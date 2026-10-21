import { useCallback, useEffect, useState } from 'react';

import { bridge } from '@midnite/studio-frame';
import type {
  CaptureChanged,
  CaptureItem,
  CaptureOverlayOutcome,
  CaptureRegionFrame,
  CaptureStatus,
  ClipboardEntry,
} from '@midnite/studio-shared';

// --- selection requests ---------------------------------------------------------------
// A capture the view should select when it shows next: one the overlay or the chord just took, or one
// the composing app imported (Studio's `midnite-studio://capture` landing) before navigating here. Kept
// at module level because the request can come before the view mounts.

let pendingSelection: string | null = null;
const selectionListeners = new Set<(id: string) => void>();

/** Asks the Capture view to select `id` — now if it is showing, else when it next mounts. */
export function selectCapture(id: string): void {
  if (selectionListeners.size === 0) {
    pendingSelection = id;
    return;
  }
  pendingSelection = null;
  for (const listener of selectionListeners) listener(id);
}

/** The overlay's state as the view shows it: waiting while it is open, and what it ended with. */
export type CaptureOverlayState = 'idle' | 'open';

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
  /** The desktop region overlay is open (Region was pressed here); cleared when it closes. */
  overlay: CaptureOverlayState;
  setOverlay: (state: CaptureOverlayState) => void;
  /** How the last overlay ended, when it ended in an error — the view shows it. */
  overlayError: string | null;
  /** A capture to select, set by {@link selectCapture} and the overlay; the view consumes it. */
  selectRequest: string | null;
  clearSelectRequest: () => void;
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
  const [overlay, setOverlay] = useState<CaptureOverlayState>('idle');
  const [overlayError, setOverlayError] = useState<string | null>(null);
  const [selectRequest, setSelectRequest] = useState<string | null>(null);
  const capture = bridge()?.capture;

  useEffect(() => {
    if (pendingSelection) {
      setSelectRequest(pendingSelection);
      pendingSelection = null;
    }
    const listener = (id: string) => setSelectRequest(id);
    selectionListeners.add(listener);
    return () => {
      selectionListeners.delete(listener);
    };
  }, []);

  const onOverlay = useCallback((outcome: CaptureOverlayOutcome | undefined) => {
    setOverlay('idle');
    setOverlayError(
      outcome?.outcome === 'error' ? (outcome.message ?? 'The region failed.') : null,
    );
    if (outcome?.outcome === 'captured' && outcome.captureId) setSelectRequest(outcome.captureId);
  }, []);

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
      else if (event.reason === 'overlay') {
        onOverlay(event.overlay);
        void refreshCaptures();
      } else if (event.reason === 'shortcut') {
        if (event.region) setRegion(event.region);
        if (event.captureId) {
          setSelectRequest(event.captureId);
          void refreshCaptures();
        }
        void refreshStatus();
      } else void Promise.all([refreshStatus(), refreshClipboard()]);
    });
  }, [refresh, refreshCaptures, refreshClipboard, refreshStatus, onOverlay]);

  return {
    status,
    captures,
    clipboard,
    region,
    setRegion,
    overlay,
    setOverlay,
    overlayError,
    selectRequest,
    clearSelectRequest: () => setSelectRequest(null),
    refresh,
    unavailable: !capture,
  };
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
      if (event.reason !== 'shortcut') return;
      // The chord's overlay took a capture: the view selects it once it is showing.
      if (event.captureId) selectCapture(event.captureId);
      onShortcut();
    });
  }, [onShortcut]);
}
