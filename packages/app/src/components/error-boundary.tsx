import { Component, useEffect, useReducer, type ErrorInfo, type ReactNode } from 'react';
import { LuCopy, LuRotateCcw, LuTriangleAlert } from 'react-icons/lu';

import { EmptyState } from './empty-state';
import { IconButton } from './icon-button';
import { reportError } from '../lib/report';
import { copyText } from '../services/queries';

/**
 * The renderer's one error boundary — Phase 60 Theme B.
 *
 * Before this, a throw anywhere under `App` blanked the entire window: 18
 * `lazy()` views, no boundary, and an Electron shell where the only recovery a
 * user has is discovering `Mod+R` by accident. A blank window is also what a
 * chunk 404 looks like after `desktop:dist` is installed over a running copy,
 * which is a normal thing to do and not a bug at all.
 *
 * **A class, and that is not legacy.** `getDerivedStateFromError` /
 * `componentDidCatch` have no hook equivalent in React 19 — this is the one
 * place in the renderer where a class is the current answer rather than an old
 * one.
 *
 * **It sits OUTSIDE `<Suspense>`, never inside.** A boundary nested inside the
 * suspense boundary it is meant to protect never sees the lazy import's
 * rejection: the promise rejects while the tree is suspended, and Suspense
 * re-throws it upward. Inside, a 404'd chunk hangs on an unresolved promise;
 * outside, it becomes this card with a working Try again.
 *
 * **Reporting goes to `lib/report.ts`, not to the console.** `packages/app`
 * carries `no-console: 'error'` and that rule is right — a packaged user has no
 * DevTools, so a console call is a report nobody can read. Phase 65 Theme C
 * built the durable path; `componentDidCatch` calls `reportError('boundary',
 * error, { componentStack })` and nothing else. Copy details is the other half:
 * what the user pastes into a bug report.
 */

export type ErrorBoundaryProps = {
  children: ReactNode;
  /**
   * Changing this clears a caught error.
   *
   * The view slot passes `resetKey={activeView}`, so navigating away from a
   * broken view and back gives it a fresh mount without a window reload.
   * Without it one throw poisons the slot for the rest of the session — the
   * user's only escape being the reload they had before this component
   * existed.
   *
   * The root/detached mount deliberately passes **none**: a popout has one
   * panel and no rail, so there is nothing to navigate away to and the Try
   * again button does the whole job.
   */
  resetKey?: string | number;
  /** Names what broke, in the card's title. `ALL_NAV_ITEMS` is the view slot's source. */
  label?: string;
  /**
   * Render nothing instead of the card.
   *
   * For the three optional modals (`FirstRunModal`, `OnboardingModal`,
   * `SlidesModal`), which already mount behind `fallback={null}`. A modal whose
   * chunk fails to load must not paint an error card over the app it was
   * optional to — it simply does not appear, exactly as it does not appear
   * while loading.
   */
  silent?: boolean;
};

type ErrorBoundaryState = { error: Error | null };

/** Long enough to identify the failure, short enough not to become the card. */
const MAX_BODY = 200;

function truncate(message: string): string {
  return message.length <= MAX_BODY ? message : `${message.slice(0, MAX_BODY - 1)}…`;
}

/* ------------------------------------------------------------------ *
 * Dev-only throw hook — Phase 60 Decision 5, resolved as "it ships,
 * gated".
 *
 * `e2e/error-boundary.spec.ts` needs a way to make a real, mounted view
 * throw; there is no honest way to do that from outside the page. So
 * the hook exists, behind `import.meta.env.DEV`, which Vite replaces
 * with the literal `false` in a production build — the assignment below
 * lands inside `if (false)` and is dropped, identifier and all, before
 * `desktop:dist` ever sees it. (Verified by grepping the built assets;
 * `__mstudioTestThrow` does not appear in them.)
 *
 * The throw happens in a CHILD of the boundary, not in the boundary's
 * own render, because a boundary cannot catch itself. `label` is
 * required and matched exactly, so a test targets one boundary rather
 * than whichever happens to render first — the modals' boundaries are
 * silent, and a stray hit on one of those would look like nothing
 * happening at all.
 * ------------------------------------------------------------------ */

declare global {
  interface Window {
    /**
     * Dev/e2e only: make the boundary labelled `label` catch a thrown error.
     * Absent from a production build.
     */
    __mstudioTestThrow?: (label: string, message?: string) => void;
  }
}

let throwOrder: { label: string; message: string } | null = null;
const throwProbes = new Set<() => void>();

function DevThrowProbe({ label, children }: { label: string | undefined; children: ReactNode }) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    throwProbes.add(bump);
    return () => {
      throwProbes.delete(bump);
    };
  }, []);
  // Read during render on purpose: throwing from an effect is not something a
  // boundary can catch.
  if (throwOrder !== null && throwOrder.label === label) throw new Error(throwOrder.message);
  return <>{children}</>;
}

if (import.meta.env.DEV) {
  window.__mstudioTestThrow = (label: string, message?: string) => {
    throwOrder = { label, message: message ?? `forced throw in ${label}` };
    for (const bump of throwProbes) bump();
  };
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    // A thrown non-`Error` is rare and entirely legal; normalising here means
    // the fallback always has a `message` to show.
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError('boundary', error, { componentStack: info.componentStack ?? undefined });
    // The order has been served — otherwise Try again would re-throw forever.
    if (import.meta.env.DEV && throwOrder?.label === this.props.label) throwOrder = null;
  }

  override componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error !== null) {
      this.setState({ error: null });
    }
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  private readonly copy = (): void => {
    const { error } = this.state;
    if (error === null) return;
    // Through the bridge (`copyText`), not `navigator.clipboard`: the packaged
    // app loads from `file://`, which the Async Clipboard API refuses.
    void copyText(`${error.message}\n\n${error.stack ?? '(no stack)'}`);
  };

  override render(): ReactNode {
    const { error } = this.state;
    const { children, label, silent } = this.props;

    if (error !== null) {
      if (silent === true) return null;
      return (
        <div
          role="alert"
          className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6"
        >
          <div>
            <EmptyState
              icon={LuTriangleAlert}
              title={`${label ?? 'This view'} stopped rendering`}
              body={truncate(error.message)}
            />
          </div>
          {/*
            No stack on screen. It is unreadable in a 300px pane and it is not
            what the user is deciding between — Try again or carry on elsewhere
            is. Copy details is what a bug report actually needs.
          */}
          <div className="flex items-center gap-2">
            <IconButton icon={LuRotateCcw} label="Try again" onClick={this.retry}>
              <span className="px-1 text-xs">Try again</span>
            </IconButton>
            <IconButton icon={LuCopy} label="Copy details" onClick={this.copy}>
              <span className="px-1 text-xs">Copy details</span>
            </IconButton>
          </div>
        </div>
      );
    }

    if (import.meta.env.DEV) {
      return <DevThrowProbe label={label}>{children}</DevThrowProbe>;
    }
    return children;
  }
}
