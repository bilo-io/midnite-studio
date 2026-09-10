import { randomUUID } from 'node:crypto';

import type { BrowserWindow } from 'electron';

import {
  EVENT_CHANNELS,
  failure,
  type CompanionUiAction,
  type CompanionUiReplyResult,
} from '@midnite/studio-shared';

/**
 * The tree's first main→renderer request/reply (Phase 81 Theme F, Decision
 * 12). Every other push in this direction is `menu.ts`'s one-way
 * `webContents.send(EVENT_CHANNELS.menuCommand, …)` — a native menu item
 * dispatched like a keybinding, with no reply because a menu click and its
 * effect are the same gesture. An MCP tool call is not: the whole value of
 * `ui.navigate`/`ui.command` to an agent is learning whether a view changed,
 * a command ran, or the renderer declined — so this needs an answer, and
 * this module is the smallest thing that can produce one.
 *
 * A pending map keyed by a request id, a 5 s timeout, and one rule that
 * makes both of those meaningful: it always targets `getMainWindow()`,
 * **never** `BrowserWindow.getFocusedWindow()`. `menu.ts` may reach for the
 * focused window because a native menu item is by definition on it; an
 * agent's request did not come from any window the user was looking at, so
 * "whichever window happens to be focused" is not the same question as
 * "the app's one main window" — and answering the wrong one would let an
 * agent steer a popout the user never asked it to touch.
 */

const REQUEST_TIMEOUT_MS = 5_000;

type PendingEntry = {
  resolve: (result: CompanionUiReplyResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, PendingEntry>();

/** Set once at boot (`main/index.ts`, alongside `registerMcpServer`) — the same thunk `registerWindowHandlers` and every other main-window consumer already share. */
let mainWindowGetter: (() => BrowserWindow | null) | null = null;

export function configureUiBridge(getMainWindow: () => BrowserWindow | null): void {
  mainWindowGetter = getMainWindow;
}

/**
 * Send one action to the main window and wait for its reply.
 *
 * Resolves with a `GitOpResult` failure — never rejects — for every way this
 * can fail to produce an answer: no main window at all (every window closed,
 * possible on macOS with the dock icon still running), or a reply that never
 * arrives within {@link REQUEST_TIMEOUT_MS}. A refusal the renderer *chose*
 * to send (a `confirm`-tier command, a locked screen, an unknown view) is a
 * perfectly normal reply and resolves the same promise with `ok: true` and
 * the renderer's own message folded into whichever `did` shape it answered
 * with — `ui-requests.ts` is what decides that, not this module.
 */
export function requestUiAction(action: CompanionUiAction): Promise<CompanionUiReplyResult> {
  const win = mainWindowGetter?.() ?? null;
  if (!win || win.isDestroyed()) {
    return Promise.resolve(failure('Midnite Studio has no open window right now.'));
  }

  const id = randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(failure('the window did not answer'));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    win.webContents.send(EVENT_CHANNELS.companionUiRequest, { id, action });
  });
}

/** The renderer's half of the round trip — `companion-handlers.ts`'s `companionUiReply` listener calls this with whatever it received. */
export function resolveUiReply(id: string, result: CompanionUiReplyResult): void {
  const entry = pending.get(id);
  if (!entry) return; // Already timed out, or a reply for a request this process never sent.
  clearTimeout(entry.timer);
  pending.delete(id);
  entry.resolve(result);
}

/** Test-only: the pending map and the registered getter otherwise survive across a suite's test cases. */
export function resetUiBridgeForTests(): void {
  for (const entry of pending.values()) clearTimeout(entry.timer);
  pending.clear();
  mainWindowGetter = null;
}
