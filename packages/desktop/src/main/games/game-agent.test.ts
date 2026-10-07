import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { TempRepo } from '@midnite/studio-git-engine';
import { EVENT_CHANNELS, GAMES_OLLAMA_WARNING, ok, type GameAgentProgress, type GameSummary } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '../log';
import type { CliRequest, CliResult, IterativeHost, ScopedDispatch } from '../media/model/iterative';
import {
  agentCommitSubject,
  applyOllamaEnvelope,
  buildGameCliArgs,
  createGameAgentDispatch,
  gatherOllamaContext,
  runGameAgent,
  runGameOllama,
} from './game-agent';
import { createGameAgentService, gitEngineGameAgentGit } from './game-agent-service';
import type { GameMcpTools } from './game-mcp';

/** vitest: commit-per-pass on a real temp repo, with a stub agent CLI and a stub Ollama — no model is ever called. */

let repo: TempRepo;
const write = async (rel: string, text: string): Promise<void> => {
  await mkdir(dirname(join(repo.path, rel)), { recursive: true });
  await writeFile(join(repo.path, rel), text, 'utf8');
};
const count = async (): Promise<number> => Number((await repo.git(['rev-list', '--count', 'HEAD'])).trim());
const subjects = async (): Promise<string[]> => (await repo.git(['log', '--format=%s'])).trim().split('\n');

beforeEach(async () => {
  repo = await TempRepo.create();
  await write('midnite-game.json', '{"name":"Demo"}\n');
  await write('src/main.js', 'export const speed = 1;\n');
  await write('kit/core/rng.js', 'export const rng = 1;\n');
  await repo.git(['add', '-A']);
  await repo.commit('Create game');
});

afterEach(async () => {
  await repo.cleanup();
});

/** An agent CLI that runs `script[pass-1]` against the repo and the private MCP server. */
function stubHost(script: Array<(ctx: { cwd: string; dispatch: ScopedDispatch; req: CliRequest }) => Promise<void>>) {
  let dispatch: ScopedDispatch | null = null;
  const calls: CliRequest[] = [];
  const closed = vi.fn(async () => undefined);
  const host: IterativeHost = {
    startServer: async (req) => {
      dispatch = req.dispatch;
      return { ok: true, socketPath: '/tmp/r-test.sock', close: closed };
    },
    shimLaunch: (socketPath) => ({ command: 'node', args: ['shim.js', '--socket', socketPath], env: { ELECTRON_RUN_AS_NODE: '1' } }),
    resolveAgent: async (agentId) =>
      agentId === 'claude' || agentId === 'cursor'
        ? { id: agentId, label: agentId === 'claude' ? 'Claude Code' : 'Cursor', command: agentId, baseArgs: [], headlessArgs: ['-p'] }
        : null,
    runCli: async (req): Promise<CliResult> => {
      calls.push(req);
      req.onSpawned({ kill: () => undefined });
      await script[calls.length - 1]?.({ cwd: req.cwd, dispatch: dispatch!, req });
      return { ok: true, exitCode: 0, output: `did pass ${calls.length}`, stderr: '' };
    },
  };
  return { host, calls, closed };
}

const fakeTools = (): GameMcpTools =>
  new Proxy({} as GameMcpTools, {
    get: (_target, tool) => async () => ({ ok: true, tool }),
  });

const game = () => ({ gameId: 'gdemo', path: repo.path });

describe('runGameAgent — commit per pass', () => {
  it('makes one commit per pass that changed files and none for a no-op pass', async () => {
    const { host, calls, closed } = stubHost([
      async ({ cwd }) => writeFile(join(cwd, 'src/main.js'), 'export const speed = 2;\n'),
      async () => undefined,
      async ({ cwd }) => writeFile(join(cwd, 'src/enemy.js'), 'export const hp = 3;\n'),
    ]);
    const progress: Array<Omit<GameAgentProgress, 'gameId' | 'runId'>> = [];
    const outcome = await runGameAgent({
      host,
      tools: fakeTools(),
      agentId: 'claude',
      modelArgs: [],
      prompt: 'Make the player faster and add an enemy',
      game: game(),
      passes: 3,
      squash: false,
      git: gitEngineGameAgentGit,
      signal: new AbortController().signal,
      onProgress: (p) => progress.push(p),
    });

    expect(outcome.outcome).toBe('done');
    expect(outcome.commits.map((c) => c.files)).toEqual([['src/main.js'], ['src/enemy.js']]);
    expect(await count()).toBe(3);
    expect((await subjects()).slice(0, 2)).toEqual([
      'agent: Make the player faster and add an enemy (pass 3/3)',
      'agent: Make the player faster and add an enemy (pass 1/3)',
    ]);
    expect(progress.filter((p) => p.commit).map((p) => p.pass)).toEqual([1, 3]);
    expect(progress.some((p) => p.pass === 2 && p.action === 'No files changed in this pass')).toBe(true);
    // Every pass runs in the game repo, and the private server closes with the run.
    expect(calls.map((c) => c.cwd)).toEqual([repo.path, repo.path, repo.path]);
    expect(calls[1]!.args.join(' ')).toContain('pass 2 of 3');
    expect(closed).toHaveBeenCalledTimes(1);
    expect((await repo.git(['status', '--porcelain'])).trim()).toBe('');
  });

  it('squashes a run of several commits into one when the setting is on', async () => {
    const { host } = stubHost([
      async ({ cwd }) => writeFile(join(cwd, 'src/main.js'), 'export const speed = 2;\n'),
      async ({ cwd }) => writeFile(join(cwd, 'src/enemy.js'), 'export const hp = 3;\n'),
    ]);
    const outcome = await runGameAgent({
      host,
      tools: fakeTools(),
      agentId: 'claude',
      modelArgs: [],
      prompt: 'Faster',
      game: game(),
      passes: 2,
      squash: true,
      git: gitEngineGameAgentGit,
      signal: new AbortController().signal,
      onProgress: () => undefined,
    });
    expect(outcome.commits).toHaveLength(1);
    expect(outcome.commits[0]!.files).toEqual(['src/enemy.js', 'src/main.js']);
    expect(await count()).toBe(2);
    expect((await subjects())[0]).toBe('agent: Faster (2 passes)');
  });

  it('commits what a cancelled pass left and stops there', async () => {
    const controller = new AbortController();
    const { host, calls } = stubHost([
      async ({ cwd }) => {
        await writeFile(join(cwd, 'src/main.js'), 'export const speed = 9;\n');
        controller.abort();
      },
    ]);
    const outcome = await runGameAgent({
      host,
      tools: fakeTools(),
      agentId: 'claude',
      modelArgs: [],
      prompt: 'Faster',
      game: game(),
      passes: 3,
      squash: false,
      git: gitEngineGameAgentGit,
      signal: controller.signal,
      onProgress: () => undefined,
    });
    expect(outcome.outcome).toBe('cancelled');
    expect(calls).toHaveLength(1);
    expect(outcome.commits).toHaveLength(1);
  });

  it('refuses a CLI that cannot be confined to file tools', async () => {
    const { host, calls } = stubHost([]);
    const outcome = await runGameAgent({
      host,
      tools: fakeTools(),
      agentId: 'cursor',
      modelArgs: [],
      prompt: 'x',
      game: game(),
      passes: 1,
      squash: false,
      git: gitEngineGameAgentGit,
      signal: new AbortController().signal,
      onProgress: () => undefined,
    });
    expect(outcome.outcome).toBe('failed');
    expect(outcome.message).toMatch(/cannot be limited to file tools/);
    expect(calls).toHaveLength(0);
  });

  it('keeps the commit subject to one line of 60 characters', () => {
    expect(agentCommitSubject('a\nb')).toBe('agent: a b');
    expect(agentCommitSubject('x'.repeat(100))).toBe(`agent: ${'x'.repeat(59)}…`);
  });
});

describe('the agent CLI is given file tools and this game’s tools, and no shell', () => {
  const shim = { command: 'node', args: ['shim.js'], env: { ELECTRON_RUN_AS_NODE: '1' } };
  it('Claude Code: strict MCP config, built-ins limited to the file tools, Bash nowhere', () => {
    const args = buildGameCliArgs({ id: 'claude', label: 'Claude Code', command: 'claude', baseArgs: [], headlessArgs: ['-p'] }, shim, 'go', [])!;
    expect(args).toContain('--strict-mcp-config');
    expect(args[args.indexOf('--tools') + 1]).toBe('Read,Edit,Write,Glob,Grep');
    const allowed = args.slice(args.indexOf('--allowedTools') + 1);
    expect(allowed).toContain('mcp__midnite__game_screenshot');
    expect(allowed).not.toContain('mcp__midnite__game_create');
    expect(allowed).not.toContain('mcp__midnite__game_open');
    expect(args.some((a) => /\bBash\b/.test(a))).toBe(false);
  });
  it('Codex: workspace-write sandbox with network off', () => {
    const args = buildGameCliArgs({ id: 'codex', label: 'Codex', command: 'codex', baseArgs: [], headlessArgs: ['exec'] }, shim, 'go', [])!;
    expect(args.slice(0, 3)).toEqual(['exec', '--sandbox', 'workspace-write']);
    expect(args).toContain('sandbox_workspace_write.network_access=false');
    expect(args.at(-1)).toBe('go');
  });
});

describe('createGameAgentDispatch', () => {
  it('answers only this game, refuses game_create and other games, and caps the calls', async () => {
    const actions: string[] = [];
    const dispatch = createGameAgentDispatch({ tools: fakeTools(), game: game(), signal: new AbortController().signal, onAction: (a) => actions.push(a), maxCalls: 2 });
    expect((await dispatch('game_run', { game: 'gdemo' })).ok).toBe(true);
    expect((await dispatch('game_state', { game: repo.path })).ok).toBe(true);
    expect(await dispatch('game_run', { game: 'gother' })).toMatchObject({ ok: false, kind: 'refused' });
    expect(await dispatch('game_create', { name: 'x', engine: 'phaser', perspective: 'top-down' })).toMatchObject({ ok: false, kind: 'error' });
    expect(await dispatch('repo_list', {})).toMatchObject({ ok: false, kind: 'error' });
    expect(await dispatch('game_logs', { game: 'gdemo' })).toMatchObject({ ok: false, kind: 'refused', message: expect.stringMatching(/limit/) });
    expect(actions).toEqual(['Ran the game', 'Read the game state']);
  });
});

describe('Ollama: whole files under src/ only', () => {
  const run = (text: string, passes = 1) =>
    runGameOllama({
      call: async () => ok({ text }),
      model: 'qwen2.5-coder:7b',
      prompt: 'Faster',
      game: game(),
      passes,
      squash: false,
      git: gitEngineGameAgentGit,
      signal: new AbortController().signal,
      onProgress: () => undefined,
    });

  it('applies a fenced envelope and commits it', async () => {
    const outcome = await run('Here you go:\n```json\n{"files":[{"path":"./src/main.js","content":"export const speed = 4;\\n"}],"summary":"Faster."}\n```');
    expect(outcome).toMatchObject({ outcome: 'done', commits: [{ files: ['src/main.js'] }] });
    expect(await readFile(join(repo.path, 'src/main.js'), 'utf8')).toBe('export const speed = 4;\n');
    expect(await count()).toBe(2);
  });

  it.each(['kit/core/rng.js', '../x.js', 'src/../kit/core/rng.js', 'vendor/phaser.js', '/etc/passwd', 'src/notes.md'])(
    'refuses the whole envelope when it names %s, writing nothing',
    async (path) => {
      const envelope = { files: [{ path: 'src/main.js', content: 'changed\n' }, { path, content: 'evil\n' }], summary: '' };
      const outcome = await run(JSON.stringify(envelope));
      expect(outcome.outcome).toBe('failed');
      expect(outcome.message).toBe(`The model tried to edit ${path}; only files under src/ can be changed.`);
      expect(await readFile(join(repo.path, 'src/main.js'), 'utf8')).toBe('export const speed = 1;\n');
      expect(await count()).toBe(1);
    },
  );

  it('rejects a reply that is not an envelope', async () => {
    expect((await run('I cannot help with that')).message).toMatch(/did not answer with JSON/);
    expect((await applyOllamaEnvelope(repo.path, { files: 'nope' })).ok).toBe(false);
  });

  it('shows the model the manifest and src/, truncating the largest file to fit', async () => {
    await write('src/big.js', 'x'.repeat(5000));
    const files = await gatherOllamaContext(repo.path, 2000);
    expect(files.map((f) => f.path)).toEqual(['midnite-game.json', 'src/big.js', 'src/main.js']);
    expect(files.find((f) => f.path === 'src/big.js')!.content).toMatch(/truncated by Midnite Studio/);
    expect(files.reduce((n, f) => n + Buffer.byteLength(f.content), 0)).toBeLessThanOrEqual(2000);
  });
});

describe('createGameAgentService', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
  const summary = (): GameSummary => ({
    gameId: 'gdemo',
    name: 'Demo',
    path: repo.path,
    engine: 'phaser',
    dimension: '2d',
    starter: 'blank',
    dirty: false,
    valid: true,
    issue: null,
  });

  function setup(text = '{"files":[{"path":"src/main.js","content":"export const speed = 5;\\n"}],"summary":"Faster."}') {
    const sent: Array<[string, unknown]> = [];
    let finished: () => void = () => undefined;
    const done = new Promise<void>((resolve) => (finished = resolve));
    const service = createGameAgentService({
      resolve: async (id) => (id === 'gdemo' ? summary() : null),
      squashRunCommits: async () => false,
      host: stubHost([]).host,
      tools: () => fakeTools(),
      ollama: async () => ok({ text }),
      send: (channel, payload) => {
        sent.push([channel, payload]);
        if (channel === EVENT_CHANNELS.gamesAgentProgress && (payload as GameAgentProgress).finished) finished();
      },
      log,
    });
    return { service, sent, done };
  }

  it('warns for an Ollama engine, streams progress, and Undo turn reverts the last agent commit', async () => {
    const { service, sent, done } = setup();
    const started = await service.run({ gameId: 'gdemo', prompt: 'Faster', engine: { kind: 'ollama', model: 'qwen' }, passes: 1 });
    expect(started).toMatchObject({ ok: true, value: { warnings: [GAMES_OLLAMA_WARNING] } });
    await done;
    const finished = sent.map(([, p]) => p as GameAgentProgress).find((p) => p.finished)!;
    expect(finished.finished!.outcome).toBe('done');
    const sha = finished.finished!.commits[0]!.sha;

    expect(await service.undo('gdemo', 'abcdef1')).toMatchObject({ ok: false, kind: 'error' });
    expect(await service.undo('gdemo', sha)).toEqual({ ok: true });
    expect(await readFile(join(repo.path, 'src/main.js'), 'utf8')).toBe('export const speed = 1;\n');
    expect(await count()).toBe(3);
    // Undone once: there is no last agent turn left to undo.
    expect((await service.undo('gdemo', sha)).ok).toBe(false);
  });

  it('refuses a dirty working tree, so the user’s edits never land in an agent commit', async () => {
    await write('src/main.js', 'export const speed = 7;\n');
    const { service } = setup();
    const result = await service.run({ gameId: 'gdemo', prompt: 'Faster', engine: { kind: 'agent', agentId: 'claude' }, passes: 1 });
    expect(result).toMatchObject({ ok: false, kind: 'error', message: expect.stringMatching(/uncommitted changes/) });
  });

  it('carries no warning for an agent engine, and allows one run per game', async () => {
    const { service, done } = setup();
    const first = await service.run({ gameId: 'gdemo', prompt: 'x', engine: { kind: 'agent', agentId: 'claude' }, passes: 1 });
    expect(first).toMatchObject({ ok: true, value: { warnings: [] } });
    expect(await service.run({ gameId: 'gdemo', prompt: 'x', engine: { kind: 'agent', agentId: 'claude' }, passes: 1 })).toMatchObject({
      ok: false,
      message: 'An agent is already working on this game.',
    });
    await done;
    expect(service.isRunning('gdemo')).toBe(false);
  });
});
