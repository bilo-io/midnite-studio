import { describe, expect, it } from 'vitest';

import { failure, ok } from '@midnite/studio-shared';

import { createMapService } from './map-service';

function memory(initial?: string) {
  let file = initial;
  const service = createMapService({
    readText: async () => (file === undefined ? failure('File not found.') : ok(file)),
    writeText: async ({ content }) => {
      file = content;
      return { ok: true as const };
    },
  });
  return service;
}
const req = { repoId: 'r', project: 'maps' };

describe('map service', () => {
  it('returns defaults for a missing file', async () => {
    const r = await memory().get(req);
    expect(r.ok && r.value.map.view.zoom).toBe(10);
    expect(r.ok && r.value.warning).toBeUndefined();
  });

  it('round-trips a view patch', async () => {
    const s = memory();
    await s.setView({ ...req, patch: { basemap: 'dark' } });
    const r = await s.get(req);
    expect(r.ok && r.value.map.basemap).toBe('dark');
  });

  it('returns defaults with a warning for corrupt json', async () => {
    const r = await memory('{nope').get(req);
    expect(r.ok && r.value.warning).toMatch(/^map\.json is not valid: /);
    expect(r.ok && r.value.map.view.zoom).toBe(10);
  });

  it('rejects an out-of-range patch', async () => {
    const r = await memory().setView({ ...req, patch: { view: { center: [0, 0], zoom: 99, bearing: 0, pitch: 0 } } });
    expect(r.ok).toBe(false);
  });
});
