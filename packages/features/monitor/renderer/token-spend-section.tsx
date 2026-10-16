import { bridge } from '@midnite/studio-frame';
import type { AgentTokenTotals, MonitorAgentUsage } from '@midnite/studio-shared';
import { useEffect, useState } from 'react';

/** 1234 -> "1.2k", 2_500_000 -> "2.5M". */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

function Totals({ t }: { t: AgentTokenTotals }) {
  return (
    <span className="tabular-nums text-muted-foreground">
      in {formatTokens(t.input)} · out {formatTokens(t.output)} · cache read {formatTokens(t.cacheRead)} · cache write{' '}
      {formatTokens(t.cacheCreate)}
    </span>
  );
}

/**
 * Tokens each live agent session has spent, read from the agent's own transcript by main, rolled up
 * per agent. Tokens only — no prices. Absent the channel the section says so rather than showing zeros.
 */
export function TokenSpendSection() {
  const [usage, setUsage] = useState<MonitorAgentUsage | null | undefined>(undefined);

  useEffect(() => {
    const read = bridge()?.monitorAgentUsage;
    if (!read) return setUsage(null);
    let alive = true;
    const load = () => void read().then((r) => alive && setUsage(r), () => alive && setUsage(null));
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <section aria-labelledby="monitor-tokens" className="rounded-lg border border-border p-4">
      <h2 id="monitor-tokens" className="mb-2 text-sm font-medium">Token spend</h2>
      {usage === undefined ? (
        <p className="text-xs text-muted-foreground">Reading transcripts…</p>
      ) : usage === null || usage.sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No live agent sessions.</p>
      ) : (
        <div className="space-y-3 text-xs">
          <ul aria-label="Tokens per agent" className="space-y-1">
            {usage.agents.map((a) => (
              <li key={a.agentId} className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{a.agentId} <span className="font-normal text-muted-foreground">({a.sessions})</span></span>
                <Totals t={a.totals} />
              </li>
            ))}
          </ul>
          <ul aria-label="Tokens per session" className="divide-y divide-border">
            {usage.sessions.map((s) => (
              <li key={s.sessionId} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span>{s.title} <span className="text-muted-foreground">{s.agentId}{s.totals?.model ? ` · ${s.totals.model}` : ''}</span></span>
                {s.totals ? <Totals t={s.totals} /> : <span className="text-muted-foreground">no transcript found</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
