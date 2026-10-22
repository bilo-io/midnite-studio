import { createHash } from 'node:crypto';

import { clickFixPreview, matchClickFixCommand, type ClickFixMatch } from '@midnite/studio-shared';

/**
 * The ClickFix clipboard watch (Phase 117 Theme G).
 *
 * A ClickFix page puts a shell command on the clipboard and tells the user to paste it into Terminal.
 * Main polls the system clipboard (`clipboard.readText()`, never a page API) and checks for that
 * shape. It is scoped so it does not become a clipboard monitor:
 *
 * - **Only while a Browser window is focused.** No read happens otherwise. The first read after the
 *   window regains focus only sets a baseline, because whatever changed meanwhile changed elsewhere.
 * - **At most 1 Hz.**
 * - **Only a hash is kept.** The text is examined when its hash changes and is then dropped.
 * - **Only after a page interaction.** A change counts when a tab has had the user's focus or input
 *   within {@link PAGE_INTERACTION_WINDOW_MS}. Copying a command from the user's own notes in another
 *   app does not raise the bar.
 *
 * A hit raises the "This page just put a command on your clipboard" bar, which offers a one-click
 * clear. The shape matcher lives in `shared/clickfix.ts`, so Phase 120's system-wide rule reuses it.
 */

export const CLIPBOARD_POLL_MS = 1000;
export const PAGE_INTERACTION_WINDOW_MS = 5000;

export type ClipboardHit = { tabId: string; origin: string; match: ClickFixMatch; preview: string };

export type ClipboardWatchDeps = {
  readText(): string;
  /** Whether to look at all: the setting is on and a Browser window is focused. */
  isActive(): boolean;
  /** The tab the user interacted with within the window, with its page origin; else `null`. */
  recentPageInteraction(): { tabId: string; origin: string } | null;
  onHit(hit: ClipboardHit): void;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
};

export type ClipboardWatch = { start(): void; stop(): void; tick(): void };

export function hashClipboardText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function createClipboardWatch(deps: ClipboardWatchDeps): ClipboardWatch {
  let lastHash: string | null = null;
  let handle: unknown = null;
  const every = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const cancel = deps.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));

  const tick = (): void => {
    if (!deps.isActive()) {
      lastHash = null;
      return;
    }
    let text: string;
    try {
      text = deps.readText();
    } catch {
      return;
    }
    const hash = hashClipboardText(text);
    const previous = lastHash;
    lastHash = hash;
    if (previous === null || previous === hash) return;
    const page = deps.recentPageInteraction();
    if (!page) return;
    const match = matchClickFixCommand(text);
    if (match) deps.onHit({ tabId: page.tabId, origin: page.origin, match, preview: clickFixPreview(text) });
  };

  return {
    tick,
    start() {
      if (handle !== null) return;
      handle = every(tick, CLIPBOARD_POLL_MS);
    },
    stop() {
      if (handle === null) return;
      cancel(handle);
      handle = null;
      lastHash = null;
    },
  };
}
