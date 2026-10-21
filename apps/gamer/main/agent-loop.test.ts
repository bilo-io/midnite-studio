// @vitest-environment node
// vitest, not Playwright: real processes (a fake agent CLI, the bundled shim) and a real Unix socket, no browser.
// Never a real agent CLI: `claude` and `codex` on the run's PATH are shell stubs exec'ing `__fixtures__/fake-agent-cli.mjs`.
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { build } from 'esbuild';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGameAgentService,
  createGameLoop,
  type GameImage,
  type GameLoopDeps,
  type GamePageContents,
} from '@midnite/studio-feature-media-game/main';
import { TempRepo } from '@midnite/studio-git-engine';
import { callMcpSocket } from '@midnite/studio-runtime';
import { EVENT_CHANNELS, GAME_AGENT_TOOL_IDS, type GameAgentProgress, type GameSummary } from '@midnite/studio-shared';

import { createGamerAgentHost, type GamerAgentHost } from './agent-host';

const at = (p: string) => join(__dirname, p);
let work: string;
let shimScript: string;
let fakeBin: string;

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'gamer-agent-loop-'));
  shimScript = join(work, 'game-mcp-shim.cjs');
  // Built the way `scripts/bundle-main.mjs` builds it, so the test runs what ships.
  await build({
    entryPoints: [at('workers/game-mcp-shim.ts')],
    outfile: shimScript,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['electron'],
    logLevel: 'silent',
    alias: {
      '@midnite/studio-runtime/agent-run/run-shim': at('../../../packages/runtime/src/agent-run/run-shim.ts'),
      '@midnite/studio-shared': at('../../../packages/shared/src/index.ts'),
    },
  });
  fakeBin = join(work, 'bin');
  await mkdir(fakeBin);
  for (const name of ['claude', 'codex']) {
    await writeFile(join(fakeBin, name), `#!/bin/sh\nexec "${process.execPath}" "${at('__fixtures__/fake-agent-cli.mjs')}" "$@"\n`);
    await chmod(join(fakeBin, name), 0o755);
  }
}, 60_000);

afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

let repo: TempRepo;
let host: GamerAgentHost;
let events: GameAgentProgress[];
let service: ReturnType<typeof createGameAgentService>;
const contentsOf = new Map<object, GamePageContents>();

/** A running game whose page is a fake: a 1×1 frame, one log line, a truthful state. */
function fakeRuntime(game: GameSummary): GameLoopDeps['runtime'] {
  const view = {};
  const frame: GameImage = { getSize: () => ({ width: 2, height: 2 }), resize: () => frame, toPNG: () => Buffer.from([137, 80, 78, 71]) };
  const contents: GamePageContents = {
    capturePage: async () => frame,
    sendInputEvent: vi.fn(),
    executeJavaScript: async (code: string) => (code.includes('getState') ? JSON.stringify({ scene: 'main', frame: 3 }) : true),
    focus: vi.fn(),
  };
  contentsOf.set(view, contents);
  return {
    runner: { view: () => view },
    service: {
      resolve: async (target: string) => (target === game.gameId || target === game.path ? game : null),
      run: async () => ({ ok: true, value: { runId: 'run-1' } }),
      isRunning: () => true,
      logs: () => ({ runId: 'run-1', entries: [{ seq: 1, at: 0, level: 'log', text: 'midnite-ready' }] }),
      emit: () => undefined,
    },
    assets: { importAsset: vi.fn() },
  } as unknown as GameLoopDeps['runtime'];
}

beforeEach(async () => {
  repo = await TempRepo.create();
  await writeFile(join(repo.path, 'midnite-game.json'), '{"name":"Demo"}\n');
  await repo.git(['add', '-A']);
  await repo.commit('Create game');
  const game = { gameId: 'g1', name: 'Demo', path: repo.path, valid: true } as unknown as GameSummary;
  const loop = createGameLoop({ runtime: fakeRuntime(game), contents: (view) => contentsOf.get(view as object) ?? null });
  host = createGamerAgentHost({ runsDir: join(work, 'mcp-runs'), shimScript, execPath: process.execPath, loginPath: async () => fakeBin });
  events = [];
  service = createGameAgentService({
    resolve: async (gameId) => (gameId === 'g1' ? game : null),
    squashRunCommits: async () => false,
    host,
    tools: () => loop.tools,
    ollama: async () => ({ ok: false, kind: 'error', message: 'no model in tests' }),
    send: (channel, payload) => {
      if (channel === EVENT_CHANNELS.gamesAgentProgress) events.push(payload as GameAgentProgress);
    },
    log: Object.assign(() => undefined, { info: () => undefined, warn: () => undefined, error: () => undefined }),
  });
});

afterEach(async () => {
  service.cancelAll();
  host.dispose();
  await rm(seenFile(), { force: true });
  await repo.cleanup();
});

/** What the fake CLI saw and did, written beside the repo. */
type Seen = {
  argv: string[];
  pid: number;
  shimPid: number;
  grandchildPid?: number;
  servers: string[];
  shim: { command: string; args: string[]; env: Record<string, string> };
  tools: string[];
  calls: Array<{ name: string; isError: boolean; types: string[]; text?: string }>;
  parked?: boolean;
};
const seenFile = (): string => join(dirname(repo.path), `${basename(repo.path)}.agent.json`);
const readSeen = async (): Promise<Seen | null> => {
  try {
    return JSON.parse(await readFile(seenFile(), 'utf8')) as Seen;
  } catch {
    return null;
  }
};

/** Polls until `check` holds; the ceiling only bounds a hung run, it asserts nothing about speed. */
async function until<T>(check: () => Promise<T | null | undefined | false> | T | null | undefined | false, what: string): Promise<T> {
  for (let i = 0; i < 600; i += 1) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}
const finished = () => until(() => events.find((e) => e.finished)?.finished, 'the run to finish');
const alive = (pid: number | undefined): boolean => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
/** The run's socket, as the shim was told it. */
const socketOf = (seen: Seen): string => seen.shim.args[seen.shim.args.indexOf('--socket') + 1] ?? '';
const run = (agentId: string, prompt = 'make the player faster') =>
  service.run({ gameId: 'g1', prompt, engine: { kind: 'agent', agentId }, passes: 1 } as Parameters<typeof service.run>[0]);

describe('the shim Gamer ships', () => {
  it('is bundled beside main.cjs under the name main looks for', async () => {
    const bundler = await readFile(at('../scripts/bundle-main.mjs'), 'utf8');
    const main = await readFile(at('index.ts'), 'utf8');
    expect(bundler).toContain("at('../main/workers/game-mcp-shim.ts')");
    // `.cjs`: apps/gamer is `"type": "module"`, so a `.js` beside it would be read as ESM in dev.
    expect(bundler).toContain("at('../dist/game-mcp-shim.cjs')");
    expect(main).toContain("join(__dirname, 'game-mcp-shim.cjs')");
  });
});

describe('a Gamer game agent run, end to end over the shim', () => {
  it('plays the game through the run’s private server, edits a file and commits it — confined as in Studio', async () => {
    expect(await run('claude')).toMatchObject({ ok: true });
    const outcome = await finished();
    expect(outcome).toMatchObject({ outcome: 'done', commits: [{ files: ['src/agent-edit.js'] }] });
    expect(await repo.git(['log', '-1', '--format=%s'])).toMatch(/^agent: make the player faster \(pass 1\/1\)/);

    const seen = (await readSeen())!;
    // Claude Code: this run's server only, built-in tools limited to file tools, nothing else allowed.
    const { argv } = seen;
    expect(argv.slice(0, 1)).toEqual(['-p']);
    expect(argv).toContain('--strict-mcp-config');
    expect(argv[argv.indexOf('--tools') + 1]).toBe('Read,Edit,Write,Glob,Grep');
    expect(argv[argv.indexOf('--permission-mode') + 1]).toBe('dontAsk');
    const allowed = argv.slice(argv.indexOf('--allowedTools') + 1);
    expect(allowed).toEqual(['Read', 'Edit', 'Write', 'Glob', 'Grep', ...GAME_AGENT_TOOL_IDS.map((id) => `mcp__midnite__${id}`)]);
    expect(argv.join(' ')).not.toMatch(/Bash|WebFetch/);
    expect(seen.servers).toEqual(['midnite']);
    // Gamer's own shim, under this process's binary as plain node, pointed at one socket.
    expect(seen.shim).toEqual({ command: process.execPath, args: [shimScript, '--socket', expect.any(String)], env: { ELECTRON_RUN_AS_NODE: '1' } });

    // The shim lists the game agent's tools only, and they answer from the running game.
    expect(seen.tools).toEqual([...GAME_AGENT_TOOL_IDS]);
    const byName = (name: string) => seen.calls.filter((c) => c.name === name);
    expect(byName('game_run')[0]).toMatchObject({ isError: false, text: expect.stringContaining('run-1') });
    expect(byName('game_screenshot')[0]).toMatchObject({ isError: false, types: ['text', 'image'] });
    expect(byName('game_logs')[0]).toMatchObject({ isError: false, text: expect.stringContaining('midnite-ready') });
    expect(byName('game_input')[0]).toMatchObject({ isError: false, text: '{"sent":1}' });
    expect(byName('game_state')[0]).toMatchObject({ isError: false, text: expect.stringContaining('"scene":"main"') });
    // Refused: another game (by the server), a tool outside the run (by the shim).
    expect(byName('game_state')[1]).toMatchObject({ isError: true, text: expect.stringContaining('This run edits one game') });
    expect(byName('game_create')[0]).toMatchObject({ isError: true, text: 'Unknown tool: "game_create"' });

    // After the run: no server, no socket, no run directory, no process.
    expect(host.liveServers()).toBe(0);
    expect(existsSync(socketOf(seen))).toBe(false);
    expect(existsSync(dirname(socketOf(seen)))).toBe(false);
    await until(() => !alive(seen.pid) && !alive(seen.shimPid), 'the CLI and the shim to exit');
  }, 60_000);

  it('confines Codex to workspace-write with the network off, over the same shim', async () => {
    expect(await run('codex')).toMatchObject({ ok: true });
    expect(await finished()).toMatchObject({ outcome: 'done' });
    const { argv, tools } = (await readSeen())!;
    expect(argv[0]).toBe('exec');
    expect(argv[argv.indexOf('--sandbox') + 1]).toBe('workspace-write');
    expect(argv).toContain('sandbox_workspace_write.network_access=false');
    expect(tools).toEqual([...GAME_AGENT_TOOL_IDS]);
    expect(host.liveServers()).toBe(0);
  }, 60_000);

  it('refuses any other CLI before anything is spawned or served', async () => {
    expect(await run('aider')).toMatchObject({ ok: true });
    expect(await finished()).toMatchObject({ outcome: 'failed', message: expect.stringContaining('cannot be limited to file tools') });
    expect(await readSeen()).toBeNull();
    expect(host.liveServers()).toBe(0);
  });

  it('cancel kills the CLI’s whole process group and closes the run’s server', async () => {
    expect(await run('claude', 'HANG make the player faster')).toMatchObject({ ok: true });
    const seen = await until(async () => {
      const s = await readSeen();
      return s?.parked ? s : null;
    }, 'the fake CLI to park');
    expect([seen.pid, seen.shimPid, seen.grandchildPid].every(alive)).toBe(true);
    // The server itself (not only the shim) answers nothing outside the run, even dialled directly.
    const direct = (tool: string, input: unknown) => callMcpSocket({ socketPath: socketOf(seen), tool, input, timeoutMs: 10_000 });
    expect(await direct('game_create', { name: 'X' })).toMatchObject({ ok: false, message: 'Unknown tool: "game_create"' });
    expect(await direct('repo_list', {})).toMatchObject({ ok: false, message: 'Unknown tool: "repo_list"' });
    expect(await direct('game_state', { game: '/elsewhere' })).toMatchObject({ ok: false, kind: 'refused' });
    expect(service.cancel('g1')).toMatchObject({ ok: true });
    expect(await finished()).toMatchObject({ outcome: 'cancelled' });
    await until(() => ![seen.pid, seen.shimPid, seen.grandchildPid].some(alive), 'every process in the group to die');
    expect(host.liveServers()).toBe(0);
    expect(existsSync(socketOf(seen))).toBe(false);
  }, 60_000);

  it('quit tears every run down at once: the group killed, the server closed and removed synchronously', async () => {
    expect(await run('claude', 'HANG make the player faster')).toMatchObject({ ok: true });
    const seen = await until(async () => {
      const s = await readSeen();
      return s?.parked ? s : null;
    }, 'the fake CLI to park');
    service.cancelAll();
    host.dispose();
    expect(host.liveServers()).toBe(0);
    expect(existsSync(dirname(socketOf(seen)))).toBe(false);
    await until(() => ![seen.pid, seen.shimPid, seen.grandchildPid].some(alive), 'every process in the group to die');
  }, 60_000);
});
