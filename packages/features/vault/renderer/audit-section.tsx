import { bridge } from '@midnite/studio-frame';
import { useCallback, useEffect, useState } from 'react';
import { LuDownload, LuRefreshCw, LuShieldAlert, LuShieldCheck } from 'react-icons/lu';

type AuditEntry = {
  t: number;
  seq: number;
  prev: string;
  op: string;
  namespace?: string;
  id?: string;
  app: string;
  principal: string;
  result: 'ok' | 'denied' | 'locked' | 'failed';
  reason?: string;
  count?: number;
};

export function AuditSection() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [valid, setValid] = useState<boolean>(true);
  const [brokenSeq, setBrokenSeq] = useState<number | undefined>();
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [appFilter, setAppFilter] = useState<string>('all');
  const [opFilter, setOpFilter] = useState<string>('all');
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const api = bridge()?.vaultAudit;
    if (!api) return;
    setLoading(true);
    try {
      const res = await api.list({
        limit: 100,
        app: appFilter === 'all' ? undefined : appFilter,
        op: opFilter === 'all' ? undefined : opFilter,
      });
      setEntries(res.entries as AuditEntry[]);
      setValid(res.valid);
      setTotal(res.total);

      const v = await api.verify({});
      setValid(v.valid);
      setBrokenSeq(v.brokenSeq);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [appFilter, opFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleExport = async () => {
    const api = bridge()?.vaultAudit;
    if (!api) return;
    try {
      const res = await api.export({});
      if (res.ok && res.path) {
        setExportMessage(`Audit log exported to: ${res.path}`);
      } else {
        setExportMessage(res.error ?? 'Export failed');
      }
      setTimeout(() => setExportMessage(null), 5000);
    } catch (e) {
      setExportMessage(e instanceof Error ? e.message : 'Export failed');
      setTimeout(() => setExportMessage(null), 5000);
    }
  };

  return (
    <section aria-labelledby="vault-audit" className="rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="vault-audit" className="text-sm font-medium">Audit Log</h2>
            {valid ? (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                <LuShieldCheck className="size-3" />
                Chain verified ({total} events)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-400">
                <LuShieldAlert className="size-3" />
                Tamper detected at seq #{brokenSeq}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Append-only, SHA-256 hash-chained tamper-evident record of all vault operations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-1 rounded border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
          >
            <LuDownload className="size-3" />
            Export log
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
          >
            <LuRefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {exportMessage ? (
        <div className="mb-3 rounded bg-muted/60 p-2 text-xs text-foreground">
          {exportMessage}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">App:</span>
          <select
            value={appFilter}
            onChange={(e) => setAppFilter(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="all">All apps</option>
            <option value="studio">Studio</option>
            <option value="vault">Vault</option>
            <option value="coder">Coder</option>
            <option value="browser">Browser</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Op:</span>
          <select
            value={opFilter}
            onChange={(e) => setOpFilter(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="all">All operations</option>
            <option value="get">Read (get)</option>
            <option value="set">Write (set)</option>
            <option value="delete">Delete</option>
            <option value="lock">Lock</option>
            <option value="unlock">Unlock</option>
            <option value="grant">Grant</option>
            <option value="revoke">Revoke</option>
          </select>
        </label>
      </div>

      <div className="max-h-72 overflow-y-auto rounded border border-border">
        {entries.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">No audit entries matching filter.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5">Seq</th>
                <th className="px-3 py-1.5">Time</th>
                <th className="px-3 py-1.5">Op</th>
                <th className="px-3 py-1.5">Target</th>
                <th className="px-3 py-1.5">App</th>
                <th className="px-3 py-1.5">Result</th>
                <th className="px-3 py-1.5 font-mono text-[10px]">Prev Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-[11px]">
              {entries.map((entry) => (
                <tr key={`${entry.seq}-${entry.t}`} className="hover:bg-muted/20">
                  <td className="px-3 py-1.5 font-semibold text-muted-foreground">#{entry.seq}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-sans text-muted-foreground">
                    {new Date(entry.t).toLocaleTimeString()}
                  </td>
                  <td className="px-3 py-1.5 font-sans">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">
                      {entry.op}
                    </span>
                    {entry.count && entry.count > 1 ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">×{entry.count}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5 font-sans text-muted-foreground">
                    {entry.namespace ? `${entry.namespace}:${entry.id ?? '*'}` : '—'}
                  </td>
                  <td className="px-3 py-1.5 font-sans">{entry.app}</td>
                  <td className="px-3 py-1.5 font-sans">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        entry.result === 'ok'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : entry.result === 'locked'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {entry.result}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground" title={entry.prev}>
                    {entry.prev.slice(0, 10)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
