// @vitest-environment node
import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createVanguardSettingsState, createVanguardStore } from './vanguard-store';

describe('vanguard store', () => {
  it('loads the safe default (nothing opened, no sensor overrides) from a missing file', async () => {
    const store = createVanguardStore(mkdtempSync(join(tmpdir(), 'vg-')));
    expect(await store.load()).toMatchObject({ version: 1, viewOpened: false, sensors: {} });
  });

  it('loads the safe default from a corrupt or wrong-shaped file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vg-'));
    writeFileSync(join(dir, 'vanguard.json'), '{ nope');
    expect((await createVanguardStore(dir).load()).viewOpened).toBe(false);
    writeFileSync(join(dir, 'vanguard.json'), JSON.stringify({ version: 1, cadenceSeconds: 1 }));
    expect((await createVanguardStore(dir).load()).cadenceSeconds).toBe(30);
  });

  it('round-trips an update, merging sensors per id, at mode 0600', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vg-'));
    const state = await createVanguardSettingsState(createVanguardStore(dir));
    await state.update({ sensors: { a: false } });
    await state.update({ sensors: { b: true }, viewOpened: true });
    const reloaded = await createVanguardStore(dir).load();
    expect(reloaded).toMatchObject({ sensors: { a: false, b: true }, viewOpened: true });
    expect(statSync(join(dir, 'vanguard.json')).mode & 0o777).toBe(0o600);
  });
});
