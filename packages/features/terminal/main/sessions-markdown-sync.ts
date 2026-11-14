import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
  BUILTIN_AGENTS,
  formatShellResumeCommand,
  type AgentDefinition,
  type ClosedSession,
  type TerminalSession,
} from '@midnite/studio-shared';

export type MarkdownSessionRow = {
  session: TerminalSession;
  live: { pid: number; legacy: boolean } | null;
  detectedAgentId?: string;
  exitCode: number | null;
};

export type MarkdownClosedRow = ClosedSession;

export type MarkdownSnapshot = {
  now: number;
  active: MarkdownSessionRow[];
  closed: MarkdownClosedRow[];
  agents: AgentDefinition[];
};

export type SessionsMarkdownSync = {
  schedule(): void;
  flush(): Promise<void>;
  stop(): void;
};

export type SessionsMarkdownSyncOptions = {
  targetPath: string | null;
  debounceMs?: number;
  readSnapshot: () => Promise<MarkdownSnapshot>;
  log: (message: string) => void;
  requireExistingParentDir?: boolean;
};

const END_MARKER = '<!-- midnite-studio:end -->';
const OUTSIDE_HEADING_RE = /^## Outside Midnite Studio Brokers\b/m;
const DEFAULT_DEBOUNCE_MS = 1_000;
const MAX_CLOSED_ROWS = 15;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatLocalTimestamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatLocalTimestampWithTz(ms: number): string {
  const d = new Date(ms);
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const hh = pad2(Math.floor(absMin / 60));
  const mm = pad2(absMin % 60);
  return `${formatLocalTimestamp(ms)} (UTC${sign}${hh}:${mm})`;
}

function escapeMarkdownCell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

function resolveAgentDefinition(
  agentId: string | undefined,
  agents: readonly AgentDefinition[],
): AgentDefinition | null {
  if (!agentId) return null;
  return (
    agents.find((a) => a.id === agentId) ??
    BUILTIN_AGENTS.find((a) => a.id === agentId) ??
    null
  );
}

function formatActiveStatus(row: MarkdownSessionRow): string {
  if (row.live !== null) {
    return row.session.kind === 'shell' ? '⚪ shell' : '🟢 running';
  }
  if (row.exitCode !== null) {
    return `⏹️ exited (${row.exitCode})`;
  }
  return '🟡 asleep';
}

function formatClosedStatus(row: MarkdownClosedRow): string {
  if (row.exitCode !== null) {
    return `⏹️ ${row.reason} (${row.exitCode})`;
  }
  return `⏹️ ${row.reason}`;
}

function formatRepoName(cwd: string): string {
  return escapeMarkdownCell(basename(cwd) || cwd);
}

function renderActiveTable(rows: readonly MarkdownSessionRow[], agents: readonly AgentDefinition[]): string {
  if (rows.length === 0) {
    return '_No active sessions._';
  }
  const lines = [
    '| Status | Agent | PID | Repo | Started | Topic | Resume Command |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const effectiveAgentId = row.session.agentId ?? row.detectedAgentId;
    const agentLabel = effectiveAgentId ?? 'shell';
    const agentDef =
      row.session.kind === 'shell' && !effectiveAgentId
        ? null
        : resolveAgentDefinition(effectiveAgentId, agents);
    const status = formatActiveStatus(row);
    const pid = row.live ? String(row.live.pid) : '-';
    const repo = formatRepoName(row.session.cwd);
    const started = formatLocalTimestamp(row.session.createdAt);
    const topic = escapeMarkdownCell(row.session.name ?? row.session.title);
    const cmd = formatShellResumeCommand(row.session.cwd, agentDef, row.session.agentConversationId);
    lines.push(
      `| ${status} | \`${agentLabel}\` | ${pid} | ${repo} | ${started} | ${topic} | \`${cmd}\` |`,
    );
  }
  return lines.join('\n');
}

function renderClosedTable(rows: readonly MarkdownClosedRow[], agents: readonly AgentDefinition[]): string {
  if (rows.length === 0) {
    return '_No recently closed sessions._';
  }
  const lines = [
    '| Status | Agent | Closed | Repo | Topic | Resume Command |',
    '|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const agentLabel = row.agentId ?? 'shell';
    const agentDef =
      row.kind === 'shell' && !row.agentId
        ? null
        : resolveAgentDefinition(row.agentId, agents);
    const status = formatClosedStatus(row);
    const closed = formatLocalTimestamp(row.closedAt);
    const repo = formatRepoName(row.cwd);
    const topic = escapeMarkdownCell(row.name ?? row.title);
    const cmd = formatShellResumeCommand(row.cwd, agentDef, row.agentConversationId);
    lines.push(
      `| ${status} | \`${agentLabel}\` | ${closed} | ${repo} | ${topic} | \`${cmd}\` |`,
    );
  }
  return lines.join('\n');
}

/**
 * Extract any user-authored tail section (such as `## Outside Midnite Studio Brokers`)
 * from an existing `MIDNITE_SESSIONS.md` file so auto-sync preserves it across rewrites.
 */
export function extractPreservedTail(existingMarkdown: string): string | null {
  const markerIndex = existingMarkdown.indexOf(END_MARKER);
  if (markerIndex !== -1) {
    const after = existingMarkdown.slice(markerIndex + END_MARKER.length).trim();
    return after.length > 0 ? after : null;
  }
  const headingMatch = OUTSIDE_HEADING_RE.exec(existingMarkdown);
  if (headingMatch) {
    const after = existingMarkdown.slice(headingMatch.index).trim();
    return after.length > 0 ? after : null;
  }
  return null;
}

/**
 * Render the complete `MIDNITE_SESSIONS.md` document from a point-in-time snapshot.
 */
export function renderSessionsMarkdown(
  snapshot: MarkdownSnapshot,
  preservedTail?: string | null,
): string {
  const activeRows = snapshot.active.filter((row) => row.live?.legacy !== true);
  const detachedRows = snapshot.active.filter((row) => row.live?.legacy === true);
  const closedRows = [...snapshot.closed]
    .sort((a, b) => b.closedAt - a.closedAt)
    .slice(0, MAX_CLOSED_ROWS);

  const sections: string[] = [
    '# Midnite Studio Sessions',
    `> Last updated: ${formatLocalTimestampWithTz(snapshot.now)}`,
    '## Active Sessions',
    renderActiveTable(activeRows, snapshot.agents),
  ];

  if (detachedRows.length > 0) {
    sections.push('## Detached / Retired Broker Sessions', renderActiveTable(detachedRows, snapshot.agents));
  }

  sections.push(
    `## Recently Closed Sessions (last ${MAX_CLOSED_ROWS})`,
    renderClosedTable(closedRows, snapshot.agents),
    END_MARKER,
  );

  const trimmedTail = preservedTail?.trim();
  if (trimmedTail) {
    sections.push(trimmedTail);
  }

  return `${sections.join('\n\n')}\n`;
}

/**
 * Create a debounced, serialized, atomic file observer that keeps `targetPath`
 * synchronized with the current terminal session state.
 */
export function createSessionsMarkdownSync(
  options: SessionsMarkdownSyncOptions,
): SessionsMarkdownSync {
  const targetPath = options.targetPath?.trim() ? options.targetPath.trim() : null;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const requireExistingParentDir = options.requireExistingParentDir ?? true;

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let tmpCounter = 0;
  let writeChain: Promise<void> = Promise.resolve();

  const performWrite = async (): Promise<void> => {
    if (stopped || !targetPath) return;

    const parentDir = dirname(targetPath);
    if (requireExistingParentDir) {
      try {
        const parentStat = await stat(parentDir);
        if (!parentStat.isDirectory()) return;
      } catch {
        return;
      }
    }

    const snapshot = await options.readSnapshot();
    if (stopped) return;

    const existing = await readFile(targetPath, 'utf8').catch(() => null);
    if (stopped) return;

    const preservedTail = existing !== null ? extractPreservedTail(existing) : null;
    const content = renderSessionsMarkdown(snapshot, preservedTail);

    const tmpPath = join(parentDir, `.${basename(targetPath)}.${process.pid}.${++tmpCounter}.tmp`);
    try {
      await writeFile(tmpPath, content, 'utf8');
      if (stopped) {
        await unlink(tmpPath).catch(() => undefined);
        return;
      }
      await rename(tmpPath, targetPath);
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      options.log(`sessions-markdown-sync: failed to write ${targetPath}: ${message}`);
    }
  };

  return {
    schedule(): void {
      if (stopped || !targetPath) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void this.flush();
      }, debounceMs);
      timer.unref?.();
    },

    flush(): Promise<void> {
      if (stopped || !targetPath) return Promise.resolve();
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      writeChain = writeChain.then(() => performWrite());
      return writeChain;
    },

    stop(): void {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
