/**
 * Media ▸ Audio ▸ Editor over MCP (Phase 101 Theme H) — the `music_*` tools an agent uses to read and
 * edit a song, and the wire types its engines and live edits ride on. Registered in `MCP_TOOLS`
 * (`mcp.ts`). The names mirror midi-file-mcp's (`get_midi_info`, `add_notes`, `remove_notes` …) so a
 * prompt written for it carries over; the inputs are derived from {@link SongSchema}, so the tools can
 * never accept a value the song model would refuse.
 *
 * The read tools (`music_list`, `music_get_*`, `music_render_preview`) change nothing and answer
 * whenever the server is on. Everything else sits behind `Settings ▸ MCP ▸ Let agents edit music`
 * (`allowMusic`, off by default). A tool that is given something invalid never throws: it answers
 * `{ ok: false, errors: [{ path, message }] }` and the song is untouched.
 *
 * Every edit lands in a working copy held in main and is pushed to the open editor as one
 * `mstudio:media:music-changed` event, so the editor can take it as a single undoable step. Nothing
 * reaches disk until `music_save` (an agent engine's run saves whatever is left at the end).
 *
 * Zod only — this file imports no other workspace package.
 */
import { z } from 'zod';

import { GitOpResultOf } from './domain/result';
import { LoopModelSchema } from './loops';
import { MediaProjectNameSchema } from './media';
import {
  SongControlChangeSchema,
  SongNameSchema,
  SongNoteSchema,
  SongPitchBendSchema,
  SongSchema,
  SongTempoEventSchema,
  SongTrackSchema,
} from './media-music';

/** Ids of the tools, in the order an agent meets them. */
export const MUSIC_MCP_TOOL_IDS = [
  'music_list',
  'music_open',
  'music_get_info',
  'music_set_tempo',
  'music_get_tracks',
  'music_get_track',
  'music_get_notes',
  'music_add_notes',
  'music_remove_notes',
  'music_add_cc',
  'music_add_pitchbends',
  'music_add_track',
  'music_save',
  'music_render_preview',
] as const;
export type MusicMcpToolId = (typeof MUSIC_MCP_TOOL_IDS)[number];
export const isMusicMcpToolId = (value: string): value is MusicMcpToolId => (MUSIC_MCP_TOOL_IDS as readonly string[]).includes(value);

/** Tools that change a song, open it in the window or write it — gated by `Settings ▸ MCP ▸ Let agents edit music`. */
export const MUSIC_MCP_WRITE_TOOL_IDS: readonly MusicMcpToolId[] = [
  'music_open',
  'music_set_tempo',
  'music_add_notes',
  'music_remove_notes',
  'music_add_cc',
  'music_add_pitchbends',
  'music_add_track',
  'music_save',
];

/** The exact refusal the write tools answer with while `McpSettings.allowMusic` is off. */
export const MUSIC_OFF_MESSAGE = 'Music editing is off — Settings ▸ MCP ▸ Let agents edit music';

/** One call may add or return at most this many events, so an answer stays prompt-sized. */
export const MUSIC_MCP_MAX_EVENTS_PER_CALL = 2000;
export const MUSIC_MCP_NOTES_DEFAULT_LIMIT = 500;
export const MUSIC_MCP_NOTES_MAX_LIMIT = 5000;
export const MUSIC_PREVIEW_DEFAULT_BARS = 4;
export const MUSIC_PREVIEW_MAX_BARS = 16;

// --- targets --------------------------------------------------------------------

/** Every tool but `music_list` names its song: the repo, the Audio project, the song. */
export const MusicToolTargetSchema = z.object({
  repoPath: z.string().min(1),
  project: MediaProjectNameSchema,
  name: SongNameSchema,
});
export type MusicToolTarget = z.infer<typeof MusicToolTargetSchema>;

/** A track is addressed by its id or its zero-based index. */
const TrackRef = z.union([z.string().min(1).max(64), z.number().int().min(0)]);

// --- inputs ---------------------------------------------------------------------

export const MusicToolListInputSchema = z.object({
  repoPath: z.string().min(1),
  project: MediaProjectNameSchema.optional(),
});
export const MusicOpenInputSchema = MusicToolTargetSchema;
export const MusicGetInfoInputSchema = MusicToolTargetSchema;
export const MusicGetTracksInputSchema = MusicToolTargetSchema;
export const MusicSaveInputSchema = MusicToolTargetSchema;

export const MusicSetTempoInputSchema = MusicToolTargetSchema.extend({
  /** Replaces the tempo at `tick` (default 0), or adds a tempo change there. */
  bpm: SongTempoEventSchema.shape.bpm,
  tick: SongTempoEventSchema.shape.tick.optional(),
});

export const MusicGetTrackInputSchema = MusicToolTargetSchema.extend({ track: TrackRef });

export const MusicGetNotesInputSchema = MusicToolTargetSchema.extend({
  track: TrackRef,
  fromTick: z.number().int().min(0).optional(),
  /** Exclusive. */
  toTick: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(MUSIC_MCP_NOTES_MAX_LIMIT).optional(),
});

export const MusicAddNotesInputSchema = MusicToolTargetSchema.extend({
  track: TrackRef,
  notes: z.array(SongNoteSchema).min(1).max(MUSIC_MCP_MAX_EVENTS_PER_CALL),
});

export const MusicRemoveNotesInputSchema = MusicToolTargetSchema.extend({
  track: TrackRef,
  /** Notes starting at or after this tick … */
  fromTick: z.number().int().min(0).optional(),
  /** … and before this one. */
  toTick: z.number().int().min(0).optional(),
  /** Only these pitches (0–127); omit for every pitch in the range. */
  pitches: z.array(z.number().int().min(0).max(127)).max(128).optional(),
});

export const MusicAddCcInputSchema = MusicToolTargetSchema.extend({
  track: TrackRef,
  events: z.array(SongControlChangeSchema).min(1).max(MUSIC_MCP_MAX_EVENTS_PER_CALL),
});

export const MusicAddPitchbendsInputSchema = MusicToolTargetSchema.extend({
  track: TrackRef,
  events: z.array(SongPitchBendSchema).min(1).max(MUSIC_MCP_MAX_EVENTS_PER_CALL),
});

export const MusicAddTrackInputSchema = MusicToolTargetSchema.extend({
  /** The new track's name (the target's `name` is the song). */
  trackName: SongTrackSchema.shape.name.optional(),
  channel: SongTrackSchema.shape.channel.optional(),
  program: SongTrackSchema.shape.program.optional(),
  color: SongTrackSchema.shape.color.optional(),
});

export const MusicRenderPreviewInputSchema = MusicToolTargetSchema.extend({
  /** One-based first bar (default 1). */
  fromBar: z.number().int().min(1).max(2000).optional(),
  bars: z.number().int().min(1).max(MUSIC_PREVIEW_MAX_BARS).optional(),
});

// --- outputs --------------------------------------------------------------------

export const MusicIssueSchema = z.object({ path: z.string(), message: z.string() });
export type MusicIssue = z.infer<typeof MusicIssueSchema>;

/** What every editing tool answers: `ok` with counts, or `ok: false` with errors and the song untouched. */
export const MusicEditResultSchema = z.object({
  ok: z.boolean(),
  errors: z.array(MusicIssueSchema).optional(),
  added: z.number().int().optional(),
  removed: z.number().int().optional(),
  trackId: z.string().optional(),
  trackIndex: z.number().int().optional(),
  noteCount: z.number().int().optional(),
  /** Whether the working copy differs from what is on disk. */
  unsaved: z.boolean().optional(),
});
export type MusicEditResult = z.infer<typeof MusicEditResultSchema>;

export const MusicToolListResultSchema = z.object({
  projects: z.array(
    z.object({
      name: z.string(),
      songs: z.array(z.object({ name: z.string(), hasSidecar: z.boolean(), size: z.number().int() })),
    }),
  ),
});

export const MusicOpenResultSchema = z.object({
  opened: z.literal(true),
  name: z.string(),
  trackCount: z.number().int(),
  noteCount: z.number().int(),
});

export const MusicInfoResultSchema = z.object({
  name: z.string(),
  ppq: z.number().int(),
  tempos: z.array(SongTempoEventSchema),
  timeSignatures: z.array(z.object({ tick: z.number().int(), numerator: z.number().int(), denominator: z.number().int() })),
  keySignatures: z.array(z.object({ tick: z.number().int(), key: z.string(), scale: z.string() })),
  trackCount: z.number().int(),
  noteCount: z.number().int(),
  endTick: z.number().int(),
  /** Whole bars the notes span, in the first time signature. */
  bars: z.number().int(),
  unsaved: z.boolean(),
});

export const MusicTrackSummarySchema = z.object({
  index: z.number().int(),
  id: z.string(),
  name: z.string(),
  channel: z.number().int(),
  program: z.number().int(),
  color: z.string(),
  noteCount: z.number().int(),
  controlChangeCount: z.number().int(),
  pitchBendCount: z.number().int(),
  /** Lowest and highest pitch, and the tick span — absent on an empty track. */
  pitchRange: z.tuple([z.number().int(), z.number().int()]).optional(),
  tickRange: z.tuple([z.number().int(), z.number().int()]).optional(),
});
export type MusicTrackSummary = z.infer<typeof MusicTrackSummarySchema>;
export const MusicGetTracksResultSchema = z.object({ tracks: z.array(MusicTrackSummarySchema) });
export const MusicGetTrackResultSchema = MusicTrackSummarySchema;

export const MusicGetNotesResultSchema = z.object({
  notes: z.array(SongNoteSchema),
  /** Notes in the asked range, before `limit`. */
  total: z.number().int(),
  truncated: z.boolean(),
});

export const MusicSaveResultSchema = z.object({
  ok: z.boolean(),
  errors: z.array(MusicIssueSchema).optional(),
  size: z.number().int().optional(),
});

/** `music_render_preview` answers image content (`_content`), like `model_render_preview`. */
export const MusicRenderPreviewResultSchema = z.object({ _content: z.array(z.unknown()) });

// --- wire: events main pushes to the editor ---------------------------------------

/**
 * `mstudio:media:music-changed` — an agent edited a song (an engine's run, or an MCP session). The
 * full song rides along so the editor can swap it in as **one** undoable step; `summary` is the
 * history entry's label ("Added 12 notes to Bass").
 */
export const MusicChangedEventSchema = z.object({
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  name: SongNameSchema,
  song: SongSchema,
  summary: z.string().max(200),
  /** Whether the change has been written to disk yet. */
  saved: z.boolean(),
});
export type MusicChangedEvent = z.infer<typeof MusicChangedEventSchema>;

/** `mstudio:media:music-open` — `music_open` asked the window to show a song (brings the Editor tab up). */
export const MusicOpenEventSchema = z.object({
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  name: SongNameSchema,
});
export type MusicOpenEvent = z.infer<typeof MusicOpenEventSchema>;

// --- agent engines ----------------------------------------------------------------

/**
 * Who writes the song. Claude and Codex refine over several passes through a private per-run MCP
 * socket; Ollama writes it as JSON in one pass, with repair rounds; Antigravity (`agy`) writes in one
 * pass until Midnite is registered in its MCP config, and then refines too.
 */
export const MusicEngineSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ollama'), model: z.string().min(1).max(200) }),
  z.object({ kind: z.literal('agent'), agentId: z.string().min(1), model: LoopModelSchema.optional() }),
]);
export type MusicEngine = z.infer<typeof MusicEngineSchema>;

export const MUSIC_PASSES_DEFAULT = 8;
export const MUSIC_PASSES_MAX = 30;
/** Repair rounds a single-pass engine gets when its JSON does not validate. */
export const MUSIC_REPAIR_ROUNDS = 3;
export const MUSIC_AGENT_PROMPT_MAX = 4000;

/** Agent CLIs that refine over several passes through a private per-run server. */
export const MUSIC_ITERATIVE_AGENTS = ['claude', 'codex'] as const;
export const agentIteratesMusic = (agentId: string): boolean => (MUSIC_ITERATIVE_AGENTS as readonly string[]).includes(agentId);
/** Antigravity's roster id: single pass until Midnite is registered in its MCP config. */
export const MUSIC_AGY_AGENT_ID = 'agy';

export type MusicAgentMode = 'iterative' | 'single-pass';

export const MusicAgentRunRequestSchema = z.object({
  /** Chosen by the caller so progress events and Cancel can name the run before it returns. */
  runId: z.string().min(1).max(64),
  repoId: z.string().min(1),
  project: MediaProjectNameSchema,
  name: SongNameSchema,
  prompt: z.string().trim().min(1).max(MUSIC_AGENT_PROMPT_MAX),
  engine: MusicEngineSchema,
  /** Refining engines only: how many passes (listen/inspect, then fix) the agent gets. */
  maxPasses: z.number().int().min(1).max(MUSIC_PASSES_MAX).optional(),
});
export type MusicAgentRunRequest = z.infer<typeof MusicAgentRunRequestSchema>;

export const MusicAgentRunResultSchema = z.object({
  mode: z.enum(['iterative', 'single-pass']),
  edits: z.number().int().min(0),
  passes: z.number().int().min(0),
  saved: z.boolean(),
  /** The agent's closing sentence, or what the single-pass engine wrote. */
  summary: z.string(),
});
export type MusicAgentRunResult = z.infer<typeof MusicAgentRunResultSchema>;

export const MusicAgentCancelRequestSchema = z.object({ runId: z.string().min(1).max(64) });

export const MusicAgentProgressEventSchema = z.object({
  runId: z.string(),
  mode: z.enum(['iterative', 'single-pass']),
  state: z.enum(['running', 'done', 'failed', 'cancelled']),
  pass: z.object({ n: z.number().int().min(0), max: z.number().int().min(1) }),
  /** The latest tool action in words ("Added 12 notes to Bass"). */
  action: z.string().optional(),
});
export type MusicAgentProgressEvent = z.infer<typeof MusicAgentProgressEventSchema>;

// --- Antigravity registration (Settings ▸ MCP) ------------------------------------------

export const MusicAgyStatusSchema = z.object({
  registered: z.boolean(),
  /** Where agy's own MCP config lives, so the consent text can name the file it edits. */
  configPath: z.string(),
});
export type MusicAgyStatus = z.infer<typeof MusicAgyStatusSchema>;

export const MusicAgyRegisterRequestSchema = z.object({
  /** Writing into another tool's config needs the user's say-so; main refuses without it. */
  consent: z.literal(true),
});

export const MusicAgentResultSchemas = {
  run: GitOpResultOf(MusicAgentRunResultSchema),
  agyStatus: GitOpResultOf(MusicAgyStatusSchema),
} as const;
