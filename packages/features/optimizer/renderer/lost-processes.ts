import type { ProcessInfo, ProcessLostReason } from '@midnite/studio-shared';

import { formatBytes, type ConfirmRequest } from '@midnite/studio-frame';

/**
 * The Memory tab's view of lost processes (Phase 148 Theme B): terminal brokers from an older build,
 * brokers nothing reaches, and ptys with no sidebar row — stamped in main (`broker-inventory.ts`).
 * Pure, so the confirm copy is testable without rendering the table.
 */

export const LOST_REASON_LABEL: Record<ProcessLostReason, string> = {
  'previous-build': 'previous build',
  unreachable: 'unreachable broker',
  'no-row': 'no sidebar row',
};

export const isLost = (proc: ProcessInfo): boolean => proc.lost != null;

/** A lost broker this app may end: the broker row itself, never the primary (which is never lost). */
export const isLostBroker = (proc: ProcessInfo): boolean =>
  proc.ours && proc.brokerPid === proc.pid && (proc.lost === 'previous-build' || proc.lost === 'unreachable');

/** The broker and every process in its tree, broker first. */
export function brokerTree(processes: readonly ProcessInfo[], brokerPid: number): ProcessInfo[] {
  return processes
    .filter((p) => p.brokerPid === brokerPid)
    .sort((a, b) => (a.pid === brokerPid ? -1 : b.pid === brokerPid ? 1 : a.pid - b.pid));
}

/** A broker's sessions are its direct children: one pty root each. */
export const brokerSessionCount = (processes: readonly ProcessInfo[], brokerPid: number): number =>
  processes.filter((p) => p.ppid === brokerPid && p.brokerPid === brokerPid).length;

const rssOf = (procs: readonly ProcessInfo[]): number => procs.reduce((sum, p) => sum + (p.rssBytes ?? 0), 0);

/** `pid · RSS · argv`, one per process the kill takes. */
export const describeProcess = (proc: ProcessInfo): string =>
  `${proc.pid} · ${proc.rssBytes === null ? '—' : formatBytes(proc.rssBytes)} · ${proc.argv}`;

/** What ending these brokers takes with it: every process, the RSS they hold and the sessions inside. */
export function lostTreeSummary(processes: readonly ProcessInfo[], brokers: readonly ProcessInfo[]) {
  const tree = brokers.flatMap((b) => brokerTree(processes, b.pid));
  return {
    tree,
    rssBytes: rssOf(tree),
    sessions: brokers.reduce((n, b) => n + brokerSessionCount(processes, b.pid), 0),
  };
}

/**
 * The blast-radius confirm for ending one or more lost brokers as whole trees. `force` is the second,
 * explicit step — SIGKILL for every process instead of SIGTERM to the broker.
 */
export function lostTreeConfirm(
  processes: readonly ProcessInfo[],
  brokers: readonly ProcessInfo[],
  force: boolean,
  onConfirm: () => void,
): ConfirmRequest {
  const { tree, rssBytes, sessions } = lostTreeSummary(processes, brokers);
  const one = brokers.length === 1;
  const subject = one ? `broker ${brokers[0]?.pid}` : `${brokers.length} lost brokers`;
  return {
    title: force ? `Force kill ${subject}` : one ? `End lost broker (PID ${brokers[0]?.pid})` : `End all lost brokers`,
    body: `${force ? 'SIGKILL every process' : 'SIGTERM the broker; its shutdown hangs up every session'} below — ${tree.length} ${
      tree.length === 1 ? 'process' : 'processes'
    }, ${formatBytes(rssBytes)} held. Unsaved work in them is lost.`,
    confirmLabel: force ? 'Force Kill' : one ? 'End broker' : `End ${brokers.length} brokers`,
    danger: true,
    blastRadius: { count: sessions, sample: [] },
    blastRadiusKind: 'sessions',
    warnings: tree.map(describeProcess),
    onConfirm,
  };
}
