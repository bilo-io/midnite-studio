import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  engineAppDir,
  engineNeedsInstall,
  engineState,
  ensureHyperframesComposition,
  hyperframesProjectDir,
  hyperframesStubComposition,
  otherEngineDirs,
  readVideoEngine,
  switchVideoEngine,
  writeVideoEngine,
} from './engine';
import { scaffoldVideoWorkspace } from './scaffold';

const TEMPLATE = join(__dirname, '..', '..', '..', '..', '..', 'templates', 'media-video');

let tmp: string | null = null;
const fresh = (): string => (tmp = mkdtempSync(join(tmpdir(), 'video-engine-')));
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

describe('readVideoEngine / writeVideoEngine — persistence', () => {
  it('reads Remotion from a root with no config (migration: every pre-engine root)', async () => {
    const root = fresh();
    mkdirSync(join(root, 'video-editor'));
    mkdirSync(join(root, 'projects'));
    expect(await readVideoEngine(root)).toBe('remotion');
  });

  it('round-trips the choice through video.config.json', async () => {
    const root = fresh();
    await writeVideoEngine(root, 'hyperframes');
    expect(JSON.parse(readFileSync(join(root, 'video.config.json'), 'utf8'))).toEqual({
      engine: 'hyperframes',
    });
    expect(await readVideoEngine(root)).toBe('hyperframes');
    await writeVideoEngine(root, 'remotion');
    expect(await readVideoEngine(root)).toBe('remotion');
  });

  it('treats a malformed or unknown-engine config as Remotion rather than failing', async () => {
    const root = fresh();
    writeFileSync(join(root, 'video.config.json'), '{not json');
    expect(await readVideoEngine(root)).toBe('remotion');
    writeFileSync(join(root, 'video.config.json'), JSON.stringify({ engine: 'premiere' }));
    expect(await readVideoEngine(root)).toBe('remotion');
  });

  it('leaves no temp file behind', async () => {
    const root = fresh();
    await writeVideoEngine(root, 'hyperframes');
    expect(readdirSync(root)).toEqual(['video.config.json']);
  });
});

describe('engine app helpers', () => {
  it('names each engine its own editor app', () => {
    expect(engineAppDir('/r', 'remotion')).toBe(join('/r', 'video-editor'));
    expect(engineAppDir('/r', 'hyperframes')).toBe(join('/r', 'hyperframes-editor'));
    expect(otherEngineDirs('remotion')).toEqual(['hyperframes-editor']);
    expect(otherEngineDirs('hyperframes')).toEqual(['video-editor']);
  });

  it('reports a missing install, and nothing for no root', () => {
    const root = fresh();
    mkdirSync(join(root, 'hyperframes-editor'));
    expect(engineNeedsInstall(root, 'hyperframes')).toBe(true);
    mkdirSync(join(root, 'hyperframes-editor', 'node_modules'));
    expect(engineNeedsInstall(root, 'hyperframes')).toBe(false);
    expect(engineState(null, 'remotion')).toEqual({
      root: null,
      engine: 'remotion',
      needsInstall: false,
      appDir: null,
    });
    expect(engineState(root, 'hyperframes')).toEqual({
      root,
      engine: 'hyperframes',
      needsInstall: false,
      appDir: join(root, 'hyperframes-editor'),
    });
  });
});

describe('switchVideoEngine — migration safety', () => {
  it('adds the HyperFrames app to an existing Remotion root without touching a file of it', async () => {
    const root = join(fresh(), 'video');
    await scaffoldVideoWorkspace(TEMPLATE, root, 'remotion');
    // A user edit the switch must not clobber.
    const edited = join(root, 'video-editor', 'src', 'Root.tsx');
    writeFileSync(edited, '// my edits\n');
    // A pre-engine root: no config file at all.
    rmSync(join(root, 'video.config.json'));
    expect(existsSync(join(root, 'hyperframes-editor'))).toBe(false);

    const result = await switchVideoEngine(TEMPLATE, root, 'hyperframes');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ root, engine: 'hyperframes', needsInstall: true });
    expect(existsSync(join(root, 'hyperframes-editor', 'package.json'))).toBe(true);
    expect(readFileSync(edited, 'utf8')).toBe('// my edits\n');
    expect(await readVideoEngine(root)).toBe('hyperframes');
  });

  it('switches back without recopying or overwriting the app it already has', async () => {
    const root = join(fresh(), 'video');
    await scaffoldVideoWorkspace(TEMPLATE, root, 'hyperframes');
    const pkg = join(root, 'hyperframes-editor', 'package.json');
    writeFileSync(pkg, '{"name":"mine"}');

    expect((await switchVideoEngine(TEMPLATE, root, 'remotion')).ok).toBe(true);
    expect(await readVideoEngine(root)).toBe('remotion');
    expect((await switchVideoEngine(TEMPLATE, root, 'hyperframes')).ok).toBe(true);
    expect(readFileSync(pkg, 'utf8')).toBe('{"name":"mine"}');
  });

  it('refuses a folder that is not a video workspace', async () => {
    const root = fresh();
    const result = await switchVideoEngine(TEMPLATE, root, 'hyperframes');
    expect(result.ok).toBe(false);
    expect(existsSync(join(root, 'video.config.json'))).toBe(false);
  });

  it('fails cleanly, without recording the engine, when the template lacks the app', async () => {
    const root = fresh();
    mkdirSync(join(root, 'projects'));
    const result = await switchVideoEngine(join(root, 'no-template'), root, 'hyperframes');
    expect(result.ok).toBe(false);
    expect(existsSync(join(root, 'video.config.json'))).toBe(false);
  });
});

describe('HyperFrames composition folders', () => {
  it('confines a project id to <app>/projects', () => {
    expect(hyperframesProjectDir('/app', 'acme/promo/001-x')).toBe(
      join('/app', 'projects', 'acme', 'promo', '001-x'),
    );
    expect(hyperframesProjectDir('/app', '../escape')).toBeNull();
    expect(hyperframesProjectDir('/app', '..')).toBeNull();
    expect(hyperframesProjectDir('/app', '.')).toBeNull();
  });

  it('writes a valid stub once and never overwrites an existing composition', async () => {
    const app = join(fresh(), 'hyperframes-editor');
    const first = await ensureHyperframesComposition(app, 'acme/001-x', 'AcmeX', 'Acme <X>');
    expect(first.ok).toBe(true);
    const entry = join(app, 'projects', 'acme', '001-x', 'index.html');
    const html = readFileSync(entry, 'utf8');
    expect(html).toContain('data-composition-id="AcmeX"');
    expect(html).toContain('window.__timelines["AcmeX"]');
    expect(html).toContain('Acme &lt;X&gt;');

    writeFileSync(entry, 'mine');
    await ensureHyperframesComposition(app, 'acme/001-x', 'AcmeX', 'Acme');
    expect(readFileSync(entry, 'utf8')).toBe('mine');
  });

  it('rejects an id that escapes the app', async () => {
    const app = join(fresh(), 'hyperframes-editor');
    expect((await ensureHyperframesComposition(app, '../../x', 'X', 'X')).ok).toBe(false);
  });

  it('escapes the composition id in the stub', () => {
    expect(hyperframesStubComposition('a"b', 't')).toContain('data-composition-id="a&quot;b"');
  });
});
