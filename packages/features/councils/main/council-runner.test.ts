// @vitest-environment node
import type { AgentDefinition, Council, CouncilRun } from '@midnite/studio-shared';
import { agentEnvViolations } from '@midnite/studio-runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./council-service', () => ({
  getCouncil: vi.fn(),
  getRun: vi.fn(),
  saveRun: vi.fn(),
}));

import { getCouncil, getRun, saveRun } from './council-service';
import {
  configureCouncilRunner,
  retryMember,
  runLocksSizeForTests,
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

  vi.mocked(getCouncil).mockImplementation(async (id: string) => (id === COUNCIL.id ? COUNCIL : null));
  vi.mocked(getRun).mockImplementation(async (id: string) => store[id] ?? null);
  vi.mocked(saveRun).mockImplementation(async (run: CouncilRun) => {
    store[run.id] = run;
  });
  vi.mocked(listAgents).mockResolvedValue(AGENTS);
  vi.mocked(createPty).mockImplementation(async () => ({ ok: true, ptyId: `pty-${++ptyCounter}` }));
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
    const calls = vi.mocked(createPty).mock.calls.map(([opts]) => opts.initialInput);
    expect(calls.some((c) => c?.startsWith('agy -p '))).toBe(true);
    expect(calls.some((c) => c?.startsWith('codex exec '))).toBe(true);
    // The auto-send exception: every invocation ends with a trailing Return.
    expect(calls.every((c) => c?.endsWith('\r'))).toBe(true);
    // The pty is a login shell, not `pty.spawn(command)` — without an
    // explicit exit, the CLI finishing would leave the shell (and therefore
    // the pty) alive at a fresh prompt, and the settle barrier's only signal
    // (the pty's own exit event) would never fire.
    expect(calls.every((c) => c?.includes('; exit $?\r'))).toBe(true);
  });

  it('runs the settle barrier once every member exits, then spawns the synthesizer', async () => {
    const result = await startRun('c1', 'topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();

    const ptyIds = [...listeners.keys()];
    expect(ptyIds).toHaveLength(2);

    exit(ptyIds[0]!, 0);
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
    exit(synthPtyId, 0);
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
    exit(ptyIds[0]!, 0);
    exit(ptyIds[1]!, 1);
    await flush();

    const synthPtyId = [...listeners.keys()].find((id) => !ptyIds.includes(id))!;
    exit(synthPtyId, 0);
    await flush();

    expect(store[result.value.id]!.status).toBe('completed');
    expect(runLocksSizeForTests()).toBe(0);
  });
});

describe('Ollama binding (Phase 96 Theme H)', () => {
  it('a member bound to Ollama in the mirrored settings launches through the recipe', async () => {
    agentBackends = { codex: { backend: 'ollama', model: 'qwen3:14b' } };

    const result = await startRun('c1', 'topic');
    expect(result.ok).toBe(true);
    await flush();

    const calls = vi.mocked(createPty).mock.calls.map(([opts]) => opts);
    const codexCall = calls.find((c) => c.initialInput?.includes('--oss'));
    expect(codexCall?.initialInput).toContain('codex --oss -m qwen3:14b exec');
    // codex's own recipe row carries no env — this asserts createPty is
    // never handed an empty env object as noise.
    expect(codexCall?.env).toBeUndefined();

    const agyCall = calls.find((c) => c.initialInput?.startsWith('agy '));
    expect(agyCall?.initialInput).toBe(agyCall?.initialInput); // agy has no binding — unaffected
    expect(agyCall?.env).toBeUndefined();
  });

  it('an unbound member is unaffected by another agent’s binding', async () => {
    agentBackends = { codex: { backend: 'ollama', model: 'qwen3:14b' } };

    await startRun('c1', 'topic');
    await flush();

    const calls = vi.mocked(createPty).mock.calls.map(([opts]) => opts.initialInput);
    expect(calls.some((c) => c?.startsWith('agy -p '))).toBe(true);
  });
});

describe('retryMember', () => {
  it('re-spawns a failed member using the council\'s current config', async () => {
    const result = await startRun('c1', 'topic');
    if (!result.ok) throw new Error('expected ok');
    await flush();
    const [firstPtyId, secondPtyId] = [...listeners.keys()];
    exit(firstPtyId!, 1); // m-agy fails
    exit(secondPtyId!, 0); // m-codex succeeds -> triggers synthesis
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
    for (const id of memberPtys) exit(id, 0);
    await flush();
    const synth = [...listeners.keys()].find((id) => !memberPtys.includes(id))!;
    exit(synth, 0);
    await flush();

    const typed = vi.mocked(createPty).mock.calls.map(([opts]) => opts.initialInput ?? '').join('\n');
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
