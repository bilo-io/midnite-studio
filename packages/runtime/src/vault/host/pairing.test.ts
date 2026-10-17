import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createFakeCipher } from '../testing';
import { loadOrCreatePairingIdentity, verifyPairingProof } from './pairing';
import { createPairingStore } from './pairing-store';

const temp = () => mkdtempSync(join(tmpdir(), 'msr-pair-'));

describe('loadOrCreatePairingIdentity', () => {
  it('creates a seed on first run, encrypted under the app’s own cipher, user-only — and reads the same one back', () => {
    const dir = temp();
    const file = join(dir, 'vault-pairing.json');
    const cipher = createFakeCipher();
    const first = loadOrCreatePairingIdentity({ file, cipher })!;
    expect(statSync(file).mode & 0o777).toBe(0o600);
    // Ciphertext on disk, and the seed went through the cipher.
    expect(cipher.encrypted).toHaveLength(1);
    expect(readFileSync(file, 'utf8')).not.toContain(cipher.encrypted[0]!);

    const again = loadOrCreatePairingIdentity({ file, cipher })!;
    expect(again.publicKey).toBe(first.publicKey);
    expect(cipher.encrypted).toHaveLength(1);
    expect(verifyPairingProof(first.publicKey, 'coder', 'n1', again.prove('coder', 'n1'))).toBe(true);
  });

  it('proves only the nonce and the app it signed for', () => {
    const me = loadOrCreatePairingIdentity({ file: join(temp(), 'p.json'), cipher: createFakeCipher() })!;
    const proof = me.prove('coder', 'nonce-a');
    expect(verifyPairingProof(me.publicKey, 'coder', 'nonce-a', proof)).toBe(true);
    expect(verifyPairingProof(me.publicKey, 'coder', 'nonce-b', proof)).toBe(false);
    expect(verifyPairingProof(me.publicKey, 'money', 'nonce-a', proof)).toBe(false);
    expect(verifyPairingProof('not-a-key', 'coder', 'nonce-a', proof)).toBe(false);
  });

  it('keeps nothing, and writes nothing, when the keychain is unavailable', () => {
    const dir = temp();
    const cipher = createFakeCipher();
    cipher.setAvailable(false);
    expect(loadOrCreatePairingIdentity({ file: join(dir, 'p.json'), cipher })).toBeNull();
    expect(existsSync(join(dir, 'p.json'))).toBe(false);
  });

  it('moves an unreadable seed aside (never deletes it) and makes a fresh one', () => {
    const dir = temp();
    const file = join(dir, 'p.json');
    writeFileSync(file, JSON.stringify({ version: 1, seed: Buffer.from('not ours').toString('base64') }));
    const fresh = loadOrCreatePairingIdentity({ file, cipher: createFakeCipher(), now: () => 42 });
    expect(fresh).not.toBeNull();
    expect(readdirSync(dir).sort()).toEqual(['p.json', 'p.json.unreadable-42']);
  });
});

describe('createPairingStore', () => {
  it('binds on first sight, matches the same key, records a different one as a conflict; unpair clears both', () => {
    const store = createPairingStore({ hostDirectory: join(temp(), 'host'), now: () => 9 });
    expect(store.check('coder', 'k1')).toBe('bound');
    expect(store.check('coder', 'k1')).toBe('paired');
    expect(store.check('coder', 'k2')).toBe('conflict');
    expect(store.check('coder', 'k2')).toBe('conflict');
    expect(store.list()).toEqual({ apps: [{ appId: 'coder', pairedAt: 9, conflict: { at: 9, count: 2 } }] });
    expect(store.unpair('coder')).toBe(true);
    expect(store.unpair('coder')).toBe(false);
    expect(store.check('coder', 'k2')).toBe('bound');
  });

  it('reads a malformed file as nothing paired', () => {
    const host = join(temp(), 'host');
    const store = createPairingStore({ hostDirectory: host });
    store.check('coder', 'k1');
    writeFileSync(join(host, 'pairings.json'), '{');
    expect(store.list()).toEqual({ apps: [] });
  });
});
