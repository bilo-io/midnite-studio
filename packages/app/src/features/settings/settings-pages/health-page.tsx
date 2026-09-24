import { useCallback, useEffect, useRef, useState } from 'react';
import { LuStethoscope, LuCheck, LuX, LuPlay } from 'react-icons/lu';
import { Spinner } from '../../../components/skeleton';
import type { SystemHealth } from '@midnite/studio-shared';
import { openExternal } from '../../../services/queries';
import { useUiStore } from '../../../store/ui-store';
import { useTerminalStore } from '../../terminal/terminal-store';
import { parseGitVersion } from './git-version';
import {
  parseToolchainVersion,
  TOOLCHAIN_TOOLS,
  type ToolchainToolId,
} from './toolchain-version';

/**
 * Spawns a shell in the integrated terminal and submits `command` with a
 * trailing carriage return. Mirrors `agent-page.tsx`'s own `submitCommand` —
 * no shared helper exists yet for two settings pages doing the identical
 * "run this in a pty" thing, so this is a deliberate, small duplication
 * rather than a from-scratch extraction this phase did not ask for.
 */
function submitCommand(command: string, title = 'ollama'): void {
  if (!command) return;
  const ui = useUiStore.getState();
  ui.setTerminalOpen(true);
  const cwd = ui.selectedWorktreePath ?? '.';
  const repoId = ui.selectedRepoId ?? 'default';
  const session = useTerminalStore.getState().openSession({
    kind: 'shell',
    title,
    cwd,
    repoId,
  });
  const input = command.endsWith('\r') || command.endsWith('\n') ? command : `${command}\r`;
  useTerminalStore.getState().queueInput(session.id, input);
}

/** Bounded re-probe after Install/Update/Start — up to ~15s, since a fresh
 *  `ollama serve` or the app finishing its own launch is not instant. */
const REPROBE_ATTEMPTS = 10;
const REPROBE_INTERVAL_MS = 1500;

function OllamaRow({
  binary,
  daemon,
  onHealthRefreshed,
}: {
  binary: SystemHealth['ollama'];
  daemon: SystemHealth['ollamaDaemon'];
  onHealthRefreshed: (health: SystemHealth) => void;
}) {
  const [busy, setBusy] = useState<'install' | 'update' | 'start' | null>(null);
  const reprobeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (reprobeTimer.current) clearTimeout(reprobeTimer.current);
    },
    [],
  );

  const reprobe = useCallback(
    (attemptsLeft: number) => {
      if (!window.midniteStudio?.systemHealth) {
        setBusy(null);
        return;
      }
      window.midniteStudio
        .systemHealth()
        .then((next) => {
          onHealthRefreshed(next);
          if (next.ollamaDaemon?.reachable || attemptsLeft <= 1) {
            setBusy(null);
            return;
          }
          reprobeTimer.current = setTimeout(() => reprobe(attemptsLeft - 1), REPROBE_INTERVAL_MS);
        })
        .catch(() => setBusy(null));
    },
    [onHealthRefreshed],
  );

  const isInstalled = Boolean(binary?.path);
  const isReachable = Boolean(daemon?.reachable);
  const isAppBundle = Boolean(binary?.path?.includes('/Applications/Ollama.app'));

  const install = () => {
    setBusy('install');
    submitCommand('brew install --cask ollama-app', 'Ollama install');
    reprobeTimer.current = setTimeout(() => reprobe(REPROBE_ATTEMPTS), REPROBE_INTERVAL_MS);
  };
  const update = () => {
    setBusy('update');
    submitCommand('brew upgrade --cask ollama-app', 'Ollama update');
    reprobeTimer.current = setTimeout(() => reprobe(REPROBE_ATTEMPTS), REPROBE_INTERVAL_MS);
  };
  const start = () => {
    setBusy('start');
    // The app bundle, when present, is the friendlier launch (menu bar icon,
    // survives a terminal closing); otherwise a detached `ollama serve` in
    // its own shell. Never a stop/restart control — see the phase doc's
    // "never quit the user's daemon" guardrail.
    submitCommand(isAppBundle ? 'open -a Ollama' : 'ollama serve &', 'Start Ollama');
    reprobeTimer.current = setTimeout(() => reprobe(REPROBE_ATTEMPTS), REPROBE_INTERVAL_MS);
  };

  const statusIcon = isInstalled && isReachable ? (
    <LuCheck className="h-4 w-4 text-green-500" />
  ) : isInstalled ? (
    <LuCheck className="h-4 w-4 text-yellow-500" />
  ) : (
    <LuX className="h-4 w-4 text-muted-foreground" />
  );

  return (
    <div className="flex flex-col gap-1.5 rounded border border-border/50 p-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statusIcon}
          <span className="font-medium text-xs">Ollama</span>
        </div>
        <ToolchainVersionValue tool="ollama" raw={binary?.version} path={binary?.path} />
      </div>
      <div className="flex items-center justify-between pl-6">
        <span className="text-[11px] text-muted-foreground">
          {isReachable
            ? `Daemon reachable${daemon?.version ? ` (v${daemon.version})` : ''} at ${daemon?.host ?? ''}`
            : isInstalled
              ? 'Daemon not reachable'
              : 'Not installed'}
        </span>
        <div className="flex items-center gap-1.5">
          {!isInstalled ? (
            <button
              type="button"
              onClick={install}
              disabled={busy !== null}
              className="flex h-6 items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              {busy === 'install' ? <Spinner className="h-3 w-3" /> : null}
              Install
            </button>
          ) : (
            <button
              type="button"
              onClick={update}
              disabled={busy !== null}
              className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {busy === 'update' ? <Spinner className="h-3 w-3" /> : null}
              Update
            </button>
          )}
          {isInstalled && !isReachable ? (
            <button
              type="button"
              onClick={start}
              disabled={busy !== null}
              className="flex h-6 items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              {busy === 'start' ? <Spinner className="h-3 w-3" /> : <LuPlay className="h-3 w-3" />}
              Start Ollama
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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

        {/* Ollama — a bespoke row, not folded into `toolchainKeys`: it carries
            a binary-vs-daemon distinction none of the four rows above have,
            plus install/update/start actions the others don't offer. */}
        <OllamaRow binary={health?.ollama} daemon={health?.ollamaDaemon} onHealthRefreshed={setHealth} />
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
