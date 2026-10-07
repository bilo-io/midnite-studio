import { randomBytes } from 'node:crypto';

import { commit, getStatus, reset, revertCommit, stagePaths } from '@midnite/studio-git-engine';
import {
  EVENT_CHANNELS,
  failure,
  gameEngineWarnings,
  GameAgentRunRequestSchema,
  loopModelArgs,
  ok,
  type GameAgentProgress,
  type GameAgentRunRequest,
  type GameAgentRunResult,
  type GameSummary,
  type GitOpResult,
} from '@midnite/studio-shared';

import type { Logger } from '../log';
import type { IterativeHost } from '../media/model/iterative';
import { runGameAgent, runGameOllama, type GameAgentGit, type GameAgentOutcome, type GameOllamaCall } from './game-agent';
import type { GameMcpTools } from './game-mcp';

/** The real git seam: git-engine commands, each inside the per-repo write queue. */
export const gitEngineGameAgentGit: GameAgentGit = {
  async head(path) {
    return (await getStatus(path)).branch.oid;
  },
  async changedFiles(path) {
    const status = await getStatus(path);
    return status.entries.map((entry) => entry.path).sort();
  },
  async commitAll(path, message) {
    const staged = await stagePaths(path, ['.']);
    if (!staged.ok) return staged;
    const made = await commit(path, { message });
    if (!made.ok) return made;
    const sha = (await getStatus(path)).branch.oid;
    return sha ? ok({ sha }) : failure('The commit did not move HEAD.');
  },
  async squash(path, base, message) {
    const moved = await reset(path, base, 'soft');
    if (!moved.ok) return moved;
    const made = await commit(path, { message });
    if (!made.ok) return made;
    const sha = (await getStatus(path)).branch.oid;
    return sha ? ok({ sha }) : failure('The squash did not move HEAD.');
  },
};

export type GameAgentServiceDeps = {
  /** A game by id (the game service's `resolve`). */
  resolve: (gameId: string) => Promise<GameSummary | null>;
  /** Settings ▸ Media ▸ Games ▸ squash a run's commits. */
  squashRunCommits: () => Promise<boolean>;
  host: IterativeHost;
  /** The `game_*` implementations (ungated — a run's private server answers them for one game). */
  tools: () => GameMcpTools | null;
  ollama: GameOllamaCall;
  git?: GameAgentGit;
  /** For the dirty-tree and in-progress checks; git-engine's `getStatus` by default. */
  status?: (path: string) => Promise<{ dirty: boolean; inProgress: string | null; head: string | null }>;
  revert?: (path: string, sha: string) => Promise<GitOpResult>;
  send: (channel: string, payload: unknown) => void;
  log: Logger;
};

/**
 * Starts, cancels and undoes game agent runs (Phase 107 Theme M). One run per
 * game at a time; a run is started and answered at once, and its progress
 * streams on `gamesAgentProgress`.
 *
 * A run refuses a dirty working tree: commit-per-pass stages everything, so an
 * uncommitted edit of the user's own would otherwise be swept into the
 * agent's first commit — and Undo turn would take it away with the agent's.
 */
export function createGameAgentService(deps: GameAgentServiceDeps) {
  const git = deps.git ?? gitEngineGameAgentGit;
  const status =
    deps.status ??
    (async (path: string) => {
      const s = await getStatus(path);
      return { dirty: s.entries.length > 0, inProgress: s.inProgress, head: s.branch.oid };
    });
  const revert = deps.revert ?? revertCommit;
  const running = new Map<string, { runId: string; controller: AbortController }>();
  /** The newest agent commit per game, which is the only one Undo turn accepts. */
  const lastAgentCommit = new Map<string, string>();

  const emit = (gameId: string, runId: string, progress: Omit<GameAgentProgress, 'gameId' | 'runId'>): void => {
    deps.send(EVENT_CHANNELS.gamesAgentProgress, { gameId, runId, ...progress });
  };

  async function run(raw: GameAgentRunRequest): Promise<GitOpResult<GameAgentRunResult>> {
    const parsed = GameAgentRunRequestSchema.safeParse(raw);
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Invalid request.');
    const req = parsed.data;
    const game = await deps.resolve(req.gameId);
    if (!game) return failure('That game was not found.');
    if (!game.valid) return failure(`midnite-game.json is invalid${game.issue ? `: ${game.issue}` : ''}. Fix it before running an agent.`);
    if (running.has(game.gameId)) return failure('An agent is already working on this game.');
    const tools = deps.tools();
    if (req.engine.kind === 'agent' && !tools) return failure('Media ▸ Games is not ready yet.');

    const tree = await status(game.path);
    if (tree.inProgress) return failure(`Finish or abort the ${tree.inProgress} in this game's repo first.`);
    if (tree.dirty) return failure('This game has uncommitted changes. Commit or discard them first, so the agent’s commits hold only its own edits.');

    const runId = `ga-${randomBytes(4).toString('hex')}`;
    const controller = new AbortController();
    running.set(game.gameId, { runId, controller });
    const squash = await deps.squashRunCommits().catch(() => false);
    const ref = { gameId: game.gameId, path: game.path };
    const onProgress = (progress: Omit<GameAgentProgress, 'gameId' | 'runId'>): void => {
      if (progress.commit) lastAgentCommit.set(game.gameId, progress.commit.sha);
      emit(game.gameId, runId, progress);
    };
    deps.log.info(`game agent start ${game.gameId} run=${runId} engine=${req.engine.kind} passes=${req.passes}`);

    const work: Promise<GameAgentOutcome> =
      req.engine.kind === 'agent'
        ? runGameAgent({
            host: deps.host,
            tools: tools!,
            agentId: req.engine.agentId,
            modelArgs: req.engine.model ? loopModelArgs(req.engine.agentId, req.engine.model) : [],
            prompt: req.prompt,
            game: ref,
            passes: req.passes,
            squash,
            git,
            signal: controller.signal,
            onProgress,
          })
        : runGameOllama({
            call: deps.ollama,
            model: req.engine.model,
            prompt: req.prompt,
            game: ref,
            passes: req.passes,
            squash,
            git,
            signal: controller.signal,
            onProgress,
          });

    void work
      .catch((error: unknown): GameAgentOutcome => ({
        outcome: 'failed',
        message: error instanceof Error ? error.message : String(error),
        commits: [],
      }))
      .then((outcome) => {
        running.delete(game.gameId);
        const last = outcome.commits.at(-1);
        if (last) lastAgentCommit.set(game.gameId, last.sha);
        emit(game.gameId, runId, { pass: req.passes, of: req.passes, finished: outcome });
        deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'manifest' });
        deps.log.info(`game agent ${outcome.outcome} ${game.gameId} run=${runId} commits=${outcome.commits.length}`);
      });

    return ok({ runId, warnings: gameEngineWarnings(req.engine) });
  }

  return {
    run,

    cancel(gameId: string): GitOpResult {
      const current = running.get(gameId);
      if (!current) return failure('No agent is working on this game.');
      current.controller.abort();
      return ok();
    },

    /**
     * Undo turn: a new commit reverting `sha`. Only the newest agent commit
     * this session made, and only while it is still HEAD — undoing an older
     * one would revert under later work, which is a Timeline job.
     */
    async undo(gameId: string, sha: string): Promise<GitOpResult> {
      const game = await deps.resolve(gameId);
      if (!game) return failure('That game was not found.');
      if (running.has(gameId)) return failure('Wait for the agent to finish, or cancel it, before undoing.');
      const last = lastAgentCommit.get(gameId);
      if (!last || !last.startsWith(sha.toLowerCase())) return failure('Only the last agent turn can be undone here. Use the Timeline for older commits.');
      const tree = await status(game.path);
      if (tree.head !== last) return failure('The game has moved on since that turn. Use the Timeline to revert it.');
      const result = await revert(game.path, last);
      if (result.ok) {
        lastAgentCommit.delete(gameId);
        deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'manifest' });
      }
      return result;
    },

    isRunning: (gameId: string): boolean => running.has(gameId),

    cancelAll(): void {
      for (const { controller } of running.values()) controller.abort();
    },
  };
}

export type GameAgentService = ReturnType<typeof createGameAgentService>;
