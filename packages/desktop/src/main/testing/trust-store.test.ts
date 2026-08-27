import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestTrustStore, type TestTrustStore } from './trust-store';

let dir: string;
let store: TestTrustStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mgit-tests-trust-'));
  store = createTestTrustStore(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('createTestTrustStore', () => {
  it('starts untrusted for a suite nobody has approved', async () => {
    expect(await store.status('repo1', 'pkg::test', 'fp-a')).toEqual({
      state: 'untrusted',
      trustedAt: null,
    });
  });

  it('trusts one suite without affecting a sibling suite in the same repo', async () => {
    await store.trust('repo1', 'pkg::test', 'fp-a', 1_000);
    expect(await store.status('repo1', 'pkg::test', 'fp-a')).toMatchObject({ state: 'trusted' });
    expect(await store.status('repo1', 'pkg::e2e', 'fp-b')).toEqual({ state: 'untrusted', trustedAt: null });
  });

  it('withdraws trust when the live fingerprint no longer matches the grant', async () => {
    await store.trust('repo1', 'pkg::test', 'fp-a', 1_000);
    // The script changed since approval — the fingerprint now differs.
    expect(await store.status('repo1', 'pkg::test', 'fp-changed')).toEqual({
      state: 'untrusted',
      trustedAt: null,
    });
  });

  it('untrust drops the grant', async () => {
    await store.trust('repo1', 'pkg::test', 'fp-a', 1_000);
    await store.untrust('repo1', 'pkg::test');
    expect(await store.status('repo1', 'pkg::test', 'fp-a')).toEqual({ state: 'untrusted', trustedAt: null });
  });

  it('persists across a fresh store rooted at the same directory', async () => {
    await store.trust('repo1', 'pkg::test', 'fp-a', 1_000);
    const reopened = createTestTrustStore(dir);
    expect(await reopened.status('repo1', 'pkg::test', 'fp-a')).toMatchObject({ state: 'trusted' });
  });
});
