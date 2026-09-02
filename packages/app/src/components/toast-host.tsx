import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Toast, type ToastRequest } from './toast';

/**
 * The toast primitive (Phase 22 Theme H) — shaped after `DialogHost`
 * (`dialog-host.tsx`): one host, mounted once in `app.tsx`, owns a stack that
 * any feature can push onto through `useToasts()` rather than each feature
 * rendering its own popup.
 *
 * Non-modal (no backdrop, no focus trap — the app underneath stays fully
 * usable) and stacking (several toasts can be up at once, newest at the
 * bottom of the stack the way most toast systems read). Escape dismisses only
 * the TOPMOST toast, one at a time, the same "closest thing first" rule the
 * dialog host's Escape follows for its own single dialog.
 *
 * Every toast auto-dismisses — 8s if it carries an action (long enough to
 * read and decide on Undo), 4s for a plain notice — per the phase doc's
 * recommendation. Dismissal (auto or manual) removes the NOTIFICATION only;
 * an Undo action's capability lives on the journal entry that raised it
 * (`services/use-journal.ts`), found from the History view long after its
 * toast is gone.
 */
type ToastEntry = { id: string; request: ToastRequest };

export type ToastApi = {
  /** Push a toast onto the stack. Returns its id, for a caller that wants to
   *  dismiss it early (none does today; kept for parity with `dismiss`). */
  show: (request: ToastRequest) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToasts(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToasts must be used inside <ToastHost>');
  return api;
}

const DURATION_WITH_ACTION_MS = 8000;
const DURATION_PLAIN_MS = 4000;

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const show = useCallback(
    (request: ToastRequest) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, request }]);
      const durationMs = request.action ? DURATION_WITH_ACTION_MS : DURATION_PLAIN_MS;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      );
      return id;
    },
    [dismiss],
  );

  // Every pending timer is cleared on unmount — the host is mounted once for
  // the app's lifetime, but this keeps a hot-reload or a future conditional
  // mount from leaking timers onto toasts nothing can dismiss any more.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const topmost = toasts[toasts.length - 1];
      if (topmost) dismiss(topmost.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toasts, dismiss]);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
        Fixed to the viewport, not the content column — an Undo toast has to
        stay reachable regardless of which view is active when it fires, the
        same reasoning `DialogHost`'s menu/confirm/prompt already follow.
        `pointer-events-none` on the wrapper and `pointer-events-auto` back on
        each toast is what lets clicks fall through the gaps between toasts to
        whatever is underneath.
      */}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-toast flex flex-col items-end gap-2"
        aria-live="polite"
      >
        {toasts.map((entry) => (
          <Toast
            key={entry.id}
            request={entry.request}
            onDismiss={() => dismiss(entry.id)}
            onAction={() => {
              entry.request.action?.onAction();
              dismiss(entry.id);
            }}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export type { ToastAction, ToastRequest } from './toast';
