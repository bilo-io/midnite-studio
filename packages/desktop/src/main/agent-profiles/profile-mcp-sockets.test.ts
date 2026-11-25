import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MCP_MAX_REQUEST_BYTES,
  createBlankAgentProfile,
  type AgentProfile,
  type McpRequest,
  type McpResponse,
  type NewAgentAuditRecord,
} from '@midnite/studio-shared';
import { readSocketToken } from '@midnite/studio-runtime/security/socket-token';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFrameDecoder, encodeJsonFrame } from '../../broker/protocol';
import { getMcpCallLog, resetMcpCallLog } from '../mcp/audit';
import { startMcpServer } from '../mcp/server';
import { createProfileMcpSockets, type ProfileMcpSockets, type ProfileMcpSocketSeams } from './profile-mcp-sockets';

const dispatchSpy = vi.hoisted(() => vi.fn());
vi.mock('../mcp/dispatch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mcp/dispatch')>();
  dispatchSpy.mockImplementation(actual.dispatchMcpCall);
  return { ...actual, dispatchMcpCall: dispatchSpy };
});

let dirs: string[] = [];
let opened: ProfileMcpSockets[] = [];

afterEach(async () => {
  await Promise.all(opened.map((s) => s.closeAll()));
  opened = [];
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
  dispatchSpy.mockClear();
  resetMcpCallLog();
  vi.useRealTimers();
});

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return { ...createBlankAgentProfile(), name: 'Reviewer', ...overrides };
}

function sockets(extra: Partial<ProfileMcpSocketSeams> = {}): { sockets: ProfileMcpSockets; audits: NewAgentAuditRecord[] } {
  const dir = mkdtempSync(join(tmpdir(), 'mp-'));
  dirs.push(dir);
  const audits: NewAgentAuditRecord[] = [];
  let n = 0;
  const created = createProfileMcpSockets({
    runsDir: () => dir,
    startServer: ({ socketPath, gate, sessionId }) =>
      startMcpServer({ userDataDir: dir, appVersion: '0.0.0-test', buildId: 'test', isPackaged: false, socketPath, sessionId, ...(gate ? { gate } : {}) }),
    shimLaunch: (socketPath, toolArgs) => ({ command: '/bin/node', args: ['/shim.js', '--socket', socketPath, ...toolArgs], env: { ELECTRON_RUN_AS_NODE: '1' } }),
    recordAudit: (record) => void audits.push(record),
    newLaunchId: () => `abcdef00000${n++}`,
    ...extra,
  });
  opened.push(created);
  return { sockets: created, audits };
}

const socketOf = (args: string[]): string => {
  const config = JSON.parse(args[1]!.slice(1, -1)) as { mcpServers: { midnite: { args: string[] } } };
  const at = config.mcpServers.midnite.args.indexOf('--socket');
  return config.mcpServers.midnite.args[at + 1]!;
};

function call(socketPath: string, request: McpRequest): Promise<McpResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath);
    const decoder = createFrameDecoder(MCP_MAX_REQUEST_BYTES);
    socket.once('error', reject);
    socket.once('connect', () => {
      const token = readSocketToken(socketPath);
      if (token !== null) socket.write(encodeJsonFrame({ auth: token }));
      socket.write(encodeJsonFrame(request));
    });
    socket.on('data', (chunk: Buffer) => {
      for (const frame of decoder.push(chunk)) {
        if (frame.type !== 0x00) continue;
        socket.end();
        resolve(frame.message as unknown as McpResponse);
        return;
      }
    });
  });
}

describe('createProfileMcpSockets', () => {
  it('dispatches an allowed tool through the global registry, attributed to the bound session', async () => {
    const { sockets: s } = sockets();
    const prepared = await s.prepare(profile({ mcpTools: ['repo.list'] }), '/work/app');
    expect(s.bind(prepared.launchId, 'sess-1')).toBe(true);
    const reply = await call(socketOf(prepared.mcpArgs), { id: 'c1', tool: 'repo.list', input: {} });
    expect(reply).toMatchObject({ id: 'c1', ok: true });
    expect(dispatchSpy).toHaveBeenCalledWith('repo.list', {});
    expect((await getMcpCallLog())[0]).toMatchObject({ tool: 'repo.list', sessionId: 'sess-1' });
  });

  it('refuses a tool outside the allowlist without reaching the registry, and records the denial', async () => {
    const { sockets: s, audits } = sockets();
    const prepared = await s.prepare(profile({ mcpTools: ['repo.list'] }), '/work/app');
    s.bind(prepared.launchId, 'sess-2');
    const reply = await call(socketOf(prepared.mcpArgs), { id: 'c2', tool: 'status.get', input: { repoPath: '/work/app' } });
    expect(reply).toMatchObject({ ok: false, kind: 'refused', message: 'Tool "status.get" is not allowed for agent "Reviewer".' });
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(audits).toEqual([
      { kind: 'policy-decision', tool: 'status.get', decision: 'deny', rule: 'profile-allowlist', repoPath: '/work/app', sessionId: 'sess-2' },
    ]);
  });

  it('adds --strict-mcp-config and --tools only when the tools are restricted', async () => {
    const { sockets: s } = sockets();
    const restricted = await s.prepare(profile({ mcpTools: ['repo.list', 'graph.log'] }), '/w');
    const open = await s.prepare(profile({ mcpTools: null }), '/w');
    expect(restricted.mcpArgs).toContain('--strict-mcp-config');
    expect(restricted.launch?.args).toEqual(['/shim.js', '--socket', expect.stringMatching(/p-abcdef000000\.sock$/), '--tools', 'repo.list,graph.log']);
    expect(open.mcpArgs).not.toContain('--strict-mcp-config');
    expect(open.launch?.args).not.toContain('--tools');
    expect(open.mcpArgs[0]).toBe('--mcp-config');
  });

  it('gives Codex the -c command/args/env triplet and no strict flag', async () => {
    const { sockets: s } = sockets();
    const prepared = await s.prepare(profile({ baseAgentId: 'codex', mcpTools: ['repo.list'] }), '/w');
    expect(prepared.mcpArgs.filter((w) => w === '-c')).toHaveLength(3);
    expect(prepared.mcpArgs[1]).toBe(`'mcp_servers.midnite.command="/bin/node"'`);
    expect(prepared.mcpArgs[5]).toBe(`'mcp_servers.midnite.env={ ELECTRON_RUN_AS_NODE = "1" }'`);
    expect(prepared.mcpArgs.join(' ')).not.toContain('strict');
  });

  it('a restricted Codex agent turns the other servers off; an unaddressable one refuses before a socket starts (#1697)', async () => {
    const startServer = vi.fn(async ({ socketPath }: { socketPath: string }) => ({ ok: true as const, handle: { socketPath, close: async () => undefined } }));
    const servers = { names: ['github'], unaddressable: [] as string[] };
    const { sockets: s } = sockets({ startServer, codexServers: async () => servers });
    const restricted = await s.prepare(profile({ baseAgentId: 'codex', mcpTools: ['repo.list'] }), '/w');
    expect(restricted.otherMcpServers).toEqual(['github']);
    expect(restricted.mcpArgs.slice(-2)).toEqual(['-c', 'mcp_servers.github.enabled=false']);
    const open = await s.prepare(profile({ baseAgentId: 'codex', mcpTools: null }), '/w');
    expect(open.otherMcpServers).toEqual([]);
    servers.unaddressable = ['weird.name'];
    startServer.mockClear();
    await expect(s.prepare(profile({ baseAgentId: 'codex', mcpTools: ['repo.list'] }), '/w')).rejects.toThrow(/"weird.name"/);
    expect(startServer).not.toHaveBeenCalled();
  });

  it('starts nothing for a CLI with no per-launch MCP config (aider)', async () => {
    const startServer = vi.fn();
    const { sockets: s } = sockets({ startServer });
    const prepared = await s.prepare(profile({ baseAgentId: 'aider' }), '/w');
    expect(prepared).toMatchObject({ mcpArgs: [], launch: null });
    expect(startServer).not.toHaveBeenCalled();
  });

  it('closes a launch nobody bound within 60 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const close = vi.fn(async () => undefined);
    const { sockets: s } = sockets({
      startServer: async ({ socketPath }) => ({ ok: true, handle: { socketPath, close } }),
    });
    const prepared = await s.prepare(profile(), '/w');
    await vi.advanceTimersByTimeAsync(59_000);
    expect(close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(close).toHaveBeenCalledTimes(1);
    expect(s.bind(prepared.launchId, 'late')).toBe(false);
  });

  it('a bound launch survives the timeout and closeForSession unlinks its socket and token', async () => {
    const { sockets: s } = sockets();
    const prepared = await s.prepare(profile(), '/w');
    const socketPath = socketOf(prepared.mcpArgs);
    expect(s.bind(prepared.launchId, 'sess-3')).toBe(true);
    expect(s.bind(prepared.launchId, 'other')).toBe(false);
    expect(existsSync(socketPath)).toBe(true);
    await s.closeForSession('sess-3');
    expect(existsSync(socketPath)).toBe(false);
    expect(existsSync(`${socketPath}.token`)).toBe(false);
  });

  it('a queued line whose launch expired is started again on its old socket when the late view binds it (#1697)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { sockets: s } = sockets();
    const prepared = await s.prepare(profile({ mcpTools: ['repo.list'] }), '/work/app');
    const socketPath = socketOf(prepared.mcpArgs);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(existsSync(socketPath)).toBe(false);
    vi.useRealTimers();
    expect(await s.ensureBound(prepared.launchId, 'late-view')).toBe(true);
    expect(existsSync(socketPath)).toBe(true);
    const refused = await call(socketPath, { id: 'c3', tool: 'status.get', input: { repoPath: '/work/app' } });
    expect(refused).toMatchObject({ ok: false, kind: 'refused' });
    expect(await s.ensureBound(prepared.launchId, 'other')).toBe(false);
    expect(await s.ensureBound('ffffffffffff', 'x')).toBe(false);
  });

  it('after a restart, restore brings back a live session socket with its allowlist and drops the rest (#1697)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mp-'));
    dirs.push(dir);
    const before = sockets({ runsDir: () => dir }).sockets;
    const live = await before.prepare(profile({ mcpTools: ['repo.list'] }), '/work/app');
    const gone = await before.prepare(profile(), '/work/app');
    const unbound = await before.prepare(profile(), '/work/app');
    before.bind(live.launchId, 'sess-live');
    before.bind(gone.launchId, 'sess-gone');
    await vi.waitFor(() => expect(existsSync(join(dir, `p-${gone.launchId}.json`))).toBe(true));
    const livePath = socketOf(live.mcpArgs);

    await before.suspendAll(); // app quit
    expect(existsSync(livePath)).toBe(false);
    expect(existsSync(join(dir, `p-${live.launchId}.json`))).toBe(true);
    expect(existsSync(join(dir, `p-${unbound.launchId}.json`))).toBe(false);

    const after = sockets({ runsDir: () => dir }).sockets;
    expect(await after.restore((id) => id === 'sess-live')).toEqual(['sess-live']);
    expect(existsSync(join(dir, `p-${gone.launchId}.json`))).toBe(false);
    const ok = await call(livePath, { id: 'c4', tool: 'repo.list', input: {} });
    expect(ok).toMatchObject({ ok: true });
    expect((await getMcpCallLog()).at(-1)).toMatchObject({ tool: 'repo.list', sessionId: 'sess-live' });
    const refused = await call(livePath, { id: 'c5', tool: 'status.get', input: { repoPath: '/work/app' } });
    expect(refused).toMatchObject({ ok: false, kind: 'refused' });
    expect(await after.restore(() => true)).toEqual([]); // already open: skipped

    await after.closeForSession('sess-live');
    expect(existsSync(join(dir, `p-${live.launchId}.json`))).toBe(false);
  });

  it('restore ignores a manifest whose socket path it would never have chosen (#1697)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mp-'));
    dirs.push(dir);
    const decoy = join(dir, 'decoy');
    writeFileSync(decoy, 'keep');
    const manifest = { launchId: 'abc', sessionId: 's', socketPath: decoy, cwd: '/w', agent: { name: 'A', baseAgentId: 'claude', mcpTools: null } };
    writeFileSync(join(dir, 'p-abc.json'), JSON.stringify(manifest));
    const startServer = vi.fn();
    const { sockets: s } = sockets({ runsDir: () => dir, startServer });
    expect(await s.restore(() => true)).toEqual([]);
    expect(startServer).not.toHaveBeenCalled();
    expect(existsSync(decoy)).toBe(true);
    expect(existsSync(join(dir, 'p-abc.json'))).toBe(false);
  });
});
