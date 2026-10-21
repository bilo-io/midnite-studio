import { MUSIC_MCP_TOOL_IDS, MUSIC_MCP_WRITE_TOOL_IDS, MUSIC_OFF_MESSAGE } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MusicToolHandlers } from '../media/music/music-mcp';
import { MCP_HANDLERS } from './dispatch';
import { resetMcpAllowUiStateForTests, setMcpAllowMusicState } from './ui-gate';
import { musicAddNotes, musicGetInfo, musicSave, setMusicTools } from './music-tools';

/** vitest: the `allowMusic` gate — every write tool refuses with the named reason while it is off; the reads never do. */
const stub = (): MusicToolHandlers =>
  Object.fromEntries(MUSIC_MCP_TOOL_IDS.map((id) => [id, vi.fn(async () => ({ ok: true }))])) as unknown as MusicToolHandlers;

afterEach(() => {
  resetMcpAllowUiStateForTests();
  setMusicTools(null);
});

const TARGET = { repoPath: '/r', project: 'p', name: 'n' };

describe('music tool gate', () => {
  it('is off by default and refuses before touching the song', async () => {
    const handlers = stub();
    setMusicTools(handlers);
    await expect(musicAddNotes({ ...TARGET, track: 0, notes: [] as never })).rejects.toMatchObject({ kind: 'refused', message: MUSIC_OFF_MESSAGE });
    await expect(musicSave(TARGET)).rejects.toMatchObject({ kind: 'refused' });
    expect(handlers.music_add_notes).not.toHaveBeenCalled();
    expect(handlers.music_save).not.toHaveBeenCalled();
  });

  it('reads answer while the switch is off', async () => {
    setMusicTools(stub());
    await expect(musicGetInfo(TARGET)).resolves.toEqual({ ok: true });
  });

  it('writes go through once the switch is on', async () => {
    const handlers = stub();
    setMusicTools(handlers);
    setMcpAllowMusicState(true);
    await musicSave(TARGET);
    expect(handlers.music_save).toHaveBeenCalledWith(TARGET);
  });

  it('answers, not throws a crash, before the editor service is bound', async () => {
    setMcpAllowMusicState(true);
    await expect(musicSave(TARGET)).rejects.toMatchObject({ kind: 'error' });
  });

  it('every write tool in the registry is gated and every read tool is not', async () => {
    setMusicTools(stub());
    for (const id of MUSIC_MCP_TOOL_IDS) {
      const handler = MCP_HANDLERS[id] as (input: unknown) => Promise<unknown>;
      const gated = (MUSIC_MCP_WRITE_TOOL_IDS as readonly string[]).includes(id);
      if (gated) await expect(handler({}), id).rejects.toMatchObject({ kind: 'refused' });
      else await expect(handler({}), id).resolves.toBeDefined();
    }
  });
});
