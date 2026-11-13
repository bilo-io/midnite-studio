// @vitest-environment node
import type { AgentDefinition, Council, CouncilRun } from '@midnite/studio-shared';
import { agentEnvViolations } from '@midnite/studio-runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./council-service', () => ({
  getCouncil: vi.fn(),
  getRun: vi.fn(),
  saveRun: vi.fn(),
}));

/*
  The prompt and the script a member runs are written to a temp dir (Phase 133
  Theme A). An in-memory fs keeps every write a microtask, so `flush` below
  still settles a whole spawn, and lets a test read what each shell would run.
*/
const files = vi.hoisted(() => new Map<string, string>());
vi.mock('node:fs/promises', () => {
  let dirs = 0;
  return {
    mkdtemp: vi.fn(async (prefix: string) => `${prefix}${++dirs}`),
    writeFile: vi.fn(async (path: string, data: string) => {
      files.set(path, data);
    }),
    chmod: vi.fn(async () => undefined),
    rm: vi.fn(async (path: string) => {
      for (const key of [...files.keys()]) if (key.startsWith(path)) files.delete(key);
    }),
  };
});

import { getCouncil, getRun, saveRun } from './council-service';
import {
  askOnce,
  cancelRun,
  configureCouncilRunner,
  continueRun,
  forgetLiveRunsForTests,
  reconcileRun,
  retryMember,
  runLocksSizeForTests,
  setCouncilTimeoutForTests,
  skipMember,
  startRun,
  type CouncilRunnerPorts,
} from './council-runner';

// The composer's ports, as spies — no pty, roster or vault is ever touched.
const createPty = vi.fn<CouncilRunnerPorts['createPty']>();
const killPty = vi.fn<CouncilRunnerPorts['killPty']>();
const onPty = vi.fn<CouncilRunnerPorts['onPty']>();
const offPty = vi.fn<CouncilRunnerPorts['offPty']>();
const listAgents = vi.fn<CouncilRunnerPorts['listAgents']>();
let agentBackends: Record<string, { backend: 'ollama'; model: string }> = {};

const AGENTS: AgentDefinition[] = [
  { id: 'agy', label: 'Antigravity', command: 'agy', args: [], accent: '#000' },
  { id: 'claude', label: 'Claude', command: 'claude', args: [], accent: '#000' },
  { id: 'codex', label: 'Codex', command: 'codex', args: [], accent: '#000' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode', args: [], accent: '#000' },
];

const COUNCIL: Council = {
  id: 'c1',
  name: 'Test council',
  members: [
    { id: 'm-agy', name: 'Optimist', provider: 'agy', role: 'Best case.' },
    { id: 'm-codex', name: 'Skeptic', provider: 'codex', role: 'Worst case.' },
  ],
  synthProvider: 'opencode',
  createdAt: 1,
  updatedAt: 1,
};

let store: Record<string, CouncilRun>;
let ptyCounter: number;
let audited: unknown[];
type PtyListener = { onData: (bytes: Uint8Array) => void; onExit: (exitCode: number) => void };
let listeners: Map<string, PtyListener>;
/** What each spawned shell would run, captured at `createPty` time (the files go when the CLI settles). */
let spawns: Array<{ ptyId: string; typed: string; script: string; prompt: string }>;

/** Let every currently-queued microtask (our own async chains) settle. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
  agentBackends = {};
  configureCouncilRunner({
    createPty,
    killPty,
    onPty,
    offPty,
    listAgents,
    agentBinding: (agentId) => agentBackends[agentId],
    ollamaBaseUrl: () => 'http://127.0.0.1:11434',
    ollamaApiKey: async () => null,
    audit: (record) => audited.push(record),
  });
  audited = [];
  store = {};
  ptyCounter = 0;
  listeners = new Map();
  spawns = [];
  files.clear();
  forgetLiveRunsForTests();
  setCouncilTimeoutForTests(null);

  vi.mocked(getCouncil).mockImplementation(async (id: string) => (id === COUNCIL.id ? COUNCIL : null));
  vi.mocked(getRun).mockImplementation(async (id: string) => store[id] ?? null);
  vi.mocked(saveRun).mockImplementation(async (run: CouncilRun) => {
    store[run.id] = run;
  });
  vi.mocked(listAgents).mockResolvedValue(AGENTS);
  vi.mocked(createPty).mockImplementation(async (opts) => {
    const ptyId = `pty-${++ptyCounter}`;
    const scriptPath = /^\/bin\/sh '([^']+)'/.exec(opts.initialInput)?.[1] ?? '';
    const dir = scriptPath.replace(/\/run\.sh$/, '');
    spawns.push({ ptyId, typed: opts.initialInput, script: files.get(scriptPath) ?? '', prompt: files.get(`${dir}/prompt.txt`) ?? '' });
    return { ok: true, ptyId };
  });
  vi.mocked(onPty).mockImplementation((ptyId, onData, onExit) => {
    listeners.set(ptyId, { onData, onExit });
  });
  vi.mocked(offPty).mockImplementation((ptyId) => {
    listeners.delete(ptyId);
  });
});

function exit(ptyId: string, code: number): void {
  listeners.get(ptyId)?.onExit(code);
}

/** A CLI that prints `text` and exits 0. */
function reply(ptyId: string, text: string): void {
  listeners.get(ptyId)?.onData(new TextEncoder().encode(text));
  exit(ptyId, 0);
}

const scriptOf = (ptyId: string) => spawns.find((s) => s.ptyId === ptyId)?.script ?? '';

describe('startRun', () => {
  it('fails when the council has no members', async () => {
    vi.mocked(getCouncil).mockResolvedValueOnce({ ...COUNCIL, members: [] });
    const result = await startRun('c1', 'topic');
    expect(result.ok).toBe(false);
  });

  it('fails when the council does not exist', async () => {
    const result = await startRun('missing', 'topic');
    expect(result.ok).toBe(false);
  });

  it('spawns one pty per member with the right per-agent invocation flag', async () => {
    const result = await startRun('c1', 'topic');
    expect(result.ok).toBe(true);
    await flush();

    expect(createPty).toHaveBeenCalledTimes(2);
    const scripts = spawns.map((s) => s.script);
    expect(scripts.some((c) => c.includes(`exec 'agy' '--output-format' 'json' '-p' "$(cat `))).toBe(true);
    expect(scripts.some((c) => c.includes(`exec 'codex' 'exec' "$(cat `))).toBe(true);
    const calls = vi.mocked(createPty).mock.calls.map(([opts]) => opts.initialInput);
    // The auto-send exception: every invocation ends with a trailing Return.
    expect(calls.every((c) => c?.endsWith('\r'))).toBe(true);
    // The pty is a login shell, not `pty.spawn(command)` — without an
    // explicit exit, the CLI finishing would leave the shell (and therefore
    // the pty) alive at a fresh prompt, and the settle barrier's only signal
    // (the pty's own exit event) would never fire.
    expect(calls.every((c) => c?.includes('; exit $?\r'))).toBe(true);
  });

  it('never types the prompt into the shell: it goes to a file the script reads (Phase 133 Theme A)', async () => {
    const topic = 'a long topic\nwith lines   and   spaces';
    await startRun('c1', topic);
    await flush();
    for (const spawn of spawns) {
      expect(spawn.typed).toMatch(/^\/bin\/sh '[^']+\/run\.sh'; exit \$\?\r$/);
      expect(spawn.typed).not.toContain('topic');
      // Newlines and runs of spaces survive, unlike `shellQuote`.
      expect(spawn.prompt).toContain(topic);
      expect(spawn.script).toContain('< /dev/null');
    }
  });

  it('runs the settle barrier once every member exits, then spawns the synthesizer', async () => {
    const result = await startRun('c1', 'topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();

    const ptyIds = [...listeners.keys()];
    expect(ptyIds).toHaveLength(2);

    reply(ptyIds[0]!, 'an answer');
    await flush();
    // Only one member settled — no synthesis yet.
    expect(createPty).toHaveBeenCalledTimes(2);

    exit(ptyIds[1]!, 1);
    await flush();
    // Both settled — the synthesizer is the third spawn.
    expect(createPty).toHaveBeenCalledTimes(3);

    const run = store[result.value.id]!;
    expect(run.status).toBe('synthesizing');
    expect(run.members.map((m) => m.status).sort()).toEqual(['failed', 'succeeded']);

    const synthPtyId = [...listeners.keys()].find((id) => !ptyIds.includes(id))!;
    reply(synthPtyId, 'the synthesis');
    await flush();
    expect(store[result.value.id]!.status).toBe('completed');
    expect(audited).toEqual([
      expect.objectContaining({ kind: 'council-run', councilId: 'c1', runId: result.value.id, status: 'completed', members: 2, succeeded: 1, synthProvider: 'opencode' }),
    ]);
  });
});

describe('skipMember', () => {
  it('kills the pty and settles the member as skipped without waiting for a real exit', async () => {
    const result = await startRun('c1', 'topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();

    const skipped = await skipMember(result.value.id, 'm-agy');
    expect(skipped.ok).toBe(true);
    await flush();

    const member = store[result.value.id]!.members.find((m) => m.memberId === 'm-agy')!;
    expect(member.status).toBe('skipped');
    expect(killPty).toHaveBeenCalled();
  });

  it('fails for a member that already settled', async () => {
    const result = await startRun('c1', 'topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();
    await skipMember(result.value.id, 'm-agy');
    await flush();

    const second = await skipMember(result.value.id, 'm-agy');
    expect(second.ok).toBe(false);
  });
});

describe('runLocks (Phase 45 Theme E)', () => {
  it('leaves no lock behind once a run reaches a terminal state', async () => {
    const result = await startRun('c1', 'topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();

    const ptyIds = [...listeners.keys()];
    reply(ptyIds[0]!, 'an answer');
    exit(ptyIds[1]!, 1);
    await flush();

    const synthPtyId = [...listeners.keys()].find((id) => !ptyIds.includes(id))!;
    reply(synthPtyId, 'the synthesis');
    await flush();

    expect(store[result.value.id]!.status).toBe('completed');
    expect(runLocksSizeForTests()).toBe(0);
  });
});

describe('one key per engine (Phase 121 Theme I)', () => {
  const keys: Record<string, Record<string, string>> = {
    codex: { OPENAI_API_KEY: 'sk-oai' },
    agy: { GEMINI_API_KEY: 'gem' },
    opencode: { OPENAI_API_KEY: 'sk-oai-oc' },
  };

  it('spawns each member and the synthesizer with an environment holding only its own engine key', async () => {
    const asked: string[] = [];
    configureCouncilRunner({
      createPty,
      killPty,
      onPty,
      offPty,
      listAgents,
      agentBinding: () => undefined,
      ollamaBaseUrl: () => 'http://127.0.0.1:11434',
      ollamaApiKey: async () => null,
      agentKeyEnv: async (id) => {
        asked.push(id);
        return keys[id] ?? {};
      },
    });
    const result = await startRun('c1', 'topic');
    expect(result.ok).toBe(true);
    await flush();
    const envs = vi.mocked(createPty).mock.calls.map(([opts]) => opts.env);
    expect(envs).toHaveLength(2);
    expect(envs).toEqual(expect.arrayContaining([{ OPENAI_API_KEY: 'sk-oai' }, { GEMINI_API_KEY: 'gem' }]));
    expect([...asked].sort()).toEqual(['agy', 'codex']);
  });

  it('asks for no key for a member bound to Ollama, which launches through its recipe', async () => {
    agentBackends = { codex: { backend: 'ollama', model: 'qwen3:14b' } };
    const asked: string[] = [];
    configureCouncilRunner({
      createPty,
      killPty,
      onPty,
      offPty,
      listAgents,
      agentBinding: (id) => agentBackends[id],
      ollamaBaseUrl: () => 'http://127.0.0.1:11434',
      ollamaApiKey: async () => null,
      agentKeyEnv: async (id) => {
        asked.push(id);
        return keys[id] ?? {};
      },
    });
    await startRun('c1', 'topic');
    await flush();
    expect(asked).toEqual(['agy']);
  });
});

describe('Ollama binding (Phase 96 Theme H)', () => {
  it('a member bound to Ollama in the mirrored settings launches through the recipe', async () => {
    agentBackends = { codex: { backend: 'ollama', model: 'qwen3:14b' } };

    const result = await startRun('c1', 'topic');
    expect(result.ok).toBe(true);
    await flush();

    const calls = vi.mocked(createPty).mock.calls.map(([opts]) => opts);
    const codexSpawn = spawns.find((s) => s.script.includes("'--oss'"))!;
    expect(codexSpawn.script).toContain(`'codex' '--oss' '-m' 'qwen3:14b' 'exec'`);
    // codex's own recipe row carries no env — this asserts createPty is
    // never handed an empty env object as noise.
    expect(calls[spawns.indexOf(codexSpawn)]?.env).toBeUndefined();

    const agySpawn = spawns.find((s) => s.script.includes(`exec 'agy' `))!;
    expect(agySpawn.script).not.toContain('--oss'); // agy has no binding — unaffected
    expect(calls[spawns.indexOf(agySpawn)]?.env).toBeUndefined();
  });

  it('an unbound member is unaffected by another agent’s binding', async () => {
    agentBackends = { codex: { backend: 'ollama', model: 'qwen3:14b' } };

    await startRun('c1', 'topic');
    await flush();

    expect(spawns.some((s) => s.script.includes(`exec 'agy' '--output-format' 'json' '-p'`))).toBe(true);
  });
});

describe('retryMember', () => {
  it('re-spawns a failed member using the council\'s current config', async () => {
    const result = await startRun('c1', 'topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();
    const [firstPtyId, secondPtyId] = [...listeners.keys()];
    exit(firstPtyId!, 1); // m-agy fails
    reply(secondPtyId!, 'an answer'); // m-codex succeeds -> triggers synthesis
    await flush();

    const before = store[result.value.id]!;
    expect(before.members.find((m) => m.memberId === 'm-agy')!.status).toBe('failed');

    const retried = await retryMember(result.value.id, 'm-agy');
    expect(retried.ok).toBe(true);
    await flush();

    const after = store[result.value.id]!;
    // Retrying re-opens the settle barrier: the stale synthesis is cleared.
    expect(after.status).toBe('running');
    expect(after.synthesisOutput).toBeUndefined();
    expect(after.members.find((m) => m.memberId === 'm-agy')!.status).toBe('running');
  });
});

describe('outbound redaction and the member environment (Phase 121 Theme D)', () => {
  const VAULT_PAT = 'Zq8vK2mXw9LpR4tYb7NcH3dJ6fGs1AaE';
  const CANARY = `ghp_${'c'.repeat(36)}`;
  const vault = [
    { name: 'forge-accounts:github:github.com:me', value: VAULT_PAT, kind: 'vault' as const },
    { name: 'canaries:github-pat', value: CANARY, kind: 'canary' as const },
    { name: 'secrets:agent.codex.apiKey', value: 'sk-codex-secret-value-0002-abcdef', kind: 'vault' as const },
  ];

  beforeEach(() => {
    configureCouncilRunner({
      createPty,
      killPty,
      onPty,
      offPty,
      listAgents,
      agentBinding: (agentId) => agentBackends[agentId],
      ollamaBaseUrl: () => 'http://127.0.0.1:11434',
      ollamaApiKey: async () => null,
      audit: (record) => audited.push(record),
      outboundSecrets: async () => vault,
    });
  });

  it('types no vault value into any member or synthesis pty, and says how many it scrubbed on the audit record', async () => {
    const result = await startRun('c1', `use ${VAULT_PAT} and ${CANARY} for the deploy`);
    if (!result.ok) throw new Error('expected ok');
    await flush();
    const memberPtys = [...listeners.keys()];
    for (const id of memberPtys) reply(id, 'an answer');
    await flush();
    const synth = [...listeners.keys()].find((id) => !memberPtys.includes(id))!;
    reply(synth, 'the synthesis');
    await flush();

    const typed = spawns.map((s) => `${s.typed}\n${s.script}\n${s.prompt}`).join('\n');
    expect(createPty).toHaveBeenCalledTimes(3);
    expect(typed).not.toContain(VAULT_PAT);
    expect(typed).not.toContain(CANARY);
    expect(typed).toContain('[redacted: vault-secret]');
    // Members' own output is quoted into the synthesis prompt; the topic is there too, scrubbed again.
    expect(audited).toEqual([expect.objectContaining({ kind: 'council-run', canary: true, redactions: expect.any(Number) })]);
    expect((audited[0] as { redactions: number }).redactions).toBeGreaterThanOrEqual(4);
  });

  it('hands each member pty no vault value in its environment (no Ollama cloud binding, so no key at all)', async () => {
    await startRun('c1', 'topic');
    await flush();
    for (const [opts] of vi.mocked(createPty).mock.calls) {
      expect(agentEnvViolations(opts.env ?? {}, { vaultValues: vault })).toEqual([]);
    }
  });

  it('the env check fails a member pty whose env gains a key', async () => {
    const env = { ANTHROPIC_API_KEY: vault[2]!.value };
    expect(agentEnvViolations(env, { vaultValues: vault })).toHaveLength(1);
  });
});

describe('structured answers, models and terminal states (Phase 133 Theme A)', () => {
  const AGY_COUNCIL: Council = {
    ...COUNCIL,
    members: [
      { id: 'a1', name: 'One', provider: 'agy', role: 'First.', model: 'gemini-3.8-flash-low' },
      { id: 'a2', name: 'Two', provider: 'agy', role: 'Second.' },
    ],
    synthProvider: 'claude',
    synthModel: 'haiku',
  };

  beforeEach(() => {
    vi.mocked(getCouncil).mockImplementation(async (id: string) => (id === AGY_COUNCIL.id ? AGY_COUNCIL : null));
  });

  const agyJson = (response: string, id: string) =>
    `${JSON.stringify({ conversation_id: id, status: 'SUCCESS', response })}\n`;

  it('passes the member model and reads the answer and session id out of the JSON', async () => {
    const result = await startRun('c1', 'topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();
    const [p1, p2] = [...listeners.keys()];
    expect(scriptOf(p1!)).toContain(`'agy' '--model' 'gemini-3.8-flash-low' '--output-format' 'json' '-p'`);
    expect(scriptOf(p2!)).not.toContain('--model');

    reply(p1!, agyJson('answer one', 'conv-1'));
    reply(p2!, agyJson('answer two', 'conv-2'));
    await flush();
    const run = store[result.value.id]!;
    expect(run.members.map((m) => [m.output, m.sessionId])).toEqual([
      ['answer one', 'conv-1'],
      ['answer two', 'conv-2'],
    ]);
    expect(run.status).toBe('synthesizing');
    expect(run.synthesisStatus).toBe('running');

    const synth = [...listeners.keys()].find((id) => id !== p1 && id !== p2)!;
    expect(scriptOf(synth)).toContain(`'claude' '--model' 'haiku' '--output-format' 'json' '-p'`);
    reply(synth, `${JSON.stringify({ type: 'result', is_error: false, result: 'distilled', session_id: 's-1' })}\n`);
    await flush();
    const done = store[result.value.id]!;
    expect(done.status).toBe('completed');
    expect(done.synthesisStatus).toBe('succeeded');
    expect(done.synthesisOutput).toBe('distilled');
    expect(done.synthSessionId).toBe('s-1');
  });

  it('a synthesis timeout ends the run as timeout with no shell echo as its output', async () => {
    setCouncilTimeoutForTests(5);
    const result = await startRun('c1', 'topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();
    const members = [...listeners.keys()];
    for (const id of members) reply(id, agyJson('ok', id));
    await flush();
    const synth = [...listeners.keys()].find((id) => !members.includes(id))!;
    listeners.get(synth)!.onData(new TextEncoder().encode('### Environment Artist ([failed — no answer to include]'));
    await new Promise((resolve) => setTimeout(resolve, 20)); // allow-timeout: the 5 ms settle timer under test
    await flush();
    const run = store[result.value.id]!;
    expect(run.status).toBe('timeout');
    expect(run.synthesisStatus).toBe('timeout');
    expect(run.synthesisOutput).toBe('');
    expect(run.synthesisError).toMatch(/Timed out/);
    expect(killPty).toHaveBeenCalledWith(synth);
  });

  it('skips the synthesis when no member answered', async () => {
    const result = await startRun('c1', 'topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();
    for (const id of [...listeners.keys()]) exit(id, 1);
    await flush();
    const run = store[result.value.id]!;
    expect(createPty).toHaveBeenCalledTimes(2);
    expect(run.status).toBe('failed');
    expect(run.synthesisStatus).toBe('failed');
    expect(run.synthesisError).toMatch(/No member answered/);
  });

  it('cancel kills every live CLI and records cancelled', async () => {
    const result = await startRun('c1', 'topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();
    const cancelled = await cancelRun(result.value.id);
    expect(cancelled.ok).toBe(true);
    await flush();
    const run = store[result.value.id]!;
    expect(run.status).toBe('cancelled');
    expect(run.members.every((m) => m.status === 'cancelled')).toBe(true);
    expect(killPty).toHaveBeenCalledTimes(2);
    expect(await cancelRun(result.value.id)).toMatchObject({ ok: false });
    expect(audited).toHaveLength(1);
  });

  it('reconciles a run left live by a previous process as interrupted', async () => {
    const result = await startRun('c1', 'topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();
    // This process still drives it: untouched.
    expect((await reconcileRun(store[result.value.id]!)).status).toBe('running');

    forgetLiveRunsForTests();
    const settled = await reconcileRun(store[result.value.id]!);
    expect(settled.status).toBe('failed');
    expect(settled.members.every((m) => m.status === 'failed' && /Interrupted/.test(m.error ?? ''))).toBe(true);
  });
});

describe('follow-up turns (Phase 133 Theme D)', () => {
  const AGY_COUNCIL: Council = {
    ...COUNCIL,
    members: [{ id: 'a1', name: 'One', provider: 'agy', role: 'First.' }],
    synthProvider: 'claude',
  };

  beforeEach(() => {
    vi.mocked(getCouncil).mockImplementation(async (id: string) => (id === AGY_COUNCIL.id ? AGY_COUNCIL : null));
  });

  async function completedRun(): Promise<string> {
    const result = await startRun('c1', 'first topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();
    const [member] = [...listeners.keys()];
    reply(member!, `${JSON.stringify({ conversation_id: 'conv-1', status: 'SUCCESS', response: 'answer' })}\n`);
    await flush();
    const synth = [...listeners.keys()].find((id) => id !== member)!;
    reply(synth, `${JSON.stringify({ result: 'first synthesis', session_id: 's-1', is_error: false })}\n`);
    await flush();
    return result.value.id;
  }

  it('refuses while a turn is still running', async () => {
    const result = await startRun('c1', 'topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();
    expect(await continueRun(result.value.id, 'next')).toMatchObject({ ok: false });
  });

  it('archives the turn, resumes each CLI session and carries the last synthesis forward', async () => {
    const runId = await completedRun();
    spawns = [];
    const next = await continueRun(runId, 'and the follow-up?');
    expect(next.ok).toBe(true);
    await flush();

    const run = store[runId]!;
    expect(run.turns).toHaveLength(1);
    expect(run.turns[0]!.prompt).toBe('first topic');
    expect(run.turns[0]!.synthesisOutput).toBe('first synthesis');
    expect(run.prompt).toBe('and the follow-up?');
    expect(run.status).toBe('running');
    expect(run.members[0]!.sessionId).toBe('conv-1');

    const [spawn] = spawns;
    expect(spawn!.script).toContain(`'--conversation' 'conv-1'`);
    expect(spawn!.prompt).toContain('and the follow-up?');
    expect(spawn!.prompt).toContain('first synthesis');

    const member = spawn!.ptyId;
    reply(member, `${JSON.stringify({ conversation_id: 'conv-1', status: 'SUCCESS', response: 'second' })}\n`);
    await flush();
    const synth = [...listeners.keys()].find((id) => id !== member)!;
    expect(scriptOf(synth)).toContain(`'--resume' 's-1'`);
  });
});

describe('askOnce (Phase 133 Theme E)', () => {
  it('runs one CLI outside any run and resolves with its answer', async () => {
    const asked = askOnce('claude', 'haiku', 'recommend', 1_000);
    await flush();
    const [ptyId] = [...listeners.keys()];
    expect(scriptOf(ptyId!)).toContain(`'claude' '--model' 'haiku'`);
    reply(ptyId!, `${JSON.stringify({ result: '{"members":[]}', is_error: false })}\n`);
    await expect(asked).resolves.toMatchObject({ status: 'succeeded', text: '{"members":[]}' });
    expect(saveRun).not.toHaveBeenCalled();
  });
});
