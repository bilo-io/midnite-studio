import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { INTEGRITY_KEY_FILE } from './integrity';
import { vaultFilesPresent } from './vault-files-present';
import { VAULT_NAMESPACES } from './vault-service';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mstudio-vault-present-'));
});

describe('vaultFilesPresent', () => {
  it('is false on an empty directory and on a missing one', () => {
    expect(vaultFilesPresent(dir)).toBe(false);
    expect(vaultFilesPresent(join(dir, 'nope'))).toBe(false);
  });

  it('is false when only unrelated files exist', async () => {
    await writeFile(join(dir, 'settings.json'), '{}');
    expect(vaultFilesPresent(dir)).toBe(false);
  });

  it('is true for each namespace file', async () => {
    for (const spec of Object.values(VAULT_NAMESPACES)) {
      const d = await mkdtemp(join(tmpdir(), 'mstudio-vault-present-'));
      await writeFile(join(d, spec.fileName), '{}');
      expect(vaultFilesPresent(d)).toBe(true);
    }
  });

  it('is true for the integrity key alone', async () => {
    await writeFile(join(dir, INTEGRITY_KEY_FILE), 'x');
    expect(vaultFilesPresent(dir)).toBe(true);
  });
});
