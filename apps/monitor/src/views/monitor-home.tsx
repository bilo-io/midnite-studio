import { Suspense, lazy, useCallback, useState } from 'react';
import { PiPulseFill } from 'react-icons/pi';

import { handOff } from '@midnite/studio-frame';
import { monitorViews } from '@midnite/studio-feature-monitor/renderer';

import { MONITOR_APP } from '../monitor-manifest';

// The feature's one view, kept in its own lazy chunk as the feature intends.
const MonitorPage = lazy(() => monitorViews.monitor().then((component) => ({ default: component })));

/** Monitor hosts only itself: a session lives in Studio, so opening one is a hand-off there. */
const HOSTED = new Set(['monitor'] as const);

/** What Monitor shows on open: the accent mark and name on top, the feature's view below. */
export function MonitorHome() {
  const [notice, setNotice] = useState<string | null>(null);
  const openSession = useCallback((id: string) => {
    void handOff({ app: 'studio', ref: { kind: 'session', id } }, { hosted: HOSTED }).then((outcome) =>
      setNotice(outcome.ok ? null : outcome.say),
    );
  }, []);
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: MONITOR_APP.accent }}
        >
          <PiPulseFill className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold leading-tight">{MONITOR_APP.name}</p>
        {notice ? (
          <p role="status" className="ml-auto text-xs text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </header>
      <main className="min-h-0 flex-1 overflow-auto" aria-label="Monitor">
        <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading the monitor…</p>}>
          <MonitorPage onOpenSession={openSession} />
        </Suspense>
      </main>
    </div>
  );
}
