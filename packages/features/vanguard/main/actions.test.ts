// vitest/node: every response action against a temp dir, with a fake process table, a fake launchctl and a
// fake kill through the injected seams. Nothing here signals or unloads anything real.
import { createHash } from 'node:crypto';
import { chmod, link, mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFindingsLedger, type FindingsLedger } from '@midnite/studio-runtime';
import type { NewSecurityFinding, RemediationAction, SecurityFinding } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHANGED_SINCE_CONFIRM,
  createResponseActions,
  findingRules,
  issueDraft,
  previewAction,
  radiusDigest,
  runAction as runActionConfirmed,
  sameAction,
  type ResponseActionDeps,
  type ResponseActions,
} from './actions';
import { createQuarantineStore } from './response/quarantine';
import type { SensorRunProcess, SensorRunProcessResult } from './sensor-host';

const UID = process.getuid?.() ?? 501;
const digestOf = (preview: Awaited<ReturnType<typeof previewAction>>): string | undefined => (preview.ok ? preview.value.digest : undefined);

/**
 * Act as the view does: preview, then act with the digest the user confirmed. Pass `confirmed` to act on a
 * preview the test already took (so a rescan or ps call is not counted twice).
 */
async function runAction(l: FindingsLedger, actions: ResponseActions, id: string, action: RemediationAction, confirmed?: string) {
  if (confirmed !== undefined) return runActionConfirmed(l, actions, id, action, confirmed);
  const preview = await previewAction(l, actions, id, action);
  return runActionConfirmed(l, actions, id, action, preview.ok ? preview.value.digest : undefined);
}
const NOW = 1_800_000_000_000;
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const ok = (stdout = '', exitCode = 0, stderr = ''): SensorRunProcessResult => ({ ok: true, stdout, stderr, exitCode });

let root: string;
let home: string;
let userData: string;
let ledger: FindingsLedger;
let calls: { command: string; args: readonly string[] }[];
let ps: string;
let launchctl: SensorRunProcessResult;
let plist: string;

const runProcess: SensorRunProcess = async (command, args) => {
  calls.push({ command, args });
  if (command === '/bin/ps' && args[0] === '-axww') return ok(ps);
  if (command === '/bin/ps') return ok(args.at(-1)!.split(',').map((pid) => `${pid} /usr/bin/thing --flag`).join('\n'));
  if (command === '/bin/launchctl') return launchctl;
  if (command === '/usr/bin/plutil') return ok(plist);
  if (command === '/usr/bin/xattr') return ok('');
  return { ok: false, reason: 'not-installed', hint: command };
};

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'vanguard-actions-')));
  home = join(root, 'home');
  userData = join(root, 'userData');
  await mkdir(join(home, 'Library', 'LaunchAgents'), { recursive: true });
  await mkdir(userData, { recursive: true });
  ledger = createFindingsLedger({ userData, homeDir: home, now: () => NOW });
  calls = [];
  ps = '';
  launchctl = ok();
  plist = JSON.stringify({ Label: 'com.example.helper', ProgramArguments: ['/tmp/.helper/agent'], RunAtLoad: true });
});

afterEach(async () => {
  await chmod(join(userData, 'vanguard', 'quarantine'), 0o700).catch(() => undefined);
  await rm(root, { recursive: true, force: true });
});

function deps(over: Partial<ResponseActionDeps> = {}): ResponseActionDeps {
  return {
    homeDir: home,
    uid: UID,
    selfPid: 900,
    selfExecPath: '/Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio',
    protectedPaths: () => [userData],
    protectedMarkers: () => ['/Applications/Midnite Studio.app/Contents/Resources/app.asar.unpacked/dist/broker.js'],
    runProcess,
    quarantine: createQuarantineStore({ quarantineDir: join(userData, 'vanguard', 'quarantine'), runProcess, now: () => NOW, retentionDays: () => 30 }),
    rescan: async () => ({ rules: [], errors: [] }),
    sessions: async () => [{ sessionId: 's1', pid: 4000, title: 'claude · midnite' }],
    interrupt: async () => true,
    retentionDays: () => 30,
    kill: vi.fn(),
    sleep: async () => undefined,
    now: () => NOW,
    killGraceMs: 0,
    ...over,
  };
}

async function record(over: Partial<NewSecurityFinding>): Promise<SecurityFinding> {
  return ledger.record({
    fingerprint: `fp-${Math.random()}`,
    source: 'vanguard',
    severity: 'high',
    category: 'persistence',
    title: 'A finding',
    detail: 'detail',
    evidence: [],
    remediation: [{ id: 'mute' }],
    ...over,
    firstSeen: NOW - 60_000,
    lastSeen: NOW - 60_000,
  } as NewSecurityFinding);
}

async function fileFinding(name: string, content: string, actions: (path: string) => RemediationAction[], mode = 0o755) {
  const path = join(home, name);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
  await chmod(path, mode);
  const finding = await record({
    category: 'malware',
    fingerprint: `malware:stealer_rule:${path}`,
    evidence: [{ kind: 'path', path, hash: sha(content) }],
    remediation: [...actions(path), { id: 'mute' }],
  });
  return { path, finding };
}

describe('sameAction / findingRules', () => {
  it('ignores the description and compares every other argument', () => {
    expect(sameAction({ id: 'chmod-600', path: '/a', description: 'x' }, { id: 'chmod-600', path: '/a' })).toBe(true);
    expect(sameAction({ id: 'chmod-600', path: '/a' }, { id: 'chmod-600', path: '/b' })).toBe(false);
  });
  it('reads the malware rule from the fingerprint', () => {
    expect(findingRules({ category: 'malware', fingerprint: 'malware:clamav:Eicar-Test:/x' } as SecurityFinding)).toEqual(['Eicar-Test']);
    expect(findingRules({ category: 'process', fingerprint: 'malware:x:/y' } as SecurityFinding)).toEqual([]);
  });
});

describe('the renderer cannot name a target', () => {
  it('refuses an action that is not one of the finding’s own, and records nothing', async () => {
    const { finding } = await fileFinding('a.txt', 'secret', () => []);
    const result = await runAction(ledger, createResponseActions(deps()), finding.id, { id: 'chmod-600', path: '/etc/hosts' });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('not one of this finding’s actions') });
    expect((await ledger.get(finding.id))?.actions).toBeUndefined();
  });

  it('answers a missing finding with an error envelope', async () => {
    expect(await runAction(ledger, createResponseActions(deps()), 'nope', { id: 'mute' })).toMatchObject({ ok: false });
  });
});

describe('revoke-mcp-server (Phase 121 Theme C)', () => {
  const withMcpFinding = () =>
    record({
      category: 'supply-chain',
      repoId: 'repo-1',
      remediation: [{ id: 'revoke-mcp-server', serverName: 'fs' }, { id: 'open-in-agents', findingId: 'x' }],
    });

  it('answers calmly where the app keeps no MCP allowlist, recording nothing', async () => {
    const finding = await withMcpFinding();
    const actions = createResponseActions(deps());
    const revoke = await runAction(ledger, actions, finding.id, { id: 'revoke-mcp-server', serverName: 'fs' });
    expect(revoke).toMatchObject({ ok: true, value: { actionId: 'revoke-mcp-server', unavailable: { reason: expect.stringContaining('allowlist') } } });
    expect(actions.unavailable()).toHaveProperty('revoke-mcp-server');
    expect((await ledger.get(finding.id))?.actions).toBeUndefined();
  });

  it('clears the allowlist entry for the finding’s repo, behind the confirm, and resolves the finding', async () => {
    const finding = await withMcpFinding();
    const revokeMcpServer = vi.fn(async () => 1);
    const actions = createResponseActions(deps({ revokeMcpServer }));
    expect(actions.unavailable()).not.toHaveProperty('revoke-mcp-server');
    const action = { id: 'revoke-mcp-server', serverName: 'fs' } as const;
    const preview = await previewAction(ledger, actions, finding.id, action);
    expect(preview).toMatchObject({ ok: true, value: { actionId: 'revoke-mcp-server', confirm: true } });
    expect(revokeMcpServer).not.toHaveBeenCalled();
    const result = await runAction(ledger, actions, finding.id, action, digestOf(preview));
    expect(result).toMatchObject({ ok: true, value: { actionId: 'revoke-mcp-server' } });
    expect(revokeMcpServer).toHaveBeenCalledWith('fs', 'repo-1');
    expect((await ledger.get(finding.id))?.status).toBe('resolved');
  });

  it('refuses a server the finding does not name', async () => {
    const finding = await withMcpFinding();
    const revokeMcpServer = vi.fn(async () => 1);
    const result = await runAction(ledger, createResponseActions(deps({ revokeMcpServer })), finding.id, { id: 'revoke-mcp-server', serverName: 'other' });
    expect(result).toMatchObject({ ok: false });
    expect(revokeMcpServer).not.toHaveBeenCalled();
  });

  it('open-in-agents still answers as Phase 121 Theme A’s', async () => {
    const finding = await withMcpFinding();
    const actions = createResponseActions(deps());
    const agents = await runAction(ledger, actions, finding.id, { id: 'open-in-agents', findingId: 'x' });
    expect(agents).toMatchObject({ ok: true, value: { unavailable: { reason: expect.stringContaining('Phase 121 Theme A') } } });
    expect(calls).toEqual([]);
    expect(actions.unavailable()).toHaveProperty('open-in-agents');
  });
});

describe('mute and report-issue', () => {
  it('mute records the action and mutes the finding', async () => {
    const finding = await record({});
    const result = await runAction(ledger, createResponseActions(deps()), finding.id, { id: 'mute' });
    expect(result).toMatchObject({ ok: true, value: { finding: { status: 'muted', actions: [{ id: 'mute', ok: true, at: NOW }] } } });
  });

  it('report-issue builds a prefilled form with the home folder folded, needs no confirm, and leaves the status', async () => {
    const finding = await record({
      category: 'network',
      evidence: [{ kind: 'path', path: join(home, 'secret', 'thing') }],
      remediation: [{ id: 'report-issue', title: 'Odd host' }],
    });
    const actions = createResponseActions(deps({ issueApp: 'midnite-vanguard' }));
    const preview = await previewAction(ledger, actions, finding.id, { id: 'report-issue', title: 'Odd host' });
    expect(preview).toMatchObject({ ok: true, value: { confirm: false } });
    const result = await runAction(ledger, actions, finding.id, { id: 'report-issue', title: 'Odd host' }, digestOf(preview));
    if (!result.ok) throw new Error('report-issue failed');
    const url = new URL(result.value.issueUrl!);
    expect(url.searchParams.get('app')).toBe('midnite-vanguard');
    expect(url.searchParams.get('title')).toBe('Odd host');
    expect(url.toString()).not.toContain(encodeURIComponent(home));
    expect(result.value.finding?.status).toBe('open');
  });

  it('issueDraft folds the home folder', () => {
    const url = issueDraft(
      { severity: 'high', category: 'network', title: 't', detail: `${home}/x`, evidence: [] } as unknown as SecurityFinding,
      { id: 'report-issue', title: 'T' },
      home,
      'midnite-studio',
    );
    expect(decodeURIComponent(url)).not.toContain(home);
  });
});

describe('pause-session', () => {
  it('sends the interrupt to a live session and leaves the finding open', async () => {
    const interrupt = vi.fn(async () => true);
    const finding = await record({ remediation: [{ id: 'pause-session', sessionId: 's1' }] });
    const actions = createResponseActions(deps({ interrupt }));
    const preview = await previewAction(ledger, actions, finding.id, { id: 'pause-session', sessionId: 's1' });
    expect(preview).toMatchObject({ ok: true, value: { confirm: true, pauses: ['claude · midnite (pid 4000)'], dies: [] } });
    const result = await runAction(ledger, actions, finding.id, { id: 'pause-session', sessionId: 's1' }, digestOf(preview));
    expect(interrupt).toHaveBeenCalledWith('s1');
    expect(result).toMatchObject({ ok: true, value: { finding: { status: 'open', actions: [{ id: 'pause-session', ok: true }] } } });
  });

  it('is unavailable where the app has no session seams', async () => {
    const finding = await record({ remediation: [{ id: 'pause-session', sessionId: 's1' }] });
    const { sessions: _s, interrupt: _i, ...rest } = deps();
    const actions = createResponseActions(rest);
    expect(actions.unavailable()['pause-session']?.reason).toMatch(/no terminal sessions/);
    const result = await runAction(ledger, actions, finding.id, { id: 'pause-session', sessionId: 's1' });
    expect(result).toMatchObject({ ok: true, value: { unavailable: { reason: expect.any(String) } } });
  });

  it('records a refusal when the session has ended', async () => {
    const finding = await record({ remediation: [{ id: 'pause-session', sessionId: 'gone' }] });
    const result = await runAction(ledger, createResponseActions(deps()), finding.id, { id: 'pause-session', sessionId: 'gone' });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('no longer live') });
    expect((await ledger.get(finding.id))?.actions).toEqual([{ id: 'pause-session', at: NOW, ok: false, error: expect.stringContaining('no longer live') }]);
  });
});

describe('kill-process-group', () => {
  // pid ppid pgid uid etime comm
  const table = (rows: string[]): string => rows.join('\n');
  const evil = (over: Partial<NewSecurityFinding> = {}) =>
    record({
      category: 'process',
      evidence: [{ kind: 'pid', pid: 4100, command: '/tmp/evil' }],
      remediation: [{ id: 'kill-process-group', pid: 4100 }],
      ...over,
    });

  it('runs only the plan the user confirmed: a group that grew since the preview is refused and recorded', async () => {
    ps = table([` 4100  4000  4100 ${UID} 02:00 /tmp/evil`]);
    const finding = await evil();
    const kill = vi.fn();
    const actions = createResponseActions(deps({ kill }));
    const preview = await previewAction(ledger, actions, finding.id, { id: 'kill-process-group', pid: 4100 });
    expect(preview).toMatchObject({ ok: true, value: { confirmLabel: 'Stop 1 process', digest: expect.any(String) } });
    // A child joins the group while the dialog is open: it was never shown, so nothing is signalled.
    ps = table([` 4100  4000  4100 ${UID} 02:00 /tmp/evil`, ` 4102  4100  4100 ${UID} 00:01 /usr/bin/nc`]);
    const result = await runActionConfirmed(ledger, actions, finding.id, { id: 'kill-process-group', pid: 4100 }, digestOf(preview));
    expect(result).toMatchObject({ ok: false, message: CHANGED_SINCE_CONFIRM });
    expect(kill).not.toHaveBeenCalled();
    expect((await ledger.get(finding.id))?.actions).toEqual([{ id: 'kill-process-group', at: NOW, ok: false, error: CHANGED_SINCE_CONFIRM }]);
    expect((await ledger.get(finding.id))?.status).toBe('open');
  });

  it('refuses a destructive act with no confirmed preview, and records nothing', async () => {
    ps = table([` 4100  4000  4100 ${UID} 02:00 /tmp/evil`]);
    const finding = await evil();
    const kill = vi.fn();
    const result = await runActionConfirmed(ledger, createResponseActions(deps({ kill })), finding.id, { id: 'kill-process-group', pid: 4100 });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('confirm dialog') });
    expect(kill).not.toHaveBeenCalled();
    expect((await ledger.get(finding.id))?.actions).toBeUndefined();
  });

  it('the digest covers members a capped list hides', async () => {
    const preview = { actionId: 'kill-process-group' as const, confirm: true, title: 't', confirmLabel: 'c', summary: 's', dies: ['…and 3 more'], moves: [], pauses: [], warnings: [] };
    expect(radiusDigest(preview, '1:a\n2:b')).not.toBe(radiusDigest(preview, '1:a\n3:b'));
    expect(radiusDigest({ ...preview, digest: 'ignored' }, 'x')).toBe(radiusDigest(preview, 'x'));
  });

  it('names every member of the group and the session that ends with it, then SIGTERMs the group', async () => {
    ps = table([
      `  900     1   900 ${UID} 01:00:00 /Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio`,
      ` 4000   900  4000 ${UID} 05:00 /bin/zsh`,
      ` 4100  4000  4100 ${UID} 02:00 /tmp/evil`,
      ` 4101  4100  4100 ${UID} 01:59 /usr/bin/curl`,
    ]);
    const finding = await evil();
    const kill = vi.fn((pid: number, signal: NodeJS.Signals | 0) => {
      if (signal === 0) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
      void pid;
    });
    const actions = createResponseActions(deps({ kill, sessions: async () => [{ sessionId: 's9', pid: 4101, title: 'agent' }] }));
    const preview = await previewAction(ledger, actions, finding.id, { id: 'kill-process-group', pid: 4100 });
    expect(preview).toMatchObject({
      ok: true,
      value: {
        title: 'Stop process group 4100?',
        confirmLabel: 'Stop 2 processes',
        dies: ['agent session agent (pid 4101) ends with it', 'pid 4100  /tmp/evil', 'pid 4101  /usr/bin/curl'],
      },
    });
    const result = await runAction(ledger, actions, finding.id, { id: 'kill-process-group', pid: 4100 });
    expect(kill).toHaveBeenCalledWith(-4100, 'SIGTERM');
    expect(kill).not.toHaveBeenCalledWith(-4100, 'SIGKILL');
    expect(result).toMatchObject({ ok: true, value: { finding: { status: 'resolved', resolvedBy: 'action:kill-process-group' } } });
  });

  it('escalates to SIGKILL when the group outlives the grace period', async () => {
    ps = ` 4100  1  4100 ${UID} 02:00 /tmp/evil`;
    const finding = await evil();
    let killed = false;
    const kill = vi.fn((_pid: number, signal: NodeJS.Signals | 0) => {
      if (signal === 'SIGKILL') killed = true;
      if (signal === 0 && killed) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    });
    const result = await runAction(ledger, createResponseActions(deps({ kill })), finding.id, { id: 'kill-process-group', pid: 4100 });
    expect(kill).toHaveBeenCalledWith(-4100, 'SIGKILL');
    expect(result.ok).toBe(true);
  });

  it('refuses a stale pid: a process that started after the finding', async () => {
    ps = ` 4100  1  4100 ${UID} 00:05 /tmp/evil`; // started 5 s ago; the finding is a minute old
    const finding = await evil();
    const kill = vi.fn();
    const result = await runAction(ledger, createResponseActions(deps({ kill })), finding.id, { id: 'kill-process-group', pid: 4100 });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('started after the finding') });
    expect(kill).not.toHaveBeenCalled();
    const row = await ledger.get(finding.id);
    expect(row?.status).toBe('open');
    expect(row?.actions?.[0]).toMatchObject({ id: 'kill-process-group', ok: false, error: expect.stringContaining('started after') });
  });

  it('refuses a pid now running a different executable', async () => {
    ps = ` 4100  1  4100 ${UID} 02:00 /usr/bin/vim`;
    const finding = await evil();
    const result = await runAction(ledger, createResponseActions(deps()), finding.id, { id: 'kill-process-group', pid: 4100 });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('now runs /usr/bin/vim') });
  });

  it('refuses a group that holds the app itself, its broker, or another user’s process', async () => {
    const actions = createResponseActions(deps());
    ps = table([`  900  1  4100 ${UID} 01:00 /Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio`, ` 4100  900  4100 ${UID} 02:00 /tmp/evil`]);
    let finding = await evil();
    expect(await previewAction(ledger, actions, finding.id, { id: 'kill-process-group', pid: 4100 })).toMatchObject({ ok: false, message: expect.stringContaining('Midnite itself') });

    ps = table([` 4100  1  4100 ${UID} 02:00 /tmp/evil`, ` 4102  4100  4100 ${UID} 02:00 /Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio`]);
    finding = await evil();
    expect(await previewAction(ledger, actions, finding.id, { id: 'kill-process-group', pid: 4100 })).toMatchObject({ ok: false, message: expect.stringContaining('part of Midnite') });

    ps = table([` 4100  1  4100 ${UID} 02:00 /tmp/evil`, ` 4103  4100  4100 0 02:00 /usr/sbin/thing`]);
    finding = await evil();
    expect(await previewAction(ledger, actions, finding.id, { id: 'kill-process-group', pid: 4100 })).toMatchObject({ ok: false, message: expect.stringContaining('another user') });
  });

  it('refuses a group whose command line carries the broker marker', async () => {
    ps = ` 4100  1  4100 ${UID} 02:00 /tmp/evil`;
    const finding = await evil();
    const marker = '/x/broker.js';
    const custom: SensorRunProcess = async (command, args) =>
      command === '/bin/ps' && args[0] === '-ww' ? ok(`4100 /usr/local/bin/node ${marker} --socket /s`) : runProcess(command, args);
    const result = await previewAction(ledger, createResponseActions(deps({ runProcess: custom, protectedMarkers: () => [marker] })), finding.id, { id: 'kill-process-group', pid: 4100 });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('terminal broker') });
  });

  it('refuses a pid the finding never recorded', async () => {
    ps = ` 4100  1  4100 ${UID} 02:00 /tmp/evil`;
    const finding = await evil({ evidence: [], remediation: [{ id: 'kill-process-group', pid: 4100 }] });
    expect(await previewAction(ledger, createResponseActions(deps()), finding.id, { id: 'kill-process-group', pid: 4100 })).toMatchObject({
      ok: false,
      message: expect.stringContaining('does not record pid 4100'),
    });
  });
});

describe('bootout-launch-item', () => {
  async function agent(content = '<plist/>') {
    const path = join(home, 'Library', 'LaunchAgents', 'com.example.helper.plist');
    await writeFile(path, content);
    const finding = await record({
      evidence: [{ kind: 'path', path, hash: sha(content) }],
      remediation: [{ id: 'bootout-launch-item', domain: `gui/${UID}`, path }],
    });
    return { path, finding, action: { id: 'bootout-launch-item' as const, domain: `gui/${UID}`, path } };
  }

  it('names the label and target, runs launchctl bootout in the user domain, and resolves the finding', async () => {
    const { finding, action } = await agent();
    const actions = createResponseActions(deps());
    const preview = await previewAction(ledger, actions, finding.id, action);
    expect(preview).toMatchObject({ ok: true, value: { dies: ['com.example.helper — runs /tmp/.helper/agent'], summary: expect.stringContaining('loads again at your next login') } });
    const result = await runAction(ledger, actions, finding.id, action, digestOf(preview));
    // By label, so launchd unloads the service that was hashed and shown, not whatever the file says later.
    expect(calls).toContainEqual({ command: '/bin/launchctl', args: ['bootout', `gui/${UID}/com.example.helper`] });
    expect(result).toMatchObject({ ok: true, value: { finding: { status: 'resolved', actions: [{ id: 'bootout-launch-item', ok: true }] } } });
  });

  it('a failed bootout leaves the finding open with the error recorded', async () => {
    const { finding, action } = await agent();
    launchctl = ok('', 5, 'Boot-out failed: 5: Input/output error');
    const result = await runAction(ledger, createResponseActions(deps()), finding.id, action);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('Input/output error') });
    const row = await ledger.get(finding.id);
    expect(row?.status).toBe('open');
    expect(row?.actions).toEqual([{ id: 'bootout-launch-item', at: NOW, ok: false, error: expect.stringContaining('Boot-out failed: 5') }]);
  });

  it('refuses a plist that changed since the finding (hash differs), without running launchctl', async () => {
    const { path, finding, action } = await agent();
    await writeFile(path, '<plist>changed</plist>');
    const result = await runAction(ledger, createResponseActions(deps()), finding.id, action);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('has changed since the finding') });
    expect(calls.some((c) => c.command === '/bin/launchctl')).toBe(false);
    expect((await ledger.get(finding.id))?.actions?.[0]).toMatchObject({ ok: false });
  });

  it('refuses the system domain: Vanguard does not escalate', async () => {
    const { path, finding } = await agent();
    const action = { id: 'bootout-launch-item' as const, domain: 'system', path };
    await ledger.record({ ...finding, remediation: [action] } as NewSecurityFinding);
    const f2 = await record({ remediation: [action], evidence: finding.evidence });
    expect(await previewAction(ledger, createResponseActions(deps()), f2.id, action)).toMatchObject({ ok: false, message: expect.stringContaining('administrator rights') });
  });

  it('refuses a plist outside ~/Library/LaunchAgents', async () => {
    const path = join(home, 'elsewhere.plist');
    await writeFile(path, 'x');
    const action = { id: 'bootout-launch-item' as const, domain: `gui/${UID}`, path };
    const finding = await record({ remediation: [action] });
    expect(await previewAction(ledger, createResponseActions(deps()), finding.id, action)).toMatchObject({ ok: false, message: expect.stringContaining('not a launch agent') });
  });

  it('refuses a plist that is a symlink, without following it', async () => {
    const target = join(home, 'real.plist');
    await writeFile(target, 'x');
    const path = join(home, 'Library', 'LaunchAgents', 'linked.plist');
    await symlink(target, path);
    const action = { id: 'bootout-launch-item' as const, domain: `gui/${UID}`, path };
    const finding = await record({ remediation: [action] });
    expect(await previewAction(ledger, createResponseActions(deps()), finding.id, action)).toMatchObject({ ok: false, message: expect.stringContaining('symbolic link') });
  });
});

describe('quarantine-file and restore-file', () => {
  it('moves the file in at 0000, then restores it byte-for-byte with its mode after a clean re-scan', async () => {
    const { path, finding } = await fileFinding('Downloads/tool.bin', 'payload bytes', (p) => [{ id: 'quarantine-file', path: p }], 0o751);
    const rescan = vi.fn(async () => ({ rules: [], errors: [] }));
    const actions = createResponseActions(deps({ rescan }));
    const preview = await previewAction(ledger, actions, finding.id, { id: 'quarantine-file', path });
    expect(preview).toMatchObject({ ok: true, value: { moves: [expect.stringMatching(/tool\.bin \(13 B, 0751, sha256 [0-9a-f]{12}…\) to quarantine/)], summary: expect.stringContaining('30 days') } });
    const result = await runAction(ledger, actions, finding.id, { id: 'quarantine-file', path }, digestOf(preview));
    expect(result).toMatchObject({ ok: true, value: { finding: { status: 'resolved' } } });
    await expect(stat(path)).rejects.toThrow();
    const dataPath = join(userData, 'vanguard', 'quarantine', finding.id, 'data', 'tool.bin');
    expect((await stat(dataPath)).mode & 0o777).toBe(0);
    const manifest = JSON.parse(await readFile(join(userData, 'vanguard', 'quarantine', finding.id, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ originalPath: path, mode: 0o751, sha256: sha('payload bytes'), allowRules: ['stealer_rule'], findingId: finding.id });

    const restore = { id: 'restore-file' as const, findingId: finding.id, path };
    const restorePreview = await previewAction(ledger, actions, finding.id, restore);
    expect(restorePreview).toMatchObject({ ok: true, value: { moves: [expect.stringContaining(`quarantine to ${path}`)] } });
    const restored = await runAction(ledger, actions, finding.id, restore, digestOf(restorePreview));
    expect(restored).toMatchObject({ ok: true, value: { finding: { status: 'acknowledged' } } });
    expect(await readFile(path, 'utf8')).toBe('payload bytes');
    expect((await stat(path)).mode & 0o7777).toBe(0o751);
    // The preview's, the act's re-plan, and the restore's own check just before the move.
    expect(rescan).toHaveBeenCalledTimes(3);
    await expect(stat(join(userData, 'vanguard', 'quarantine', finding.id))).rejects.toThrow();
    expect((await ledger.get(finding.id))?.actions?.map((a) => a.id)).toEqual(['quarantine-file', 'restore-file']);
  });

  it('a restore whose re-scan matches a new rule refuses and keeps the file in quarantine at 0000', async () => {
    const { path, finding } = await fileFinding('a.bin', 'x', (p) => [{ id: 'quarantine-file', path: p }]);
    let rules: string[] = [];
    const actions = createResponseActions(deps({ rescan: async () => ({ rules, errors: [] }) }));
    await runAction(ledger, actions, finding.id, { id: 'quarantine-file', path });
    rules = ['other_rule'];
    const restore = { id: 'restore-file' as const, findingId: finding.id, path };
    const result = await runAction(ledger, actions, finding.id, restore);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('matched other_rule') });
    await expect(stat(path)).rejects.toThrow();
    expect((await stat(join(userData, 'vanguard', 'quarantine', finding.id, 'data', 'a.bin'))).mode & 0o777).toBe(0);
  });

  it('the finding’s own rule matching again is a warning on the confirm, not a refusal', async () => {
    const { path, finding } = await fileFinding('a.bin', 'x', (p) => [{ id: 'quarantine-file', path: p }]);
    const actions = createResponseActions(deps({ rescan: async () => ({ rules: ['stealer_rule'], errors: [] }) }));
    await runAction(ledger, actions, finding.id, { id: 'quarantine-file', path });
    const preview = await previewAction(ledger, actions, finding.id, { id: 'restore-file', findingId: finding.id, path });
    expect(preview).toMatchObject({ ok: true, value: { warnings: [expect.stringContaining('still matches stealer_rule')] } });
  });

  it('refuses to restore over a file that appeared at the original path', async () => {
    const { path, finding } = await fileFinding('a.bin', 'x', (p) => [{ id: 'quarantine-file', path: p }]);
    const actions = createResponseActions(deps());
    await runAction(ledger, actions, finding.id, { id: 'quarantine-file', path });
    await writeFile(path, 'new');
    const result = await runAction(ledger, actions, finding.id, { id: 'restore-file', findingId: finding.id, path });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('already at') });
    expect(await readFile(path, 'utf8')).toBe('new');
  });

  it('refuses a restore when an engine failed: "no match" from a scan that did not run is not clean', async () => {
    const { path, finding } = await fileFinding('e.bin', 'x', (p) => [{ id: 'quarantine-file', path: p }]);
    const actions = createResponseActions(deps({ rescan: async () => ({ rules: [], errors: ['yara: exited 1'] }) }));
    await runAction(ledger, actions, finding.id, { id: 'quarantine-file', path });
    expect(await runAction(ledger, actions, finding.id, { id: 'restore-file', findingId: finding.id, path })).toMatchObject({
      ok: false,
      message: expect.stringContaining('did not finish (yara: exited 1)'),
    });
    await expect(stat(path)).rejects.toThrow();
  });

  it('refuses to quarantine a file with other hard links', async () => {
    const { path, finding } = await fileFinding('h.bin', 'x', (p) => [{ id: 'quarantine-file', path: p }]);
    await link(path, join(home, 'h-other.bin'));
    expect(await previewAction(ledger, createResponseActions(deps()), finding.id, { id: 'quarantine-file', path })).toMatchObject({
      ok: false,
      message: expect.stringContaining('1 other hard link'),
    });
  });

  it('quarantines and restores a dotfile', async () => {
    const { path, finding } = await fileFinding('.claude.json', '{"mcpServers":{}}', (p) => [{ id: 'quarantine-file', path: p }], 0o644);
    const actions = createResponseActions(deps());
    expect(await runAction(ledger, actions, finding.id, { id: 'quarantine-file', path })).toMatchObject({ ok: true });
    expect(await runAction(ledger, actions, finding.id, { id: 'restore-file', findingId: finding.id, path })).toMatchObject({ ok: true });
    expect(await readFile(path, 'utf8')).toBe('{"mcpServers":{}}');
  });

  it('refuses a restore when the scan cannot run', async () => {
    const { path, finding } = await fileFinding('a.bin', 'x', (p) => [{ id: 'quarantine-file', path: p }]);
    const actions = createResponseActions(deps({ rescan: async () => ({ error: 'engine missing' }) }));
    await runAction(ledger, actions, finding.id, { id: 'quarantine-file', path });
    expect(await runAction(ledger, actions, finding.id, { id: 'restore-file', findingId: finding.id, path })).toMatchObject({
      ok: false,
      message: expect.stringContaining('re-scan could not run'),
    });
  });

  it('refuses to quarantine a file that changed since the finding', async () => {
    const { path, finding } = await fileFinding('a.bin', 'x', (p) => [{ id: 'quarantine-file', path: p }]);
    await writeFile(path, 'y');
    const result = await runAction(ledger, createResponseActions(deps()), finding.id, { id: 'quarantine-file', path });
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('has changed') });
    expect(await readFile(path, 'utf8')).toBe('y');
  });

  it('refuses the app’s own files, system files and symlinks', async () => {
    const own = join(userData, 'x.bin');
    await writeFile(own, 'x');
    const link = join(home, 'link');
    await symlink(own, link);
    const actions = createResponseActions(deps());
    for (const [path, reason] of [
      [own, 'Midnite itself'],
      [link, 'symbolic link'],
      ['/usr/bin/true', 'system file'],
      ['relative/x', 'plain absolute path'],
    ] as const) {
      const finding = await record({ remediation: [{ id: 'quarantine-file', path }] });
      expect(await previewAction(ledger, actions, finding.id, { id: 'quarantine-file', path })).toMatchObject({ ok: false, message: expect.stringContaining(reason) });
    }
  });

  it('warns when a running process is the file being quarantined', async () => {
    const { path, finding } = await fileFinding('a.bin', 'x', (p) => [{ id: 'quarantine-file', path: p }]);
    ps = ` 5120 1 5120 ${UID} 01:00 ${path}`;
    expect(await previewAction(ledger, createResponseActions(deps()), finding.id, { id: 'quarantine-file', path })).toMatchObject({
      ok: true,
      value: { warnings: ['pid 5120 is running this file; it keeps running until you stop it.'] },
    });
  });

  it('expands a ledger-redacted ~/ path before acting', async () => {
    const { finding } = await fileFinding('b.bin', 'x', () => [{ id: 'quarantine-file', path: '~/b.bin' }]);
    const result = await runAction(ledger, createResponseActions(deps()), finding.id, { id: 'quarantine-file', path: '~/b.bin' });
    expect(result.ok).toBe(true);
  });
});

describe('chmod-600', () => {
  it('restricts the file to its owner and names the mode change', async () => {
    const { path, finding } = await fileFinding('.aws/credentials', 'key', (p) => [{ id: 'chmod-600', path: p }], 0o644);
    const actions = createResponseActions(deps());
    expect(await previewAction(ledger, actions, finding.id, { id: 'chmod-600', path })).toMatchObject({ ok: true, value: { moves: [`${path}: 0644 to 0600`] } });
    const result = await runAction(ledger, actions, finding.id, { id: 'chmod-600', path });
    expect(result).toMatchObject({ ok: true, value: { finding: { status: 'resolved' } } });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('refuses a file modified after the finding when no hash was recorded', async () => {
    const path = join(home, 'cfg');
    await writeFile(path, 'x');
    await chmod(path, 0o644);
    const finding = await record({ remediation: [{ id: 'chmod-600', path }] });
    const later = (NOW + 3_600_000) / 1000;
    await utimes(path, later, later);
    expect(await runAction(ledger, createResponseActions(deps()), finding.id, { id: 'chmod-600', path })).toMatchObject({
      ok: false,
      message: expect.stringContaining('modified after the finding'),
    });
    expect((await stat(path)).mode & 0o777).toBe(0o644);
  });
});
