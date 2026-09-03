import type { WorkflowNode } from '@midnite/studio-shared';
import { LuLink } from 'react-icons/lu';

import { useDemoApiStatus, useStartDemoApi, useStopDemoApi } from './use-demo-api';

/**
 * "Demo API · running on :&lt;port&gt; · [stop]" / "Demo API · stopped ·
 * [start]" — the Workflows canvas toolbar's own control for the local
 * `node:http` server Phase 43 Theme D built to build/test `http` nodes
 * against. Lives beside the Run History control (`workflows-view.tsx`), not
 * in Settings — the settings page (Theme I) covers workflow-run defaults,
 * not a per-session dev server toggle.
 */
export function DemoApiPill({
  selectedNode,
  onInsertUrl,
}: {
  selectedNode: WorkflowNode | null;
  onInsertUrl: (baseUrl: string) => void;
}) {
  const status = useDemoApiStatus();
  const start = useStartDemoApi();
  const stop = useStopDemoApi();

  // Never undefined: `useDemoApiStatus` sets `initialData`.
  const data = status.data;
  const port = data.running ? data.port : null;
  const baseUrl = port !== null ? `http://127.0.0.1:${port}` : null;
  const pending = start.isPending || stop.isPending;

  return (
    <div className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-border px-1.5 py-1 text-[11px] text-muted-foreground">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${data.running ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`}
      />
      <span>Demo API{data.running ? ` · running on :${port}` : ' · stopped'}</span>
      {baseUrl !== null && selectedNode?.kind === 'http' ? (
        <button
          type="button"
          title="Insert base URL into the selected node"
          onClick={() => onInsertUrl(baseUrl)}
          className="rounded px-1 hover:bg-accent hover:text-foreground"
        >
          <LuLink aria-hidden className="h-3 w-3" />
        </button>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => (data.running ? stop.mutate() : start.mutate())}
        className="rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        {data.running ? 'stop' : 'start'}
      </button>
    </div>
  );
}
