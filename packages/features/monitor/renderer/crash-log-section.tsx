import { bridge } from '@midnite/studio-frame';
import { useEffect, useState } from 'react';

/**
 * The crash log: where it lives and the redacted diagnostics block
 * (`reportBundle`) a user pastes into an issue. The sink is the composing
 * app's — a bridge without `report` shows the empty state.
 */
export function CrashLogSection() {
  const [path, setPath] = useState<string | null | undefined>(undefined);
  const [bundle, setBundle] = useState<string | null>(null);

  useEffect(() => {
    const report = bridge()?.report;
    if (!report) return setPath(null);
    void report.logPath().then((r) => setPath(r.path), () => setPath(null));
    void report.bundle().then((r) => setBundle(r.text), () => setBundle(null));
  }, []);

  const copy = () => {
    if (bundle) void navigator.clipboard?.writeText(bundle);
  };

  return (
    <section aria-labelledby="monitor-log" className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="monitor-log" className="text-sm font-medium">Crash log</h2>
        {bundle ? (
          <button type="button" onClick={copy} className="text-xs text-muted-foreground hover:text-foreground">
            Copy diagnostics
          </button>
        ) : null}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        {path === undefined ? 'Looking for the log…' : path ?? 'No log file this session.'}
      </p>
      {bundle ? (
        <pre aria-label="Recent log records" className="max-h-56 overflow-auto rounded bg-muted p-2 text-[11px]">{bundle}</pre>
      ) : null}
    </section>
  );
}
