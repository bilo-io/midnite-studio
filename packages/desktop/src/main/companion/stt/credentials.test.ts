import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 79 Theme F — the recogniser's key vault.
 *
 * Mocked exactly as `db/credential-vault.test.ts` mocks it, and for its stated
 * reason: the module imports `electron`, so `safeStorage` has to be in place
 * before it loads, and desktop's `module: "commonjs"` tsconfig forbids a
 * top-level await to do it with.
 */
const { encryptString, decryptString, isEncryptionAvailable } = vi.hoisted(() => ({
  encryptString: vi.fn((value: string) => Buffer.from(`enc:${value}`)),
  decryptString: vi.fn((buf: Buffer) => buf.toString('utf8').replace(/^enc:/, '')),
  isEncryptionAvailable: vi.fn(() => true),
}));
vi.mock('electron', () => ({
  safeStorage: { encryptString, decryptString, isEncryptionAvailable },
}));

let createSttCredentials: typeof import('./credentials').createSttCredentials;
let parseVaultState: typeof import('./credentials').parseVaultState;
let nullSttCredentials: typeof import('./credentials').nullSttCredentials;
beforeAll(async () => {
  ({ createSttCredentials, parseVaultState, nullSttCredentials } = await import('./credentials'));
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mstudio-stt-vault-'));
  isEncryptionAvailable.mockReturnValue(true);
  // Hoisted mocks are module-level, so their call records outlive a test —
  // and two assertions below are about a call *not* happening.
  encryptString.mockClear();
  decryptString.mockClear();
});

const vaultFile = (): string => join(dir, 'companion-stt.vault.json');

describe('createSttCredentials', () => {
  it('starts with nothing configured', async () => {
    const vault = createSttCredentials(dir);
    expect(await vault.get('openai-whisper')).toBeNull();
    expect(await vault.configured()).toEqual([]);
  });

  it('round-trips a key through safeStorage', async () => {
    const vault = createSttCredentials(dir);
    await vault.set('openai-whisper', 'sk-test-123');

    expect(encryptString).toHaveBeenCalledWith('sk-test-123');
    expect(await vault.get('openai-whisper')).toBe('sk-test-123');
    expect(await vault.configured()).toEqual(['openai-whisper']);
  });

  it('trims the key — a pasted secret arrives with whitespace', async () => {
    const vault = createSttCredentials(dir);
    await vault.set('openai-whisper', '  sk-test-123\n');
    expect(await vault.get('openai-whisper')).toBe('sk-test-123');
  });

  /*
    The one thing that must never happen: the plaintext on disk. The vault
    exists because `finance-store.ts` persisted an API key in plaintext
    renderer localStorage, and this assertion is what stops the same thing
    happening one directory over.
  */
  it('never writes the plaintext key to disk', async () => {
    const vault = createSttCredentials(dir);
    await vault.set('openai-whisper', 'sk-secret-value');
    const onDisk = await readFile(vaultFile(), 'utf8');
    expect(onDisk).not.toContain('sk-secret-value');
    // Base64 of whatever `safeStorage` produced, which is what the ciphertext
    // is stored as — decoding it back is the only way to see the fake's
    // marker, and doing so proves the file holds nothing else.
    const stored = (JSON.parse(onDisk) as { keys: Record<string, string> }).keys['openai-whisper'];
    expect(Buffer.from(stored ?? '', 'base64').toString('utf8')).toBe('enc:sk-secret-value');
  });

  it('clears on an empty string — the Settings field\'s own gesture', async () => {
    const vault = createSttCredentials(dir);
    await vault.set('openai-whisper', 'sk-test-123');
    await vault.set('openai-whisper', '   ');
    expect(await vault.get('openai-whisper')).toBeNull();
    expect(await vault.configured()).toEqual([]);
  });

  it('clears explicitly too', async () => {
    const vault = createSttCredentials(dir);
    await vault.set('openai-whisper', 'sk-test-123');
    await vault.clear('openai-whisper');
    expect(await vault.get('openai-whisper')).toBeNull();
  });

  it('keeps two providers apart', async () => {
    const vault = createSttCredentials(dir);
    await vault.set('openai-whisper', 'sk-openai');
    await vault.set('deepgram', 'dg-key');
    expect(await vault.get('openai-whisper')).toBe('sk-openai');
    expect(await vault.get('deepgram')).toBe('dg-key');
    expect((await vault.configured()).sort()).toEqual(['deepgram', 'openai-whisper']);
  });

  it('survives a fresh instance over the same directory', async () => {
    await createSttCredentials(dir).set('openai-whisper', 'sk-test-123');
    expect(await createSttCredentials(dir).get('openai-whisper')).toBe('sk-test-123');
  });

  it('reads an unreadable keychain entry as no key rather than throwing', async () => {
    const vault = createSttCredentials(dir);
    await vault.set('openai-whisper', 'sk-test-123');
    decryptString.mockImplementationOnce(() => {
      throw new Error('keychain reset');
    });
    expect(await vault.get('openai-whisper')).toBeNull();
  });

  it('loads a corrupt file as nothing configured', async () => {
    await writeFile(vaultFile(), 'not json at all', 'utf8');
    expect(await createSttCredentials(dir).configured()).toEqual([]);
  });

  describe('with no working keychain', () => {
    beforeEach(() => isEncryptionAvailable.mockReturnValue(false));

    it('degrades to session memory rather than refusing the key', async () => {
      const vault = createSttCredentials(dir);
      await vault.set('openai-whisper', 'sk-test-123');

      expect(encryptString).not.toHaveBeenCalledWith('sk-test-123');
      // Usable now...
      expect(await vault.get('openai-whisper')).toBe('sk-test-123');
      expect(await vault.configured()).toEqual(['openai-whisper']);
      expect(vault.isAvailable()).toBe(false);
      // ...and gone next launch, which `encryptionAvailable: false` is what
      // tells the Settings page.
      expect(await createSttCredentials(dir).get('openai-whisper')).toBeNull();
    });

    it('writes nothing to disk in that case', async () => {
      await createSttCredentials(dir).set('openai-whisper', 'sk-test-123');
      await expect(readFile(vaultFile(), 'utf8')).rejects.toThrow();
    });
  });
});

describe('parseVaultState', () => {
  it('drops an unknown provider id and a non-string value', () => {
    expect(
      parseVaultState({
        version: 1,
        keys: { 'openai-whisper': 'abc', 'whisper.cpp': 'def', deepgram: 42 },
      }),
    ).toEqual({ 'openai-whisper': 'abc' });
  });

  it('answers the safe default for every unusable shape', () => {
    expect(parseVaultState(null)).toEqual({});
    expect(parseVaultState('nope')).toEqual({});
    expect(parseVaultState({})).toEqual({});
    expect(parseVaultState({ keys: null })).toEqual({});
  });
});

describe('nullSttCredentials', () => {
  it('stores nothing and remembers nothing', async () => {
    await nullSttCredentials.set('openai-whisper', 'sk-test');
    expect(await nullSttCredentials.get('openai-whisper')).toBeNull();
    expect(await nullSttCredentials.configured()).toEqual([]);
    expect(nullSttCredentials.isAvailable()).toBe(false);
  });
});
