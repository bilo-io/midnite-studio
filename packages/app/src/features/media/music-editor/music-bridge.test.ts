import { describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { buildMockBridge } from '../../../../test-support/mock-bridge';

/** Phase 101 Theme B — the mock bridge answers the same `music.*` envelopes main does. */
describe('mock bridge music', () => {
  it('writes, lists, reads and deletes a song through GitOpResult envelopes', async () => {
    const { music } = (buildMockBridge(fixtures) as unknown as { media: { music: Record<"write" | "list" | "read" | "delete", (req: unknown) => Promise<unknown>> } }).media;
    const song = { name: 'Demo', tracks: [] };
    expect(await music.write({ repoId: 'repo-1', project: 'album', name: 'Demo', song })).toMatchObject({ ok: true });
    expect(await music.list({ repoId: 'repo-1', project: 'album' })).toMatchObject({
      ok: true,
      value: [{ name: 'Demo', path: 'Demo.mid', hasSidecar: true }],
    });
    expect(await music.read({ repoId: 'repo-1', project: 'album', name: 'Demo' })).toEqual({ ok: true, value: song });
    expect(await music.delete({ repoId: 'repo-1', project: 'album', name: 'Demo' })).toEqual({ ok: true });
    expect(await music.read({ repoId: 'repo-1', project: 'album', name: 'Demo' })).toMatchObject({ ok: false });
  });
});
