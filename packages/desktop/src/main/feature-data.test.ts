import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { featureToggle } from '@midnite/studio-shared';

import { deleteFeatureData, describeFeatureData } from './feature-data';

describe('feature data (Phase 135 Theme F)', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('describes only the files that exist, with sizes', async () => {
    dir = mkdtempSync(join(tmpdir(), 'feature-data-'));
    const [first] = featureToggle('councils').data.files;
    writeFileSync(join(dir, first!), '12345');
    writeFileSync(join(dir, 'chats.json'), 'not councils');
    expect(await describeFeatureData(dir, 'councils')).toEqual([{ path: first, bytes: 5 }]);
  });

  it('counts a folder by what is inside it', async () => {
    dir = mkdtempSync(join(tmpdir(), 'feature-data-'));
    const folder = featureToggle('media').data.files.find((f) => !f.includes('.'));
    if (!folder) return;
    mkdirSync(join(dir, folder, 'nested'), { recursive: true });
    writeFileSync(join(dir, folder, 'a'), 'abc');
    writeFileSync(join(dir, folder, 'nested', 'b'), 'de');
    expect(await describeFeatureData(dir, 'media')).toContainEqual({ path: folder, bytes: 5 });
  });

  it('refuses while the feature is on, and trashes every file once it is off', async () => {
    dir = mkdtempSync(join(tmpdir(), 'feature-data-'));
    for (const file of featureToggle('councils').data.files) writeFileSync(join(dir, file), 'xx');
    const trash = vi.fn(async () => undefined);
    const on = await deleteFeatureData({ userData: dir, feature: 'councils', isOn: true, trash });
    expect(on).toMatchObject({ ok: false, kind: 'error' });
    expect(trash).not.toHaveBeenCalled();
    const off = await deleteFeatureData({ userData: dir, feature: 'councils', isOn: false, trash });
    const count = featureToggle('councils').data.files.length;
    expect(off).toEqual({ ok: true, removedFiles: count, removedBytes: count * 2 });
    for (const file of featureToggle('councils').data.files) expect(trash).toHaveBeenCalledWith(join(dir, file));
  });

  it('reports a partial failure as the error envelope', async () => {
    dir = mkdtempSync(join(tmpdir(), 'feature-data-'));
    for (const file of featureToggle('councils').data.files) writeFileSync(join(dir, file), 'xx');
    const trash = vi.fn(async () => {
      throw new Error('locked');
    });
    const out = await deleteFeatureData({ userData: dir, feature: 'councils', isOn: false, trash });
    expect(out).toMatchObject({ ok: false, kind: 'error' });
    if (!out.ok) expect(out.message).toMatch(/locked/);
  });
});
