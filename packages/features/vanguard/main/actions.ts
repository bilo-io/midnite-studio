import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

import {
  appIssueFormUrl,
  DEFAULT_ISSUE_APP,
  redactPaths,
  REMEDIATION_PENDING,
  REMEDIATION_UNCONFIRMED,
  type ActionBlastRadius,
  type EvidenceItem,
  type FindingActionResult,
  type GitOpResult,
  type RemediationAction,
  type RemediationActionId,
  type RemediationUnavailable,
  type SecurityFinding,
  type SecurityFindingStatus,
} from '@midnite/studio-shared';

import { launchTarget, parseLaunchPlistJson } from './persistence-parse';
import {
  ancestorsOf,
  commMatches,
  GROUP_PS_ARGS,
  parseGroupPs,
  parsePidArgs,
  PS,
  type GroupPsRow,
} from './response/process-table';
import type { QuarantineStore } from './response/quarantine';
import {
  checkFileTarget,
  checkFileUnchanged,
  expandHome,
  formatMode,
  formatSize,
  STALE_SLACK_MS,
} from './response/target';
import type { SensorRunProcess } from './sensor-host';

/**
 * Response actions (Phase 120 Theme H): one handler per id in the closed `RemediationActionSchema` enum.
 *
 * Every action is planned against the machine as it is now — the target re-checked against what the finding
 * saw — and the plan is what the blast-radius confirm shows. `act` plans again from scratch before it runs,
 * so a preview is never a licence and a stale finding is refused with the reason recorded on its row.
 *
 * The renderer cannot name a target: an action runs only when it is one of the finding's own `remediation`
 * entries (or, for `restore-file`, when the quarantine holds a file for that finding at that path).
 */

export const LAUNCHCTL = '/bin/launchctl';
export const PLUTIL = '/usr/bin/plutil';
/** Ctrl+C as the bytes a pty reads — the interrupt Loops' Stop sends (`use-loop-session.ts`). */
export const INTERRUPT = '\x03';
const KILL_GRACE_MS = 2_000;
const LIST_CAP = 12;

export interface ResponseSession {
  sessionId: string;
  /** The pty's root pid. */
  pid: number;
  title: string;
}

export type RescanResult = { rules: string[]; errors: string[] } | { error: string };

export interface ResponseActionDeps {
  homeDir: string;
  uid: number;
  selfPid: number;
  /** `process.execPath`: the app's own Electron helpers and its terminal broker all run it. */
  selfExecPath: string;
  /** The app's bundle and userData (and, in a guest app, the host's): never a file target. Read per plan. */
  protectedPaths: () => readonly string[];
  /** Strings that mark a process as the suite's own in its command line (the broker's script, its socket dir). */
  protectedMarkers?: () => readonly string[];
  /** Other suite processes never to stop (the runtime host, seen from a guest app). */
  protectedPids?: () => readonly number[];
  runProcess: SensorRunProcess;
  quarantine: QuarantineStore;
  /** Re-scan one file without recording findings (the malware scanner's `check`). */
  rescan: (path: string) => Promise<RescanResult>;
  /** Live agent sessions; absent where the app has no terminals to reach. */
  sessions?: () => Promise<readonly ResponseSession[]>;
  /** Write the interrupt to a session's pty; false when it is not live. */
  interrupt?: (sessionId: string) => Promise<boolean>;
  /**
   * Clears a server from the MCP allowlist (Phase 121 Theme C): every repo when `repoId` is omitted. Resolves
   * to how many entries it cleared. Absent where the app keeps no allowlist.
   */
  revokeMcpServer?: (serverName: string, repoId?: string) => Promise<number>;
  /** The issue form's App dropdown value. */
  issueApp?: string;
  retentionDays: () => number;
  kill?: (pid: number, signal: NodeJS.Signals | 0) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  killGraceMs?: number;
}

type Run = () => Promise<
  | { ok: true; detail: string; status?: { status: SecurityFindingStatus; resolvedBy?: string }; issueUrl?: string }
  | { ok: false; error: string }
>;

type Plan =
  /** `identity`: the exact targets behind the radius (every pid, the full hash), folded into its digest. */
  | { kind: 'ready'; radius: ActionBlastRadius; identity?: string; run: Run }
  | { kind: 'refused'; error: string }
  | { kind: 'unavailable'; unavailable: RemediationUnavailable };

export interface ResponseActions {
  /** The clock outcomes are stamped with. */
  now(): number;
  /** The actions this app cannot run, with why: Phase 121's pair always, plus any seam the composer left out. */
  unavailable(): Record<string, RemediationUnavailable>;
  plan(finding: SecurityFinding, action: RemediationAction): Promise<Plan>;
}

const resolvedBy = (id: RemediationActionId) => ({ status: 'resolved' as const, resolvedBy: `action:${id}` });

function capped(lines: string[]): string[] {
  return lines.length <= LIST_CAP ? lines : [...lines.slice(0, LIST_CAP), `…and ${lines.length - LIST_CAP} more`];
}

/** Two actions are the same when every argument but the free-text description agrees. */
export function sameAction(a: RemediationAction, b: RemediationAction): boolean {
  const strip = ({ description: _d, ...rest }: RemediationAction): Record<string, unknown> => rest;
  const left = strip(a);
  const right = strip(b);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

/** The malware rule a `malware:` finding is about (`malware:[clamav:]<rule>:<path>`), which a restore's re-scan may match. */
export function findingRules(finding: SecurityFinding): string[] {
  const m = /^malware:(?:clamav:)?([^:]+):/.exec(finding.fingerprint);
  return finding.category === 'malware' && m ? [m[1]!] : [];
}

/** What the user confirmed: the radius as shown plus the exact targets behind it. */
export function radiusDigest(radius: ActionBlastRadius, identity = ''): string {
  const { digest: _digest, ...shown } = radius;
  return createHash('sha256').update(JSON.stringify({ shown, identity })).digest('hex');
}

function confirmFlag(id: RemediationActionId): boolean {
  return !REMEDIATION_UNCONFIRMED.has(id);
}

function radius(
  id: RemediationActionId,
  fields: Omit<ActionBlastRadius, 'actionId' | 'confirm' | 'dies' | 'moves' | 'pauses' | 'warnings'> &
    Partial<Pick<ActionBlastRadius, 'dies' | 'moves' | 'pauses' | 'warnings'>>,
): ActionBlastRadius {
  return {
    actionId: id,
    confirm: confirmFlag(id),
    dies: [],
    moves: [],
    pauses: [],
    warnings: [],
    ...fields,
  };
}

/** The issue body: what the finding says, with the home folder folded and secrets blanked. Evidence by kind only. */
export function issueDraft(finding: SecurityFinding, action: Extract<RemediationAction, { id: 'report-issue' }>, home: string, app: string): string {
  const evidence = finding.evidence
    .flatMap((item: EvidenceItem) => {
      switch (item.kind) {
        case 'host':
          return [`- host ${item.host}${item.port !== undefined ? `:${item.port}` : ''}`];
        case 'pid':
          return [`- process ${item.command ?? item.pid}`];
        case 'path':
          return [`- path ${item.path}`];
        default:
          return [];
      }
    })
    .slice(0, 10);
  const description = [
    `Vanguard raised a ${finding.severity} ${finding.category} finding: ${finding.title}`,
    '',
    action.body ?? finding.detail,
    ...(evidence.length > 0 ? ['', 'Evidence:', ...evidence] : []),
  ].join('\n');
  return appIssueFormUrl({
    kind: 'bug',
    title: redactPaths(action.title, home),
    description: redactPaths(description, home),
    diagnostics: '',
    app,
  });
}

export function createResponseActions(deps: ResponseActionDeps): ResponseActions {
  const now = deps.now ?? Date.now;
  const kill = deps.kill ?? ((pid: number, signal: NodeJS.Signals | 0) => void process.kill(pid, signal));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const home = deps.homeDir;
  const reach = () => ({ homeDir: home, uid: deps.uid, protectedPaths: deps.protectedPaths() });

  const alive = (pid: number): boolean => {
    try {
      kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  };

  const psTable = async (): Promise<GroupPsRow[] | null> => {
    const result = await deps.runProcess(PS, GROUP_PS_ARGS, { timeoutMs: 10_000 });
    return result.ok && result.exitCode === 0 ? parseGroupPs(result.stdout) : null;
  };

  const unavailable = (): Record<string, RemediationUnavailable> => {
    const out: Record<string, RemediationUnavailable> = { ...REMEDIATION_PENDING };
    if (!deps.sessions || !deps.interrupt) {
      out['pause-session'] = { reason: 'This app has no terminal sessions it can reach, so it cannot pause one.' };
    }
    if (!deps.revokeMcpServer) {
      out['revoke-mcp-server'] = { reason: 'This app keeps no MCP allowlist, so there is nothing to revoke from.' };
    }
    return out;
  };

  // --- pause-session -----------------------------------------------------------------------------------
  const pauseSession = async (action: Extract<RemediationAction, { id: 'pause-session' }>): Promise<Plan> => {
    const sessions = deps.sessions;
    const interrupt = deps.interrupt;
    if (!sessions || !interrupt) return { kind: 'unavailable', unavailable: unavailable()['pause-session']! };
    const session = (await sessions()).find((s) => s.sessionId === action.sessionId);
    if (!session) return { kind: 'refused', error: 'That agent session is no longer live; there is nothing to pause.' };
    return {
      kind: 'ready',
      radius: radius('pause-session', {
        title: 'Pause the agent session?',
        confirmLabel: 'Send Ctrl+C',
        summary:
          'Sends Ctrl+C to the session’s terminal: the agent stops its current turn and waits for you. The session stays open and nothing is killed.',
        pauses: [`${session.title} (pid ${session.pid})`],
      }),
      run: async () =>
        (await interrupt(session.sessionId))
          ? { ok: true, detail: `Interrupted ${session.title}.` }
          : { ok: false, error: 'The session’s terminal could not be reached; it may have just ended.' },
    };
  };

  // --- kill-process-group ------------------------------------------------------------------------------
  const killGroup = async (finding: SecurityFinding, action: Extract<RemediationAction, { id: 'kill-process-group' }>): Promise<Plan> => {
    const recorded = finding.evidence.find((e): e is Extract<EvidenceItem, { kind: 'pid' }> => e.kind === 'pid' && e.pid === action.pid);
    if (!recorded) {
      return { kind: 'refused', error: `The finding does not record pid ${action.pid}; Vanguard will not stop a process it cannot verify.` };
    }
    const table = await psTable();
    if (!table) return { kind: 'refused', error: 'The process table could not be read.' };
    const target = table.find((r) => r.pid === action.pid);
    if (!target) return { kind: 'refused', error: `Process ${action.pid} has already exited.` };
    if (target.uid !== deps.uid) {
      return { kind: 'refused', error: `Process ${action.pid} belongs to another user; it is outside what Vanguard may stop.` };
    }
    if (recorded.command && !commMatches(target.comm, expandHome(recorded.command, home))) {
      return {
        kind: 'refused',
        error: `pid ${action.pid} now runs ${target.comm}, not ${recorded.command}; the process the finding saw is gone.`,
      };
    }
    const startedAt = now() - target.elapsedSeconds * 1000;
    if (startedAt > finding.lastSeen + STALE_SLACK_MS) {
      return {
        kind: 'refused',
        error: `pid ${action.pid} belongs to a process that started after the finding; it is not the one the finding saw.`,
      };
    }
    const pgid = target.pgid;
    if (pgid <= 1) return { kind: 'refused', error: `Process ${action.pid} is in a system process group.` };
    const members = table.filter((r) => r.pgid === pgid);
    const own = ancestorsOf(table, deps.selfPid);
    for (const pid of deps.protectedPids?.() ?? []) own.add(pid);
    const markers = (deps.protectedMarkers?.() ?? []).filter((m) => m.length > 0);
    let args = new Map<number, string>();
    if (markers.length > 0) {
      const listed = await deps.runProcess(PS, ['-ww', '-o', 'pid=,args=', '-p', members.map((m) => m.pid).join(',')], { timeoutMs: 10_000 });
      if (!listed.ok) return { kind: 'refused', error: 'The process group’s command lines could not be read.' };
      args = parsePidArgs(listed.stdout);
    }
    for (const member of members) {
      const why =
        own.has(member.pid)
          ? 'Midnite itself'
          : member.comm === deps.selfExecPath
            ? 'part of Midnite (its helper or terminal broker)'
            : markers.some((m) => args.get(member.pid)?.includes(m))
              ? 'Midnite’s terminal broker'
              : member.uid !== deps.uid
                ? 'another user’s process'
                : null;
      if (why) {
        return { kind: 'refused', error: `Process group ${pgid} includes pid ${member.pid}, ${why}; Vanguard will not stop it.` };
      }
    }
    const sessions = (await deps.sessions?.()) ?? [];
    const memberPids = new Set(members.map((m) => m.pid));
    const ending = sessions.filter((s) => memberPids.has(s.pid));
    const grace = deps.killGraceMs ?? KILL_GRACE_MS;
    return {
      kind: 'ready',
      radius: radius('kill-process-group', {
        title: `Stop process group ${pgid}?`,
        confirmLabel: members.length === 1 ? 'Stop 1 process' : `Stop ${members.length} processes`,
        summary: `Sends SIGTERM to every process in group ${pgid}, then SIGKILL to anything still running after ${grace / 1000} s.`,
        dies: [
          ...ending.map((s) => `agent session ${s.title} (pid ${s.pid}) ends with it`),
          ...capped(members.map((m) => `pid ${m.pid}  ${m.comm}`)),
        ],
      }),
      identity: members
        .map((m) => `${m.pid}:${m.comm}`)
        .sort()
        .join('\n'),
      run: async () => {
        const signal = (sig: NodeJS.Signals): void => {
          try {
            kill(-pgid, sig);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
          }
        };
        try {
          signal('SIGTERM');
          const deadline = now() + grace;
          while (members.some((m) => alive(m.pid)) && now() < deadline) await sleep(100);
          if (members.some((m) => alive(m.pid))) {
            signal('SIGKILL');
            await sleep(100);
          }
        } catch (error) {
          return { ok: false, error: `Could not signal group ${pgid}: ${error instanceof Error ? error.message : String(error)}` };
        }
        const left = members.filter((m) => alive(m.pid));
        return left.length === 0
          ? { ok: true, detail: `Stopped ${members.length} process${members.length === 1 ? '' : 'es'} in group ${pgid}.`, status: resolvedBy('kill-process-group') }
          : { ok: false, error: `${left.length} process${left.length === 1 ? '' : 'es'} in group ${pgid} survived SIGKILL.` };
      },
    };
  };

  // --- bootout-launch-item -----------------------------------------------------------------------------
  const bootout = async (finding: SecurityFinding, action: Extract<RemediationAction, { id: 'bootout-launch-item' }>): Promise<Plan> => {
    const domain = `gui/${deps.uid}`;
    if (action.domain !== domain) {
      return {
        kind: 'refused',
        error: `This item is in the ${action.domain} domain, which needs administrator rights; Vanguard does not escalate. Unload it yourself with sudo launchctl bootout.`,
      };
    }
    const path = expandHome(action.path, home);
    if (!path.startsWith(`${home}/Library/LaunchAgents/`) || !path.endsWith('.plist')) {
      return { kind: 'refused', error: `${path} is not a launch agent in your LaunchAgents folder.` };
    }
    const target = await checkFileTarget(path, reach());
    if (!target.ok) return { kind: 'refused', error: target.error };
    const same = await checkFileUnchanged(finding, target, home);
    if (!same.ok) return { kind: 'refused', error: same.error };
    const converted = await deps.runProcess(PLUTIL, ['-convert', 'json', '-o', '-', path], { timeoutMs: 5_000 });
    const item = converted.ok && converted.exitCode === 0 ? parseLaunchPlistJson(converted.stdout) : null;
    if (!item) return { kind: 'refused', error: `${path} could not be read as a property list.` };
    const label = item.label ?? path.slice(path.lastIndexOf('/') + 1, -'.plist'.length);
    const launches = launchTarget(item);
    // By its label when the plist names one, so launchd unloads the service that was hashed and shown rather
    // than whatever the file says by the time it re-reads it.
    const bootoutTarget = item.label ? [`${domain}/${item.label}`] : [domain, path];
    return {
      kind: 'ready',
      radius: radius('bootout-launch-item', {
        title: 'Unload the launch item?',
        confirmLabel: 'Unload',
        summary: `Runs launchctl bootout ${domain} on it: launchd stops the item and whatever it is running. The plist stays in ~/Library/LaunchAgents and loads again at your next login unless you remove it.`,
        dies: [`${label}${launches ? ` — runs ${launches}` : ''}`],
        moves: [],
      }),
      identity: `${same.sha256}\n${bootoutTarget.join(' ')}`,
      run: async () => {
        const result = await deps.runProcess(LAUNCHCTL, ['bootout', ...bootoutTarget], { timeoutMs: 15_000 });
        if (!result.ok) return { ok: false, error: `launchctl bootout did not run: ${result.hint}` };
        if (result.exitCode !== 0) {
          return { ok: false, error: `launchctl bootout failed: ${(result.stderr || result.stdout).trim() || `exit ${result.exitCode}`}` };
        }
        return { ok: true, detail: `Unloaded ${label}.`, status: resolvedBy('bootout-launch-item') };
      },
    };
  };

  // --- quarantine-file ---------------------------------------------------------------------------------
  const quarantineFile = async (finding: SecurityFinding, action: Extract<RemediationAction, { id: 'quarantine-file' }>): Promise<Plan> => {
    const target = await checkFileTarget(action.path, reach());
    if (!target.ok) return { kind: 'refused', error: target.error };
    const same = await checkFileUnchanged(finding, target, home);
    if (!same.ok) return { kind: 'refused', error: same.error };
    if (target.stat.nlink > 1) {
      return {
        kind: 'refused',
        error: `${target.path} has ${target.stat.nlink - 1} other hard link${target.stat.nlink === 2 ? '' : 's'}; quarantining one name would leave the file reachable through the others.`,
      };
    }
    if ((await deps.quarantine.manifest(finding.id)).ok) {
      return { kind: 'refused', error: 'This finding already has a file in quarantine; restore it before quarantining another.' };
    }
    const running = ((await psTable()) ?? []).filter((r) => r.comm === target.path);
    const days = deps.retentionDays();
    return {
      kind: 'ready',
      radius: radius('quarantine-file', {
        title: 'Quarantine the file?',
        confirmLabel: 'Quarantine',
        summary: `Moves the file into Vanguard’s quarantine at mode 0000, so nothing can read or run it. Restore puts it back after a re-scan; it is deleted after ${days} day${days === 1 ? '' : 's'}.`,
        moves: [`${target.path} (${formatSize(target.stat.size)}, ${formatMode(target.stat.mode)}, sha256 ${same.sha256.slice(0, 12)}…) to quarantine`],
        warnings: running.map((r) => `pid ${r.pid} is running this file; it keeps running until you stop it.`),
      }),
      identity: `${same.sha256}\n${target.stat.dev}:${target.stat.ino}`,
      run: async () => {
        const put = await deps.quarantine.put({
          finding,
          path: target.path,
          sha256: same.sha256,
          size: target.stat.size,
          mode: target.stat.mode,
          uid: target.stat.uid,
          allowRules: findingRules(finding),
        });
        return put.ok
          ? { ok: true, detail: `Quarantined ${target.path}.`, status: resolvedBy('quarantine-file') }
          : { ok: false, error: put.error };
      },
    };
  };

  // --- restore-file ------------------------------------------------------------------------------------
  const verdictOf = (scan: RescanResult, allow: readonly string[]): { ok: true; allowed: string[] } | { ok: false; error: string } => {
    if ('error' in scan) return { ok: false, error: `The re-scan could not run (${scan.error}); the file stays in quarantine.` };
    // An engine that failed scanned nothing: "no match" from it is not a clean verdict.
    if (scan.errors.length > 0) {
      return { ok: false, error: `The re-scan did not finish (${scan.errors.join('; ')}); the file stays in quarantine.` };
    }
    const blocked = scan.rules.filter((r) => !allow.includes(r));
    if (blocked.length > 0) return { ok: false, error: `The re-scan matched ${blocked.join(', ')}; the file stays in quarantine.` };
    return { ok: true, allowed: scan.rules };
  };

  const restoreFile = async (finding: SecurityFinding, action: Extract<RemediationAction, { id: 'restore-file' }>): Promise<Plan> => {
    if (action.findingId !== finding.id) return { kind: 'refused', error: 'That quarantined file belongs to another finding.' };
    const read = await deps.quarantine.manifest(finding.id);
    if (!read.ok) return { kind: 'refused', error: read.error };
    const m = read.manifest;
    if (expandHome(action.path, home) !== m.originalPath) return { kind: 'refused', error: 'The quarantine holds a different file for this finding.' };
    const peeked = await deps.quarantine.peek(finding.id, (dataPath) => deps.rescan(dataPath));
    if (!peeked.ok) return { kind: 'refused', error: peeked.error };
    const verdict = verdictOf(peeked.value, m.allowRules);
    if (!verdict.ok) return { kind: 'refused', error: verdict.error };
    return {
      kind: 'ready',
      radius: radius('restore-file', {
        title: 'Restore the file?',
        confirmLabel: 'Restore',
        summary: `Re-scans the quarantined copy once more, then moves it back with its mode (${formatMode(m.mode)}) and extended attributes. Nothing already at that path is replaced.`,
        moves: [`quarantine to ${m.originalPath} (${formatSize(m.size)})`],
        warnings: verdict.allowed.map(
          (rule) => `The re-scan still matches ${rule}, the rule this finding is about. Restore it only if you are sure that is a false positive.`,
        ),
      }),
      identity: m.sha256,
      run: async () => {
        const restored = await deps.quarantine.restore(finding.id, async (dataPath, manifest) => {
          const again = verdictOf(await deps.rescan(dataPath), manifest.allowRules);
          return again.ok ? { ok: true } : again;
        });
        return restored.ok
          ? { ok: true, detail: `Restored ${m.originalPath}.`, status: { status: 'acknowledged' } }
          : { ok: false, error: restored.error };
      },
    };
  };

  // --- chmod-600 ---------------------------------------------------------------------------------------
  const chmod600 = async (finding: SecurityFinding, action: Extract<RemediationAction, { id: 'chmod-600' }>): Promise<Plan> => {
    const target = await checkFileTarget(action.path, reach());
    if (!target.ok) return { kind: 'refused', error: target.error };
    const same = await checkFileUnchanged(finding, target, home);
    if (!same.ok) return { kind: 'refused', error: same.error };
    if ((target.stat.mode & 0o777) === 0o600) return { kind: 'refused', error: `${target.path} is already 0600.` };
    return {
      kind: 'ready',
      radius: radius('chmod-600', {
        title: 'Restrict the file to you?',
        confirmLabel: 'Set mode 0600',
        summary: 'Sets the file’s mode to 0600: only you can read or write it, and nothing can run it.',
        moves: [`${target.path}: ${formatMode(target.stat.mode)} to 0600`],
      }),
      identity: `${same.sha256}\n${target.stat.dev}:${target.stat.ino}`,
      run: async () => {
        // On the opened descriptor, without following a link, and only if it is still the same file.
        let handle;
        try {
          handle = await open(target.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        } catch (error) {
          return { ok: false, error: `Could not open ${target.path}: ${error instanceof Error ? error.message : String(error)}` };
        }
        try {
          const stat = await handle.stat();
          if (stat.ino !== target.stat.ino || stat.dev !== target.stat.dev) return { ok: false, error: `${target.path} was replaced; nothing was changed.` };
          await handle.chmod(0o600);
          return { ok: true, detail: `${target.path} is now 0600.`, status: resolvedBy('chmod-600') };
        } catch (error) {
          return { ok: false, error: `Could not change ${target.path}: ${error instanceof Error ? error.message : String(error)}` };
        } finally {
          await handle.close();
        }
      },
    };
  };

  // --- revoke-mcp-server -------------------------------------------------------------------------------
  const revokeMcp = (action: Extract<RemediationAction, { id: 'revoke-mcp-server' }>, finding: SecurityFinding): Plan => {
    const revoke = deps.revokeMcpServer;
    if (!revoke) return { kind: 'unavailable', unavailable: unavailable()['revoke-mcp-server']! };
    return {
      kind: 'ready',
      radius: radius('revoke-mcp-server', {
        title: 'Revoke this MCP server?',
        confirmLabel: 'Revoke',
        summary: `Removes “${action.serverName}” from the MCP allowlist. It asks for approval again before any Chats or Councils run uses it. The config files that define it are not touched.`,
      }),
      identity: `${action.serverName}\n${finding.repoId ?? ''}`,
      run: async () => {
        const cleared = await revoke(action.serverName, finding.repoId);
        return {
          ok: true,
          detail: cleared > 0 ? `Revoked “${action.serverName}” (${cleared} allowlist entr${cleared === 1 ? 'y' : 'ies'} cleared).` : `“${action.serverName}” was not on the allowlist; nothing to clear.`,
          status: resolvedBy('revoke-mcp-server'),
        };
      },
    };
  };

  return {
    now,
    unavailable,
    async plan(finding, action) {
      const pending = REMEDIATION_PENDING[action.id] ?? (action.id === 'revoke-mcp-server' ? unavailable()['revoke-mcp-server'] : undefined);
      if (pending) return { kind: 'unavailable', unavailable: pending };
      const allowed =
        action.id === 'mute' ||
        (action.id === 'restore-file' ? action.findingId === finding.id : finding.remediation.some((r) => sameAction(r, action)));
      if (!allowed) return { kind: 'refused', error: `“${action.id}” is not one of this finding’s actions.` };
      switch (action.id) {
        case 'mute':
          return {
            kind: 'ready',
            radius: radius('mute', { title: 'Mute', confirmLabel: 'Mute', summary: 'Hides this finding; a re-detection stays muted.' }),
            run: async () => ({ ok: true, detail: 'Muted.', status: { status: 'muted' } }),
          };
        case 'report-issue': {
          const url = issueDraft(finding, action, home, deps.issueApp ?? DEFAULT_ISSUE_APP);
          return {
            kind: 'ready',
            radius: radius('report-issue', {
              title: 'Report issue',
              confirmLabel: 'Open the issue form',
              summary: 'Opens a prefilled issue on GitHub in your browser. Nothing is sent until you submit it there.',
            }),
            run: async () => ({ ok: true, detail: 'Opened a prefilled issue.', issueUrl: url }),
          };
        }
        case 'pause-session':
          return pauseSession(action);
        case 'kill-process-group':
          return killGroup(finding, action);
        case 'bootout-launch-item':
          return bootout(finding, action);
        case 'quarantine-file':
          return quarantineFile(finding, action);
        case 'restore-file':
          return restoreFile(finding, action);
        case 'chmod-600':
          return chmod600(finding, action);
        case 'revoke-mcp-server':
          return revokeMcp(action, finding);
        case 'update-package':
        case 'pin-package':
        case 'open-in-agents':
          // Unreachable while REMEDIATION_PENDING names it; kept so a new id cannot slip past the switch.
          return { kind: 'unavailable', unavailable: { reason: 'This action is not available yet.' } };
      }
    },
  };
}

/** The ledger as the action runner needs it. */
export interface ResponseLedger {
  get(id: string): Promise<SecurityFinding | null>;
  recordAction(
    id: string,
    result: FindingActionResult,
    change?: { status: SecurityFindingStatus; resolvedBy?: string },
  ): Promise<SecurityFinding | null>;
}

const failure = (message: string): { ok: false; kind: 'error'; message: string } => ({ ok: false, kind: 'error', message });

/** `securityFindingsActPreview`: the blast radius, never an action. Never throws. */
export async function previewAction(
  ledger: ResponseLedger,
  actions: ResponseActions,
  findingId: string,
  action: RemediationAction,
): Promise<GitOpResult<ActionBlastRadius>> {
  try {
    const finding = await ledger.get(findingId);
    if (!finding) return failure(`Finding '${findingId}' not found`);
    const plan = await actions.plan(finding, action);
    if (plan.kind === 'refused') return failure(plan.error);
    if (plan.kind === 'unavailable') {
      return {
        ok: true,
        value: radius(action.id, { title: 'Not available', confirmLabel: 'OK', summary: plan.unavailable.reason, unavailable: plan.unavailable }),
      };
    }
    return { ok: true, value: { ...plan.radius, digest: radiusDigest(plan.radius, plan.identity) } };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}

export interface ActOutcome {
  actionId: RemediationActionId;
  finding?: SecurityFinding;
  unavailable?: RemediationUnavailable;
  issueUrl?: string;
  detail?: string;
}

/** The refusal recorded when the fresh plan is not the one the user confirmed. */
export const CHANGED_SINCE_CONFIRM =
  'What this action would affect changed since you confirmed it, so nothing was done. Review it again before acting.';

/**
 * `securityFindingsAct`: plan afresh, run, and append the outcome to the finding's row. A confirmed action runs
 * only when the fresh plan's digest is the one the user confirmed (`confirmed`); a different one is refused and
 * recorded, and a missing one is refused without a record (the caller skipped the confirm). A refusal (stale
 * target, outside reach) and a failure are both recorded with their error and leave the status alone; an
 * action that is not available records nothing, since nothing was attempted. Never throws.
 */
export async function runAction(
  ledger: ResponseLedger,
  actions: ResponseActions,
  findingId: string,
  action: RemediationAction,
  confirmed?: string,
): Promise<GitOpResult<ActOutcome>> {
  try {
    const now = (): number => actions.now();
    const finding = await ledger.get(findingId);
    if (!finding) return failure(`Finding '${findingId}' not found`);
    let plan: Plan;
    try {
      plan = await actions.plan(finding, action);
    } catch (error) {
      plan = { kind: 'refused', error: error instanceof Error ? error.message : String(error) };
    }
    if (plan.kind === 'unavailable') return { ok: true, value: { actionId: action.id, unavailable: plan.unavailable } };
    const notOurs = plan.kind === 'refused' && plan.error.endsWith('is not one of this finding’s actions.');
    if (notOurs) return failure((plan as { error: string }).error);
    if (plan.kind === 'ready' && plan.radius.confirm && confirmed === undefined) {
      return failure('This action runs only from its confirm dialog.');
    }
    let outcome: Awaited<ReturnType<Run>>;
    if (plan.kind === 'refused') outcome = { ok: false, error: plan.error };
    else if (plan.radius.confirm && radiusDigest(plan.radius, plan.identity) !== confirmed) outcome = { ok: false, error: CHANGED_SINCE_CONFIRM };
    else {
      try {
        outcome = await plan.run();
      } catch (error) {
        outcome = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
    const result: FindingActionResult = outcome.ok
      ? { id: action.id, at: now(), ok: true }
      : { id: action.id, at: now(), ok: false, error: outcome.error };
    let updated: SecurityFinding | null = null;
    try {
      updated = await ledger.recordAction(finding.id, result, outcome.ok ? outcome.status : undefined);
    } catch (error) {
      // The action already happened; say so rather than lose it behind a write error.
      const why = error instanceof Error ? error.message : String(error);
      return failure(
        outcome.ok
          ? `${outcome.detail} The ledger could not record it (${why}).`
          : `${outcome.error} The ledger could not record it (${why}).`,
      );
    }
    if (!outcome.ok) return failure(outcome.error);
    return {
      ok: true,
      value: {
        actionId: action.id,
        ...(updated ? { finding: updated } : {}),
        detail: outcome.detail,
        ...(outcome.issueUrl ? { issueUrl: outcome.issueUrl } : {}),
      },
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}
