import { useState, useEffect, useRef } from 'react';
import { LuDownload, LuLoaderCircle, LuTriangleAlert } from 'react-icons/lu';
import { useToastStore } from '../../store/toast-store';
import { useUiStore } from '../../store/ui-store';
import type { UpdateState } from '@midnite/studio-shared';

export function UpdatePill() {
  const [updateState, setUpdateState] = useState<UpdateState>({
    phase: 'idle',
    version: null,
    percent: null,
    error: null,
  });

  const addToast = useToastStore((s) => s.addToast);
  const channel = useUiStore((s) => s.updateChannel);
  const hasBridge = typeof window !== 'undefined' && Boolean(window.midniteStudio?.update);

  useEffect(() => {
    if (!hasBridge || !window.midniteStudio?.update) return;
    let prevPhase = 'idle';

    const unsub = window.midniteStudio.update.onState((state) => {
      setUpdateState(state);
      if (state.phase === 'downloaded' && prevPhase !== 'downloaded') {
        addToast({ message: 'Update ready — restart to install', status: 'success' });
      }
      prevPhase = state.phase;
    });

    return unsub;
  }, [hasBridge, addToast]);

  /**
   * Main starts every session on the `stable`/`latest` feed and only learns
   * otherwise if `updateSetChannel` is sent — see `update-service.ts`. The
   * preference itself lives in the renderer's persisted `ui-store`, so a
   * beta user is silently back on `latest` after every relaunch unless the
   * renderer re-pushes it once the bridge exists. `initialChannelSent` keeps
   * this to the one push Phase 53 Theme G's decision calls for, not a push
   * on every `channel` state; the value read here at mount time is already
   * the rehydrated persisted one.
   */
  const initialChannelSent = useRef(false);
  useEffect(() => {
    if (!hasBridge || !window.midniteStudio?.update || initialChannelSent.current) return;
    initialChannelSent.current = true;
    window.midniteStudio.update.setChannel({ channel });
  }, [hasBridge, channel]);

  if (updateState.phase === 'error') {
    return (
      <button
        type="button"
        onClick={() => window.midniteStudio?.update?.check()}
        title={updateState.error ?? 'Failed to check for updates'}
        className="flex h-6 items-center gap-1.5 rounded px-2 text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
      >
        <LuTriangleAlert className="h-3.5 w-3.5" />
        <span className="status-label">Update check failed</span>
      </button>
    );
  }

  if (updateState.phase === 'checking') {
    return (
      <div
        title="Checking for updates…"
        className="flex h-6 items-center gap-1.5 rounded px-2 text-xs font-medium text-muted-foreground"
      >
        <LuLoaderCircle className="h-3.5 w-3.5 animate-spin" />
        <span className="status-label">Checking for updates…</span>
      </div>
    );
  }

  if (
    updateState.phase !== 'available' &&
    updateState.phase !== 'downloading' &&
    updateState.phase !== 'downloaded'
  ) {
    return null;
  }

  const labelText =
    updateState.phase === 'available'
      ? `Update v${updateState.version} available`
      : updateState.phase === 'downloading'
        ? `Downloading v${updateState.version} (${updateState.percent ?? 0}%)`
        : `v${updateState.version} ready`;

  const handleClick = () => {
    if (!hasBridge || !window.midniteStudio?.update) return;
    if (updateState.phase === 'available') {
      window.midniteStudio.update.download();
    } else if (updateState.phase === 'downloaded') {
      window.midniteStudio.update.restart();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={labelText}
      className="flex h-6 items-center gap-1.5 rounded px-2 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
    >
      <LuDownload className="h-3.5 w-3.5" />
      <span className="status-label">{labelText}</span>
    </button>
  );
}
