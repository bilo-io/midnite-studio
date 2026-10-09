import {
  MCP_SERVER_NAME,
  MCP_TOOLS,
  MODEL_ITERATIONS_DEFAULT,
  MODEL_MCP_TOOL_IDS,
  isModelMcpToolId,
  type ModelPatchOp,
} from '@midnite/studio-shared';

import { McpToolError } from '../../mcp/errors';
import type { ModelTools } from './model-mcp';

/**
 * The iterative agent engine for Media ▸ Models: an agent CLI that speaks MCP
 * runs headless with a **private, single-model** Midnite MCP server attached
 * and nothing else — no shell, no file tools — and loops build → render →
 * compare → refine → save through the `model_*` tools, within an iteration
 * budget. Each edit streams into the open editor as it lands.
 *
 * Why a private server instead of the app's global MCP socket: the global one
 * is the user's standing consent (Settings ▸ MCP, off by default, with its own
 * switches). Pressing Generate with an agent engine is consent for *this one
 * model*, and nothing wider — the run's server answers only the `model_*` tools,
 * only for the model it was started for, and dies with the run. The user
 * need not enable anything else, and the agent cannot reach git, the UI or
 * workflow gates by way of it.
 *
 * Every outside thing is injected (`IterativeHost`), so the loop — budget,
 * cancel, save — is a plain unit test against a fake CLI that calls the
 * dispatcher the way a real MCP client would.
 */

export const MODEL_MCP_SERVER_NAME = MCP_SERVER_NAME;
/** A run is a conversation of many tool calls; 20 minutes is generous without being open-ended. */
export const MODEL_ITERATIVE_TIMEOUT_MS = 20 * 60_000;
/** Hard ceiling on tool calls in one run, whatever the agent does. */
export const MODEL_ITERATIVE_MAX_CALLS = 400;
/**
 * Sculpt and mesh-pipeline calls (Phase 104) are cheap — a stroke is a few milliseconds — so they do not spend the
 * render budget, but they are bounded by it: a run may make this many per refinement pass (never fewer than the
 * floor), so the 1–100 slider still sizes the whole run.
 */
export const MODEL_ITERATIVE_SCULPT_CALLS_PER_PASS = 12;
export const MODEL_ITERATIVE_SCULPT_CALLS_FLOOR = 24;
/** The tools that edit a sculpt mesh or run the mesh pipeline over MCP. */
export const MODEL_SCULPT_TOOL_IDS = [
  'model_sculpt_stroke',
  'model_mask',
  'model_subdivide',
  'model_remesh',
  'model_sculpt_undo',
  'model_decimate',
  'model_retopo',
  'model_unwrap',
  'model_bake',
] as const;
const isSculptTool = (tool: string): boolean => (MODEL_SCULPT_TOOL_IDS as readonly string[]).includes(tool);

/** The score a `model_compare_reference` answer carries (its first text block is the JSON summary). */
function scoreOf(value: unknown): { value: number; history: number[] } | null {
  const first = (value as { _content?: { type?: string; text?: string }[] } | null)?._content?.[0];
  if (first?.type !== 'text' || !first.text) return null;
  try {
    const parsed = JSON.parse(first.text) as { score?: unknown; history?: unknown };
    if (typeof parsed.score !== 'number' || !Array.isArray(parsed.history)) return null;
    return { value: parsed.score, history: parsed.history.filter((n): n is number => typeof n === 'number') };
  } catch {
    return null;
  }
}

/** Whether a tool's answer reports success: an edit result's `ok`, or the first text block of a content answer. */
function answeredOk(value: unknown): boolean {
  const direct = value as { ok?: boolean; _content?: { type: string; text?: string }[] };
  if (direct.ok !== undefined) return direct.ok;
  const first = direct._content?.find((b) => b.type === 'text')?.text;
  if (!first) return false;
  try {
    return (JSON.parse(first) as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
}

export type DispatchResult = { ok: true; value: unknown } | { ok: false; kind: 'error' | 'not-found' | 'refused'; message: string };
export type ScopedDispatch = (tool: string, input: unknown) => Promise<DispatchResult>;

export type ResolvedAgent = {
  id: string;
  label: string;
  command: string;
  baseArgs: string[];
  headlessArgs: string[];
};

export type CliRequest = {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  onSpawned: (handle: { kill: () => void }) => void;
};
export type CliResult =
  | { ok: true; exitCode: number | null; output: string; stderr: string }
  | { ok: false; reason: 'not-installed' | 'timed-out' | 'parse-failed'; hint: string };

export type IterativeHost = {
  /** Start the private MCP server answering `dispatch` on a fresh socket; `message` says why it could not. */
  startServer: (req: { dispatch: ScopedDispatch }) => Promise<{ ok: true; socketPath: string; close: () => Promise<void> } | { ok: false; message: string }>;
  /** How an MCP client launches the stdio shim for a socket. */
  shimLaunch: (socketPath: string) => { command: string; args: string[]; env: Record<string, string> };
  resolveAgent: (agentId: string) => Promise<ResolvedAgent | null>;
  runCli: (req: CliRequest) => Promise<CliResult>;
};

export type IterativeProgress = {
  iteration: { n: number; max: number };
  action?: string;
  /** The latest `model_compare_reference` score and the history of them (Phase 104 Theme H). */
  score?: { value: number; history: number[] };
};

export type IterativeOptions = {
  host: IterativeHost;
  tools: ModelTools;
  agentId: string;
  /** `--model` arguments for the CLI, already resolved. */
  modelArgs: string[];
  /** The brief the agent is given, built by `buildIterativePrompt`. */
  prompt: string;
  target: { repoPath: string; project: string; model: string };
  cwd: string;
  maxIterations: number;
  signal: AbortSignal;
  onProgress: (progress: IterativeProgress) => void;
  timeoutMs?: number;
};

export type IterativeOutcome =
  | { kind: 'done'; edits: number; renders: number; saved: boolean; summary: string }
  | { kind: 'cancelled'; edits: number; renders: number }
  | { kind: 'failed'; edits: number; renders: number; message: string };

/** The tool names a CLI is allowed, as Claude Code spells MCP tools. */
export const allowedClaudeTools = (): string[] => MODEL_MCP_TOOL_IDS.map((id) => `mcp__${MODEL_MCP_SERVER_NAME}__${id}`);

const tomlString = (value: string): string => JSON.stringify(value);

/**
 * The argv for one agent CLI. Claude Code: its own MCP config, strict (no
 * other servers), every built-in tool off, only the `model_*` tools allowed.
 * Codex: the server and its env as `-c` config overrides. Variadic flags go
 * last so they cannot swallow the prompt.
 */
export function buildCliArgs(
  agent: ResolvedAgent,
  shim: { command: string; args: string[]; env: Record<string, string> },
  prompt: string,
  modelArgs: string[],
  /** Claude Code's allowlist; defaults to the `model_*` tools (the music engine passes its own). */
  allowedTools: string[] = allowedClaudeTools(),
): string[] | null {
  const head = [...agent.baseArgs, ...agent.headlessArgs, ...modelArgs];
  if (agent.id === 'claude') {
    const config = JSON.stringify({ mcpServers: { [MODEL_MCP_SERVER_NAME]: { command: shim.command, args: shim.args, env: shim.env } } });
    return [
      ...head,
      prompt,
      '--mcp-config',
      config,
      '--strict-mcp-config',
      '--tools',
      '',
      '--permission-mode',
      'dontAsk',
      '--allowedTools',
      ...allowedTools,
    ];
  }
  if (agent.id === 'codex') {
    const env = `{ ${Object.entries(shim.env).map(([k, v]) => `${k} = ${tomlString(v)}`).join(', ')} }`;
    const server = `mcp_servers.${MODEL_MCP_SERVER_NAME.replace(/-/g, '_')}`;
    return [
      ...head,
      '-c',
      `${server}.command=${tomlString(shim.command)}`,
      '-c',
      `${server}.args=[${shim.args.map(tomlString).join(', ')}]`,
      '-c',
      `${server}.env=${env}`,
      '--skip-git-repo-check',
      prompt,
    ];
  }
  return null;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

function describePatch(ops: readonly ModelPatchOp[]): string {
  const count = (op: ModelPatchOp['op']) => ops.filter((o) => o.op === op).length;
  const bits = [
    count('add') ? `added ${plural(count('add'), 'part')}` : '',
    count('update') ? `changed ${plural(count('update'), 'part')}` : '',
    count('remove') ? `removed ${plural(count('remove'), 'part')}` : '',
  ].filter(Boolean);
  return bits.length ? bits.join(', ') : 'patched parts';
}

export async function runIterative(opts: IterativeOptions): Promise<IterativeOutcome> {
  const { host, tools, target, signal } = opts;
  const max = Math.max(1, opts.maxIterations || MODEL_ITERATIONS_DEFAULT);
  const state = { edits: 0, renders: 0, calls: 0, sculpts: 0, saved: false, dirty: false };
  const sculptBudget = Math.max(MODEL_ITERATIVE_SCULPT_CALLS_FLOOR, max * MODEL_ITERATIVE_SCULPT_CALLS_PER_PASS);
  let lastSpecSummary = '';

  const progress = (action?: string, score?: IterativeProgress['score']): void =>
    opts.onProgress({ iteration: { n: state.renders, max }, ...(action ? { action } : {}), ...(score ? { score } : {}) });

  /** The one dispatcher a run's private server answers with. */
  const dispatch: ScopedDispatch = async (tool, rawInput) => {
    if (!isModelMcpToolId(tool) || tool === 'model_open') return { ok: false, kind: 'error', message: `Unknown tool: "${tool}"` };
    const parsed = MCP_TOOLS[tool].input.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, kind: 'error', message: `Invalid input for "${tool}": ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}` };
    }
    const input = parsed.data as { repoPath?: string; project?: string; model?: string };
    // The run owns one model: a call about any other is refused, so a confused agent cannot wander.
    if (input.repoPath !== target.repoPath || input.project !== target.project || (input.model ?? '').replace(/\.(obj|mtl|fbx|json)$/i, '') !== target.model.replace(/\.(obj|mtl|fbx|json)$/i, '')) {
      return { ok: false, kind: 'refused', message: `This run edits one model. Use exactly: ${JSON.stringify(target)}` };
    }
    if (signal.aborted) return { ok: false, kind: 'refused', message: 'This run was cancelled.' };
    state.calls += 1;
    if (state.calls > MODEL_ITERATIVE_MAX_CALLS) return { ok: false, kind: 'refused', message: 'Tool-call limit reached. Call model_save and finish.' };
    if (isSculptTool(tool)) {
      if (state.sculpts >= sculptBudget) {
        return { ok: false, kind: 'refused', message: `Sculpt budget used up (${sculptBudget} sculpt calls for ${max} refinement pass(es)). Call model_save now to finish.` };
      }
      state.sculpts += 1;
    }
    if (tool === 'model_render_preview') {
      if (state.renders >= max) {
        return { ok: false, kind: 'refused', message: `Render budget used up (${max} of ${max}). Call model_save now to finish.` };
      }
      state.renders += 1;
    }

    try {
      const handler = tools[tool] as (input: unknown) => Promise<unknown>;
      const value = await handler(parsed.data);
      const result = value as { ok?: boolean; partCount?: number; saved?: boolean };
      if (tool === 'model_set_spec' && result.ok) {
        state.edits += 1;
        state.dirty = true;
        lastSpecSummary = `${plural(result.partCount ?? 0, 'part')}`;
        progress(`Wrote a design (${lastSpecSummary})`);
      } else if (tool === 'model_patch_parts' && result.ok) {
        state.edits += 1;
        state.dirty = true;
        const ops = (parsed.data as unknown as { ops: ModelPatchOp[] }).ops;
        lastSpecSummary = `${plural(result.partCount ?? 0, 'part')}`;
        progress(`Patched: ${describePatch(ops)} (${lastSpecSummary})`);
      } else if (isSculptTool(tool) && tool !== 'model_mask' && answeredOk(value)) {
        state.edits += 1;
        state.dirty = true;
        progress(`Sculpting: ${tool.replace('model_', '').replace(/_/g, ' ')}`);
      } else if (tool === 'model_render_preview') progress(`Rendered a preview (pass ${state.renders} of ${max})`);
      else if (tool === 'model_save') {
        state.saved = true;
        state.dirty = false;
        progress('Saved the model');
      } else if (tool === 'model_get_reference_image') progress('Looked at the reference picture');
      else if (tool === 'model_compare_reference') {
        const score = scoreOf(value);
        progress(score ? `Matched the reference: ${score.value.toFixed(2)}` : 'Compared with the reference', score ?? undefined);
      }
      else if (tool === 'model_get_spec') progress('Read the design format');
      else if ((tool === 'model_set_spec' || tool === 'model_patch_parts') && result.ok === false) progress('An edit was rejected — retrying');
      return { ok: true, value };
    } catch (error) {
      if (error instanceof McpToolError) return { ok: false, kind: error.kind, message: error.message };
      return { ok: false, kind: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  };

  const agent = await host.resolveAgent(opts.agentId);
  if (!agent) return { kind: 'failed', edits: 0, renders: 0, message: `${opts.agentId} is not installed.` };

  const server = await host.startServer({ dispatch });
  if (!server.ok) return { kind: 'failed', edits: 0, renders: 0, message: server.message };

  let kill: (() => void) | null = null;
  const onAbort = (): void => kill?.();
  signal.addEventListener('abort', onAbort);

  try {
    const args = buildCliArgs(agent, host.shimLaunch(server.socketPath), opts.prompt, opts.modelArgs);
    if (!args) return { kind: 'failed', edits: 0, renders: 0, message: `${agent.label} cannot run in the iterative mode.` };
    progress();
    const result = await host.runCli({
      command: agent.command,
      args,
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs ?? MODEL_ITERATIVE_TIMEOUT_MS,
      onSpawned: (handle) => {
        kill = handle.kill;
        // Cancelled between the request and the spawn: stop it the moment it exists.
        if (signal.aborted) handle.kill();
      },
    });

    // Anything the agent left unsaved is saved here, so the files always match the design the editor shows.
    let saved = state.saved;
    if (state.dirty) {
      const final = await tools.model_save({ ...target }).catch(() => null);
      if (final) saved = true;
    }
    if (signal.aborted) return { kind: 'cancelled', edits: state.edits, renders: state.renders };
    if (!result.ok) {
      return {
        kind: 'failed',
        edits: state.edits,
        renders: state.renders,
        message: result.reason === 'timed-out' ? `${agent.label} took too long.` : `Could not run ${agent.label}: ${result.hint}`,
      };
    }
    if (state.edits === 0) {
      const tail = result.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300);
      return { kind: 'failed', edits: 0, renders: state.renders, message: `${agent.label} made no changes to the model${tail ? `: ${tail}` : '.'}` };
    }
    return { kind: 'done', edits: state.edits, renders: state.renders, saved, summary: result.output.trim().slice(-400) };
  } finally {
    signal.removeEventListener('abort', onAbort);
    await server.close().catch(() => undefined);
  }
}
