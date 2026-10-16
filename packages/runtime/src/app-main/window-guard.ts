/**
 * Keeps an app's window on the app (Phase 113).
 *
 * Every suite app's window carries a preload bridge, so whatever page that window shows can call the
 * app's IPC channels. A suite app never browses: a link a doc, a deck or a chat renders is for the
 * system browser. So a window refuses both ways out — a `window.open` / `target=_blank` gets no
 * child window, and a plain `<a href>` cannot navigate the page in place — and an `http(s)` link is
 * handed to the system browser instead. Anything else (`file:`, `javascript:`, a custom scheme) is
 * simply dropped.
 *
 * Structural types only: the runtime never imports `electron`, so this is tested under bare vitest.
 */
export type GuardableWebContents = {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void;
  on(event: 'will-navigate', listener: (event: { preventDefault(): void; url?: string }, url?: string) => void): unknown;
  getURL(): string;
};

/** True for a link the system browser should open. */
export function isExternalLink(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** The document a URL names, without its hash: an in-page `#anchor` jump is not a navigation away. */
function documentOf(url: string): string {
  const hash = url.indexOf('#');
  return hash === -1 ? url : url.slice(0, hash);
}

export function guardAppWindow(
  contents: GuardableWebContents,
  options: { openExternal: (url: string) => unknown },
): void {
  const handOff = (url: string): void => {
    if (isExternalLink(url)) void options.openExternal(url);
  };
  contents.setWindowOpenHandler(({ url }) => {
    handOff(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, legacyUrl) => {
    const url = event.url ?? legacyUrl ?? '';
    // The dev server's reload and an in-page anchor stay on the same document; everything else leaves it.
    if (documentOf(url) === documentOf(contents.getURL())) return;
    event.preventDefault();
    handOff(url);
  });
}
