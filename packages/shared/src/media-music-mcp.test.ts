import { describe, expect, it } from 'vitest';

import { MCP_TOOLS } from './mcp';
import {
  MUSIC_MCP_MAX_EVENTS_PER_CALL,
  MUSIC_MCP_TOOL_IDS,
  MUSIC_MCP_WRITE_TOOL_IDS,
  MusicAgentRunRequestSchema,
  MusicChangedEventSchema,
  MusicEngineSchema,
  agentIteratesMusic,
  isMusicMcpToolId,
} from './media-music-mcp';
import { emptySong } from './media-music';

const T = { repoPath: '/r', project: 'songs', name: 'intro' };
const NOTE = { pitch: 60, startTick: 0, durationTicks: 480, velocity: 90 };

describe('music MCP contract', () => {
  it('registers every music tool, with a write flag that matches the gated list', () => {
    for (const id of MUSIC_MCP_TOOL_IDS) {
      expect(isMusicMcpToolId(id)).toBe(true);
      expect(MCP_TOOLS[id].readOnly, id).toBe(!(MUSIC_MCP_WRITE_TOOL_IDS as readonly string[]).includes(id));
    }
    expect(isMusicMcpToolId('model_list')).toBe(false);
  });

  it('mirrors midi-file-mcp’s names so its prompts carry over', () => {
    for (const id of ['music_get_info', 'music_get_tracks', 'music_get_track', 'music_get_notes', 'music_add_notes', 'music_remove_notes', 'music_add_cc', 'music_add_pitchbends', 'music_add_track', 'music_set_tempo', 'music_save']) {
      expect(MUSIC_MCP_TOOL_IDS).toContain(id);
    }
  });

  it('derives note limits from SongSchema: pitch, velocity, duration and tick ranges are enforced', () => {
    const schema = MCP_TOOLS.music_add_notes.input;
    expect(schema.safeParse({ ...T, track: 0, notes: [NOTE] }).success).toBe(true);
    for (const bad of [{ pitch: 128 }, { pitch: -1 }, { velocity: 0 }, { velocity: 128 }, { durationTicks: 0 }, { startTick: -1 }, { startTick: 1.5 }]) {
      expect(schema.safeParse({ ...T, track: 0, notes: [{ ...NOTE, ...bad }] }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('caps one call’s events so an answer stays prompt-sized', () => {
    const many = Array.from({ length: MUSIC_MCP_MAX_EVENTS_PER_CALL + 1 }, () => NOTE);
    expect(MCP_TOOLS.music_add_notes.input.safeParse({ ...T, track: 0, notes: many }).success).toBe(false);
  });

  it('addresses a track by id or by index, never an empty string or a negative index', () => {
    const schema = MCP_TOOLS.music_get_track.input;
    expect(schema.safeParse({ ...T, track: 'bass' }).success).toBe(true);
    expect(schema.safeParse({ ...T, track: 2 }).success).toBe(true);
    expect(schema.safeParse({ ...T, track: '' }).success).toBe(false);
    expect(schema.safeParse({ ...T, track: -1 }).success).toBe(false);
  });

  it('refuses a reserved or path-like song name', () => {
    expect(MCP_TOOLS.music_get_info.input.safeParse({ ...T, name: 'project' }).success).toBe(false);
    expect(MCP_TOOLS.music_get_info.input.safeParse({ ...T, name: '../x' }).success).toBe(false);
  });

  it('the change event carries the whole validated song', () => {
    const event = { repoId: 'r1', project: 'songs', name: 'intro', song: emptySong('intro'), summary: 'Added 1 note to Lead', saved: false };
    expect(MusicChangedEventSchema.safeParse(event).success).toBe(true);
    expect(MusicChangedEventSchema.safeParse({ ...event, song: { tracks: 'x' } }).success).toBe(false);
  });

  it('engines: Ollama or an agent; only Claude and Codex refine by themselves', () => {
    expect(MusicEngineSchema.safeParse({ kind: 'ollama', model: 'qwen' }).success).toBe(true);
    expect(MusicEngineSchema.safeParse({ kind: 'agent', agentId: 'agy' }).success).toBe(true);
    expect(MusicEngineSchema.safeParse({ kind: 'sf3d' }).success).toBe(false);
    expect(['claude', 'codex', 'agy', 'gemini'].map(agentIteratesMusic)).toEqual([true, true, false, false]);
  });

  it('a run needs a prompt, and its pass count is bounded', () => {
    const run = { runId: 'r', repoId: 'r1', project: 'songs', name: 'intro', prompt: 'calm', engine: { kind: 'ollama', model: 'q' } };
    expect(MusicAgentRunRequestSchema.safeParse(run).success).toBe(true);
    expect(MusicAgentRunRequestSchema.safeParse({ ...run, prompt: '  ' }).success).toBe(false);
    expect(MusicAgentRunRequestSchema.safeParse({ ...run, maxPasses: 31 }).success).toBe(false);
  });
});
