import { MUSIC_REPAIR_ROUNDS, emptySong, failure, ok, type MusicAgentProgressEvent, type MusicAgentRunRequest, type MusicEngine, type Song } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { CliRequest, CliResult, IterativeHost, ResolvedAgent, ScopedDispatch } from '../model/iterative';
import { createMusicAgents, type MusicAgentDeps } from './music-agents';
import { createMusicTools } from './music-mcp';

/**
 * vitest: the music agent engines. The fake CLI plays an MCP client — it calls the run's private
 * dispatcher the way the shim would — so budget, scoping, cancel, repair rounds and the Antigravity
 * fallback run for real with no CLI, no socket and no model.
 */
const TARGET = { repoPath: '/r', project: 'songs', name: 'intro' };
const CLAUDE: ResolvedAgent = { id: 'claude', label: 'Claude Code', command: 'claude', baseArgs: [], headlessArgs: ['-p'] };
const AGY: ResolvedAgent = { id: 'agy', label: 'Antigravity', command: 'agy', baseArgs: [], headlessArgs: ['-p'] };
const NOTE = { pitch: 60, startTick: 0, durationTicks: 480, velocity: 90 };

type Script = (ctx: { call: ScopedDispatch; req: CliRequest; killed: Promise<void> }) => Promise<Partial<Extract<CliResult, { ok: true }>> | void>;

function kit(options: { script?: Script; agent?: ResolvedAgent | null; completions?: string[]; agyRegistered?: boolean; globalReady?: boolean } = {}) {
  const disk = new Map<string, Song>();
  const events: MusicAgentProgressEvent[] = [];
  const requests: CliRequest[] = [];
  const closed = vi.fn();
  let dispatch: ScopedDispatch | null = null;
  const tools = createMusicTools({
    resolveRepo: async () => ({ ok: true, repoId: 'r1' }),
    listProjects: async () => ok([]),
    listSongs: async () => ok([]),
    readSong: async (_r, _p, name) => (disk.has(name) ? ok(structuredClone(disk.get(name)!)) : failure('missing')),
    writeSong: async (_r, _p, name, song) => {
      disk.set(name, song);
      return ok({ size: 9, largeFile: false });
    },
    emitChanged: () => undefined,
    emitOpen: () => undefined,
  });
  const host: IterativeHost = {
    startServer: async (req) => {
      dispatch = req.dispatch;
      return { ok: true, socketPath: '/tmp/r.sock', close: async () => closed() };
    },
    shimLaunch: () => ({ command: '/App/Midnite', args: ['/App/mcp-shim.js', '--socket', '/tmp/r.sock'], env: { ELECTRON_RUN_AS_NODE: '1' } }),
    resolveAgent: async () => (options.agent === null ? null : (options.agent ?? CLAUDE)),
    runCli: async (req) => {
      requests.push(req);
      let kill!: () => void;
      const killed = new Promise<void>((resolve) => (kill = resolve));
      req.onSpawned({ kill });
      const out = await options.script?.({ call: (tool, input) => dispatch!(tool, input), req, killed });
      return { ok: true, exitCode: 0, output: 'Wrote a groove.', stderr: '', ...(out ?? {}) };
    },
  };
  const completions = [...(options.completions ?? [])];
  const prompts: string[] = [];
  const deps: MusicAgentDeps = {
    tools,
    host,
    repoPath: async () => '/r',
    complete: async (req) => {
      prompts.push(req.prompt);
      const next = completions.shift();
      return next === undefined ? failure('no more replies') : ok({ text: next });
    },
    modelArgs: () => [],
    agyRegistered: async () => options.agyRegistered ?? false,
    globalMusicReady: () => options.globalReady ?? false,
    ensureSong: async (_r, _p, name, song) => {
      if (disk.has(name)) return ok({ existed: true });
      disk.set(name, song);
      return ok({ existed: false });
    },
    emitProgress: (event) => events.push(event),
  };
  const agents = createMusicAgents(deps);
  const request = (engine: MusicEngine, extra: Partial<MusicAgentRunRequest> = {}): MusicAgentRunRequest => ({
    runId: 'run1',
    repoId: 'r1',
    project: 'songs',
    name: 'intro',
    prompt: 'a calm intro',
    engine,
    ...extra,
  });
  return { agents, tools, disk, events, requests, closed, prompts, request };
}

const claude: MusicEngine = { kind: 'agent', agentId: 'claude' };

describe('which engines refine and which write in one pass', () => {
  it('Claude and Codex refine, Ollama writes once, Antigravity writes once until registered', async () => {
    const plain = kit();
    expect(await plain.agents.modeFor(claude)).toEqual({ mode: 'iterative', via: 'private' });
    expect(await plain.agents.modeFor({ kind: 'agent', agentId: 'codex' })).toEqual({ mode: 'iterative', via: 'private' });
    expect(await plain.agents.modeFor({ kind: 'ollama', model: 'qwen' })).toEqual({ mode: 'single-pass', via: 'none' });
    expect(await plain.agents.modeFor({ kind: 'agent', agentId: 'agy' })).toEqual({ mode: 'single-pass', via: 'none' });
    expect(await plain.agents.modeFor({ kind: 'agent', agentId: 'gemini' })).toEqual({ mode: 'single-pass', via: 'none' });

    const registered = kit({ agyRegistered: true, globalReady: true });
    expect(await registered.agents.modeFor({ kind: 'agent', agentId: 'agy' })).toEqual({ mode: 'iterative', via: 'global' });
    // Registered but the app's server (or its music switch) is off: one pass, not a failure.
    const off = kit({ agyRegistered: true, globalReady: false });
    expect(await off.agents.modeFor({ kind: 'agent', agentId: 'agy' })).toEqual({ mode: 'single-pass', via: 'none' });
  });
});

describe('iterative run (Claude / Codex)', () => {
  it('runs the CLI with only the music tools, edits through the private dispatcher and saves at the end', async () => {
    const k = kit({
      script: async ({ call }) => {
        await call('music_add_track', { ...TARGET, trackName: 'Bass' });
        await call('music_add_notes', { ...TARGET, track: 0, notes: [NOTE] });
        await call('music_render_preview', TARGET);
      },
    });
    const result = await k.agents.run(k.request(claude));
    expect(result).toMatchObject({ ok: true, value: { mode: 'iterative', edits: 2, passes: 1, saved: true, summary: 'Wrote a groove.' } });
    expect(k.disk.get('intro')?.tracks[0]?.notes).toHaveLength(1);
    const args = k.requests[0]!.args;
    expect(args).toContain('--strict-mcp-config');
    expect(args.slice(args.indexOf('--allowedTools') + 1).every((t) => t.startsWith('mcp__midnite__music_'))).toBe(true);
    expect(k.closed).toHaveBeenCalledOnce();
    expect(k.events.at(-1)).toMatchObject({ state: 'done', mode: 'iterative' });
    expect(k.events.some((e) => e.action === 'Added 1 note')).toBe(true);
  });

  it('refuses a call about another song, another repo, or a tool outside the one-song scope', async () => {
    const answers: unknown[] = [];
    const k = kit({
      script: async ({ call }) => {
        answers.push(await call('music_get_info', { ...TARGET, name: 'other' }));
        answers.push(await call('music_get_info', { ...TARGET, repoPath: '/elsewhere' }));
        answers.push(await call('music_list', { repoPath: '/r' }));
        answers.push(await call('music_open', TARGET));
        answers.push(await call('repo.list', {}));
        answers.push(await call('music_set_tempo', { ...TARGET, bpm: 5 }));
        await call('music_set_tempo', { ...TARGET, bpm: 90 });
      },
    });
    await k.agents.run(k.request(claude));
    expect(answers.map((a) => (a as { kind?: string }).kind)).toEqual(['refused', 'refused', 'error', 'error', 'error', 'error']);
  });

  it('spends one preview per pass and refuses once the budget is used', async () => {
    const answers: Array<{ ok: boolean; kind?: string }> = [];
    const k = kit({
      script: async ({ call }) => {
        await call('music_set_tempo', { ...TARGET, bpm: 100 });
        for (let i = 0; i < 3; i += 1) answers.push((await call('music_render_preview', TARGET)) as never);
      },
    });
    const result = await k.agents.run(k.request(claude, { maxPasses: 2 }));
    expect(answers.map((a) => a.ok)).toEqual([true, true, false]);
    expect(answers[2]).toMatchObject({ kind: 'refused' });
    expect(result).toMatchObject({ ok: true, value: { passes: 2 } });
  });

  it('fails, rather than claiming success, when the agent changed nothing', async () => {
    const k = kit({ script: async () => ({ stderr: 'login required' }) });
    const result = await k.agents.run(k.request(claude));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('made no changes') });
    expect(k.events.at(-1)).toMatchObject({ state: 'failed' });
  });

  it('cancel kills the CLI, refuses further calls and ends as cancelled', async () => {
    let afterCancel: unknown;
    let killedBeforeEnd = false;
    const k = kit({
      script: async ({ call, killed }) => {
        await call('music_set_tempo', { ...TARGET, bpm: 90 });
        const cancelled = k.agents.cancel('run1');
        expect(cancelled.ok).toBe(true);
        await killed;
        killedBeforeEnd = true;
        afterCancel = await call('music_set_tempo', { ...TARGET, bpm: 80 });
      },
    });
    const result = await k.agents.run(k.request(claude));
    expect(result).toMatchObject({ ok: false, message: 'cancelled' });
    expect(killedBeforeEnd).toBe(true);
    expect(afterCancel).toMatchObject({ ok: false, kind: 'refused' });
    expect(k.events.at(-1)).toMatchObject({ state: 'cancelled' });
    expect(k.agents.cancel('run1')).toMatchObject({ ok: false });
  });

  it('says so when the CLI is not installed, without starting a server', async () => {
    const k = kit({ agent: null });
    expect(await k.agents.run(k.request(claude))).toMatchObject({ ok: false, message: 'claude is not installed.' });
    expect(k.requests).toHaveLength(0);
  });
});

describe('single-pass run (Ollama, Antigravity before registration)', () => {
  const ollama: MusicEngine = { kind: 'ollama', model: 'qwen' };
  const song = { name: 'Intro', tracks: [{ id: 'bass', name: 'Bass', program: 33, notes: [NOTE] }] };

  it('parses the JSON reply, validates it, saves it and reports what it wrote', async () => {
    const k = kit({ completions: ['Here you go:\n```json\n' + JSON.stringify(song) + '\n```'] });
    const result = await k.agents.run(k.request(ollama));
    expect(result).toMatchObject({ ok: true, value: { mode: 'single-pass', edits: 1, passes: 1, saved: true, summary: 'Wrote 1 track and 1 note.' } });
    expect(k.disk.get('intro')?.tracks[0]?.id).toBe('bass');
    expect(k.requests).toHaveLength(0);
  });

  it('sends an invalid reply back with the error, then accepts the repaired one', async () => {
    const bad = JSON.stringify({ ...song, tracks: [{ id: 'bass', notes: [{ ...NOTE, pitch: 300 }] }] });
    const k = kit({ completions: ['not json at all', bad, JSON.stringify(song)] });
    const result = await k.agents.run(k.request(ollama));
    expect(result).toMatchObject({ ok: true, value: { passes: 3 } });
    expect(k.prompts[1]).toContain('Your previous reply could not be used');
    expect(k.prompts[1]).toContain('no JSON object');
    expect(k.prompts[2]).toContain('pitch');
  });

  it('gives up after the repair rounds with the last problem', async () => {
    const k = kit({ completions: Array.from({ length: MUSIC_REPAIR_ROUNDS + 1 }, () => 'nope') });
    const result = await k.agents.run(k.request(ollama));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining(`${MUSIC_REPAIR_ROUNDS + 1} tries`) });
    expect(k.disk.get('intro')?.tracks).toEqual([]);
  });

  it('an unregistered Antigravity run uses one pass and never starts a server or CLI', async () => {
    const k = kit({ completions: [JSON.stringify(song)] });
    const result = await k.agents.run(k.request({ kind: 'agent', agentId: 'agy' }));
    expect(result).toMatchObject({ ok: true, value: { mode: 'single-pass' } });
    expect(k.requests).toHaveLength(0);
  });

  it('includes the existing song in the prompt so a rewrite builds on it', async () => {
    const k = kit({ completions: [JSON.stringify(song), JSON.stringify(song)] });
    await k.agents.run(k.request(ollama));
    await k.agents.run(k.request(ollama, { runId: 'run2', prompt: 'make it sadder' }));
    expect(k.prompts[0]).not.toContain('The song as it is now');
    expect(k.prompts[1]).toContain('The song as it is now');
    expect(k.prompts[1]).toContain('"bass"');
  });
});

describe('registered Antigravity', () => {
  it('refines through the global server: no private server, edits counted from the working copy', async () => {
    const k = kit({
      agent: AGY,
      agyRegistered: true,
      globalReady: true,
      script: async () => {
        // The CLI reaches the app's global server, which shares the tools' working copies.
        await k.tools.music_add_track({ ...TARGET, trackName: 'Pad' });
        await k.tools.music_add_notes({ ...TARGET, track: 0, notes: [NOTE] });
      },
    });
    const result = await k.agents.run(k.request({ kind: 'agent', agentId: 'agy' }));
    expect(result).toMatchObject({ ok: true, value: { mode: 'iterative', edits: 2, saved: true } });
    expect(k.closed).not.toHaveBeenCalled();
    expect(k.requests[0]!.args).toEqual(['-p', expect.stringContaining('music_get_info')]);
  });
});

describe('guards', () => {
  it('refuses a second run with the same id', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const k = kit({ script: async ({ call }) => { await call('music_set_tempo', { ...TARGET, bpm: 90 }); await gate; } });
    const first = k.agents.run(k.request(claude));
    await vi.waitFor(() => expect(k.requests).toHaveLength(1));
    expect(await k.agents.run(k.request(claude))).toMatchObject({ ok: false, message: 'That run is already in progress.' });
    release();
    await first;
  });

  it('creates the song when the name is new', async () => {
    const k = kit({ completions: [JSON.stringify({ tracks: [] })] });
    expect(k.disk.has('intro')).toBe(false);
    await k.agents.run(k.request({ kind: 'ollama', model: 'qwen' }));
    expect(k.disk.has('intro')).toBe(true);
    expect(emptySong('x').tracks).toEqual([]);
  });
});
