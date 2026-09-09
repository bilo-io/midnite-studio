import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

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
  /**
   * Replace the open confirm's blast radius once it has been counted.
   *
   * The optional second argument replaces `warnings` in the same patch —
   * Phase 74's Trash confirm recomputes its own count AND its own warning
   * lines (bytes freed, oldest-modified date) from the same freshly-fetched
   * summary, so both need to land in one state update rather than two.
   */
  setBlastRadius: (radius: ConfirmRequest['blastRadius'], warnings?: string[]) => void;
  prompt: (request: PromptRequest) => void;
  close: () => void;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error('useDialogs must be used inside <DialogHost>');
  return api;
}

/*
  Plain module state, mirrored beside the three `useState`s below rather than
  read from them — Phase 81 Theme C's "the command's own dialogs survive
  untouched" check (`handoff.ts`'s `runAndReport`) runs from *outside* React,
  synchronously right after a `CommandEntry.run()` that may have opened one of
  these (`closeSessionWithConfirm` calls `dialogs.confirm(...)` inline, with no
  await in between). A React state read cannot serve that: it only reflects
  what has been committed, and the whole point here is to see a call that
  happened earlier in the same tick, before the next render.
*/
let menuOpen = false;
let confirmOpen = false;
let promptOpen = false;

/** How many of the host's overlays are open right now — 0 to 3. */
export function overlayDepth(): number {
  return (menuOpen ? 1 : 0) + (confirmOpen ? 1 : 0) + (promptOpen ? 1 : 0);
}

export function DialogHost({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);
  // Incremented only by `confirm()`/`notify()`, i.e. a genuinely new request —
  // never by `setBlastRadius`'s patch of an already-open one. Keying
  // `<ConfirmDialog>` on it is what lets `requireAck`'s checkbox reset for a
  // new confirm without also resetting when an async blast-radius count lands.
  const [confirmSeq, setConfirmSeq] = useState(0);

  // The three mirrors are module state (see `overlayDepth` above), so a host
  // that unmounts without closing everything — a test's `unmount()`, a route
  // change in a harness that swaps the whole tree — must not leak an open flag
  // into whatever mounts a `<DialogHost>` next.
  useEffect(() => {
    return () => {
      menuOpen = false;
      confirmOpen = false;
      promptOpen = false;
    };
  }, []);

  const closeMenu = useCallback(() => {
    menuOpen = false;
    setMenu(null);
  }, []);
  const closeConfirm = useCallback(() => {
    confirmOpen = false;
    setConfirmRequest(null);
  }, []);
  const closePrompt = useCallback(() => {
    promptOpen = false;
    setPromptRequest(null);
  }, []);

  const close = useCallback(() => {
    menuOpen = false;
    confirmOpen = false;
    promptOpen = false;
    setMenu(null);
    setConfirmRequest(null);
    setPromptRequest(null);
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      openMenu: (event, items) => {
        menuOpen = true;
        setMenu({ position: { x: event.clientX, y: event.clientY }, items });
      },
      confirm: (request) => {
        // Opening a confirm closes the menu that raised it — leaving both up
        // reads as two competing focus targets.
        menuOpen = false;
        confirmOpen = true;
        setMenu(null);
        setConfirmRequest(request);
        setConfirmSeq((n) => n + 1);
      },
      notify: ({ title, body, okLabel }) => {
        menuOpen = false;
        confirmOpen = true;
        setMenu(null);
        setConfirmSeq((n) => n + 1);
        setConfirmRequest({
          title,
          ...(body ? { body } : {}),
          confirmLabel: okLabel ?? 'OK',
          hideCancel: true,
          // Explicitly null, not absent: absent means "still being counted"
          // and would put a "Checking what this affects…" line under a notice
          // that affects nothing.
          blastRadius: null,
          onConfirm: () => closeConfirm(),
        });
      },
      setBlastRadius: (blastRadius, warnings) =>
        setConfirmRequest((current) =>
          current ? { ...current, blastRadius, ...(warnings ? { warnings } : {}) } : current,
        ),
      prompt: (request) => {
        menuOpen = false;
        promptOpen = true;
        setMenu(null);
        setPromptRequest(request);
      },
      close,
    }),
    [close, closeConfirm],
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {menu ? (
        <ContextMenu position={menu.position} items={menu.items} onClose={closeMenu} />
      ) : null}
      {confirmRequest ? (
        <ConfirmDialog
          key={confirmSeq}
          request={{
            ...confirmRequest,
            onConfirm: () => {
              confirmRequest.onConfirm();
              closeConfirm();
            },
          }}
          onCancel={closeConfirm}
        />
      ) : null}
      {promptRequest ? (
        <PromptDialog
          request={{
            ...promptRequest,
            onConfirm: (value) => {
              promptRequest.onConfirm(value);
              closePrompt();
            },
          }}
          onCancel={closePrompt}
        />
      ) : null}
    </DialogContext.Provider>
  );
}
