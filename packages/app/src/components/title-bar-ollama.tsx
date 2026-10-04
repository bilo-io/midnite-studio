import { useCallback, useEffect, useRef, useState } from 'react';
import { SiOllama } from 'react-icons/si';
import { LuArrowRight, LuPlay, LuSquare } from 'react-icons/lu';
import { useQueryClient } from '@tanstack/react-query';
import type { OllamaRunningModel } from '@midnite/studio-shared';

import { formatBytes } from '../features/monitor/format-bytes';
import { useOllamaRunning, useOllamaStatus } from '../features/models/use-models';
import { useSetupProbe } from '../features/setup/install-runner';
import { submitCommand } from '../features/terminal/submit-command';
import { bridge } from '../services/bridge';
import { useUiStore } from '../store/ui-store';
import { Popover } from './popover';
import { Spinner } from './skeleton';
import { Tooltip } from './tooltip';

/**
 * Titlebar Ollama menu button and popover panel.
 *
 * Sits to the right of the agents count and loop launchers in the title bar.
 * - When Ollama is running: displays an active indicator with a shimmer animation,
 *   along with host and model details in the popover menu.
 * - When Ollama is stopped: displays stopped state with play/stop toggle buttons.
 * - When not installed: clicking navigates directly to Settings ▸ Ollama.
 */
export function TitleBarOllama() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'start' | 'stop' | null>(null);
  const queryClient = useQueryClient();

  const status = useOllamaStatus();
  const runningModels = useOllamaRunning();
  const probe = useSetupProbe(['ollama']);

  const isRunning = Boolean(status.data?.reachable);
  const ollamaProbe = probe.data?.['ollama'];
  // If reachable, it's definitely installed. If probe completed, read probe.installed;
  // otherwise treat as installed while probe is loading to avoid flash.
  const isInstalled = isRunning || (probe.isLoading ? true : Boolean(ollamaProbe?.installed));

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const navigateToSettings = useCallback(() => {
    useUiStore.getState().setActiveView('settings');
    useUiStore.getState().setSettingsPage('ollama');
    setOpen(false);
  }, []);

  const handleOpenModels = useCallback(() => {
    useUiStore.getState().setActiveView('models');
    setOpen(false);
  }, []);

  const handleStart = useCallback(async () => {
    setBusy('start');
    try {
      let isAppBundle = false;
      try {
        const health = await bridge()?.systemHealth?.();
        isAppBundle = Boolean(health?.ollama?.path?.includes('/Applications/Ollama.app'));
      } catch {
        // Fall back to CLI serve
      }
      submitCommand(isAppBundle ? 'open -a Ollama' : 'ollama serve &', 'Start Ollama');
      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (!mountedRef.current) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!mountedRef.current) break;
        try {
          const res = await status.refetch();
          if (res?.data?.reachable) {
            void queryClient.invalidateQueries({ queryKey: ['ollama-status'] });
            void queryClient.invalidateQueries({ queryKey: ['ollama-running'] });
            break;
          }
        } catch {
          break;
        }
      }
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  }, [queryClient, status]);

  const handleStop = useCallback(async () => {
    setBusy('stop');
    try {
      submitCommand('osascript -e \'quit app "Ollama"\' 2>/dev/null; pkill -f ollama', 'Stop Ollama');
      for (let attempt = 0; attempt < 5; attempt += 1) {
        if (!mountedRef.current) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!mountedRef.current) break;
        try {
          const res = await status.refetch();
          if (!res?.data?.reachable) {
            void queryClient.invalidateQueries({ queryKey: ['ollama-status'] });
            void queryClient.invalidateQueries({ queryKey: ['ollama-running'] });
            break;
          }
        } catch {
          break;
        }
      }
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  }, [queryClient, status]);

  if (!isInstalled) {
    return (
      <Tooltip label="Ollama: Not installed (manage in Settings)" side="bottom">
        <button
          type="button"
          data-testid="titlebar-ollama"
          data-installed="false"
          data-running="false"
          onClick={navigateToSettings}
          aria-label="Ollama: Not installed (manage in Settings)"
          className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
        >
          <SiOllama aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span
            aria-hidden
            data-testid="titlebar-ollama-dot"
            className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500/80"
          />
        </button>
      </Tooltip>
    );
  }

  const label = isRunning ? 'Ollama: Running' : 'Ollama: Stopped';

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      align="end"
      label={label}
      testId="titlebar-ollama"
      panelClassName="w-72 p-3 text-xs border border-border bg-popover text-popover-foreground shadow-xl rounded-xl"
      triggerClassName="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[open=true]:bg-accent cursor-pointer"
      trigger={
        <Tooltip label={label} side="bottom">
          <span
            data-running={isRunning ? 'true' : 'false'}
            data-installed="true"
            className="relative flex h-full w-full items-center justify-center"
          >
            <SiOllama
              aria-hidden
              className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                isRunning ? 'text-emerald-500 dark:text-emerald-400' : 'text-muted-foreground'
              }`}
            />
            {isRunning ? (
              <>
                <span
                  aria-hidden
                  data-testid="titlebar-ollama-dot"
                  className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]"
                />
                <span
                  aria-hidden
                  data-testid="titlebar-ollama-shimmer"
                  className="pill-shimmer pointer-events-none absolute inset-0 rounded-md"
                  style={{
                    background:
                      'linear-gradient(100deg, transparent 20%, rgba(16, 185, 129, 0.4) 50%, transparent 80%)',
                  }}
                />
              </>
            ) : (
              <span
                aria-hidden
                data-testid="titlebar-ollama-dot"
                className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
              />
            )}
          </span>
        </Tooltip>
      }
    >
      <TitleBarOllamaMenu
        isRunning={isRunning}
        status={status.data}
        runningModels={runningModels.data ?? []}
        busy={busy}
        onStart={handleStart}
        onStop={handleStop}
        onManageSettings={navigateToSettings}
        onOpenModels={handleOpenModels}
      />
    </Popover>
  );
}

function TitleBarOllamaMenu({
  isRunning,
  status,
  runningModels,
  busy,
  onStart,
  onStop,
  onManageSettings,
  onOpenModels,
}: {
  isRunning: boolean;
  status: { reachable: boolean; version: string | null; host: string } | undefined;
  runningModels: OllamaRunningModel[];
  busy: 'start' | 'stop' | null;
  onStart: () => void;
  onStop: () => void;
  onManageSettings: () => void;
  onOpenModels: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SiOllama
            aria-hidden
            className={`h-4 w-4 ${isRunning ? 'text-emerald-500 dark:text-emerald-400' : 'text-muted-foreground'}`}
          />
          <span className="font-semibold text-xs text-foreground">Ollama</span>
        </div>
        {isRunning ? (
          <span
            data-testid="titlebar-ollama-status-badge"
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Running
          </span>
        ) : (
          <span
            data-testid="titlebar-ollama-status-badge"
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
            Stopped
          </span>
        )}
      </div>

      {/* Details Box */}
      <div className="rounded-md border border-border/60 bg-muted/20 p-2 space-y-1.5">
        {isRunning ? (
          <>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Host</span>
              <span className="font-mono text-foreground/90">{status?.host || '127.0.0.1:11434'}</span>
            </div>
            {status?.version ? (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono text-foreground/90">v{status.version}</span>
              </div>
            ) : null}
            <div className="pt-1 border-t border-border/40">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Loaded models
              </div>
              {runningModels.length > 0 ? (
                <div className="mt-1 flex flex-col gap-1 max-h-24 overflow-y-auto">
                  {runningModels.map((m) => (
                    <div key={m.name} className="flex items-center justify-between text-[11px]">
                      <span className="font-mono truncate max-w-[150px]">{m.name}</span>
                      <span className="text-muted-foreground text-[10px] shrink-0">
                        {formatBytes(m.sizeVram ?? m.size)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Idle (no models in VRAM)
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Ollama daemon is stopped. Start it to run local models with agents and loops.
          </p>
        )}
      </div>

      {/* Play / Stop Toggle Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="titlebar-ollama-play"
          onClick={onStart}
          disabled={isRunning || busy !== null}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
            isRunning
              ? 'border border-border/50 bg-muted/40 text-muted-foreground/50 cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          {busy === 'start' ? <Spinner className="h-3 w-3" /> : <LuPlay className="h-3.5 w-3.5" />}
          Start
        </button>
        <button
          type="button"
          data-testid="titlebar-ollama-stop"
          onClick={onStop}
          disabled={!isRunning || busy !== null}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
            !isRunning
              ? 'border border-border/50 bg-muted/40 text-muted-foreground/50 cursor-not-allowed'
              : 'border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20'
          }`}
        >
          {busy === 'stop' ? <Spinner className="h-3 w-3" /> : <LuSquare className="h-3.5 w-3.5" />}
          Stop
        </button>
      </div>

      {/* Footer Links */}
      <div className="flex items-center justify-between border-t border-border/60 pt-2 text-[11px]">
        <button
          type="button"
          data-testid="titlebar-ollama-models"
          onClick={onOpenModels}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Browse models
        </button>
        <button
          type="button"
          data-testid="titlebar-ollama-settings"
          onClick={onManageSettings}
          className="flex items-center gap-1 text-primary hover:underline"
        >
          Settings <LuArrowRight aria-hidden className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
