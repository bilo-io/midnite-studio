import { useState, useEffect } from 'react';
import { LuDownload } from 'react-icons/lu';
import { useToastStore } from '../../store/toast-store';
import type { UpdateState } from '@midnite/studio-shared';

export function UpdatePill() {
  const [updateState, setUpdateState] = useState<UpdateState>({
    phase: 'idle',
    version: null,
    percent: null,
    error: null,
  });

  const addToast = useToastStore((s) => s.addToast);
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
