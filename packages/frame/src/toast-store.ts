import { create } from 'zustand';

export type ToastStatus = 'info' | 'success' | 'warning' | 'error';

/**
 * An optional "and here is where to go about it" on a notification.
 *
 * A notification that names a thing the user can act on but leaves them to
 * find it is a worse notification. `onAction` runs in the renderer, so it can
 * only do renderer things — open a panel, select a tab — which is exactly the
 * scope this is for (Phase 35's waiting-loop notice opens the FAB on the tab
 * that is waiting).
 */
export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface Toast {
  id: string;
  message: string;
  status: ToastStatus;
  action?: ToastAction;
  /**
   * More buttons beside `action`, in order (Phase 121 Theme F's tripped-limit notice has three answers:
   * Resume, Stop, Raise limit). Rendered by the bell only; the transient toast stack shows `action` alone.
   */
  extraActions?: ToastAction[];
}

export interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  clearToasts: () => set({ toasts: [] }),
}));
