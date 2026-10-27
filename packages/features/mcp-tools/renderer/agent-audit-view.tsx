import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LuChevronDown, LuChevronRight, LuDownload, LuRefreshCw } from 'react-icons/lu';

import { bridge } from '@midnite/studio-frame';
import { AGENT_AUDIT_KINDS, type AgentAuditKind, type AgentAuditRecord } from '@midnite/studio-shared';

/**
 * The Audit tab (Phase 121 Theme G): the durable agent audit trail, newest first — filter by session, kind
 * and time, expand a row to its (already redacted) record, and export the filtered trail to a file the user
 * picks. Studio mounts it in the Sessions view, Agents as its Audit tab; both read through
 * `bridge().agentAudit`. Pulled on an interval while mounted, never pushed.
 */

const AUDIT_KEY = ['agent-audit'] as const;
const POLL_MS = 3000;
const ROWS = 200;

const RANGES = [
  { id: '1h', label: 'Last hour', ms: 3_600_000 },
  { id: '24h', label: 'Last 24 hours', ms: 86_400_000 },
  { id: '7d', label: 'Last 7 days', ms: 7 * 86_400_000 },
  { id: 'all', label: 'All time', ms: null },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const KIND_LABEL: Record<AgentAuditKind, string> = {
  'mcp-call': 'MCP call',
  command: 'Command',
  'chat-turn': 'Chat turn',
  'council-run': 'Council run',
  'policy-decision': 'Policy',
  approval: 'Approval',
  install: 'Install',
  'limit-trip': 'Limit trip',
  'confine-denial': 'Confinement',
};

/** One line of what the record says, never its payload (there is none to show). */
export function summarizeAuditRecord(r: AgentAuditRecord): string {
  switch (r.kind) {
    case 'mcp-call':
      return `${r.tool} ${r.ok ? 'ok' : 'failed'} in ${r.ms} ms${r.repoPath ? ` · ${r.repoPath}` : ''}`;
    case 'command':
      return r.command;
    case 'chat-turn':
      return `${r.engine}${r.model ? ` (${r.model})` : ''} turn ${r.status} in ${r.ms} ms · ${r.attachments} attachment${r.attachments === 1 ? '' : 's'}`;
    case 'council-run':
      return `${r.status} · ${r.succeeded}/${r.members} members · synthesis by ${r.synthProvider}`;
    case 'policy-decision':
      return `${r.decision} ${r.tool} (${r.rule})`;
    case 'approval':
      return `${r.decision} ${r.tool} by ${r.by} (${r.rule})`;
    case 'install':
      return `${r.manager} ${r.packages.join(' ')} → ${r.verdict}`;
    case 'limit-trip':
      return `${r.limit}: ${r.observed} over ${r.threshold}`;
    case 'confine-denial':
      return `${r.operation} ${r.target}`;
  }
}

function formatTime(at: number): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
}

export function AgentAuditView() {
  const [kinds, setKinds] = useState<ReadonlySet<AgentAuditKind>>(() => new Set());
  const [session, setSession] = useState('');
  const [range, setRange] = useState<RangeId>('24h');
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());

  const rangeMs = RANGES.find((r) => r.id === range)?.ms ?? null;
  const sessionId = session.trim();
  const filter = useMemo(
    () => ({ ...(kinds.size > 0 ? { kinds: [...kinds] } : {}), ...(sessionId ? { sessionId } : {}) }),
    [kinds, sessionId],
  );
  // The time window is resolved at fetch time, so "Last hour" keeps sliding as the view polls.
  const windowed = () => ({ ...filter, ...(rangeMs !== null ? { since: Date.now() - rangeMs } : {}) });

  const list = useQuery({
    queryKey: [...AUDIT_KEY, filter, rangeMs],
    queryFn: async () => (await bridge()?.agentAudit.list({ ...windowed(), limit: ROWS })) ?? { records: [], truncated: false },
    refetchInterval: POLL_MS,
  });

  const exporter = useMutation({
    mutationFn: async () => bridge()?.agentAudit.export(windowed()),
  });
  const exported = exporter.data;

  const toggleKind = (kind: AgentAuditKind) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (!next.delete(kind)) next.add(kind);
      return next;
    });
  const toggleRow = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const records = list.data?.records ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="agent-audit">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div role="group" aria-label="Filter by kind" className="flex flex-wrap items-center gap-1">
          {AGENT_AUDIT_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={kinds.has(kind)}
              onClick={() => toggleKind(kind)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                kinds.has(kind) ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={session}
          onChange={(e) => setSession(e.target.value)}
          placeholder="Session id"
          aria-label="Filter by session id"
          className="h-7 w-40 rounded-md border border-border bg-background px-2 text-xs"
        />
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as RangeId)}
          aria-label="Filter by time"
          className="h-7 rounded-md border border-border bg-background px-2 text-xs"
        >
          {RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => void list.refetch()}
            aria-label="Refresh the audit trail"
            className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LuRefreshCw aria-hidden className="h-3 w-3" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => exporter.mutate()}
            disabled={exporter.isPending}
            aria-label="Export the audit trail"
            className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <LuDownload aria-hidden className="h-3 w-3" />
            Export
          </button>
        </div>
      </div>

      {exported ? (
        <p role="status" className="shrink-0 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          {!exported.ok
            ? exported.kind === 'error'
              ? exported.message
              : 'The export did not complete.'
            : exported.value.path === null
              ? 'Export cancelled.'
              : `Exported ${exported.value.count} record${exported.value.count === 1 ? '' : 's'} (redacted) to ${exported.value.path}`}
        </p>
      ) : null}

      <div role="list" aria-label="Audit records" className="min-h-0 flex-1 overflow-auto">
        {records.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {list.isPending ? 'Loading…' : 'Nothing recorded for this filter.'}
          </p>
        ) : (
          records.map((record) => {
            const expanded = open.has(record.id);
            return (
              <div key={record.id} role="listitem" className="border-b border-border/60 text-xs">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => toggleRow(record.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/50"
                >
                  {expanded ? <LuChevronDown aria-hidden className="h-3 w-3 shrink-0" /> : <LuChevronRight aria-hidden className="h-3 w-3 shrink-0" />}
                  <span className="w-36 shrink-0 tabular-nums text-muted-foreground">{formatTime(record.at)}</span>
                  <span className="w-24 shrink-0 font-medium">{KIND_LABEL[record.kind]}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{summarizeAuditRecord(record)}</span>
                  {record.sessionId ? <span className="shrink-0 text-[10px] text-muted-foreground">{record.sessionId.slice(0, 8)}</span> : null}
                </button>
                {expanded ? (
                  <pre data-testid="audit-record-json" className="mx-3 mb-2 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px]">
                    {JSON.stringify(record, null, 2)}
                  </pre>
                ) : null}
              </div>
            );
          })
        )}
        {list.data?.truncated ? (
          <p className="px-3 py-2 text-center text-[11px] text-muted-foreground">Showing the newest {ROWS}. Narrow the filter or export for the rest.</p>
        ) : null}
      </div>
    </div>
  );
}
