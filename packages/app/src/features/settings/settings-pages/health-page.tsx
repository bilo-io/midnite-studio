import { useState, useEffect } from 'react';
import { LuStethoscope, LuCheck, LuX } from 'react-icons/lu';
import { Spinner } from '../../../components/skeleton';
import type { SystemHealth } from '@midnite/studio-shared';
import { openExternal } from '../../../services/queries';
import { parseGitVersion } from './git-version';
import {
  parseToolchainVersion,
  TOOLCHAIN_TOOLS,
  type ToolchainToolId,
} from './toolchain-version';

/**
 * The git row's value: `v2.39.5`, linked to that version's upstream release
 * notes.
 *
 * The raw line (`git version 2.39.5 (Apple Git-154)`) and the binary's path are
 * both still worth having when something is wrong, so they move into the
 * tooltip rather than being dropped — the row shows the one thing a reader
 * scans for, and keeps the diagnostic a hover away.
 *
 * A version that will not parse falls back to the raw string, unlinked: a wrong
 * link is worse than no link, and `parseGitVersion` returns `null` rather than
 * guessing for exactly that reason.
 */
function GitVersionValue({ raw, path }: { raw: string | null; path: string | null }) {
  const parsed = parseGitVersion(raw);
  const title = [raw, path].filter(Boolean).join(' — ') || undefined;

  if (!parsed) {
    return (
      <span className="text-xs text-muted-foreground" title={title}>
        {raw ?? "Couldn't detect"}
      </span>
    );
  }

  return (
    <button
      type="button"
      // Deliberately `openExternal`, not `openInMidnite` (Phase 71 Theme B):
      // release notes are read once and never returned to, so a tab in the
      // app's own browser would just be one more thing to close.
      onClick={() => openExternal(parsed.releaseNotesUrl)}
      title={title}
      aria-label={`git ${parsed.label} — open release notes`}
      className="rounded font-mono text-xs text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
    >
      {parsed.label}
    </button>
  );
}

function ToolchainVersionValue({
  tool,
  raw,
  path,
}: {
  tool: ToolchainToolId;
  raw: string | null | undefined;
  path: string | null | undefined;
}) {
  const parsed = parseToolchainVersion(tool, raw);
  const meta = TOOLCHAIN_TOOLS[tool];
  const title = [raw, path].filter(Boolean).join(' — ') || undefined;

  if (!parsed || !path) {
    return (
      <button
        type="button"
        onClick={() => openExternal(meta.docsUrl)}
        title={`Open ${meta.name} documentation (${meta.docsUrl})`}
        aria-label={`${meta.name} not installed — open docs`}
        className="rounded text-xs text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      >
        Not installed
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openExternal(parsed.url)}
      title={title}
      aria-label={`${meta.name} ${parsed.label} — open release`}
      className="rounded font-mono text-xs text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
    >
      {parsed.label}
    </button>
  );
}

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

  const toolchainKeys: ToolchainToolId[] = ['homebrew', 'node', 'pnpm', 'moon'];

  return (
    <div className={`flex flex-col gap-4 ${compact ? 'text-xs max-h-80 overflow-y-auto pr-1' : 'p-3'}`}>
      {/* System Environment section */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          System Environment
        </span>

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
          <GitVersionValue raw={health?.git.version ?? null} path={health?.git.path ?? null} />
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
              : 'Undetected'}
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

      {/* Development Toolchain section */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Toolchain
        </span>

        {toolchainKeys.map((toolId) => {
          const meta = TOOLCHAIN_TOOLS[toolId];
          const info = health?.[toolId];
          const isInstalled = Boolean(info?.path);

          return (
            <div
              key={toolId}
              className="flex items-center justify-between rounded border border-border/50 p-2"
            >
              <div className="flex items-center gap-2">
                {isInstalled ? (
                  <LuCheck className="h-4 w-4 text-green-500" />
                ) : (
                  <LuX className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium text-xs">{meta.name}</span>
              </div>
              <ToolchainVersionValue tool={toolId} raw={info?.version} path={info?.path} />
            </div>
          );
        })}
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
          Diagnostic checks for system utilities, shells, SSH agents, and development toolchains.
        </p>
      </div>
      <HealthChecklist />
    </div>
  );
}
