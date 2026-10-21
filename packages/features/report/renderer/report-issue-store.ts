import { create } from 'zustand';

/**
 * Whether the app-wide Report an Issue dialog is open — the feature's own store, so an app needs no
 * slot in its own state to host it. `openReportIssue()` is what a command, a menu or a button calls;
 * `ReportIssueHost` renders the dialog over it.
 */
export type ReportIssueState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const useReportIssueStore = create<ReportIssueState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Open the app-wide dialog — from a palette command, a Help menu item, a button anywhere. */
export function openReportIssue(): void {
  useReportIssueStore.getState().setOpen(true);
}
