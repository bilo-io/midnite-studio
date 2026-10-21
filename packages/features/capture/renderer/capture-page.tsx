import { useCallback, useEffect, useRef, useState } from 'react';

import { bridge, formatBytes } from '@midnite/studio-frame';
import {
  captureFileUrl,
  capturePermitted,
  type CaptureItem,
  type CaptureRegionRect,
  type CaptureSettings,
  type CaptureSource,
  type CaptureSourceKind,
} from '@midnite/studio-shared';

import { ClipboardSection } from './clipboard-section';
import { PermissionPanel } from './permission-panel';
import {
  browserRecorderMedia,
  startRecording,
  type ActiveRecording,
  type RecorderMedia,
} from './recorder';
import { RegionPicker } from './region-picker';
import { SendTo } from './send-to';
import { SettingsSection } from './settings-section';
import { useCapture } from './use-capture';

type Tool = 'screen' | 'window' | 'region' | 'record';

const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: 'screen', label: 'Full screen' },
  { id: 'window', label: 'Window' },
  { id: 'region', label: 'Region' },
  { id: 'record', label: 'Record' },
];

const DELAYS = [0, 3, 5, 10] as const;

const describe = (item: CaptureItem): string => {
  const what =
    item.kind === 'recording'
      ? 'Recording'
      : item.mode === 'region'
        ? 'Region'
        : item.mode === 'window'
          ? 'Window'
          : 'Screen';
  const size = item.width && item.height ? ` · ${item.width} × ${item.height}` : '';
  const length = item.durationMs !== undefined ? ` · ${Math.round(item.durationMs / 1000)} s` : '';
  return `${what}${size}${length} · ${formatBytes(item.bytes)}`;
};

/**
 * The Capture view (Phase 113 Theme K): pick what to capture, take it, see it, and send it on.
 *
 * Nothing is captured until a button is pressed — not even the source list's thumbnails, which load
 * when a tool is picked. Until macOS allows Screen Recording the tools are replaced by the explanation
 * ({@link PermissionPanel}); the captures already taken, the clipboard history and the settings stay.
 */
export function CapturePage({ media = browserRecorderMedia() }: { media?: RecorderMedia } = {}) {
  const state = useCapture();
  const { status, captures, clipboard, region, setRegion, overlay, setOverlay } = state;
  const { selectRequest, clearSelectRequest } = state;
  const api = bridge()?.capture;

  const [tool, setTool] = useState<Tool | null>(null);
  const [sources, setSources] = useState<CaptureSource[] | null>(null);
  const [delay, setDelay] = useState<(typeof DELAYS)[number]>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [recording, setRecording] = useState<{ name: string; active: ActiveRecording } | null>(
    null,
  );
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  // A capture the overlay, the chord or the composing app asked to show.
  useEffect(() => {
    if (!selectRequest) return;
    setSelected(selectRequest);
    clearSelectRequest();
  }, [selectRequest, clearSelectRequest]);

  const loadSources = useCallback(
    async (kind: CaptureSourceKind) => {
      if (!api) return;
      setSources(null);
      const result = await api.sources({ kind });
      if (!result.ok) {
        setError(result.kind === 'error' ? result.message : 'Could not list sources.');
        setSources([]);
        return;
      }
      setSources(result.value.sources);
    },
    [api],
  );

  const pickTool = (next: Tool) => {
    setError(null);
    setTool(next);
    setSources(null);
    if (next === 'screen' || next === 'record') void loadSources('screen');
    if (next === 'window') void loadSources('window');
  };

  const afterDelay = (run: () => Promise<void>) => {
    if (delay === 0) return void run();
    setCountdown(delay);
    for (let i = 1; i <= delay; i += 1)
      timers.current.push(
        window.setTimeout(() => {
          const left = delay - i;
          setCountdown(left > 0 ? left : null);
          if (left === 0) void run();
        }, i * 1000),
      );
  };

  const takeStill = (source: CaptureSource) =>
    afterDelay(async () => {
      if (!api) return;
      setBusy(true);
      const result = await api.still({ mode: source.kind, sourceId: source.id });
      setBusy(false);
      if (result.ok) setSelected(result.value.id);
      else setError(result.kind === 'error' ? result.message : 'The capture failed.');
    });

  const freeze = () =>
    afterDelay(async () => {
      if (!api) return;
      setBusy(true);
      // One grab: main opens the desktop overlay on it, or hands it back for the picker here.
      const result = await api.regionStart();
      setBusy(false);
      if (!result.ok)
        return setError(result.kind === 'error' ? result.message : 'Could not freeze the screen.');
      if (result.value.surface === 'overlay') setOverlay('open');
      else setRegion(result.value.frame);
    });

  const finishRegion = async (rect: CaptureRegionRect) => {
    if (!api || !region) return;
    const pendingId = region.pendingId;
    setRegion(null);
    const result = await api.regionFinish({ pendingId, rect });
    if (result.ok) setSelected(result.value.id);
    else setError(result.kind === 'error' ? result.message : 'The region capture failed.');
  };

  const cancelRegion = () => {
    if (api && region) void api.regionCancel({ pendingId: region.pendingId });
    setRegion(null);
  };

  const stopRecording = useCallback(async () => {
    if (!recording) return;
    const outcome = await recording.active.stop();
    setRecording(null);
    if (outcome.ok) setSelected(outcome.id);
    else setError(outcome.message);
  }, [recording]);

  const record = async (source: CaptureSource) => {
    if (!api) return;
    setError(null);
    const started = await startRecording(api, source.id, media);
    if (!started.ok) return setError(started.message);
    setRecording({ name: source.name, active: started.recording });
  };

  useEffect(() => {
    if (!recording) return undefined;
    let live = true;
    void recording.active.ended.then(() => {
      if (live) void stopRecording();
    });
    return () => {
      live = false;
    };
  }, [recording, stopRecording]);

  const changeSettings = async (patch: Partial<CaptureSettings>): Promise<string | null> => {
    if (!api) return 'Capture is not available here.';
    const result = await api.setSettings(patch);
    await state.refresh();
    return result.ok ? null : result.kind === 'error' ? result.message : 'Could not save that.';
  };

  const remove = async (item: CaptureItem) => {
    if (!api) return;
    const result = await api.remove({ id: item.id });
    if (!result.ok) setError(result.kind === 'error' ? result.message : 'Could not delete it.');
    if (selected === item.id) setSelected(null);
  };

  const permitted = status ? capturePermitted(status.permission) : false;
  const current = captures.find((c) => c.id === selected) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6">
      <header>
        <h1 className="text-lg font-semibold">Capture</h1>
        <p className="text-xs text-muted-foreground">
          Screenshots and screen recordings, taken when you press a button and saved on this machine
          only.
        </p>
      </header>

      {state.unavailable ? (
        <p className="text-xs text-muted-foreground">Capture is not available in this window.</p>
      ) : null}

      {status && !permitted ? (
        <PermissionPanel permission={status.permission} onChanged={() => void state.refresh()} />
      ) : null}

      {status && permitted ? (
        <section
          aria-labelledby="capture-tools"
          className="rounded-lg border border-border p-4 text-xs"
        >
          <h2 id="capture-tools" className="sr-only">
            Capture tools
          </h2>
          <div
            className="mb-3 flex flex-wrap items-center gap-2"
            role="toolbar"
            aria-label="What to capture"
          >
            {TOOLS.filter((t) => t.id !== 'record' || status.canRecord).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tool === t.id}
                onClick={() => pickTool(t.id)}
                disabled={recording !== null}
              >
                {t.label}
              </button>
            ))}
            <span className="flex-1" />
            {tool !== 'record' ? (
              <label className="flex items-center gap-1">
                Delay
                <select
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value) as (typeof DELAYS)[number])}
                  aria-label="Delay"
                >
                  {DELAYS.map((d) => (
                    <option key={d} value={d}>
                      {d === 0 ? 'None' : `${d} s`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {countdown !== null ? (
            <p role="status" className="mb-2">
              Capturing in {countdown}…
            </p>
          ) : null}

          {recording ? (
            <div role="status" className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" aria-hidden />
              <span className="flex-1">Recording {recording.name}</span>
              <button type="button" onClick={() => void stopRecording()}>
                Stop recording
              </button>
            </div>
          ) : null}

          {tool === null ? <p className="text-muted-foreground">Pick what to capture.</p> : null}

          {tool === 'region' && !region && overlay === 'idle' ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-muted-foreground">
                Freezes the screen under the pointer, then you drag the region to keep — on the
                screen itself.
              </p>
              <button type="button" disabled={busy || countdown !== null} onClick={freeze}>
                Freeze screen
              </button>
            </div>
          ) : null}

          {overlay === 'open' ? (
            <p role="status" className="text-muted-foreground">
              Drag on the screen to choose a region — Enter takes the whole screen, Escape cancels.
            </p>
          ) : null}

          {(tool === 'screen' || tool === 'window' || tool === 'record') && !recording ? (
            sources === null ? (
              <p className="text-muted-foreground">
                Looking for {tool === 'window' ? 'windows' : 'screens'}…
              </p>
            ) : sources.length === 0 ? (
              <p className="text-muted-foreground">Nothing to capture was found.</p>
            ) : (
              <ul
                className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                aria-label={tool === 'window' ? 'Windows' : 'Screens'}
              >
                {sources.map((source) => (
                  <li key={source.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-1 rounded border border-border p-2 text-left"
                      disabled={busy || countdown !== null}
                      onClick={() => (tool === 'record' ? void record(source) : takeStill(source))}
                      aria-label={`${tool === 'record' ? 'Record' : 'Capture'} ${source.name}`}
                    >
                      {source.thumbnail ? (
                        <img
                          src={source.thumbnail}
                          alt=""
                          className="aspect-video w-full rounded object-cover"
                        />
                      ) : null}
                      <span className="truncate">{source.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>
      ) : null}

      {region ? (
        <RegionPicker
          frame={region}
          onCapture={(rect) => void finishRegion(rect)}
          onCancel={cancelRegion}
        />
      ) : null}

      {error || state.overlayError ? (
        <p role="alert" className="text-xs text-destructive">
          {error ?? state.overlayError}
        </p>
      ) : null}

      <section
        aria-labelledby="capture-recent"
        className="rounded-lg border border-border p-4 text-xs"
      >
        <h2 id="capture-recent" className="mb-2 text-sm font-medium">
          Recent captures
        </h2>
        {captures.length === 0 ? (
          <p className="text-muted-foreground">No captures yet.</p>
        ) : (
          <div className="flex flex-col gap-3 md:flex-row">
            <ul className="grid flex-1 grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Captures">
              {captures.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={selected === item.id}
                    aria-label={describe(item)}
                    className="block w-full overflow-hidden rounded border border-border"
                    onClick={() => setSelected(item.id)}
                  >
                    {item.kind === 'screenshot' ? (
                      <img
                        src={captureFileUrl(item.fileName)}
                        alt=""
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <span className="flex aspect-video w-full items-center justify-center bg-muted">
                        ▶︎
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {current && status ? (
              <aside aria-label="Preview" className="flex w-full flex-col gap-2 md:w-72">
                {current.kind === 'screenshot' ? (
                  <img
                    src={captureFileUrl(current.fileName)}
                    alt={current.sourceName ?? 'Screenshot'}
                    className="w-full rounded border border-border"
                  />
                ) : (
                  <video
                    src={captureFileUrl(current.fileName)}
                    controls
                    className="w-full rounded border border-border"
                  />
                )}
                <p className="text-muted-foreground">{describe(current)}</p>
                <div className="flex flex-wrap gap-2">
                  {current.kind === 'screenshot' ? (
                    <button type="button" onClick={() => void api?.copy({ id: current.id })}>
                      Copy
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void api?.reveal({ id: current.id })}>
                    Show in Finder
                  </button>
                  <button type="button" onClick={() => void remove(current)}>
                    Delete
                  </button>
                </div>
                <SendTo item={current} status={status} />
              </aside>
            ) : null}
          </div>
        )}
      </section>

      <ClipboardSection
        enabled={clipboard.enabled}
        entries={clipboard.entries}
        onToggle={(enabled) => void changeSettings({ clipboardHistory: enabled })}
      />

      {status ? <SettingsSection status={status} onChange={changeSettings} /> : null}
    </div>
  );
}
