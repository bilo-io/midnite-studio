import { appendFile, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AGENT_AUDIT_KINDS, agentAuditFileName, type AgentAuditKind, type NewAgentAuditRecord } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { agentAuditDirectory, createAgentAudit, createAgentAuditReader } from './agent-audit';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 23, 12);

const SAMPLES: Record<AgentAuditKind, NewAgentAuditRecord> = {
  'mcp-call': { kind: 'mcp-call', tool: 'repo.list', repoPath: '/r', ok: true, ms: 3 },
  command: { kind: 'command', sessionId: 's1', command: 'ls', source: 'heuristic', agentId: 'claude' },
  'chat-turn': { kind: 'chat-turn', engine: 'claude', chatId: 'c1', status: 'done', ms: 10, attachments: 1, redactions: 0, provenance: { attachment: 1 } },
  'council-run': { kind: 'council-run', councilId: 'k', runId: 'r', status: 'completed', members: 3, succeeded: 3, synthProvider: 'claude', ms: 9 },
  'policy-decision': { kind: 'policy-decision', tool: 'git.push', decision: 'ask', rule: 'push' },
  approval: { kind: 'approval', tool: 'git.push', decision: 'approved', by: 'user', rule: 'push', scope: 'once' },
  install: { kind: 'install', manager: 'npm', packages: ['left-pad'], verdict: 'warn', findings: ['young'] },
  'limit-trip': { kind: 'limit-trip', limit: 'tool-calls/min', observed: 121, threshold: 120 },
  'confine-denial': { kind: 'confine-denial', operation: 'file-read', target: '~/.ssh/id_ed25519' },
};

let dir: string;
let clock = T0;
const make = (extra: Partial<Parameters<typeof createAgentAudit>[0]> = {}) =>
  createAgentAudit({ userData: dir, homeDir: '/Users/me', now: () => clock, ...extra });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'audit-'));
  clock = T0;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('agent audit trail', () => {
  it('round-trips every record kind', async () => {
    const trail = make();
    for (const kind of AGENT_AUDIT_KINDS) trail.record(SAMPLES[kind]);
    const { records } = await trail.list();
    expect(records.map((r) => r.kind).sort()).toEqual([...AGENT_AUDIT_KINDS].sort());
    for (const kind of AGENT_AUDIT_KINDS) {
      const got = records.find((r) => r.kind === kind)!;
      expect(got).toMatchObject({ ...SAMPLES[kind], at: T0 });
      expect(got.id).toBeTruthy();
    }
  });

  it('redacts a vault token in a command line on disk', async () => {
    const trail = make();
    const token = `ghp_${'a'.repeat(30)}`;
    trail.record({ kind: 'command', command: `curl -H "Authorization: Bearer ${token}" /Users/me/x`, source: 'osc-133' });
    await trail.flush();
    const raw = await readFile(join(agentAuditDirectory(dir), agentAuditFileName(T0)), 'utf8');
    expect(raw).not.toContain(token);
    expect(raw).not.toContain('/Users/me');
    expect(raw).toContain('<redacted>');
  });

  it('strips fields outside the schema, so mcp-call carries no payload', async () => {
    const trail = make();
    trail.record({ ...SAMPLES['mcp-call'], input: { diff: 'secret hunk' } } as unknown as NewAgentAuditRecord);
    await trail.flush();
    const raw = await readFile(join(agentAuditDirectory(dir), agentAuditFileName(T0)), 'utf8');
    expect(raw).not.toContain('secret hunk');
  });

  it('uses 0700 for the directory and 0600 for files', async () => {
    const trail = make();
    trail.record(SAMPLES['mcp-call']);
    await trail.flush();
    const d = agentAuditDirectory(dir);
    expect((await stat(d)).mode & 0o777).toBe(0o700);
    expect((await stat(join(d, agentAuditFileName(T0)))).mode & 0o777).toBe(0o600);
  });

  it('tail returns the newest records of a kind, newest first', async () => {
    const trail = make();
    for (let i = 0; i < 60; i++) trail.record({ ...SAMPLES['mcp-call'], ms: i } as NewAgentAuditRecord);
    trail.record(SAMPLES.command);
    const tail = await trail.tail({ kind: 'mcp-call', limit: 50 });
    expect(tail).toHaveLength(50);
    expect(tail.map((r) => (r.kind === 'mcp-call' ? r.ms : -1))).toEqual(Array.from({ length: 50 }, (_, i) => 59 - i));
  });

  it('filters by session, kind and time', async () => {
    const trail = make();
    trail.record({ ...SAMPLES.command, sessionId: 'a', at: T0 });
    trail.record({ ...SAMPLES.command, sessionId: 'b', at: T0 + 10 });
    trail.record({ ...SAMPLES['mcp-call'], at: T0 + 20 });
    expect((await trail.list({ sessionId: 'b' })).records).toHaveLength(1);
    expect((await trail.list({ kinds: ['mcp-call'] })).records).toHaveLength(1);
    expect((await trail.list({ since: T0 + 10, until: T0 + 20 })).records).toHaveLength(1);
    const limited = await trail.list({ limit: 2 });
    expect(limited).toMatchObject({ truncated: true });
    expect(limited.records).toHaveLength(2);
  });

  it('rolls over to a new file each UTC day and prunes past retention', async () => {
    const trail = make({ retentionDays: 2 });
    for (const days of [0, 1, 2, 3]) {
      clock = T0 + days * DAY;
      trail.record(SAMPLES['mcp-call']);
      await trail.flush();
    }
    // Writing on day 3 pruned day 0 (older than 2 days before day 3's midnight).
    const files = await readdir(agentAuditDirectory(dir));
    expect(files.sort()).toEqual([1, 2, 3].map((d) => agentAuditFileName(T0 + d * DAY)));
  });

  it('survives a torn last line and does not glue the next record onto it', async () => {
    const trail = make();
    trail.record(SAMPLES['mcp-call']);
    await trail.flush();
    const file = join(agentAuditDirectory(dir), agentAuditFileName(T0));
    await appendFile(file, '{"kind":"command","id":"x","at":1,"comm');
    const fresh = make();
    expect((await fresh.list()).records).toHaveLength(1);
    fresh.record(SAMPLES.command);
    await fresh.flush();
    expect((await fresh.list()).records.map((r) => r.kind)).toEqual(['command', 'mcp-call']);
  });

  it('readSince returns only complete lines past the cursor and spans a rollover', async () => {
    const trail = make();
    trail.record(SAMPLES['mcp-call']);
    await trail.flush();
    const reader = createAgentAuditReader({ directory: agentAuditDirectory(dir) });
    const start = await reader.readSince(null);
    expect(start.records).toEqual([]);
    trail.record(SAMPLES.command);
    await trail.flush();
    const file = join(agentAuditDirectory(dir), agentAuditFileName(T0));
    await appendFile(file, '{"kind":"comm'); // being written right now
    const first = await reader.readSince(start.cursor);
    expect(first.records.map((r) => r.kind)).toEqual(['command']);
    clock = T0 + DAY;
    trail.record(SAMPLES['chat-turn']);
    await trail.flush();
    const second = await reader.readSince(first.cursor);
    expect(second.records.map((r) => r.kind)).toEqual(['chat-turn']);
    expect(second.cursor?.file).toBe(agentAuditFileName(T0 + DAY));
  });

  it('never throws into the caller when the write fails', async () => {
    const errors: unknown[] = [];
    await writeFile(join(dir, 'security'), 'a file, not a directory');
    const trail = make({ onError: (e) => errors.push(e) });
    expect(() => trail.record(SAMPLES['mcp-call'])).not.toThrow();
    expect(() => trail.record({ kind: 'nope' } as unknown as NewAgentAuditRecord)).not.toThrow();
    await trail.flush();
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('exports the filtered trail, redacted, oldest first, mode 0600', async () => {
    const trail = make();
    trail.record({ ...SAMPLES['mcp-call'], at: T0 });
    trail.record({ ...SAMPLES.command, at: T0 + 1 });
    const out = join(dir, 'export.ndjson');
    expect(await trail.exportTo(out)).toBe(2);
    const lines = (await readFile(out, 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as { kind: string });
    expect(lines.map((l) => l.kind)).toEqual(['mcp-call', 'command']);
    expect((await stat(out)).mode & 0o777).toBe(0o600);
  });
});
