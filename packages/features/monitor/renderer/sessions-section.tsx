import { bridge } from '@midnite/studio-frame';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { useEffect, useState } from 'react';

/** "3m", "2h 05m", "1d 4h" — how long a session has been up. Never negative. */
export function formatUptime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

type Listing = Awaited<ReturnType<MidniteStudioBridge['terminal']['list']>>;
type RestoredTerminalSession = Listing['sessions'][number];

/** The live sessions: those with a running process behind them. */
export function liveSessions(list: Listing): RestoredTerminalSession[] {
  return list.sessions.filter((s) => s.live !== null);
}

export function brokerLine(list: Listing): string {
  const legacy = list.sessions.filter((s) => s.live !== null && s.legacy).length;
  const mode = list.broker?.mode === 'inproc' ? 'In-process (no broker)' : 'Broker';
  const reason = list.broker?.reason ? ` — ${list.broker.reason}` : '';
  return `${mode}${reason}${legacy > 0 ? ` · ${legacy} on a legacy peer` : ''}`;
}

/**
 * Live terminal sessions: title or agent, cwd and uptime. Read-only — Monitor
 * lists sessions through `terminal.list` and never creates, writes or kills one.
 * `onOpen`, when the composer passes it, adds a per-row action that takes the
 * user to the session where it lives (the standalone Monitor hands off to Studio).
 */
export function SessionsSection({
  now = Date.now,
  onOpen,
  openLabel = 'Open',
}: {
  now?: () => number;
  onOpen?: (sessionId: string) => void;
  openLabel?: string;
}) {
  const [list, setList] = useState<Listing | null | undefined>(undefined);

  useEffect(() => {
    const terminal = bridge()?.terminal;
    if (!terminal) return setList(null);
    let alive = true;
    const load = () => void terminal.list().then((r) => alive && setList(r), () => alive && setList(null));
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const live = list ? liveSessions(list) : [];
  return (
    <section aria-labelledby="monitor-sessions" className="rounded-lg border border-border p-4">
      <h2 id="monitor-sessions" className="mb-1 text-sm font-medium">Sessions</h2>
      {list ? <p className="mb-2 text-xs text-muted-foreground">{brokerLine(list)}</p> : null}
      {list === undefined ? (
        <p className="text-xs text-muted-foreground">Looking for sessions…</p>
      ) : live.length === 0 ? (
        <p className="text-xs text-muted-foreground">No live sessions.</p>
      ) : (
        <ul className="divide-y divide-border text-xs">
          {live.map(({ session }) => (
            <li key={session.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0">
                <span className="font-medium">{session.name ?? session.title}</span>
                {session.agentId ? <span className="ml-2 text-muted-foreground">{session.agentId}</span> : null}
                <span className="block truncate text-[11px] text-muted-foreground">{session.cwd}</span>
              </span>
              <span className="flex items-baseline gap-3">
                <span className="tabular-nums text-muted-foreground">{formatUptime(now() - session.createdAt)}</span>
                {onOpen ? (
                  <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => onOpen(session.id)}>
                    {openLabel}
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
