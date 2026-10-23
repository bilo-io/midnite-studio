// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NewSecurityFinding, OllamaModel } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createOllamaDigestLedger,
  createOllamaDigestStore,
  manifestPathFor,
  normalizeDigest,
  ollamaModelsDir,
  verifyManifestDigest,
  type OllamaDigestPins,
  type OllamaDigestStore,
} from './digest-ledger';

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const model = (name: string, digest: string): OllamaModel => ({ name, model: name, modifiedAt: null, size: 1, digest, details: {} as OllamaModel['details'] });

const memoryStore = (): OllamaDigestStore & { saved: OllamaDigestPins[] } => {
  const saved: OllamaDigestPins[] = [];
  return { saved, load: async () => ({}), save: async (pins) => void saved.push(pins) };
};

/** A models directory whose manifests are `files` (path under `/m` → text). */
const disk = (files: Record<string, string>) => async (path: string): Promise<Buffer> => {
  const text = files[path];
  if (text === undefined) throw new Error('ENOENT');
  return Buffer.from(text);
};

describe('manifestPathFor', () => {
  it('maps the three name shapes Ollama keeps on disk', () => {
    expect(manifestPathFor('llama3:8b', '/m')).toBe('/m/manifests/registry.ollama.ai/library/llama3/8b');
    expect(manifestPathFor('llama3', '/m')).toBe('/m/manifests/registry.ollama.ai/library/llama3/latest');
    expect(manifestPathFor('someone/tuned:q4', '/m')).toBe('/m/manifests/registry.ollama.ai/someone/tuned/q4');
    expect(manifestPathFor('hf.co/org/model:Q4_K_M', '/m')).toBe('/m/manifests/hf.co/org/model/Q4_K_M');
  });

  it('refuses a name that would walk out of manifests/', () => {
    expect(manifestPathFor('../../etc/passwd', '/m')).toBeNull();
    expect(manifestPathFor('llama3:..', '/m')).toBeNull();
    expect(manifestPathFor('a//b:c', '/m')).toBeNull();
  });

  it('uses OLLAMA_MODELS when set and ~/.ollama/models otherwise', () => {
    expect(ollamaModelsDir({ OLLAMA_MODELS: '/data/ollama' }, '/home/x')).toBe('/data/ollama');
    expect(ollamaModelsDir({}, '/home/x')).toBe('/home/x/.ollama/models');
  });
});

describe('verifyManifestDigest', () => {
  const path = '/m/manifests/registry.ollama.ai/library/llama3/8b';

  it('verifies a reported digest that is the sha256 of the manifest, with or without the prefix', async () => {
    const readFile = disk({ [path]: 'manifest-bytes' });
    const hex = sha('manifest-bytes');
    expect(await verifyManifestDigest('llama3:8b', hex, { modelsDir: '/m', readFile })).toEqual({ status: 'verified', digest: `sha256:${hex}` });
    expect(await verifyManifestDigest('llama3:8b', `sha256:${hex.toUpperCase()}`, { modelsDir: '/m', readFile })).toMatchObject({ status: 'verified' });
  });

  it('reports a mismatch between what the daemon says and what is on disk', async () => {
    const result = await verifyManifestDigest('llama3:8b', sha('something else'), { modelsDir: '/m', readFile: disk({ [path]: 'manifest-bytes' }) });
    expect(result).toEqual({ status: 'mismatch', reported: `sha256:${sha('something else')}`, onDisk: `sha256:${sha('manifest-bytes')}` });
  });

  it('is unverifiable, not a failure, when the manifest is not on this machine', async () => {
    expect(await verifyManifestDigest('llama3:8b', sha('x'), { modelsDir: '/m', readFile: disk({}) })).toMatchObject({ status: 'unverifiable' });
  });
});

describe('the digest ledger', () => {
  const path = '/m/manifests/registry.ollama.ai/library/llama3/8b';
  const setup = (files: Record<string, string> = { [path]: 'v1' }) => {
    const store = memoryStore();
    const findings: NewSecurityFinding[] = [];
    const ledger = createOllamaDigestLedger({ store, modelsDir: '/m', readFile: disk(files), raiseFinding: (f) => void findings.push(f) });
    return { store, findings, ledger };
  };

  it('records the verified digest at install and raises nothing', async () => {
    const { ledger, store, findings } = setup();
    const result = await ledger.recordInstalled(model('llama3:8b', sha('v1')));
    expect(result.status).toBe('verified');
    expect(store.saved.at(-1)).toEqual({ 'llama3:8b': `sha256:${sha('v1')}` });
    expect(findings).toEqual([]);
  });

  it('does not read this disk for a daemon on another machine', async () => {
    const { ledger, store, findings } = setup();
    expect((await ledger.recordInstalled(model('llama3:8b', sha('other-build')), { checkDisk: false })).status).toBe('unverifiable');
    expect(findings).toEqual([]);
    expect(store.saved.at(-1)).toEqual({ 'llama3:8b': `sha256:${sha('other-build')}` });
  });

  it('records an unverifiable model (no manifest on this machine) without a finding', async () => {
    const { ledger, store, findings } = setup({});
    await ledger.recordInstalled(model('llama3:8b', sha('v1')));
    expect(store.saved.at(-1)).toEqual({ 'llama3:8b': `sha256:${sha('v1')}` });
    expect(findings).toEqual([]);
  });

  it('raises a medium finding and does not pin when the reported digest is not the manifest on disk', async () => {
    const { ledger, store, findings } = setup();
    await ledger.recordInstalled(model('llama3:8b', sha('forged')));
    expect(store.saved).toEqual([]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ source: 'agents', severity: 'medium', category: 'supply-chain' });
    expect(findings[0]!.fingerprint).toBe('agents:ollama-digest:manifest-mismatch:llama3:8b');
  });

  it('a changed digest for a pinned model is a medium finding, and a listing never moves the pin', async () => {
    const { ledger, store, findings } = setup();
    await ledger.recordInstalled(model('llama3:8b', sha('v1')));
    store.saved.length = 0;
    expect(await ledger.checkPinned([model('llama3:8b', sha('v1')), model('other:1b', sha('z'))])).toEqual([]);
    expect(await ledger.checkPinned([model('llama3:8b', sha('v2'))])).toEqual(['llama3:8b']);
    expect(findings.map((f) => [f.severity, f.fingerprint])).toEqual([['medium', 'agents:ollama-digest:changed:llama3:8b']]);
    expect(store.saved).toEqual([]);
    expect((await ledger.pins())['llama3:8b']).toBe(`sha256:${sha('v1')}`);
  });

  it('re-pinning after a pull that moved the tag raises the finding once and pins the new build', async () => {
    const { ledger, store, findings } = setup();
    await ledger.recordInstalled(model('llama3:8b', sha('v1')));
    const again = createOllamaDigestLedger({ store: { load: async () => ({ 'llama3:8b': `sha256:${sha('v1')}` }), save: store.save }, modelsDir: '/m', readFile: disk({ [path]: 'v2' }), raiseFinding: (f) => void findings.push(f) });
    await again.recordInstalled(model('llama3:8b', sha('v2')));
    expect(findings.filter((f) => f.fingerprint.includes(':changed:'))).toHaveLength(1);
    expect(store.saved.at(-1)).toEqual({ 'llama3:8b': `sha256:${sha('v2')}` });
  });

  it('an unavailable findings ledger never breaks a pull or a listing', async () => {
    const store = memoryStore();
    const ledger = createOllamaDigestLedger({ store, modelsDir: '/m', readFile: disk({ [path]: 'v1' }), raiseFinding: () => { throw new Error('ledger down'); } });
    await ledger.recordInstalled(model('llama3:8b', sha('v1')));
    await expect(ledger.checkPinned([model('llama3:8b', sha('v2'))])).resolves.toEqual(['llama3:8b']);
  });
});

describe('the digest store', () => {
  let dir: string | null = null;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it('round-trips pins in a 0600 file and reads corrupt or missing state as no pins', async () => {
    dir = await mkdtemp(join(tmpdir(), 'digests-'));
    const store = createOllamaDigestStore(dir);
    expect(await store.load()).toEqual({});
    await store.save({ 'llama3:8b': 'sha256:abc' });
    expect(await store.load()).toEqual({ 'llama3:8b': 'sha256:abc' });
    expect((await stat(join(dir, 'ollama-digests.json'))).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(join(dir, 'ollama-digests.json'), 'utf8')).version).toBe(1);
    expect(normalizeDigest('SHA256:AB')).toBe('ab');
  });
});
