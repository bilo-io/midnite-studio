import { bridge } from '@midnite/studio-frame';
import type { SystemHealth, ToolchainBinary } from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';

type Row = { label: string; ok: boolean; detail: string };

const binaryRow = (label: string, bin: ToolchainBinary | undefined): Row => ({
  label,
  ok: Boolean(bin?.path),
  detail: bin?.path ? (bin.version ?? bin.path) : 'not found',
});

/** The rows System Health reports, in the order the Settings page lists them. */
export function healthRows(health: SystemHealth): Row[] {
  const daemon = health.ollamaDaemon;
  return [
    binaryRow('git', health.git),
    binaryRow('Homebrew', health.homebrew),
    binaryRow('node', health.node),
    binaryRow('pnpm', health.pnpm),
    binaryRow('moon', health.moon),
    {
      label: 'SSH agent',
      ok: health.sshAgent.running,
      detail: health.sshAgent.running
        ? `${health.sshAgent.keys} key${health.sshAgent.keys === 1 ? '' : 's'} loaded`
        : 'not running',
    },
    binaryRow('ollama', health.ollama),
    {
      label: 'Ollama daemon',
      ok: Boolean(daemon?.reachable),
      detail: daemon?.reachable ? `${daemon.version ?? 'running'} at ${daemon.host}` : 'not reachable',
    },
  ];
}

/** Toolchain binaries, the ssh agent and Ollama — what `CHANNELS.systemHealth` answers. */
export function SystemHealthSection() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(() => {
    const api = bridge();
    if (!api?.systemHealth) return setFailed(true);
    api.systemHealth().then((next) => { setHealth(next); setFailed(false); }, () => setFailed(true));
  }, []);
  useEffect(refresh, [refresh]);

  const startAgent = () => {
    void bridge()?.systemHealthStartSshAgent?.().then(refresh);
  };

  return (
    <section aria-labelledby="monitor-health" className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="monitor-health" className="text-sm font-medium">System health</h2>
        <button type="button" onClick={refresh} className="text-xs text-muted-foreground hover:text-foreground">
          Re-check
        </button>
      </div>
      {failed ? (
        <p className="text-xs text-muted-foreground">System health is not available here.</p>
      ) : !health ? (
        <p className="text-xs text-muted-foreground">Checking…</p>
      ) : (
        <ul className="divide-y divide-border text-xs">
          {healthRows(health).map((row) => (
            <li key={row.label} className="flex items-center justify-between py-1.5">
              <span>{row.label}</span>
              <span className={row.ok ? 'text-muted-foreground' : 'text-amber-500'}>
                {row.ok ? '✓' : '✗'} {row.detail}
                {row.label === 'SSH agent' && !row.ok && bridge()?.systemHealthStartSshAgent ? (
                  <button type="button" onClick={startAgent} className="ml-2 underline">Start</button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
