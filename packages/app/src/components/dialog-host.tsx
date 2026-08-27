import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { ConfirmDialog, type ConfirmRequest } from './confirm-dialog';
import { ContextMenu, type MenuItem, type MenuPosition } from './context-menu';
import { PromptDialog, type PromptRequest } from './prompt-dialog';

/**
 * One place that owns the context menu, the confirm dialog and the prompt.
 *
 * A host rather than each feature rendering its own: only one of each can be
 * open at a time, they all need to close on Escape and on an outside click, and
 * a menu rendered inside a virtualized row would be unmounted the moment the
 * row scrolls out of view — taking the open menu with it.
 */
type MenuState = { position: MenuPosition; items: MenuItem[] } | null;

type DialogApi = {
  openMenu: (event: { clientX: number; clientY: number }, items: MenuItem[]) => void;
  confirm: (request: ConfirmRequest) => void;
  /**
   * A modal with one button and nothing to decide — a notice.
   *
   * Shares the confirm's box rather than introducing a second dialog shape:
   * the only difference is that there is no Cancel, because there is no
   * alternative to acknowledging it.
   */
  notify: (notice: { title: string; body?: string; okLabel?: string }) => void;
  /** Replace the open confirm's blast radius once it has been counted. */
  setBlastRadius: (radius: ConfirmRequest['blastRadius']) => void;
  prompt: (request: PromptRequest) => void;
  close: () => void;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error('useDialogs must be used inside <DialogHost>');
  return api;
}

export function DialogHost({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);

  const close = useCallback(() => {
    setMenu(null);
    setConfirmRequest(null);
    setPromptRequest(null);
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      openMenu: (event, items) => {
        setMenu({ position: { x: event.clientX, y: event.clientY }, items });
      },
      confirm: (request) => {
        // Opening a confirm closes the menu that raised it — leaving both up
        // reads as two competing focus targets.
        setMenu(null);
        setConfirmRequest(request);
      },
      notify: ({ title, body, okLabel }) => {
        setMenu(null);
        setConfirmRequest({
          title,
          ...(body ? { body } : {}),
          confirmLabel: okLabel ?? 'OK',
          hideCancel: true,
          // Explicitly null, not absent: absent means "still being counted"
          // and would put a "Checking what this affects…" line under a notice
          // that affects nothing.
          blastRadius: null,
          onConfirm: () => setConfirmRequest(null),
        });
      },
      setBlastRadius: (blastRadius) =>
        setConfirmRequest((current) => (current ? { ...current, blastRadius } : current)),
      prompt: (request) => {
        setMenu(null);
        setPromptRequest(request);
      },
      close,
    }),
    [close],
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {menu ? (
        <ContextMenu position={menu.position} items={menu.items} onClose={() => setMenu(null)} />
      ) : null}
      {confirmRequest ? (
        <ConfirmDialog
          request={{
            ...confirmRequest,
            onConfirm: () => {
              confirmRequest.onConfirm();
              setConfirmRequest(null);
            },
          }}
          onCancel={() => setConfirmRequest(null)}
        />
      ) : null}
      {promptRequest ? (
        <PromptDialog
          request={{
            ...promptRequest,
            onConfirm: (value) => {
              promptRequest.onConfirm(value);
              setPromptRequest(null);
            },
          }}
          onCancel={() => setPromptRequest(null)}
        />
      ) : null}
    </DialogContext.Provider>
  );
}
