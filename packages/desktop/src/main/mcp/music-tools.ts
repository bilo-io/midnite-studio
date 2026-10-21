import { MUSIC_OFF_MESSAGE, type McpToolInput, type McpToolOutput } from '@midnite/studio-shared';

import type { MusicToolHandlers } from '../media/music/music-mcp';
import { McpToolError } from './errors';
import { getMcpAllowMusic } from './ui-gate';

/**
 * The `music_*` tools as the app's global MCP server answers them (Phase 101 Theme H): the
 * implementations in `media/music/music-mcp.ts`, wrapped in the consent model every other
 * state-changing tool has. Every tool that changes a song, opens it in the window or writes it refuses
 * with a named reason while `Settings ▸ MCP ▸ Let agents edit music` is off; the read tools and the
 * piano-roll preview answer whenever the server is on.
 *
 * The implementations are bound at startup (`setMusicTools`, from `ipc/media-music-handlers.ts`, where
 * the song service lives); until then a call is answered, not thrown, with a plain error.
 */

let bound: MusicToolHandlers | null = null;

export function setMusicTools(tools: MusicToolHandlers | null): void {
  bound = tools;
}

function tools(): MusicToolHandlers {
  if (!bound) throw new McpToolError('error', 'Media ▸ Audio ▸ Editor is not ready yet.');
  return bound;
}

function allowed(): void {
  if (!getMcpAllowMusic()) throw new McpToolError('refused', MUSIC_OFF_MESSAGE);
}

export const musicList = async (input: McpToolInput<'music_list'>): Promise<McpToolOutput<'music_list'>> => tools().music_list(input);
export const musicOpen = async (input: McpToolInput<'music_open'>): Promise<McpToolOutput<'music_open'>> => {
  allowed();
  return tools().music_open(input);
};
export const musicGetInfo = async (input: McpToolInput<'music_get_info'>): Promise<McpToolOutput<'music_get_info'>> => tools().music_get_info(input);
export const musicSetTempo = async (input: McpToolInput<'music_set_tempo'>): Promise<McpToolOutput<'music_set_tempo'>> => {
  allowed();
  return tools().music_set_tempo(input);
};
export const musicGetTracks = async (input: McpToolInput<'music_get_tracks'>): Promise<McpToolOutput<'music_get_tracks'>> => tools().music_get_tracks(input);
export const musicGetTrack = async (input: McpToolInput<'music_get_track'>): Promise<McpToolOutput<'music_get_track'>> => tools().music_get_track(input);
export const musicGetNotes = async (input: McpToolInput<'music_get_notes'>): Promise<McpToolOutput<'music_get_notes'>> => tools().music_get_notes(input);
export const musicAddNotes = async (input: McpToolInput<'music_add_notes'>): Promise<McpToolOutput<'music_add_notes'>> => {
  allowed();
  return tools().music_add_notes(input);
};
export const musicRemoveNotes = async (input: McpToolInput<'music_remove_notes'>): Promise<McpToolOutput<'music_remove_notes'>> => {
  allowed();
  return tools().music_remove_notes(input);
};
export const musicAddCc = async (input: McpToolInput<'music_add_cc'>): Promise<McpToolOutput<'music_add_cc'>> => {
  allowed();
  return tools().music_add_cc(input);
};
export const musicAddPitchbends = async (input: McpToolInput<'music_add_pitchbends'>): Promise<McpToolOutput<'music_add_pitchbends'>> => {
  allowed();
  return tools().music_add_pitchbends(input);
};
export const musicAddTrack = async (input: McpToolInput<'music_add_track'>): Promise<McpToolOutput<'music_add_track'>> => {
  allowed();
  return tools().music_add_track(input);
};
export const musicSave = async (input: McpToolInput<'music_save'>): Promise<McpToolOutput<'music_save'>> => {
  allowed();
  return tools().music_save(input);
};
export const musicRenderPreview = async (input: McpToolInput<'music_render_preview'>): Promise<McpToolOutput<'music_render_preview'>> => tools().music_render_preview(input);
