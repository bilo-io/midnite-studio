import type { IDisposable, ILink, ILinkProvider, Terminal } from '@xterm/xterm';

import { isMac } from '../../services/keybindings/chord';

/**
 * Clickable URLs in terminal output.
 *
 * xterm renders its rows to a canvas (the WebGL renderer — see `terminal-view`),
 * so there is no anchor element to click and no browser default to lean on: a
 * URL in `git push`'s output is pixels. The only way in is xterm's own link
 * provider API, which asks a provider for the ranges on a row and then handles
 * hover decorations and activation itself.
 *
 * Two link sources, one destination:
 *
 * 1. **Plain text URLs** — matched out of the row by this module's provider.
 * 2. **OSC 8 hyperlinks** — the `ESC ] 8 ; ; <url>` markup `gh`, `npm` and
 *    friends emit, which xterm parses itself and hands to `options.linkHandler`.
 *    Without a handler it falls back to `window.open`, which main's
 *    `setWindowOpenHandler` denies-and-forwards; routing it here instead means
 *    both kinds of link take the same modifier gate and the same opener.
 *
 * Activation is Cmd+click (Ctrl elsewhere), the same contract VS Code's terminal
 * uses, because a bare click in a terminal already means "place the selection" —
 * and a stray click on a build log should never launch a browser. The underline
 * follows the modifier rather than the mouse: hovering decorates nothing until
 * the modifier goes down, at which point the link under the cursor underlines
 * and the cursor turns into a pointer. That is the affordance — it says "this
 * one, now" — and it keeps output that happens to contain URLs from lighting up
 * while you are only reading it.
 */

/**
 * What counts as a URL in raw output.
 *
 * Taken from xterm's own `addon-web-links` (MIT), whose end clause is the part
 * worth keeping: everything up to whitespace or a quote, minus trailing
 * interpunction and brackets, so `see https://example.com/a.` links `.../a` and
 * `(https://example.com)` does not swallow the paren. `(https?|HTTPS?)` rather
 * than an `i` flag so `Https://` — which no terminal emits — stays unmatched
 * alongside the two spellings that do.
 */
const URL_REGEX =
  /(https?|HTTPS?):[/]{2}[^\s"'!*(){}|\\^<>`]*[^\s"':,.!?{}|\\^~[\]`()<>]/g;

/** How far a wrapped URL is followed off the hovered row, in either direction. */
const MAX_WRAP_ROWS = 12;

/** The slice of `IBufferCell` this module reads — enough to fake in a test. */
export interface LinkCell {
  getChars(): string;
  getWidth(): number;
}

/** The slice of `IBufferLine` this module reads. */
export interface LinkLine {
  readonly isWrapped: boolean;
  getCell(x: number): LinkCell | undefined;
}

/** The slice of `IBuffer` this module reads. */
export interface LinkBuffer {
  getLine(y: number): LinkLine | undefined;
}

/** One matched URL, in xterm's 1-based, right-inclusive range convention. */
export interface FoundLink {
  text: string;
  range: { start: { x: number; y: number }; end: { x: number; y: number } };
}

/** A single cell's contribution to the flattened block string. */
interface CharCell {
  /** 0-based column. */
  x: number;
  /** 0-based buffer row. */
  y: number;
  /** Cells occupied — 2 for a wide (CJK/emoji) glyph. */
  width: number;
}

/**
 * Does this string parse as an http(s) URL that starts where it claims to?
 *
 * The regex is deliberately loose, so the `URL` constructor is the arbiter. The
 * prefix check is xterm's: `new URL` happily accepts things whose serialized
 * origin bears little resemblance to the input (`http://foo@` and friends), and
 * comparing the input against the reconstructed base rejects those without a
 * second parser.
 */
function isWebUrl(candidate: string): boolean {
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const credentials = url.username
      ? `${url.username}${url.password ? `:${url.password}` : ''}@`
      : '';
    const base = `${url.protocol}//${credentials}${url.host}`;
    return candidate.toLowerCase().startsWith(base.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Flatten the wrapped block containing `row` into a string, keeping the cell
 * each character came from.
 *
 * A URL longer than the pane is not one row's problem: the shell wrapped it
 * across several, and matching per row would linkify `https://github.com/bi` and
 * leave `lo-io/midnite-studio` inert. `isWrapped` marks a row as the
 * continuation of the one above, which is what makes the block walkable in both
 * directions.
 *
 * Trailing blanks are dropped per row so the halves of a wrapped URL meet. A
 * continuation row means the row above was written through its last column, so
 * blanks there are the one-cell gap a wide glyph leaves when it does not fit —
 * never real spaces. (Output that pads a full row with literal spaces before
 * wrapping is glued too; a URL cannot contain a space, so what survives the
 * regex is not a URL either.)
 *
 * Positions are recorded per character rather than derived from the index,
 * because a wide glyph is one character across two cells and a combining mark is
 * two characters in one — index arithmetic drifts the moment output is not
 * plain ASCII.
 */
function flattenBlock(
  buffer: LinkBuffer,
  row: number,
  cols: number,
): { text: string; cells: CharCell[] } {
  let top = row;
  while (top > 0 && row - top < MAX_WRAP_ROWS && buffer.getLine(top)?.isWrapped) top -= 1;

  let bottom = row;
  while (bottom - row < MAX_WRAP_ROWS && buffer.getLine(bottom + 1)?.isWrapped) bottom += 1;

  let text = '';
  const cells: CharCell[] = [];

  for (let y = top; y <= bottom; y += 1) {
    const line = buffer.getLine(y);
    if (!line) continue;

    let rowText = '';
    const rowCells: CharCell[] = [];
    for (let x = 0; x < cols; x += 1) {
      const cell = line.getCell(x);
      if (!cell) break;
      const width = cell.getWidth();
      // The null spacer that follows a wide glyph: no character of its own.
      if (width === 0) continue;
      const chars = cell.getChars() || ' ';
      rowText += chars;
      // One entry per UTF-16 unit, not per code point: `cells` is indexed by
      // `String.matchAll`'s indices, and a surrogate pair or a combining mark
      // would slide every position after it out of step.
      for (let i = 0; i < chars.length; i += 1) rowCells.push({ x, y, width });
    }

    const trimmed = rowText.replace(/ +$/, '');
    text += trimmed;
    cells.push(...rowCells.slice(0, trimmed.length));
  }

  return { text, cells };
}

/**
 * Every URL on the wrapped block containing `row` (0-based), as buffer ranges.
 *
 * Pure and exported for its own test: this is the half that can be wrong in ways
 * a screenshot cannot show — an off-by-one column, a wrapped URL cut in half, a
 * trailing bracket dragged into the href.
 */
export function findLinks(buffer: LinkBuffer, row: number, cols: number): FoundLink[] {
  const { text, cells } = flattenBlock(buffer, row, cols);
  const found: FoundLink[] = [];

  for (const match of text.matchAll(URL_REGEX)) {
    const url = match[0];
    if (match.index === undefined || !isWebUrl(url)) continue;

    const first = cells[match.index];
    const last = cells[match.index + url.length - 1];
    if (!first || !last) continue;

    found.push({
      text: url,
      // 1-based, and `end` names the last cell inclusive — so a wide final glyph
      // contributes both of its columns.
      range: {
        start: { x: first.x + 1, y: first.y + 1 },
        end: { x: last.x + last.width, y: last.y + 1 },
      },
    });
  }

  return found;
}

/** Cmd on macOS, Ctrl elsewhere — and only a left click ever opens anything. */
function hasOpenModifier(event: MouseEvent | KeyboardEvent): boolean {
  return isMac() ? event.metaKey : event.ctrlKey;
}

/**
 * Wire clickable links into one terminal. Dispose with the terminal.
 *
 * `open` is injected rather than imported so this module stays independent of
 * how the app opens a URL — the renderer hands it `openExternal`, a test hands
 * it a spy.
 */
export function attachTerminalLinks(term: Terminal, open: (url: string) => void): IDisposable {
  let modifierDown = false;
  /**
   * The link the mouse is currently over, if any.
   *
   * Held so a modifier pressed *after* the mouse settled still decorates it.
   * xterm replaces `link.decorations` with a live-tracked accessor once the link
   * is hovered, so assigning through it is what repaints the underline —
   * assigning a whole new `decorations` object would replace that accessor and
   * repaint nothing.
   */
  let hovered: ILink | undefined;

  const setModifier = (down: boolean): void => {
    if (down === modifierDown) return;
    modifierDown = down;
    if (!hovered?.decorations) return;
    hovered.decorations.underline = down;
    hovered.decorations.pointerCursor = down;
  };

  const onKey = (event: KeyboardEvent): void => setModifier(hasOpenModifier(event));
  // Cmd+Tab away with the key still down: the keyup lands in another window, so
  // without this the pane comes back believing the modifier is held.
  const onBlur = (): void => setModifier(false);

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  window.addEventListener('blur', onBlur);

  const activate = (event: MouseEvent, url: string): void => {
    if (event.button !== 0 || !hasOpenModifier(event)) return;
    open(url);
  };

  const provider: ILinkProvider = {
    provideLinks: (bufferLineNumber, callback) => {
      const found = findLinks(term.buffer.active, bufferLineNumber - 1, term.cols);
      callback(
        found.map(({ text, range }) => {
          const link: ILink = {
            text,
            range,
            decorations: { underline: modifierDown, pointerCursor: modifierDown },
            activate,
            hover: () => {
              hovered = link;
            },
            leave: () => {
              if (hovered === link) hovered = undefined;
            },
          };
          return link;
        }),
      );
    },
  };

  const registration = term.registerLinkProvider(provider);

  /*
    OSC 8 links come with xterm's own decorations, which are unconditional — one
    kind of link that underlines on a bare hover. Left alone deliberately: the
    program marked those bytes up AS a link, so announcing them is its call, and
    the part that matters here is that opening one still needs the modifier.
  */
  term.options.linkHandler = {
    activate,
    allowNonHttpProtocols: false,
  };

  return {
    dispose: () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('blur', onBlur);
      registration.dispose();
      term.options.linkHandler = null;
      hovered = undefined;
    },
  };
}
