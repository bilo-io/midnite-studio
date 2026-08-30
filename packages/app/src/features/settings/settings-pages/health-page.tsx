import { useState, useEffect } from 'react';
import { LuStethoscope, LuCheck, LuX } from 'react-icons/lu';
import { Spinner } from '../../../components/skeleton';
import type { SystemHealth } from '@midnite/studio-shared';

export function HealthChecklist({ compact }: { compact?: boolean }) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const hasBridge = typeof window !== 'undefined' && Boolean(window.midniteStudio?.systemHealth);

  useEffect(() => {
    if (!hasBridge || !window.midniteStudio?.systemHealth) {
      setLoading(false);
      return;
    }
    window.midniteStudio
      .systemHealth()
      .then((data) => setHealth(data))
      .catch(() => setHealth(null))
      .finally(() => setLoading(false));
  }, [hasBridge]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <Spinner className="h-4 w-4" />
        <span>Checking system health...</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${compact ? 'text-xs' : 'p-3'}`}>
      {/* Git check */}
      <div className="flex items-center justify-between rounded border border-border/50 p-2">
        <div className="flex items-center gap-2">
          {health?.git.path ? (
            <LuCheck className="h-4 w-4 text-green-500" />
          ) : (
            <LuX className="h-4 w-4 text-destructive" />
          )}
          <span className="font-medium text-xs">Git binary</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {health?.git.version ? `${health.git.version} (${health.git.path})` : "Couldn't detect"}
        </span>
      </div>

      {/* Shell check */}
      <div className="flex items-center justify-between rounded border border-border/50 p-2">
        <div className="flex items-center gap-2">
          {health?.shell ? (
            <LuCheck className="h-4 w-4 text-green-500" />
          ) : (
            <LuX className="h-4 w-4 text-destructive" />
          )}
          <span className="font-medium text-xs">Default shell</span>
        </div>
        <span className="text-xs text-muted-foreground">{health?.shell ?? "Couldn't detect"}</span>
      </div>

      {/* SSH Agent check */}
      <div className="flex items-center justify-between rounded border border-border/50 p-2">
        <div className="flex items-center gap-2">
          {health?.sshAgent.running ? (
            <LuCheck className="h-4 w-4 text-green-500" />
          ) : (
            <LuX className="h-4 w-4 text-destructive" />
          )}
          <span className="font-medium text-xs">SSH Agent</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {health?.sshAgent.running
            ? health.sshAgent.keys > 0
              ? `Running (${health.sshAgent.keys} keys loaded)`
              : 'Running (no keys loaded)'
            : "Not running / couldn't detect"}
        </span>
      </div>

      {/* CLI Integration check */}
      <div className="flex items-center justify-between rounded border border-border/50 p-2">
        <div className="flex items-center gap-2">
          {health?.cli.installed ? (
            <LuCheck className="h-4 w-4 text-green-500" />
          ) : (
            <LuX className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium text-xs">midnite-studio CLI</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {health?.cli.installed ? `Installed at ${health.cli.path}` : 'Not installed'}
        </span>
      </div>
    </div>
  );
}

export function HealthPage() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <LuStethoscope className="h-4 w-4" /> System Health & Environment
        </h2>
        <p className="text-xs text-muted-foreground">
          Diagnostic checks for system utilities, shells, SSH agents, and CLI integration.
        </p>
      </div>
      <HealthChecklist />
    </div>
  );
}
