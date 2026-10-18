import { useCallback, useEffect, useState } from 'react';

import { bridge } from '@midnite/studio-frame';
import type {
  CaptureChanged,
  CaptureItem,
  CaptureRegionFrame,
  CaptureStatus,
  ClipboardEntry,
} from '@midnite/studio-shared';

/**
 * Capture's renderer state (Phase 113 Theme K): the status (permission, settings, shortcut), the captures
 * and the clipboard history, refreshed whenever main says something changed. Everything lives in main;
 * this only asks and listens.
 */
export type CaptureState = {
  status: CaptureStatus | null;
  captures: CaptureItem[];
  clipboard: { enabled: boolean; entries: ClipboardEntry[] };
  /** A frame the shortcut froze for the region picker, until the picker takes or cancels it. */
  region: CaptureRegionFrame | null;
  setRegion: (frame: CaptureRegionFrame | null) => void;
  refresh: () => Promise<void>;
  /** The bridge's capture namespace is missing (a test, a plain browser). */
  unavailable: boolean;
};

export function useCapture(): CaptureState {
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [clipboard, setClipboard] = useState<{ enabled: boolean; entries: ClipboardEntry[] }>({
    enabled: false,
    entries: [],
  });
  const [region, setRegion] = useState<CaptureRegionFrame | null>(null);
  const capture = bridge()?.capture;

  const refreshStatus = useCallback(async () => {
    const api = bridge()?.capture;
    if (api) setStatus(await api.status());
  }, []);
  const refreshCaptures = useCallback(async () => {
    const api = bridge()?.capture;
    if (api) setCaptures((await api.list()).captures);
  }, []);
  const refreshClipboard = useCallback(async () => {
    const api = bridge()?.capture;
    if (api) setClipboard(await api.clipboard.list());
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([refreshStatus(), refreshCaptures(), refreshClipboard()]);
  }, [refreshStatus, refreshCaptures, refreshClipboard]);

  useEffect(() => {
    const api = bridge()?.capture;
    if (!api) return undefined;
    void refresh();
    // A frame the shortcut froze before this view mounted.
    void api.regionPending().then(({ frame }) => {
      if (frame) setRegion(frame);
    });
    return api.onChanged((event: CaptureChanged) => {
      if (event.reason === 'captures') void refreshCaptures();
      else if (event.reason === 'clipboard') void refreshClipboard();
      else if (event.reason === 'shortcut') {
        if (event.region) setRegion(event.region);
        void refreshStatus();
      } else void Promise.all([refreshStatus(), refreshClipboard()]);
    });
  }, [refresh, refreshCaptures, refreshClipboard, refreshStatus]);

  return { status, captures, clipboard, region, setRegion, refresh, unavailable: !capture };
}

/**
 * For the composing app, mounted once at its root: calls `onShortcut` when the global capture chord
 * fires, so the app can bring the Capture view forward (Studio navigates to it). The view itself picks
 * up the frozen frame — this only says "go there".
 */
export function useCaptureShortcutLanding(onShortcut: () => void): void {
  useEffect(() => {
    const api = bridge()?.capture;
    if (!api) return undefined;
    return api.onChanged((event) => {
      if (event.reason === 'shortcut') onShortcut();
    });
  }, [onShortcut]);
}
