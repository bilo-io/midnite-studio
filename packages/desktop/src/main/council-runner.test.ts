import type { AgentDefinition, Council, CouncilRun } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pty-service', () => ({
  createPty: vi.fn(),
  killPty: vi.fn(),
  onPty: vi.fn(),
  offPty: vi.fn(),
}));
vi.mock('./terminal-service', () => ({ listAgents: vi.fn() }));
vi.mock('./council-service', () => ({
  getCouncil: vi.fn(),
  getRun: vi.fn(),
  saveRun: vi.fn(),
}));

import { getCouncil, getRun, saveRun } from './council-service';
import { retryMember, skipMember, startRun } from './council-runner';
import { createPty, killPty, offPty, onPty } from './pty-service';
import { listAgents } from './terminal-service';

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
type PtyListener = { onData: (bytes: Uint8Array) => void; onExit: (exitCode: number) => void };
let listeners: Map<string, PtyListener>;

/** Let every currently-queued microtask (our own async chains) settle. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
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
