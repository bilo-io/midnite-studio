import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

import {
  checkGameOllamaPath,
  failure,
  GAME_AGENT_COMMIT_PREFIX,
  GAME_MANIFEST_FILE,
  GAME_MCP_TOOL_IDS,
  GAME_OLLAMA_CONTEXT_MAX_BYTES,
  GameOllamaEnvelopeSchema,
  isGameMcpToolId,
  MCP_SERVER_NAME,
  MCP_TOOLS,
  ok,
  type GameAgentCommit,
  type GameAgentProgress,
  type GameMcpToolId,
  type GitOpResult,
} from '@midnite/studio-shared';

import { McpToolError } from '../mcp/errors';
import {
  MODEL_ITERATIVE_MAX_CALLS,
  MODEL_ITERATIVE_TIMEOUT_MS,
  type IterativeHost,
  type ResolvedAgent,
  type ScopedDispatch,
} from '../media/model/iterative';
import type { GameMcpTools } from './game-mcp';

/**
 * Create and iterate (Phase 107 Theme M): an agent edits a game repo in
 * passes, and every pass that changed files becomes one commit — so the
 * Timeline shows the game's history pass by pass and **Undo turn** is a plain
 * `git revert` of the newest one.
 *
 * Two kinds of writer:
 *
 * - **An agent CLI** (Claude Code, Codex) runs headless *in the game repo*
 *   (`IterativeHost.runCli`, cwd = the repo) with its own file tools and a
 *   private MCP server answering only this game's `game_*` tools — so it plays
 *   the game it is editing. **No shell** (Decision 11): the runner sandbox is
 *   the only place AI-written code may execute.
 * - **Ollama**, which has no tools: it is shown the repo's `src/` and answers
 *   whole-file replacements in a zod-validated envelope that main applies,
 *   only under `src/`.
 *
 * Every outside thing is injected (`IterativeHost`, `GameAgentGit`, the Ollama
 * call), so commit-per-pass, squash, refusals and cancel are plain unit tests.
 */

export type GameRef = { gameId: string; path: string };

/** The git writes a run makes, all through git-engine's per-repo write queue. */
export type GameAgentGit = {
  /** HEAD's sha, or `null` in an unborn repo. */
  head: (path: string) => Promise<string | null>;
  /** Paths with any change (staged, unstaged or untracked); a non-empty answer also when an operation is in progress. */
  changedFiles: (path: string) => Promise<string[]>;
  /** Stage everything and commit it; answers the new sha. */
  commitAll: (path: string, message: string) => Promise<GitOpResult<{ sha: string }>>;
  /** `reset --soft base` + one commit: the run's passes become one commit. */
  squash: (path: string, base: string, message: string) => Promise<GitOpResult<{ sha: string }>>;
};

export type PassOutcome = { ok: true; summary: string } | { ok: false; message: string };

/** One pass of a writer: edit the files in the repo, answer a sentence about what changed. */
export type RunPass = (ctx: {
  pass: number;
  of: number;
  signal: AbortSignal;
  onAction: (action: string) => void;
}) => Promise<PassOutcome>;

export type GameAgentOutcome = {
  outcome: 'done' | 'cancelled' | 'failed';
  message: string;
  commits: GameAgentCommit[];
};

export type ProgressSink = (progress: Omit<GameAgentProgress, 'gameId' | 'runId'>) => void;

/** `agent: <first 60 chars of the prompt, one line>` — the subject every agent commit carries. */
export function agentCommitSubject(prompt: string): string {
  const line = prompt.replace(/\s+/g, ' ').trim();
  return `${GAME_AGENT_COMMIT_PREFIX}${line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line}`;
}

/**
 * The commit-per-pass loop every writer shares. After each pass: anything
 * changed → stage + commit (`agent: <prompt> (pass n/N)`); nothing changed → no
 * commit. A cancelled or failed pass still commits what it left, so the tree is
 * never left dirty and the half-pass can be undone like any other. With
 * `squash`, a run of more than one commit ends as one.
 */
export async function runGameTurns(opts: {
  game: GameRef;
  prompt: string;
  passes: number;
  squash: boolean;
  git: GameAgentGit;
  signal: AbortSignal;
  runPass: RunPass;
  onProgress: ProgressSink;
}): Promise<GameAgentOutcome> {
  const { game, git, signal } = opts;
  const of = Math.max(1, opts.passes);
  const subject = agentCommitSubject(opts.prompt);
  const base = await git.head(game.path);
  const commits: GameAgentCommit[] = [];
  const summaries: string[] = [];
  let stop: { outcome: 'cancelled' | 'failed'; message: string } | null = null;

  for (let pass = 1; pass <= of; pass += 1) {
    if (signal.aborted) {
      stop = { outcome: 'cancelled', message: 'Cancelled.' };
      break;
    }
    opts.onProgress({ pass, of, action: `Pass ${pass} of ${of}` });
    const result = await opts.runPass({
      pass,
      of,
      signal,
      onAction: (action) => opts.onProgress({ pass, of, action }),
    });

    const files = await git.changedFiles(game.path);
    if (files.length > 0) {
      const committed = await git.commitAll(game.path, `${subject} (pass ${pass}/${of})`);
      if (!committed.ok) {
        stop = {
          outcome: 'failed',
          message:
            committed.kind === 'error'
              ? `Could not commit pass ${pass}: ${committed.message}`
              : `Could not commit pass ${pass}.`,
        };
        break;
      }
      const commit = { sha: committed.value.sha, files };
      commits.push(commit);
      opts.onProgress({ pass, of, commit });
    } else {
      opts.onProgress({ pass, of, action: 'No files changed in this pass' });
    }

    if (signal.aborted) {
      stop = { outcome: 'cancelled', message: 'Cancelled.' };
      break;
    }
    if (!result.ok) {
      stop = { outcome: 'failed', message: result.message };
      break;
    }
    if (result.summary) summaries.push(result.summary);
  }

  let kept = commits;
  if (opts.squash && commits.length > 1 && base !== null) {
    const squashed = await git.squash(game.path, base, `${subject} (${commits.length} passes)`);
    if (squashed.ok)
      kept = [
        { sha: squashed.value.sha, files: [...new Set(commits.flatMap((c) => c.files))].sort() },
      ];
  }

  if (stop) return { ...stop, commits: kept };
  const last = summaries.at(-1);
  const message =
    kept.length === 0
      ? `No files changed${last ? ` — ${last}` : '.'}`
      : `${kept.length === 1 ? '1 commit' : `${kept.length} commits`}${last ? ` — ${last}` : '.'}`;
  return { outcome: 'done', message, commits: kept };
}

// --- agent CLIs ---------------------------------------------------------------------

/** The built-in file tools a game agent gets. No `Bash`: the runner sandbox is the only place game code runs. */
export const GAME_AGENT_FILE_TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep'] as const;

/** The `game_*` tools a run's private server answers: everything but creating or opening another game. */
export const GAME_AGENT_TOOL_IDS: readonly GameMcpToolId[] = GAME_MCP_TOOL_IDS.filter(
  (id) => id !== 'game_create' && id !== 'game_open',
);

export const allowedGameClaudeTools = (): string[] => [
  ...GAME_AGENT_FILE_TOOLS,
  ...GAME_AGENT_TOOL_IDS.map((id) => `mcp__${MCP_SERVER_NAME}__${id}`),
];

const tomlString = (value: string): string => JSON.stringify(value);

/**
 * The argv for one pass. Claude Code: strict MCP config (this run's server
 * only), built-ins limited to the file tools, nothing else allowed. Codex:
 * `--sandbox workspace-write` with network off, and the server as `-c`
 * overrides. Any other CLI cannot be confined this way, so it is refused.
 */
export function buildGameCliArgs(
  agent: ResolvedAgent,
  shim: { command: string; args: string[]; env: Record<string, string> },
  prompt: string,
  modelArgs: string[],
): string[] | null {
  const head = [...agent.baseArgs, ...agent.headlessArgs, ...modelArgs];
  if (agent.id === 'claude') {
    const config = JSON.stringify({
      mcpServers: { [MCP_SERVER_NAME]: { command: shim.command, args: shim.args, env: shim.env } },
    });
    return [
      ...head,
      prompt,
      '--mcp-config',
      config,
      '--strict-mcp-config',
      '--tools',
      GAME_AGENT_FILE_TOOLS.join(','),
      '--permission-mode',
      'dontAsk',
      '--allowedTools',
      ...allowedGameClaudeTools(),
    ];
  }
  if (agent.id === 'codex') {
    const env = `{ ${Object.entries(shim.env)
      .map(([k, v]) => `${k} = ${tomlString(v)}`)
      .join(', ')} }`;
    const server = `mcp_servers.${MCP_SERVER_NAME.replace(/-/g, '_')}`;
    return [
      ...head,
      '--sandbox',
      'workspace-write',
      '-c',
      'sandbox_workspace_write.network_access=false',
      '-c',
      `${server}.command=${tomlString(shim.command)}`,
      '-c',
      `${server}.args=[${shim.args.map(tomlString).join(', ')}]`,
      '-c',
      `${server}.env=${env}`,
      prompt,
    ];
  }
  return null;
}

/** The brief for one pass. Pass 1 makes the change; later passes play-test and fix. */
export function buildGamePassPrompt(req: {
  prompt: string;
  game: GameRef;
  pass: number;
  of: number;
}): string {
  const { game, pass, of } = req;
  return [
    `You are working on a Midnite Studio game: the repository in the current folder (gameId "${game.gameId}").`,
    'Start by reading the midnite-media-game-build skill (in .claude/skills/, .agents/skills/ or .codex/skills/), and the genre recipe skill there if one fits the request.',
    '',
    `The request: ${req.prompt}`,
    '',
    pass === 1
      ? `This is pass 1 of ${of}. Make the change with your file tools, then play-test it.`
      : `This is pass ${pass} of ${of}. Play-test the game, then fix what is wrong or move it closer to the request. If it already does what was asked, make no edits.`,
    `Play-test through the midnite MCP tools, always with game "${game.gameId}": game_run, game_screenshot, game_logs, game_input, game_state, game_reload, game_stop.`,
    'Rules: edit only files inside this folder; never edit vendor/ or kit/ (extend the kit from src/); keep getState() truthful; there is no shell, so do not try to run commands.',
    'Finish with one sentence saying what you changed.',
  ].join('\n');
}

const ACTION_LABELS: Partial<Record<GameMcpToolId, string>> = {
  game_run: 'Ran the game',
  game_reload: 'Reloaded the game',
  game_stop: 'Stopped the game',
  game_screenshot: 'Took a screenshot',
  game_logs: 'Read the console',
  game_input: 'Played the game',
  game_state: 'Read the game state',
  game_get_manifest: 'Read the manifest',
  game_set_manifest: 'Changed the manifest',
  game_import_asset: 'Imported an asset',
};

/**
 * The private server's dispatcher: this game's tools only, fixed to this
 * `gameId` (or its path), under a tool-call ceiling. It calls the tool
 * implementations directly — pressing Run is consent for this one game, the
 * same reasoning as Models' iterative runs, so the global `allowGames` switch
 * does not gate it.
 */
export function createGameAgentDispatch(opts: {
  tools: GameMcpTools;
  game: GameRef;
  signal: AbortSignal;
  onAction: (action: string) => void;
  maxCalls?: number;
}): ScopedDispatch {
  const max = opts.maxCalls ?? MODEL_ITERATIVE_MAX_CALLS;
  let calls = 0;
  return async (tool, rawInput) => {
    if (!isGameMcpToolId(tool) || !GAME_AGENT_TOOL_IDS.includes(tool))
      return { ok: false, kind: 'error', message: `Unknown tool: "${tool}"` };
    const parsed = MCP_TOOLS[tool].input.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        kind: 'error',
        message: `Invalid input for "${tool}": ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`,
      };
    }
    const input = parsed.data as { game?: string };
    if (tool !== 'game_list' && input.game !== opts.game.gameId && input.game !== opts.game.path) {
      return {
        ok: false,
        kind: 'refused',
        message: `This run edits one game. Use game "${opts.game.gameId}".`,
      };
    }
    if (opts.signal.aborted)
      return { ok: false, kind: 'refused', message: 'This run was cancelled.' };
    calls += 1;
    if (calls > max)
      return {
        ok: false,
        kind: 'refused',
        message: 'Tool-call limit reached. Finish this pass now.',
      };
    try {
      const handler = opts.tools[tool] as (input: unknown) => Promise<unknown>;
      const value = await handler(parsed.data);
      const label = ACTION_LABELS[tool];
      if (label) opts.onAction(label);
      return { ok: true, value };
    } catch (error) {
      if (error instanceof McpToolError)
        return { ok: false, kind: error.kind, message: error.message };
      return {
        ok: false,
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

/** Runs an agent CLI over a game, one CLI run per pass, behind one private MCP server for the whole run. */
export async function runGameAgent(opts: {
  host: IterativeHost;
  tools: GameMcpTools;
  agentId: string;
  modelArgs: string[];
  prompt: string;
  game: GameRef;
  passes: number;
  squash: boolean;
  git: GameAgentGit;
  signal: AbortSignal;
  onProgress: ProgressSink;
  timeoutMs?: number;
}): Promise<GameAgentOutcome> {
  const { host, game, signal } = opts;
  const agent = await host.resolveAgent(opts.agentId);
  if (!agent)
    return { outcome: 'failed', message: `${opts.agentId} is not installed.`, commits: [] };
  if (buildGameCliArgs(agent, { command: '', args: [], env: {} }, '', []) === null) {
    return {
      outcome: 'failed',
      message: `${agent.label} cannot be limited to file tools here. Pick Claude Code or Codex, or an Ollama model.`,
      commits: [],
    };
  }

  let currentPass = { pass: 1, of: Math.max(1, opts.passes) };
  const dispatch = createGameAgentDispatch({
    tools: opts.tools,
    game,
    signal,
    onAction: (action) => opts.onProgress({ ...currentPass, action }),
  });
  const server = await host.startServer({ dispatch });
  if (!server.ok) return { outcome: 'failed', message: server.message, commits: [] };

  try {
    const shim = host.shimLaunch(server.socketPath);
    return await runGameTurns({
      game,
      prompt: opts.prompt,
      passes: opts.passes,
      squash: opts.squash,
      git: opts.git,
      signal,
      onProgress: opts.onProgress,
      runPass: async ({ pass, of }) => {
        currentPass = { pass, of };
        const args = buildGameCliArgs(
          agent,
          shim,
          buildGamePassPrompt({ prompt: opts.prompt, game, pass, of }),
          opts.modelArgs,
        )!;
        let kill: (() => void) | null = null;
        const onAbort = (): void => kill?.();
        signal.addEventListener('abort', onAbort);
        try {
          const result = await host.runCli({
            command: agent.command,
            args,
            cwd: game.path,
            timeoutMs: opts.timeoutMs ?? MODEL_ITERATIVE_TIMEOUT_MS,
            onSpawned: (handle) => {
              kill = handle.kill;
              if (signal.aborted) handle.kill();
            },
          });
          if (!result.ok) {
            return {
              ok: false,
              message:
                result.reason === 'timed-out'
                  ? `${agent.label} took too long on pass ${pass}.`
                  : `Could not run ${agent.label}: ${result.hint}`,
            };
          }
          if (result.exitCode !== 0 && !signal.aborted) {
            const tail = result.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300);
            return {
              ok: false,
              message: `${agent.label} stopped with an error${tail ? `: ${tail}` : '.'}`,
            };
          }
          return { ok: true, summary: lastSentence(result.output) };
        } finally {
          signal.removeEventListener('abort', onAbort);
        }
      },
    });
  } finally {
    await server.close().catch(() => undefined);
  }
}

const lastSentence = (output: string): string => {
  const text = output.trim();
  if (!text) return '';
  const line =
    text
      .split('\n')
      .filter((l) => l.trim())
      .at(-1) ?? '';
  return line.length > 300 ? `${line.slice(0, 299)}…` : line;
};

// --- Ollama ---------------------------------------------------------------------------

/** One JSON-mode Ollama chat: the prompt in, the reply text out. */
export type GameOllamaCall = (req: {
  model: string;
  prompt: string;
  signal: AbortSignal;
}) => Promise<GitOpResult<{ text: string }>>;

const TRUNCATED =
  '\n/* … truncated by Midnite Studio: the file is longer than the context allows */\n';

/**
 * What an Ollama pass is shown: `midnite-game.json` and `src/**\/*.js`, up to
 * 60 KB. When the files run over, the largest are cut short with a marker
 * rather than dropped, so the model still sees every file exists.
 */
export async function gatherOllamaContext(
  root: string,
  maxBytes = GAME_OLLAMA_CONTEXT_MAX_BYTES,
): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];
  try {
    files.push({
      path: GAME_MANIFEST_FILE,
      content: await readFile(join(root, GAME_MANIFEST_FILE), 'utf8'),
    });
  } catch {
    // An invalid or missing manifest is still worth editing around.
  }
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && /\.js$/.test(entry.name)) {
        files.push({
          path: relative(root, full).split(sep).join('/'),
          content: await readFile(full, 'utf8'),
        });
      }
    }
  };
  await walk(join(root, 'src'));

  // Shrink the largest file until everything fits.
  const total = (): number => files.reduce((sum, f) => sum + Buffer.byteLength(f.content), 0);
  while (total() > maxBytes) {
    const largest = files.reduce((a, b) =>
      Buffer.byteLength(b.content) > Buffer.byteLength(a.content) ? b : a,
    );
    const over = total() - maxBytes;
    const keep = Math.max(0, largest.content.length - over - TRUNCATED.length - 64);
    if (keep === 0 && largest.content.endsWith(TRUNCATED)) break;
    largest.content = `${largest.content.slice(0, keep)}${TRUNCATED}`;
  }
  return files;
}

export function buildOllamaPrompt(req: {
  prompt: string;
  pass: number;
  of: number;
  files: Array<{ path: string; content: string }>;
}): string {
  return [
    'You are editing a browser game written as plain ES modules (Phaser or three.js, through the kit in kit/, which you cannot change).',
    `The request: ${req.prompt}`,
    req.pass === 1
      ? ''
      : `This is pass ${req.pass} of ${req.of}: improve on the previous pass, or change nothing if the request is met.`,
    '',
    'Answer with JSON only, in exactly this shape:',
    '{"files":[{"path":"src/...","content":"<the WHOLE new file>"}],"summary":"<one sentence>"}',
    'Rules: only paths under src/ ending in .js or .json; each file is replaced whole; at most 10 files; return an empty "files" list to change nothing.',
    '',
    'The current files:',
    ...req.files.map((f) => `--- ${f.path}\n${f.content}`),
  ]
    .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
    .join('\n');
}

/** Pulls the JSON object out of a reply that may be fenced or chatty. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1]! : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not answer with JSON.');
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Validates an envelope and writes it. One path outside `src/` refuses the
 * **whole** envelope — nothing is written — so a model that tries to touch
 * `kit/` or `vendor/` leaves the repo exactly as it was.
 */
export async function applyOllamaEnvelope(
  root: string,
  raw: unknown,
): Promise<GitOpResult<{ files: string[]; summary: string }>> {
  const parsed = GameOllamaEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return failure(
      `The model's answer was not a valid edit${first ? ` (${first.path.join('.') || '(root)'}: ${first.message})` : ''}.`,
    );
  }
  const writes: Array<{ path: string; content: string }> = [];
  for (const file of parsed.data.files) {
    const checked = checkGameOllamaPath(file.path);
    if (!checked.ok) return failure(checked.message);
    writes.push({ path: checked.path, content: file.content });
  }
  // A symlinked src/ could point anywhere; refuse to write through one.
  const srcStat = await lstat(join(root, 'src')).catch(() => null);
  if (srcStat && (srcStat.isSymbolicLink() || !srcStat.isDirectory()))
    return failure('src/ is not a plain folder, so nothing was written.');
  try {
    for (const file of writes) {
      const full = join(root, ...file.path.split('/'));
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, file.content, 'utf8');
    }
  } catch (error) {
    return failure(
      `Could not write the edit: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return ok({ files: writes.map((w) => w.path), summary: parsed.data.summary });
}

export async function runGameOllama(opts: {
  call: GameOllamaCall;
  model: string;
  prompt: string;
  game: GameRef;
  passes: number;
  squash: boolean;
  git: GameAgentGit;
  signal: AbortSignal;
  onProgress: ProgressSink;
}): Promise<GameAgentOutcome> {
  return runGameTurns({
    game: opts.game,
    prompt: opts.prompt,
    passes: opts.passes,
    squash: opts.squash,
    git: opts.git,
    signal: opts.signal,
    onProgress: opts.onProgress,
    runPass: async ({ pass, of, signal, onAction }) => {
      const files = await gatherOllamaContext(opts.game.path);
      onAction(`Asked ${opts.model} for an edit`);
      const reply = await opts.call({
        model: opts.model,
        prompt: buildOllamaPrompt({ prompt: opts.prompt, pass, of, files }),
        signal,
      });
      if (!reply.ok)
        return {
          ok: false,
          message: reply.kind === 'error' ? reply.message : 'The model call failed.',
        };
      let raw: unknown;
      try {
        raw = extractJson(reply.value.text);
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
      const applied = await applyOllamaEnvelope(opts.game.path, raw);
      if (!applied.ok)
        return {
          ok: false,
          message: applied.kind === 'error' ? applied.message : 'The edit was refused.',
        };
      if (applied.value.files.length > 0) onAction(`Wrote ${applied.value.files.join(', ')}`);
      return { ok: true, summary: applied.value.summary };
    },
  });
}
