import { useState } from 'react';
import { createStore, useStore } from 'zustand';
import { LuTriangleAlert } from 'react-icons/lu';

import type { BlastRadiusKind, ConfirmRequest, FrameDialogs } from '@midnite/studio-frame';

/**
 * Cleaner's dialogs: the frame's `useDialogs()` port, backed by a real confirm.
 *
 * Every Cleaner action is destructive, and CLAUDE.md requires a confirm showing
 * the blast radius before one runs — so unlike a stub, `confirm` here parks the
 * request in a store and `CleanerDialogHost` renders it. `onConfirm` fires only
 * from the dialog's own button.
 */
type DialogState = { request: ConfirmRequest | null };
export const dialogStore = createStore<DialogState>(() => ({ request: null }));

const COPY: Record<BlastRadiusKind, { noun: string; consequence: string }> = {
  commits: { noun: 'commit', consequence: 'will no longer be reachable from any branch.' },
  files: { noun: 'item', consequence: 'will be moved to the trash.' },
  trash: { noun: 'item', consequence: 'will be permanently deleted — this cannot be undone.' },
  systemCache: { noun: 'cache', consequence: 'will be moved to the trash.' },
  secrets: { noun: 'secret value', consequence: 'will be written to a local, gitignored file.' },
  issue: { noun: 'issue', consequence: 'will be affected.' },
  project: { noun: 'project', consequence: 'will be affected.' },
};

export function useCleanerDialogs(): FrameDialogs {
  return {
    confirm: (request) => dialogStore.setState({ request }),
    notify: (notice) =>
      dialogStore.setState({
        request: {
          title: notice.title,
          body: notice.body,
          confirmLabel: notice.okLabel ?? 'OK',
          hideCancel: true,
          onConfirm: () => {},
        },
      }),
    setBlastRadius: (blastRadius, warnings) =>
      dialogStore.setState((s) => (s.request ? { request: { ...s.request, blastRadius, warnings } } : s)),
    close: () => dialogStore.setState({ request: null }),
  };
}

export function CleanerDialogHost() {
  const request = useStore(dialogStore, (s) => s.request);
  if (!request) return null;
  const close = () => dialogStore.setState({ request: null });
  return (
    <ConfirmDialog
      request={request}
      onCancel={close}
      onConfirm={() => {
        close();
        request.onConfirm();
      }}
    />
  );
}

export function ConfirmDialog({
  request,
  onCancel,
  onConfirm,
}: {
  request: ConfirmRequest;
  onCancel: () => void;
  onConfirm?: () => void;
}) {
  const [acked, setAcked] = useState(false);
  const copy = COPY[request.blastRadiusKind ?? 'commits'];
  const radius = request.blastRadius;
  return (
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        className={`w-full max-w-md rounded-lg border bg-popover shadow-xl ${
          request.danger ? 'border-destructive/60 ring-1 ring-destructive/25' : 'border-border'
        }`}
      >
        <div className="space-y-2 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {request.danger ? <LuTriangleAlert aria-hidden className="h-4 w-4 text-destructive" /> : null}
            <span className={request.danger ? 'text-destructive' : ''}>{request.title}</span>
          </h2>
          {request.body ? <p className="text-xs text-muted-foreground">{request.body}</p> : null}
          {radius ? (
            <p role="status" className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs">
              {radius.count} {copy.noun}
              {radius.count === 1 ? '' : 's'} {copy.consequence}
            </p>
          ) : null}
          {request.warnings?.map((w) => (
            <p key={w} className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs">
              {w}
            </p>
          ))}
          {request.requireAck ? (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} />
              {request.requireAck}
            </label>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-3">
          {request.hideCancel ? null : (
            <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-xs hover:bg-accent">
              Cancel
            </button>
          )}
          {request.secondaryLabel ? (
            <button type="button" onClick={request.onSecondary} className="rounded px-3 py-1.5 text-xs hover:bg-accent">
              {request.secondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            disabled={Boolean(request.requireAck) && !acked}
            onClick={onConfirm ?? request.onConfirm}
            className={`rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
              request.danger ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'
            }`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
