import {
  MCP_SERVER_NAME,
  MCP_TOOLS,
  MUSIC_AGY_AGENT_ID,
  MUSIC_MCP_TOOL_IDS,
  MUSIC_PASSES_DEFAULT,
  MUSIC_REPAIR_ROUNDS,
  SongSchema,
  agentIteratesMusic,
  emptySong,
  failure,
  isMusicMcpToolId,
  ok,
  type GitOpResult,
  type LoopModel,
  type MusicAgentMode,
  type MusicAgentProgressEvent,
  type MusicAgentRunRequest,
  type MusicAgentRunResult,
  type MusicEngine,
  type Song,
} from '@midnite/studio-shared';

import { McpToolError } from '../../mcp/errors';
import { buildCliArgs, type IterativeHost, type ScopedDispatch } from '../model/iterative';
import type { MusicTools } from './music-mcp';
import { buildMusicIterativePrompt, buildSongPrompt, buildSongRepairPrompt, extractJsonObject } from './music-prompts';

/**
 * The agent engines behind Media ▸ Audio ▸ Editor (Phase 101 Theme H) — who writes a song when the
 * user asks, and how.
 *
 *  - **Claude and Codex refine.** The CLI runs headless with a **private, single-song** Midnite MCP
 *    server attached and nothing else (no shell, no file tools), and loops write → look at the piano
 *    roll → fix → save through the `music_*` tools, within a preview budget and a tool-call ceiling.
 *    It is `model`'s `iterative.ts` pattern: pressing Generate is consent for *this one song*, so the
 *    run's server answers only `music_*` calls for the song it was started for, regardless of the
 *    global `Let agents edit music` switch, and dies with the run.
 *  - **Ollama writes in one pass.** It answers the whole song as JSON, validated against
 *    `SongSchema`; a reply that does not fit is sent back with the error, up to
 *    {@link MUSIC_REPAIR_ROUNDS} repair rounds.
 *  - **Antigravity writes in one pass** — it has no per-run MCP flag — until the user registers Midnite
 *    in its MCP config (`agy-registration.ts`). Then it refines too, but through the app's *global*
 *    server, which needs the MCP server on and `Let agents edit music` allowed; when either is off the
 *    run falls back to one pass rather than failing.
 *
 * Every outside thing is injected, so the budget, cancel, repair and fallback logic are plain unit
 * tests against a fake CLI that calls the dispatcher the way a real MCP client would.
 */

/** A run is a conversation of many tool calls; 20 minutes is generous without being open-ended. */
export const MUSIC_ITERATIVE_TIMEOUT_MS = 20 * 60_000;
/** A single-pass answer is one long generation. */
export const MUSIC_SINGLE_TIMEOUT_MS = 8 * 60_000;
/** Hard ceiling on tool calls in one run, whatever the agent does. */
export const MUSIC_ITERATIVE_MAX_CALLS = 400;

export const allowedClaudeMusicTools = (): string[] => MUSIC_MCP_TOOL_IDS.map((id) => `mcp__${MCP_SERVER_NAME}__${id}`);

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
const EDIT_TOOLS = new Set(['music_set_tempo', 'music_add_notes', 'music_remove_notes', 'music_add_cc', 'music_add_pitchbends', 'music_add_track']);

export type MusicAgentDeps = {
  tools: MusicTools;
  host: IterativeHost;
  /** The open repository's folder, for the tools' `repoPath` and the CLI's cwd. */
  repoPath: (repoId: string) => Promise<string | null>;
  /** One prompt through a one-shot engine (`runHeadlessText`, or Ollama's chat), answering the raw reply. */
  complete: (req: { engine: MusicEngine; repoId: string; prompt: string; signal: AbortSignal }) => Promise<GitOpResult<{ text: string }>>;
  /** `--model` arguments for an agent CLI. */
  modelArgs: (agentId: string, model: LoopModel | undefined) => string[];
  /** Whether Midnite is registered in Antigravity's MCP config. */
  agyRegistered: () => Promise<boolean>;
  /** Whether the app's global MCP server is listening and the music switch is on — what a registered agy needs. */
  globalMusicReady: () => boolean;
  /** Writes an empty song so a run on a brand-new name has something to edit. */
  ensureSong: (repoId: string, project: string, name: string, song: Song) => Promise<GitOpResult<{ existed: boolean }>>;
  emitProgress: (event: MusicAgentProgressEvent) => void;
};

export function createMusicAgents(deps: MusicAgentDeps) {
  const running = new Map<string, AbortController>();

  /** Which way an engine runs, given what is installed and registered. */
  async function modeFor(engine: MusicEngine): Promise<{ mode: MusicAgentMode; via: 'private' | 'global' | 'none' }> {
    if (engine.kind === 'ollama') return { mode: 'single-pass', via: 'none' };
    if (agentIteratesMusic(engine.agentId)) return { mode: 'iterative', via: 'private' };
    if (engine.agentId === MUSIC_AGY_AGENT_ID && (await deps.agyRegistered()) && deps.globalMusicReady()) return { mode: 'iterative', via: 'global' };
    return { mode: 'single-pass', via: 'none' };
  }

  async function run(req: MusicAgentRunRequest): Promise<GitOpResult<MusicAgentRunResult>> {
    if (running.has(req.runId)) return failure('That run is already in progress.');
    const controller = new AbortController();
    running.set(req.runId, controller);
    const { signal } = controller;
    const max = req.maxPasses ?? MUSIC_PASSES_DEFAULT;
    const { mode, via } = await modeFor(req.engine);
    const progress = (state: MusicAgentProgressEvent['state'], n: number, action?: string): void =>
      deps.emitProgress({ runId: req.runId, mode, state, pass: { n, max }, ...(action ? { action } : {}) });

    try {
      const repoPath = await deps.repoPath(req.repoId);
      if (!repoPath) return failure('That repository is not open.');
      const target = { repoPath, project: req.project, name: req.name };
      const ensured = await deps.ensureSong(req.repoId, req.project, req.name, emptySong(req.name));
      if (!ensured.ok) return ensured;
      // Start from what is on disk, never from a stale working copy.
      deps.tools.drop(req.repoId, req.project, req.name);

      progress('running', 0, mode === 'iterative' ? 'Starting' : 'Writing the song');
      const result =
        mode === 'iterative'
          ? await iterate(req, target, max, via === 'global', signal, progress)
          : await singlePass(req, target, signal, progress);

      if (signal.aborted) {
        progress('cancelled', 0);
        return failure('cancelled');
      }
      if (!result.ok) {
        progress('failed', 0, result.kind === 'error' ? result.message : undefined);
        return result;
      }
      progress('done', result.value.passes, result.value.summary || undefined);
      return result;
    } finally {
      running.delete(req.runId);
    }
  }

  function cancel(runId: string): GitOpResult {
    const controller = running.get(runId);
    if (!controller) return failure('Nothing to cancel.');
    controller.abort();
    return ok();
  }

  // --- one pass (Ollama, Antigravity before registration, any other agent) ---------------------

  async function singlePass(
    req: MusicAgentRunRequest,
    target: { repoPath: string; project: string; name: string },
    signal: AbortSignal,
    progress: (state: MusicAgentProgressEvent['state'], n: number, action?: string) => void,
  ): Promise<GitOpResult<MusicAgentRunResult>> {
    // Loads the working copy, so an existing song reaches the prompt and a rewrite builds on it.
    await deps.tools.music_get_info(target).catch(() => undefined);
    const current = deps.tools.peek(req.repoId, req.project, req.name)?.song;
    let prompt = buildSongPrompt({ prompt: req.prompt, existing: current });
    let lastError = '';
    for (let round = 0; round <= MUSIC_REPAIR_ROUNDS; round += 1) {
      const reply = await deps.complete({ engine: req.engine, repoId: req.repoId, prompt, signal });
      if (signal.aborted) return failure('cancelled');
      if (!reply.ok) return reply;
      let song: unknown;
      try {
        song = extractJsonObject(reply.value.text);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        prompt = buildSongRepairPrompt({ previousReply: reply.value.text, error: lastError });
        progress('running', round + 1, round < MUSIC_REPAIR_ROUNDS ? 'The reply was not valid JSON — asking again' : undefined);
        continue;
      }
      const parsed = SongSchema.safeParse(song);
      if (!parsed.success) {
        lastError = parsed.error.issues
          .slice(0, 12)
          .map((i) => `${i.path.join('.') || '(song)'}: ${i.message}`)
          .join('; ');
        prompt = buildSongRepairPrompt({ previousReply: reply.value.text, error: lastError });
        progress('running', round + 1, round < MUSIC_REPAIR_ROUNDS ? 'The song did not fit the format — asking again' : undefined);
        continue;
      }
      const song2 = { ...parsed.data, name: parsed.data.name || req.name };
      const adopted = await deps.tools.adopt(target, song2, `Wrote the song (${plural(song2.tracks.length, 'track')})`);
      if (!adopted.ok) {
        lastError = adopted.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
        prompt = buildSongRepairPrompt({ previousReply: reply.value.text, error: lastError });
        continue;
      }
      const saved = await deps.tools.music_save(target);
      const noteTotal = song2.tracks.reduce((sum, t) => sum + t.notes.length, 0);
      return ok({
        mode: 'single-pass',
        edits: 1,
        passes: round + 1,
        saved: saved.ok,
        summary: `Wrote ${plural(song2.tracks.length, 'track')} and ${plural(noteTotal, 'note')}.`,
      });
    }
    return failure(`The engine could not write a valid song after ${MUSIC_REPAIR_ROUNDS + 1} tries: ${lastError}`);
  }

  // --- refining (Claude, Codex, a registered Antigravity) ------------------------------------

  async function iterate(
    req: MusicAgentRunRequest,
    target: { repoPath: string; project: string; name: string },
    max: number,
    viaGlobal: boolean,
    signal: AbortSignal,
    progress: (state: MusicAgentProgressEvent['state'], n: number, action?: string) => void,
  ): Promise<GitOpResult<MusicAgentRunResult>> {
    if (req.engine.kind !== 'agent') return failure('Only an agent CLI can refine.');
    const engine = req.engine;
    const agent = await deps.host.resolveAgent(engine.agentId);
    if (!agent) return failure(`${engine.agentId} is not installed.`);

    const startRevision = deps.tools.peek(req.repoId, req.project, req.name)?.revision ?? 0;
    const state = { edits: 0, previews: 0, calls: 0, saved: false, dirty: false };
    const editing = ((await deps.tools.music_get_info(target).catch(() => null))?.trackCount ?? 0) > 0;
    const prompt = buildMusicIterativePrompt({ prompt: req.prompt, target, maxPasses: max, editing });
    const modelArgs = deps.modelArgs(engine.agentId, engine.model);

    const dispatch: ScopedDispatch = async (tool, rawInput) => {
      // `music_list` and `music_open` reach beyond the one song, so a run's server does not answer them.
      if (!isMusicMcpToolId(tool) || tool === 'music_open' || tool === 'music_list') return { ok: false, kind: 'error', message: `Unknown tool: "${tool}"` };
      const parsed = MCP_TOOLS[tool].input.safeParse(rawInput);
      if (!parsed.success) {
        return { ok: false, kind: 'error', message: `Invalid input for "${tool}": ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}` };
      }
      const input = parsed.data as { repoPath?: string; project?: string; name?: string };
      // The run owns one song: a call about any other is refused, so a confused agent cannot wander.
      if (input.repoPath !== target.repoPath || input.project !== target.project || input.name !== target.name) {
        return { ok: false, kind: 'refused', message: `This run edits one song. Use exactly: ${JSON.stringify(target)}` };
      }
      if (signal.aborted) return { ok: false, kind: 'refused', message: 'This run was cancelled.' };
      state.calls += 1;
      if (state.calls > MUSIC_ITERATIVE_MAX_CALLS) return { ok: false, kind: 'refused', message: 'Tool-call limit reached. Call music_save and finish.' };
      if (tool === 'music_render_preview') {
        if (state.previews >= max) return { ok: false, kind: 'refused', message: `Preview budget used up (${max} of ${max}). Call music_save now to finish.` };
        state.previews += 1;
      }
      try {
        const value = await (deps.tools[tool] as (input: unknown) => Promise<unknown>)(parsed.data);
        const result = value as { ok?: boolean; added?: number; removed?: number };
        if (EDIT_TOOLS.has(tool) && result.ok) {
          state.edits += 1;
          state.dirty = true;
          progress('running', state.previews, describe(tool, result));
        } else if (EDIT_TOOLS.has(tool) && result.ok === false) {
          progress('running', state.previews, 'An edit was rejected — retrying');
        } else if (tool === 'music_render_preview') {
          progress('running', state.previews, `Looked at the piano roll (pass ${state.previews} of ${max})`);
        } else if (tool === 'music_save' && result.ok) {
          state.saved = true;
          state.dirty = false;
          progress('running', state.previews, 'Saved the song');
        }
        return { ok: true, value };
      } catch (error) {
        if (error instanceof McpToolError) return { ok: false, kind: error.kind, message: error.message };
        return { ok: false, kind: 'error', message: error instanceof Error ? error.message : String(error) };
      }
    };

    let kill: (() => void) | null = null;
    const onAbort = (): void => kill?.();
    signal.addEventListener('abort', onAbort);

    // A private server for Claude and Codex; a registered Antigravity reaches the app's global one.
    const server = viaGlobal ? null : await deps.host.startServer({ dispatch });
    if (server && !server.ok) {
      signal.removeEventListener('abort', onAbort);
      return failure(server.message);
    }
    try {
      const args = viaGlobal
        ? [...agent.baseArgs, ...agent.headlessArgs, ...modelArgs, prompt]
        : buildCliArgs(agent, deps.host.shimLaunch(server!.ok ? server!.socketPath : ''), prompt, modelArgs, allowedClaudeMusicTools());
      if (!args) return failure(`${agent.label} cannot refine a song over several passes.`);
      const result = await deps.host.runCli({
        command: agent.command,
        args,
        cwd: target.repoPath,
        timeoutMs: MUSIC_ITERATIVE_TIMEOUT_MS,
        onSpawned: (handle) => {
          kill = handle.kill;
          if (signal.aborted) handle.kill();
        },
      });

      // Through the global server the edits arrive without passing `dispatch`; the working copy's revision counts them.
      const session = deps.tools.peek(req.repoId, req.project, req.name);
      if (viaGlobal) state.edits = Math.max(0, (session?.revision ?? 0) - startRevision);
      if (session && !session.saved) {
        const final = await deps.tools.music_save(target).catch(() => null);
        if (final?.ok) state.saved = true;
      }
      if (signal.aborted) return failure('cancelled');
      if (!result.ok) {
        return failure(result.reason === 'timed-out' ? `${agent.label} took too long.` : `Could not run ${agent.label}: ${result.hint}`);
      }
      if (state.edits === 0) {
        const tail = result.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300);
        return failure(`${agent.label} made no changes to the song${tail ? `: ${tail}` : '.'}`);
      }
      return ok({ mode: 'iterative', edits: state.edits, passes: state.previews, saved: state.saved, summary: result.output.trim().slice(-400) });
    } finally {
      signal.removeEventListener('abort', onAbort);
      if (server?.ok) await server.close().catch(() => undefined);
    }
  }

  return { run, cancel, modeFor };
}

function describe(tool: string, result: { added?: number; removed?: number }): string {
  switch (tool) {
    case 'music_add_notes':
      return `Added ${plural(result.added ?? 0, 'note')}`;
    case 'music_remove_notes':
      return `Removed ${plural(result.removed ?? 0, 'note')}`;
    case 'music_add_track':
      return 'Added a track';
    case 'music_set_tempo':
      return 'Set the tempo';
    case 'music_add_cc':
      return `Added ${plural(result.added ?? 0, 'controller change')}`;
    default:
      return `Added ${plural(result.added ?? 0, 'pitch bend')}`;
  }
}

export type MusicAgents = ReturnType<typeof createMusicAgents>;
