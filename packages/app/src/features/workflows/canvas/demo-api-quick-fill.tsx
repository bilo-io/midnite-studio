import { useState } from 'react';

import { LuChevronDown, LuLink } from 'react-icons/lu';

import { Popover } from '../../../components/popover';

/**
 * The `/demo/*` scripted route group (Phase 97 Theme M,
 * `packages/desktop/src/main/demo-api/scripted-routes.ts`) — listed here as
 * plain labels rather than imported, since `app` may not reach into
 * `desktop` (package boundary). Keep this list in sync with that file by
 * hand; `demo-api.test.ts` is what actually proves each route's behaviour.
 */
export const DEMO_API_QUICK_FILL_ROUTES: readonly { path: string; hint: string }[] = [
  { path: '/demo/echo', hint: 'echo — reflects method, query, headers and body back' },
  { path: '/demo/delay?ms=500', hint: 'delay?ms= — waits (capped) before responding' },
  { path: '/demo/fail-n?key=demo&n=2', hint: 'fail-n?key=&n= — fails the first n calls per key, then passes' },
  { path: '/demo/flaky?rate=0.5&seed=demo', hint: 'flaky?rate=&seed= — deterministic random pass/fail' },
  { path: '/demo/classify?risk=0.5', hint: 'classify?risk= — buckets a risk score into low/medium/high' },
  { path: '/demo/research/sales', hint: 'research/:lane — canned findings for a research lane' },
  { path: '/demo/verify?key=demo&passAfter=2', hint: 'verify?key=&passAfter= — passes once called passAfter times' },
];

/**
 * "Use demo API" — a popover beside the `http` form's URL field listing the
 * demo API's scripted routes (Theme M). Picking one inserts
 * `{{demo.baseUrl}}<path>` into the URL, replacing whatever was there — the
 * same reserved root `workflow-engine.ts`'s `runNode` resolves at run time.
 */
export function DemoApiQuickFill({ onInsert }: { onInsert: (url: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      label="Use demo API"
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      align="end"
      triggerClassName="flex h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      panelClassName="w-72 p-1"
      trigger={
        <>
          <LuLink className="h-3 w-3 shrink-0" aria-hidden />
          <span>Use demo API</span>
          <LuChevronDown className="h-3 w-3 shrink-0" aria-hidden />
        </>
      }
    >
      <div className="hide-scrollbar flex max-h-72 flex-col gap-0.5 overflow-auto">
        {DEMO_API_QUICK_FILL_ROUTES.map((route) => (
          <button
            key={route.path}
            type="button"
            onClick={() => {
              onInsert(`{{demo.baseUrl}}${route.path}`);
              setOpen(false);
            }}
            className="flex flex-col items-start gap-0.5 rounded px-2 py-1 text-left text-xs hover:bg-accent"
          >
            <span className="font-mono text-[11px] text-foreground">{route.path}</span>
            <span className="text-[10px] text-muted-foreground">{route.hint}</span>
          </button>
        ))}
      </div>
    </Popover>
  );
}
