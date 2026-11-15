import { bridge, formatBytes, useToastStore, type FrameDialogs } from '@midnite/studio-frame';

/**
 * Free RAM (Phase 148 Theme C), the monitor flyout's action: ask main what it would end, show ALL of it in
 * one confirm, run it, and say what was really freed.
 *
 * It never ends an idle session of the current build: main offers only previous-build sessions, lost
 * brokers, hidden tabs and renderer caches, and the renderer sends back candidate ids rather than pids.
 * The confirm is all-or-nothing (the shared dialog has no per-row checkboxes); the processes are listed
 * first with their command and RSS, the tabs and caches after them under "Also".
 */
export type FreeRamDeps = {
  dialogs: Pick<FrameDialogs, 'confirm' | 'notify'>;
};

export type FreeRamCandidate = {
  id: string;
  kind: 'previous-build-session' | 'lost-broker' | 'hidden-tab' | 'renderer-cache';
  label: string;
  command: string | null;
  rssBytes: number | null;
  destructive: boolean;
};

export type FreeRamMeasured = {
  beforeRssBytes: number;
  afterRssBytes: number;
  freedRssBytes: number;
  machineFreeDeltaBytes: number | null;
};

const COMMAND_MAX = 100;

const clip = (text: string): string => (text.length <= COMMAND_MAX ? text : `${text.slice(0, COMMAND_MAX - 1)}…`);

/** One confirm line per candidate: processes with command and RSS first, then the "also" items. */
export function confirmLines(candidates: readonly FreeRamCandidate[], totalRssBytes: number): string[] {
  const lines: string[] = [];
  for (const c of candidates.filter((x) => x.destructive)) {
    const rss = c.rssBytes === null ? '' : ` · ${formatBytes(c.rssBytes)}`;
    // An unreachable broker's ptys are not listed, yet ending the broker ends them.
    const maybeLive = c.kind === 'lost-broker' && c.label.includes('unreachable') ? ' · may hold live sessions' : '';
    lines.push(`${c.label} — ${c.command ? clip(c.command) : 'no command'}${rss}${maybeLive}`);
  }
  for (const c of candidates.filter((x) => !x.destructive)) {
    const rss = c.rssBytes === null ? '' : ` · ${formatBytes(c.rssBytes)}`;
    lines.push(`Also: ${c.label}${rss}`);
  }
  lines.push(`≈${formatBytes(totalRssBytes)} held`);
  return lines;
}

/** The toast: the figure is the measured one, and a zero says zero. */
export function resultMessage(measured: FreeRamMeasured, failureCount: number, unavailable = false): string {
  const head = unavailable
    ? 'Freed RAM · the measurement was unavailable'
    : measured.freedRssBytes > 0
      ? `Freed ${formatBytes(measured.freedRssBytes)} · Midnite processes ${formatBytes(measured.beforeRssBytes)} → ${formatBytes(measured.afterRssBytes)}`
      : `Nothing to free · Midnite processes ${formatBytes(measured.afterRssBytes)}`;
  return failureCount > 0 ? `${head} · ${failureCount} could not be ended` : head;
}

/** Guards planning only: once the confirm is open `runOnce` has returned; main serialises the execution itself. */
let inFlight = false;

export async function runFreeRam(deps: FreeRamDeps): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    await runOnce(deps);
  } finally {
    inFlight = false;
  }
}

async function runOnce({ dialogs }: FreeRamDeps): Promise<void> {
  const optimizer = bridge()?.optimizer;
  if (!optimizer) return;
  const plan = await optimizer.freeRamPlan();
  if (!plan.ok) {
    dialogs.notify({ title: 'Could not plan Free RAM', body: plan.message });
    return;
  }
  const { candidates, totalRssBytes } = plan.value;
  // The renderer cache is always offered; on its own it is not worth a confirm.
  if (!candidates.some((c) => c.kind !== 'renderer-cache')) {
    dialogs.notify({
      title: 'Nothing to free',
      body: 'No previous-build sessions, lost brokers or hidden tabs were found.',
    });
    return;
  }
  const destructive = candidates.filter((c) => c.destructive).length;
  // Sessions only in the count; brokers are listed in the warnings (confirmLines).
  const sessionSample = candidates
    .filter((c) => c.kind === 'previous-build-session')
    .map((c) => ({ sha: c.id.slice(0, 7), subject: c.label }));
  dialogs.confirm({
    title: 'Free RAM?',
    body: 'Idle sessions of this build are left alone. Hidden tabs reload when you open them.',
    confirmLabel: 'Free RAM',
    danger: destructive > 0,
    blastRadius: sessionSample.length > 0 ? { count: sessionSample.length, sample: sessionSample.slice(0, 5) } : null,
    blastRadiusKind: 'sessions',
    warnings: confirmLines(candidates, totalRssBytes),
    onConfirm: () => void execute(candidates.map((c) => c.id), dialogs),
  });
}

async function execute(candidateIds: string[], dialogs: Pick<FrameDialogs, 'notify'>): Promise<void> {
  const toast = useToastStore.getState();
  try {
    const result = await bridge()?.optimizer.freeRam({ candidateIds });
    if (!result) return;
    if (!result.ok) {
      toast.addToast({ message: result.message, status: 'error' });
      return;
    }
    const { measured, failures, ended, measurementUnavailable } = result.value;
    toast.addToast({
      message: resultMessage(measured, failures.length, measurementUnavailable === true),
      status: failures.length > 0 && ended.length === 0 ? 'error' : 'info',
    });
  } catch (error) {
    dialogs.notify({
      title: 'Could not free RAM',
      body: error instanceof Error ? error.message : String(error),
    });
  }
}
