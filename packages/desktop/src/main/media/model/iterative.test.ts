import {
  MODEL_MCP_TOOL_IDS,
  failure,
  ok,
  parseModelSidecar,
  type ModelGenerateProgressEvent,
  type ModelGenerateRequest,
} from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import {
  allowedClaudeTools,
  buildCliArgs,
  MODEL_ITERATIVE_MAX_CALLS,
  runIterative,
  type CliRequest,
  type CliResult,
  type IterativeHost,
  type ResolvedAgent,
  type ScopedDispatch,
} from './iterative';
import { BOX_SPEC, memoryModelKit } from './model-test-kit';

/**
 * vitest: the iterative engine against a fake CLI. The fake plays the part of
 * the agent's MCP client — it calls the run's private dispatcher the way the
 * shim would — so budget, cancel, save and fallback are exercised for real
 * with no CLI, no socket and no network.
 */

const CLAUDE: ResolvedAgent = { id: 'claude', label: 'Claude Code', command: 'claude', baseArgs: [], headlessArgs: ['-p'] };
const SHIM = { command: '/App/Midnite', args: ['/App/mcp-shim.js', '--socket', '/tmp/r.sock'], env: { ELECTRON_RUN_AS_NODE: '1' } };

type Script = (ctx: {
  call: (tool: string, input?: Record<string, unknown>) => ReturnType<ScopedDispatch>;
  target: Record<string, string>;
  killed: Promise<void>;
  req: CliRequest;
}) => Promise<Partial<Extract<CliResult, { ok: true }>> | void>;

/** A host whose "CLI" runs `script` against the dispatcher the run handed to its private server. */
function fakeHost(script: Script, agent: ResolvedAgent | null = CLAUDE) {
  let dispatch!: ScopedDispatch;
  const closed = vi.fn();
  const requests: CliRequest[] = [];
  const host: IterativeHost = {
    startServer: async (req) => {
      dispatch = req.dispatch;
      return { ok: true, socketPath: '/tmp/r.sock', close: async () => closed() };
    },
    shimLaunch: () => SHIM,
    resolveAgent: async () => agent,
    runCli: async (req) => {
      requests.push(req);
      let kill!: () => void;
      const killed = new Promise<void>((resolve) => (kill = resolve));
      req.onSpawned({ kill });
      // `setup`/`serviceWith` wrap the script with the real target; the host itself does not know it.
      const out = await script({ call: (tool, input = {}) => dispatch(tool, { ...input }), target: {}, killed, req });
      return { ok: true, exitCode: 0, output: 'Built a crate.', stderr: '', ...(out ?? {}) };
    },
  };
  return { host, closed, requests };
}

async function setup(script: Script, options: { maxIterations?: number; agent?: ResolvedAgent | null; toolOverrides?: Record<string, unknown> } = {}) {
  const kit = memoryModelKit();
  const created = await kit.service.createModel({
    repoId: 'r1',
    project: 'gen',
    stem: 'crate-20261003-141502',
    spec: { name: 'model', parts: [{ id: 'p1', name: 'placeholder', shape: 'box', size: [0.2, 0.2, 0.2], position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#b0b0b0' }] },
    engine: 'test',
  });
  if (!created.ok) throw new Error('setup failed');
  const target = { repoPath: kit.repoPath, project: 'gen', model: 'crate-20261003-141502/crate-20261003-141502.obj' };
  const { host, closed, requests } = fakeHost((ctx) => script({ ...ctx, target }), options.agent === undefined ? CLAUDE : options.agent);
  const controller = new AbortController();
  const progress: { iteration: { n: number; max: number }; action?: string }[] = [];
  const run = () =>
    runIterative({
      host,
      tools: { ...kit.tools, ...options.toolOverrides } as typeof kit.tools,
      agentId: 'claude',
      modelArgs: ['--model', 'opus'],
      prompt: 'build a crate',
      target,
      cwd: kit.repoPath,
      maxIterations: options.maxIterations ?? 3,
      signal: controller.signal,
      onProgress: (p) => progress.push(p),
    });
  return { kit, target, controller, progress, run, closed, requests };
}

describe('runIterative', () => {
  it('runs build → render → refine → render → save, streams every edit and reports a finished run', async () => {
    const { kit, run, progress, closed } = await setup(async ({ call, target }) => {
      await call('model_get_spec', target);
      await call('model_set_spec', { ...target, spec: BOX_SPEC });
      await call('model_render_preview', { ...target, views: ['front'] });
      await call('model_patch_parts', { ...target, ops: [{ op: 'add', part: { name: 'lid', shape: 'box', size: [1, 0.1, 1], position: [0, 1.05, 0] } }] });
      await call('model_render_preview', { ...target, views: ['front'] });
      await call('model_save', target);
    });
    const outcome = await run();
    expect(outcome).toMatchObject({ kind: 'done', edits: 2, renders: 2, saved: true, summary: 'Built a crate.' });
    // Each edit reached the open editor as it happened (set_spec, patch, then the save).
    expect(kit.changed.map((e) => [e.spec.parts.length, e.saved])).toEqual([
      [1, false],
      [2, false],
      [2, true],
    ]);
    expect(progress.map((p) => p.action)).toEqual([undefined, 'Read the design format', 'Wrote a design (1 part)', 'Rendered a preview (pass 1 of 3)', 'Patched: added 1 part (2 parts)', 'Rendered a preview (pass 2 of 3)', 'Saved the model']);
    expect(progress.at(-1)!.iteration).toEqual({ n: 2, max: 3 });
    expect(closed).toHaveBeenCalledOnce();
  });

  it('enforces the iteration budget: the render past it is refused and tells the agent to save', async () => {
    const results: string[] = [];
    const { run } = await setup(
      async ({ call, target }) => {
        await call('model_set_spec', { ...target, spec: BOX_SPEC });
        for (let i = 0; i < 3; i += 1) {
          const r = await call('model_render_preview', { ...target, views: ['front'], size: 128 });
          results.push(r.ok ? 'ok' : `${r.kind}: ${r.message}`);
        }
      },
      { maxIterations: 2 },
    );
    const outcome = await run();
    expect(results[0]).toBe('ok');
    expect(results[1]).toBe('ok');
    expect(results[2]).toMatch(/^refused: Render budget used up \(2 of 2\)\. Call model_save/);
    expect(outcome).toMatchObject({ kind: 'done', renders: 2 });
  });

  it('saves whatever the agent left unsaved when it ends, so the files match the design on screen', async () => {
    const { run, kit } = await setup(async ({ call, target }) => {
      await call('model_set_spec', { ...target, spec: BOX_SPEC });
    });
    expect(await run()).toMatchObject({ kind: 'done', saved: true });
    const sidecar = parseModelSidecar(kit.files.get('gen/crate-20261003-141502/crate-20261003-141502.json')!.toString('utf8'))!;
    expect(sidecar.spec.name).toBe('crate');
    expect(kit.files.get('gen/crate-20261003-141502/crate-20261003-141502.obj')!.toString()).toContain('crate');
  });

  it('cancels cleanly: aborting kills the CLI, the outcome is cancelled, edits so far are saved and the server closes', async () => {
    const killedSpy = vi.fn();
    const { run, controller, kit, closed } = await setup(async ({ call, target, killed }) => {
      await call('model_set_spec', { ...target, spec: BOX_SPEC });
      void killed.then(killedSpy);
      // The agent is mid-conversation: it will not return until its process is killed.
      await killed;
      // A call that arrives after the cancel is refused.
      const late = await call('model_patch_parts', { ...target, ops: [{ op: 'remove', id: 'p1' }] });
      expect(late).toMatchObject({ ok: false, kind: 'refused', message: 'This run was cancelled.' });
    });
    const pending = run();
    await vi.waitFor(() => expect(kit.changed.length).toBeGreaterThan(0));
    controller.abort();
    expect(await pending).toMatchObject({ kind: 'cancelled', edits: 1 });
    expect(killedSpy).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
    expect(kit.files.get('gen/crate-20261003-141502/crate-20261003-141502.obj')!.toString()).toContain('crate');
  });

  it('kills a CLI that was cancelled before it finished spawning', async () => {
    const { run, controller } = await setup(async ({ killed }) => {
      await killed;
    });
    controller.abort();
    expect(await run()).toMatchObject({ kind: 'cancelled' });
  });

  it('answers a failed run (no edits) so the caller can fall back to the one-shot path', async () => {
    const { run } = await setup(async () => ({ stderr: 'error: unknown option --mcp-config\nUsage: …' }));
    const outcome = await run();
    expect(outcome).toMatchObject({ kind: 'failed', edits: 0 });
    expect(outcome.kind === 'failed' && outcome.message).toContain('made no changes');
    expect(outcome.kind === 'failed' && outcome.message).toContain('unknown option');
  });

  it('refuses calls about any other model, any other repository, a tool outside the model set, and bad input', async () => {
    const answers: Record<string, unknown> = {};
    const { run, kit } = await setup(async ({ call, target }) => {
      answers.other = await call('model_get_spec', { ...target, model: 'other.obj' });
      answers.repo = await call('model_get_spec', { ...target, repoPath: '/other/repo' });
      answers.git = await call('repo.list', {});
      answers.open = await call('model_open', target);
      answers.bad = await call('model_set_spec', { ...target, spec: 'nope' });
      await call('model_set_spec', { ...target, spec: BOX_SPEC });
    });
    await run();
    expect(answers.other).toMatchObject({ ok: false, kind: 'refused', message: expect.stringContaining('This run edits one model') });
    expect(answers.repo).toMatchObject({ ok: false, kind: 'refused' });
    expect(answers.git).toMatchObject({ ok: false, message: 'Unknown tool: "repo.list"' });
    expect(answers.open).toMatchObject({ ok: false });
    expect(answers.bad).toMatchObject({ ok: false, kind: 'error', message: expect.stringContaining('spec') });
    expect(kit.changed.length).toBeGreaterThan(0);
  });

  it('passes validation failures back as a normal result and keeps the run going', async () => {
    const seen: unknown[] = [];
    const { run } = await setup(async ({ call, target }) => {
      seen.push(await call('model_set_spec', { ...target, spec: { parts: [{ shape: 'sphere' }] } }));
      seen.push(await call('model_set_spec', { ...target, spec: BOX_SPEC }));
    });
    expect(await run()).toMatchObject({ kind: 'done', edits: 1 });
    expect(seen[0]).toMatchObject({ ok: true, value: { ok: false, errors: [{ path: 'parts.0.radius' }] } });
  });

  it('caps the total tool calls whatever the agent does', async () => {
    let last: unknown;
    // The budget is a pure counter, so the tool behind it is stubbed: 251 real
    // spec reads cost ~1.7s idle and blew vitest's 5s default under parallel load.
    const { run } = await setup(
      async ({ call, target }) => {
        for (let i = 0; i <= MODEL_ITERATIVE_MAX_CALLS; i += 1) last = await call('model_get_spec', target);
      },
      { toolOverrides: { model_get_spec: async () => ({ ok: true }) } },
    );
    await run();
    expect(last).toMatchObject({ ok: false, kind: 'refused' });
  });

  it('reports a CLI that is not installed, a launch failure and a timeout without throwing', async () => {
    const missing = await setup(async () => undefined, { agent: null });
    expect(await missing.run()).toMatchObject({ kind: 'failed', message: 'claude is not installed.' });

    const kit = memoryModelKit();
    const { host } = fakeHost(async () => undefined);
    host.runCli = async () => ({ ok: false, reason: 'timed-out', hint: 'x' });
    const timedOut = await runIterative({
      host,
      tools: kit.tools,
      agentId: 'claude',
      modelArgs: [],
      prompt: 'p',
      target: { repoPath: kit.repoPath, project: 'gen', model: 'm.obj' },
      cwd: kit.repoPath,
      maxIterations: 1,
      signal: new AbortController().signal,
      onProgress: () => undefined,
    });
    expect(timedOut).toMatchObject({ kind: 'failed', message: 'Claude Code took too long.' });
  });
});

describe('buildCliArgs', () => {
  it('gives Claude Code only the private MCP server and only the model_* tools — no shell, no files, no other servers', () => {
    const args = buildCliArgs(CLAUDE, SHIM, 'PROMPT', ['--model', 'opus'])!;
    expect(args.slice(0, 4)).toEqual(['-p', '--model', 'opus', 'PROMPT']);
    const config = JSON.parse(args[args.indexOf('--mcp-config') + 1]!) as { mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }> };
    expect(Object.keys(config.mcpServers)).toEqual(['midnite']);
    expect(config.mcpServers['midnite']).toEqual(SHIM);
    expect(args).toContain('--strict-mcp-config');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('dontAsk');
    const allowed = args.slice(args.indexOf('--allowedTools') + 1);
    expect(allowed).toEqual(allowedClaudeTools());
    expect(allowed).toEqual(MODEL_MCP_TOOL_IDS.map((id) => `mcp__midnite__${id}`));
    // Lockstep: Claude names a tool `mcp__<server>__<tool>`, so every allowlisted tool must carry
    // the exact server name the config registers — and never the pre-rename one.
    const server = Object.keys(config.mcpServers)[0]!;
    expect(allowed.every((t) => t.startsWith(`mcp__${server}__model_`))).toBe(true);
    expect(allowed.some((t) => t.includes('midnite-studio'))).toBe(false);
    // Variadic flags last, so they cannot swallow the prompt.
    expect(args.indexOf('PROMPT')).toBeLessThan(args.indexOf('--mcp-config'));
  });

  it('configures Codex through -c overrides and refuses an agent that cannot attach MCP', () => {
    const args = buildCliArgs({ ...CLAUDE, id: 'codex', command: 'codex', headlessArgs: ['exec'] }, SHIM, 'PROMPT', [])!;
    expect(args[0]).toBe('exec');
    expect(args).toContain('mcp_servers.midnite.command="/App/Midnite"');
    expect(args).toContain('mcp_servers.midnite.args=["/App/mcp-shim.js", "--socket", "/tmp/r.sock"]');
    expect(args).toContain('mcp_servers.midnite.env={ ELECTRON_RUN_AS_NODE = "1" }');
    expect(args.at(-1)).toBe('PROMPT');
    expect(buildCliArgs({ ...CLAUDE, id: 'cursor' }, SHIM, 'PROMPT', [])).toBeNull();
  });
});

describe('generate with an iterative agent engine', () => {
  const request = (overrides: Partial<ModelGenerateRequest> = {}): ModelGenerateRequest => ({
    generationId: 'g1',
    repoId: 'r1',
    project: 'gen',
    prompt: 'a wooden crate',
    engine: { kind: 'agent', agentId: 'claude' },
    maxIterations: 3,
    ...overrides,
  });

  function serviceWith(script: Script, extra: { llmReply?: string } = {}) {
    const events: ModelGenerateProgressEvent[] = [];
    // The kit's service and tools are rebuilt here so the service owns an `iterative` seam wired to its own tools.
    const kit = memoryModelKit();
    let tools: typeof kit.tools = kit.tools;
    const { host, requests } = fakeHost((ctx) => script({ ...ctx, target: { repoPath: kit.repoPath, project: 'gen', model: lastModel() } }));
    let lastModel = (): string => '';
    const built = memoryModelKit({
      service: {
        emit: (event) => {
          events.push(event);
          if (event.primary) lastModel = () => event.primary!;
        },
        llm: async () => ok({ text: extra.llmReply ?? JSON.stringify(BOX_SPEC) }),
        iterative: {
          host,
          tools: () => tools,
          repoPath: async () => kit.repoPath,
          modelArgs: () => ['--model', 'opus'],
        },
      },
    });
    tools = built.tools;
    return { ...built, events, requests };
  }

  it('creates the model up front, streams progress with the pass and the latest action, and finishes with the saved files', async () => {
    const { service, events, files, changed, requests } = serviceWith(async ({ call, target }) => {
      await call('model_set_spec', { ...target, spec: BOX_SPEC });
      await call('model_render_preview', { ...target, views: ['front'], size: 128 });
      await call('model_save', target);
    });
    const result = await service.generate(request());
    expect(result).toMatchObject({ ok: true, value: { primary: 'a-wooden-crate-20261003-141502/a-wooden-crate-20261003-141502.obj' } });
    expect(requests[0]!.args).toContain('--mcp-config');
    // The first event already names the model, so the tab can show it from the start.
    expect(events[0]).toMatchObject({ status: 'running', stage: 'iterating', primary: 'a-wooden-crate-20261003-141502/a-wooden-crate-20261003-141502.obj', iteration: { n: 0, max: 3 } });
    expect(events.some((e) => e.action === 'Rendered a preview (pass 1 of 3)' && e.iteration?.n === 1)).toBe(true);
    expect(events.at(-1)).toMatchObject({ status: 'succeeded' });
    expect(changed.some((e) => e.saved)).toBe(true);
    expect(files.get('gen/a-wooden-crate-20261003-141502/a-wooden-crate-20261003-141502.obj')!.toString()).toContain('crate');
  });

  it('stores an attached picture beside the design and tells the agent to look at it', async () => {
    const { service, files, requests } = serviceWith(async ({ call, target }) => {
      await call('model_set_spec', { ...target, spec: BOX_SPEC });
    });
    await service.generate(request({ image: { name: 'photo.png', mime: 'image/png', data: Buffer.from('IMG').toString('base64') } }));
    expect(files.get('gen/a-wooden-crate-20261003-141502/a-wooden-crate-20261003-141502.ref.png')!.toString()).toBe('IMG');
    const sidecar = parseModelSidecar(files.get('gen/a-wooden-crate-20261003-141502/a-wooden-crate-20261003-141502.json')!.toString('utf8'))!;
    expect(sidecar.reference).toBe('a-wooden-crate-20261003-141502.ref.png');
    expect(requests[0]!.args.find((a) => a.includes('model_get_reference_image') && a.includes('Request'))).toBeTruthy();
  });

  it('reports a cancelled run as cancelled, not failed', async () => {
    const { service, events } = serviceWith(async ({ call, target, killed }) => {
      await call('model_set_spec', { ...target, spec: BOX_SPEC });
      await killed;
    });
    const pending = service.generate(request());
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(1));
    expect(service.cancel('g1')).toEqual({ ok: true });
    expect(await pending).toEqual(failure('cancelled'));
    expect(events.at(-1)).toMatchObject({ status: 'cancelled' });
  });

  it('falls back to the one-shot JSON path, filling the same files, when the agent made no edits', async () => {
    const { service, files, events } = serviceWith(async () => ({ stderr: 'boom' }));
    const result = await service.generate(request());
    expect(result).toMatchObject({ ok: true, value: { primary: 'a-wooden-crate-20261003-141502/a-wooden-crate-20261003-141502.obj' } });
    const sidecar = parseModelSidecar(files.get('gen/a-wooden-crate-20261003-141502/a-wooden-crate-20261003-141502.json')!.toString('utf8'))!;
    expect(sidecar.spec.name).toBe('crate');
    expect(events.some((e) => e.stage === 'generating')).toBe(true);
    // No stray placeholder: one design, one trio.
    expect([...files.keys()].filter((k) => k.endsWith('.obj'))).toHaveLength(1);
  });

  it('keeps Ollama, CLIs without MCP, and an explicit opt-out on the one-shot path', async () => {
    for (const overrides of [
      { engine: { kind: 'ollama' as const, model: 'qwen2.5-coder:7b' } },
      { engine: { kind: 'agent' as const, agentId: 'cursor' } },
      { iterative: false },
    ]) {
      const script = vi.fn(async () => undefined);
      const { service, requests } = serviceWith(script);
      const result = await service.generate(request(overrides));
      expect(result.ok).toBe(true);
      expect(requests).toHaveLength(0);
      expect(script).not.toHaveBeenCalled();
    }
  });
});
