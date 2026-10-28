import { bridge } from '@midnite/studio-frame';
import {
  type NetworkConnection,
  type SecurityFinding,
  type SecurityFindingCategory,
  type SecurityFindingSeverity,
  type SecurityFindingSource,
  type SecurityFindingStatus,
  type SensorStatus,
  VANGUARD_TABS,
  type VanguardTab,
} from '@midnite/studio-shared';
import { useEffect, useMemo, useState } from 'react';
import { LuShield, LuShieldCheck } from 'react-icons/lu';

import { MalwareScanCard } from './malware-scan-card';
import { ACTION_LABEL, FindingActions, QuarantineCard, UnavailableNotes, useResponseState } from './response';
import { useConnections, useFindings, useSensors } from './use-vanguard';
import { useVanguardUi } from './vanguard-ui-store';

const SEVERITIES: readonly SecurityFindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const SOURCES: readonly SecurityFindingSource[] = ['vanguard', 'guard', 'agents'];
const CATEGORIES: readonly SecurityFindingCategory[] = ['persistence', 'process', 'network', 'integrity', 'malware', 'agent', 'vulnerability', 'config', 'secret', 'supply-chain', 'site'];
const STATUSES: readonly SecurityFindingStatus[] = ['open', 'acknowledged', 'resolved', 'muted'];

const TAB_LABEL: Record<VanguardTab, string> = { findings: 'Findings', sensors: 'Sensors', network: 'Network' };

const SEVERITY_CLASS: Record<SecurityFindingSeverity, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-amber-400 text-black',
  low: 'bg-sky-500 text-white',
  info: 'bg-muted text-muted-foreground',
};

/**
 * Sensors a later theme of Phase 120 will register. Shown as "not installed yet" until the host reports one
 * with the same id, so the tab says what is coming rather than looking empty.
 */
const PLANNED_SENSORS: readonly { id: string; label: string; description: string }[] = [
  { id: 'integrity', label: 'Integrity', description: 'Hashes the files that decide what runs: the app bundle, .claude, .mcp.json, git hooks, lockfiles.' },
  { id: 'persistence', label: 'Persistence and processes', description: 'LaunchAgents, login items, cron, shell rc files and new executables.' },
  { id: 'network', label: 'Network', description: 'Outbound connections per process, against the suite and a per-session baseline.' },
  { id: 'malware', label: 'Malware scan', description: 'YARA rules and clamscan over files on demand and on change.' },
  { id: 'agents', label: 'Agent behaviour', description: 'Reads the agent audit trail for the shapes a compromised agent shows.' },
];

function ago(at: number | null): string {
  if (at === null) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T | ''; options: readonly T[]; onChange: (next: T | '') => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T | '')}
        className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SeverityBadge({ severity }: { severity: SecurityFindingSeverity }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_CLASS[severity]}`}>{severity}</span>;
}

function failureText(result: { ok: false; kind: string } & { message?: string }): string {
  return result.message ?? 'That did not go through.';
}

function evidenceLine(item: SecurityFinding['evidence'][number]): string {
  switch (item.kind) {
    case 'path':
      return `path  ${item.path}`;
    case 'pid':
      return `pid  ${item.pid}${item.command ? `  ${item.command}` : ''}`;
    case 'host':
      return `host  ${item.host}${item.port !== undefined ? `:${item.port}` : ''}`;
    case 'hash':
      return `${item.algorithm}  ${item.value}`;
    case 'command':
      return `command  ${[item.command, ...(item.args ?? [])].join(' ')}`;
  }
}

function FindingDetail({ finding }: { finding: SecurityFinding }) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const response = useResponseState();
  useEffect(() => setMessage(null), [finding.id]);
  const setStatus = async (status: SecurityFindingStatus): Promise<void> => {
    const result = await bridge()?.vanguard.findings.setStatus({ id: finding.id, status });
    setMessage(result && !result.ok ? { text: failureText(result), error: true } : null);
  };
  return (
    <section aria-label="Finding detail" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <h2 className="text-sm font-semibold">{finding.title}</h2>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {finding.source} · {finding.category} · seen {finding.count}x · first {ago(finding.firstSeen)} · last {ago(finding.lastSeen)} · {finding.status}
        </p>
      </header>
      <p className="whitespace-pre-wrap text-xs">{finding.detail}</p>
      {finding.evidence.length > 0 ? (
        <div>
          <h3 className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">Evidence</h3>
          <ul className="flex flex-col gap-0.5 font-mono text-[11px]">
            {finding.evidence.map((item, index) => (
              <li key={index} className="break-all">
                {evidenceLine(item)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <FindingActions finding={finding} state={response} onMessage={setMessage} />
        {finding.status !== 'acknowledged' && finding.status !== 'resolved' ? (
          <button type="button" onClick={() => void setStatus('acknowledged')} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
            Acknowledge
          </button>
        ) : null}
        {finding.status !== 'resolved' ? (
          <button type="button" onClick={() => void setStatus('resolved')} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
            Resolve
          </button>
        ) : (
          <button type="button" onClick={() => void setStatus('open')} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
            Reopen
          </button>
        )}
      </div>
      <UnavailableNotes finding={finding} state={response} />
      {finding.actions && finding.actions.length > 0 ? (
        <div>
          <h3 className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">Actions taken</h3>
          <ul aria-label="Actions taken" className="flex flex-col gap-0.5 text-[11px]">
            {finding.actions.map((done, index) => (
              <li key={index} className={done.ok ? '' : 'text-destructive'}>
                {ago(done.at)} · {ACTION_LABEL[done.id]} · {done.ok ? 'done' : `failed: ${done.error ?? 'no reason given'}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {message ? (
        <p role="status" className={`text-xs ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

type Filters = { source: SecurityFindingSource | ''; category: SecurityFindingCategory | ''; status: SecurityFindingStatus | '' };

/** The findings list grouped by severity, with filters and a detail pane. `only` pins a category (the Network tab). */
function FindingsPane({ only, emptyText }: { only?: SecurityFindingCategory; emptyText: string }) {
  const [filters, setFilters] = useState<Filters>({ source: '', category: '', status: 'open' });
  const [selected, setSelected] = useState<string | null>(null);
  const { findings, loaded } = useFindings({
    ...(filters.source ? { source: filters.source } : {}),
    ...(only ? { category: only } : filters.category ? { category: filters.category } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  });
  const grouped = useMemo(
    () => SEVERITIES.map((severity) => ({ severity, items: findings.filter((f) => f.severity === severity) })).filter((g) => g.items.length > 0),
    [findings],
  );
  const current = findings.find((f) => f.id === selected) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Select label="Source" value={filters.source} options={SOURCES} onChange={(source) => setFilters((f) => ({ ...f, source }))} />
        {only ? null : <Select label="Category" value={filters.category} options={CATEGORIES} onChange={(category) => setFilters((f) => ({ ...f, category }))} />}
        <Select label="Status" value={filters.status} options={STATUSES} onChange={(status) => setFilters((f) => ({ ...f, status }))} />
      </div>
      {loaded && findings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center">
          <LuShieldCheck aria-hidden className="h-6 w-6 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="flex flex-col gap-3">
            {grouped.map(({ severity, items }) => (
              <section key={severity} aria-label={`${severity} findings`}>
                <h3 className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                  {severity} ({items.length})
                </h3>
                <ul className="flex flex-col gap-1">
                  {items.map((finding) => (
                    <li key={finding.id}>
                      <button
                        type="button"
                        aria-current={finding.id === selected ? 'true' : undefined}
                        onClick={() => setSelected(finding.id)}
                        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent ${finding.id === selected ? 'border-primary' : 'border-border'}`}
                      >
                        <SeverityBadge severity={finding.severity} />
                        <span className="min-w-0 flex-1 truncate">{finding.title}</span>
                        <span className="text-[10px] text-muted-foreground">{finding.category}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {current ? <FindingDetail finding={current} /> : <p className="text-xs text-muted-foreground">Select a finding to see its evidence and what you can do about it.</p>}
        </div>
      )}
    </div>
  );
}

interface ProcessGroup {
  key: string;
  heading: string;
  role: NetworkConnection['role'];
  rows: NetworkConnection[];
}

function groupConnections(connections: readonly NetworkConnection[]): ProcessGroup[] {
  const groups = new Map<string, ProcessGroup>();
  for (const conn of connections) {
    const key = `${conn.role}|${conn.pid}`;
    let group = groups.get(key);
    if (!group) {
      const who =
        conn.role === 'suite'
          ? conn.label === 'broker'
            ? 'Midnite terminal broker'
            : 'Midnite'
          : conn.role === 'agent'
            ? `Agent session · ${conn.command}`
            : conn.command;
      group = { key, heading: `${who} (pid ${conn.pid})`, role: conn.role, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(conn);
  }
  return [...groups.values()];
}

function ConnectionRow({ conn }: { conn: NetworkConnection }) {
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs">
      <span className="font-mono">
        {conn.remoteHost}:{conn.remotePort}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {conn.protocol}
        {conn.state ? ` · ${conn.state}` : ''}
      </span>
      <span className="ml-auto flex items-center gap-2">
        {conn.allowedBy ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]" title="The Phase 115 egress registry entry that allows this host">
            allowed by {conn.allowedBy}
          </span>
        ) : null}
        {conn.flagged ? (
          <span className="flex items-center gap-1.5" title={conn.flagged.reason}>
            <SeverityBadge severity={conn.flagged.severity} />
            <span className="max-w-[28ch] truncate text-[10px] text-muted-foreground">{conn.flagged.reason}</span>
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** Live outbound connections grouped by process, the suite's own first, then the findings the network sensor raised. */
function NetworkPane() {
  const { snapshot, loaded } = useConnections();
  const groups = useMemo(() => groupConnections(snapshot.connections), [snapshot.connections]);
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Live connections" className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Live connections</h2>
          <p className="text-[11px] text-muted-foreground">
            {snapshot.at === null ? 'no snapshot yet' : `snapshot ${ago(snapshot.at)}`} · read-only
          </p>
        </div>
        {snapshot.note ? (
          <p role="status" className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
            {snapshot.note}
          </p>
        ) : null}
        {loaded && groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            {snapshot.at === null
              ? 'The network sensor has not run. It starts once this view has been opened and the sensor is switched on in Settings ▸ Vanguard.'
              : 'No outbound connections in the last snapshot.'}
          </p>
        ) : (
          <ul aria-label="Processes" className="flex flex-col gap-2">
            {groups.map((group) => (
              <li key={group.key} className="rounded-lg border border-border">
                <p className="border-b border-border px-3 py-1.5 text-xs font-medium">
                  {group.heading}
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                    {group.rows.length} connection{group.rows.length === 1 ? '' : 's'}
                  </span>
                </p>
                <ul className="divide-y divide-border">
                  {group.rows.map((conn) => (
                    <ConnectionRow key={`${conn.protocol}|${conn.remoteHost}:${conn.remotePort}`} conn={conn} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Network findings" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Findings</h2>
        <FindingsPane only="network" emptyText="No network findings. This tab is read-only: a finding's remedy is to stop the process." />
      </section>
    </div>
  );
}

function SensorRow({ sensor }: { sensor: SensorStatus }) {
  const stateText = sensor.enabled ? sensor.state : 'off';
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{sensor.label}</p>
        <p className="text-[11px] text-muted-foreground">{sensor.description}</p>
        {sensor.error ? <p className="mt-1 text-[11px] text-destructive">{sensor.error}</p> : null}
      </div>
      <div className="flex flex-col items-end gap-1 text-[11px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">{stateText}</span>
        <span>
          last run {ago(sensor.lastRunAt)}
          {sensor.lastDurationMs !== null ? ` (${sensor.lastDurationMs} ms)` : ''}
        </span>
        <span>{sensor.lastFindings} finding{sensor.lastFindings === 1 ? '' : 's'}</span>
        <button
          type="button"
          disabled={sensor.state === 'disabled' || sensor.state === 'running'}
          onClick={() => void bridge()?.vanguard.runSensor({ id: sensor.id })}
          className="rounded-md border border-border px-2 py-0.5 text-[11px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Run now
        </button>
      </div>
    </li>
  );
}

function SensorsPane() {
  const { sensors, loaded } = useSensors();
  const registered = new Set(sensors.sensors.map((s) => s.id));
  const planned = PLANNED_SENSORS.filter((p) => !registered.has(p.id));
  return (
    <div className="flex flex-col gap-3">
      {!sensors.active && loaded ? (
        <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Sensors are paused. They start once this view has been opened and the sensor is switched on in Settings ▸ Vanguard.
        </p>
      ) : null}
      <MalwareScanCard />
      <QuarantineCard />
      <ul aria-label="Sensors" className="flex flex-col gap-2">
        {sensors.sensors.map((sensor) => (
          <SensorRow key={sensor.id} sensor={sensor} />
        ))}
        {planned.map((p) => (
          <li key={p.id} className="flex items-start gap-3 rounded-lg border border-dashed border-border p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{p.label}</p>
              <p className="text-[11px] text-muted-foreground">{p.description}</p>
            </div>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">not installed yet</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The Vanguard view (Phase 120 Theme B): findings grouped by severity with filters and a detail pane, a
 * Sensors tab with each sensor's last run and state, and a Network tab (read-only; blocking is a deferred
 * decision). Opening it tells main the view was opened — in Studio that is what lets the enabled sensors start.
 */
export function VanguardPage() {
  const tab = useVanguardUi((s) => s.tab);
  const setTab = useVanguardUi((s) => s.setTab);
  useEffect(() => {
    void bridge()?.vanguard.viewOpened();
  }, []);
  return (
    // The view scrolls itself: hosts give it a bounded box (Studio's overflow-hidden view box), so
    // without this the tab lists were clipped instead of scrolled.
    <div className="h-full min-h-0 overflow-y-auto" data-testid="vanguard-scroll">
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
      <header className="flex items-center gap-2">
        <LuShield aria-hidden className="h-5 w-5" />
        <div>
          <h1 className="text-lg font-semibold">Vanguard</h1>
          <p className="text-xs text-muted-foreground">What the sensors have seen on this machine, and what to do about it.</p>
        </div>
      </header>
      <div role="tablist" aria-label="Vanguard" className="flex gap-1 border-b border-border">
        {VANGUARD_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 text-xs ${tab === id ? 'border-b-2 border-primary font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {TAB_LABEL[id]}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'findings' ? <FindingsPane emptyText="No findings match. Nothing the sensors watch has raised a concern." /> : null}
        {tab === 'sensors' ? <SensorsPane /> : null}
        {tab === 'network' ? <NetworkPane /> : null}
      </div>
    </div>
    </div>
  );
}
