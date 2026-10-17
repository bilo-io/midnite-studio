import { useState } from 'react';
import { createStore, useStore } from 'zustand';
import { LuTriangleAlert } from 'react-icons/lu';

import type { BlastRadiusKind, ConfirmRequest, FrameDialogs, FrameMenuEntry, FramePromptRequest } from '../chrome/types';
import { KitContextMenu } from './context-menu';
import { KitPromptDialog } from './prompt-dialog';

/** What the blast-radius line says, per kind of thing about to be lost. */
export const BLAST_RADIUS_COPY: Record<BlastRadiusKind, { noun: string; consequence: string }> = {
  commits: { noun: 'commit', consequence: 'will no longer be reachable from any branch.' },
  files: { noun: 'item', consequence: 'will be moved to the trash.' },
  trash: { noun: 'item', consequence: 'will be permanently deleted — this cannot be undone.' },
  systemCache: { noun: 'cache', consequence: 'will be moved to the trash.' },
  secrets: { noun: 'secret value', consequence: 'will be written to a local, gitignored file.' },
  issue: { noun: 'issue', consequence: 'will be affected.' },
  project: { noun: 'project', consequence: 'will be affected.' },
};

type DialogState = {
  request: ConfirmRequest | null;
  prompt?: FramePromptRequest | null;
  /** An open context menu (Phase 113 Theme S): where it opened and what it lists. */
  menu?: { x: number; y: number; items: FrameMenuEntry[] } | null;
};

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
  const copy = BLAST_RADIUS_COPY[request.blastRadiusKind ?? 'commits'];
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
            {request.danger ? (
              <LuTriangleAlert aria-hidden className="h-4 w-4 text-destructive" />
            ) : null}
            <span className={request.danger ? 'text-destructive' : ''}>{request.title}</span>
          </h2>
          {request.body ? <p className="text-xs text-muted-foreground">{request.body}</p> : null}
          {radius ? (
            <p
              role="status"
              className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs"
            >
              {radius.count} {copy.noun}
              {radius.count === 1 ? '' : 's'} {copy.consequence}
            </p>
          ) : null}
          {request.warnings?.map((w) => (
            <p
              key={w}
              className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs"
            >
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
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-xs hover:bg-accent"
            >
              Cancel
            </button>
          )}
          {request.secondaryLabel ? (
            <button
              type="button"
              onClick={request.onSecondary}
              className="rounded px-3 py-1.5 text-xs hover:bg-accent"
            >
              {request.secondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            disabled={Boolean(request.requireAck) && !acked}
            onClick={onConfirm ?? request.onConfirm}
            className={`rounded px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
              request.danger
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-primary text-primary-foreground'
            }`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One dialog store per app, with the real confirm: `confirm` parks the request and
 * `DialogHost` renders it; `onConfirm` fires only from the dialog's own button.
 */
export function createDialogs() {
  const store = createStore<DialogState>(() => ({ request: null }));
  const close = () => store.setState({ request: null, prompt: null, menu: null });
  const closeMenu = () => store.setState({ menu: null });
  const dialogs: FrameDialogs = {
    confirm: (request) => store.setState({ request }),
    prompt: (prompt) => store.setState({ prompt }),
    openMenu: (point, items) => store.setState({ menu: { x: point.clientX, y: point.clientY, items } }),
    notify: (notice) =>
      store.setState({
        request: {
          title: notice.title,
          body: notice.body,
          confirmLabel: notice.okLabel ?? 'OK',
          hideCancel: true,
          onConfirm: () => {},
        },
      }),
    setBlastRadius: (blastRadius, warnings) =>
      store.setState((s) => (s.request ? { request: { ...s.request, blastRadius, warnings } } : s)),
    close,
  };
  function useDialogs(): FrameDialogs {
    return dialogs;
  }
  function DialogHost() {
    const request = useStore(store, (s) => s.request);
    const prompt = useStore(store, (s) => s.prompt ?? null);
    const menu = useStore(store, (s) => s.menu ?? null);
    // A menu closes before the row it ran opens its dialog, so the two never stack.
    if (menu) return <KitContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />;
    if (prompt) return <KitPromptDialog request={prompt} onCancel={close} />;
    if (!request) return null;
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
  return { useDialogs, DialogHost, ConfirmDialog, store };
}
