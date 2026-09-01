import type { ILink, Terminal } from '@xterm/xterm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  attachTerminalLinks,
  findLinks,
  type LinkBuffer,
  type LinkCell,
  type LinkLine,
} from './terminal-links';

/** Cmd, not Ctrl — `isMac()` reads `navigator.platform`. */
const platform = Object.getOwnPropertyDescriptor(navigator, 'platform');
beforeAll(() => {
  Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
});
afterAll(() => {
  if (platform) Object.defineProperty(navigator, 'platform', platform);
});

/**
 * One buffer row of single-width cells.
 *
 * A blank cell reports `''` from `getChars()`, exactly as xterm's does — the
 * flattener is what turns that back into a space, and a stub that handed it a
 * literal ' ' would never exercise it.
 */
const row = (text: string, cols: number, isWrapped = false): LinkLine => ({
  isWrapped,
  getCell: (x) =>
    x >= cols ? undefined : { getChars: () => text[x] ?? '', getWidth: () => 1 },
});

const buffer = (lines: LinkLine[]): LinkBuffer => ({ getLine: (y) => lines[y] });

describe('findLinks', () => {
  it('finds a URL in a row and reports its cells 1-based, end inclusive', () => {
    const found = findLinks(buffer([row('see https://a.io/x now', 40)]), 0, 40);

    expect(found).toHaveLength(1);
    expect(found[0]?.text).toBe('https://a.io/x');
    // 'see ' occupies columns 0-3, so the URL starts at column 4 (1-based 5) and
    // its 14th and last character sits at 1-based 18.
    expect(found[0]?.range).toEqual({ start: { x: 5, y: 1 }, end: { x: 18, y: 1 } });
  });

  it('leaves trailing interpunction and brackets out of the link', () => {
    const found = findLinks(buffer([row('(https://a.io/x), done.', 40)]), 0, 40);

    expect(found.map((link) => link.text)).toEqual(['https://a.io/x']);
  });

  it('finds every URL on the row', () => {
    const found = findLinks(buffer([row('https://a.io and https://b.io/y', 40)]), 0, 40);

    expect(found.map((link) => link.text)).toEqual(['https://a.io', 'https://b.io/y']);
  });

  it('joins a URL wrapped across rows into one link', () => {
    const lines = [row('https://a.', 10), row('io/x done', 10, true)];

    // Hovering either half answers with the whole thing.
    for (const hovered of [0, 1]) {
      const found = findLinks(buffer(lines), hovered, 10);
      expect(found).toHaveLength(1);
      expect(found[0]?.text).toBe('https://a.io/x');
      expect(found[0]?.range).toEqual({ start: { x: 1, y: 1 }, end: { x: 4, y: 2 } });
    }
  });

  it('does not run past a row that is not a continuation', () => {
    // Two unrelated rows that would read as one URL if joined blindly.
    const found = findLinks(buffer([row('https://a.', 10), row('io/x', 10)]), 0, 10);

    expect(found.map((link) => link.text)).toEqual(['https://a']);
  });

  it('rejects text the URL parser will not take', () => {
    const lines = [row('http:// ftp://a.io/x https://', 40)];

    expect(findLinks(buffer(lines), 0, 40)).toEqual([]);
  });

  it('counts a wide glyph as the two cells it occupies', () => {
    // '漢' occupies columns 0-1: one cell of width 2, then the null spacer.
    const cells: (LinkCell | undefined)[] = [
      { getChars: () => '漢', getWidth: () => 2 },
      { getChars: () => '', getWidth: () => 0 },
      ...[...'https://a.io'].map((char) => ({ getChars: () => char, getWidth: () => 1 })),
    ];
    const line: LinkLine = { isWrapped: false, getCell: (x) => cells[x] };

    const found = findLinks({ getLine: (y) => (y === 0 ? line : undefined) }, 0, 40);

    expect(found[0]?.text).toBe('https://a.io');
    expect(found[0]?.range.start).toEqual({ x: 3, y: 1 });
  });
});

/**
 * A terminal stubbed down to what `attachTerminalLinks` touches.
 *
 * The point of testing against a stub rather than a real `Terminal` is the
 * contract: what the provider hands back, and what it does with a mouse event.
 * Whether xterm then paints the underline is xterm's own tested business — but
 * `decorations` being a plain object here (real xterm swaps in a live accessor
 * on hover) is exactly why the modifier writes through it rather than replacing
 * it wholesale.
 */
function stubTerminal(lines: LinkLine[], cols = 40) {
  const registered: { provider?: Parameters<Terminal['registerLinkProvider']>[0] } = {};
  let disposed = false;
  const term = {
    cols,
    buffer: { active: buffer(lines) },
    options: {} as Terminal['options'],
    registerLinkProvider: (provider: Parameters<Terminal['registerLinkProvider']>[0]) => {
      registered.provider = provider;
      return {
        dispose: () => {
          disposed = true;
        },
      };
    },
  };
  return {
    term: term as unknown as Terminal,
    options: term.options,
    provider: () => registered.provider,
    providerDisposed: () => disposed,
  };
}

const linksOn = (stub: ReturnType<typeof stubTerminal>, bufferLine: number): ILink[] => {
  let links: ILink[] | undefined;
  stub.provider()?.provideLinks(bufferLine, (result) => {
    links = result;
  });
  return links ?? [];
};

const meta = (down: boolean) =>
  new KeyboardEvent(down ? 'keydown' : 'keyup', { key: 'Meta', metaKey: down });

describe('attachTerminalLinks', () => {
  it('opens a link on Cmd+click and ignores a bare click', () => {
    const stub = stubTerminal([row('https://a.io/x', 40)]);
    const open = vi.fn();
    attachTerminalLinks(stub.term, open);

    const link = linksOn(stub, 1)[0];
    expect(link?.text).toBe('https://a.io/x');

    link?.activate(new MouseEvent('click', { button: 0 }), link.text);
    expect(open).not.toHaveBeenCalled();

    link?.activate(new MouseEvent('click', { button: 0, metaKey: true }), link.text);
    expect(open).toHaveBeenCalledWith('https://a.io/x');
  });

  it('ignores a Cmd+click from any button but the primary one', () => {
    const stub = stubTerminal([row('https://a.io/x', 40)]);
    const open = vi.fn();
    attachTerminalLinks(stub.term, open);

    const link = linksOn(stub, 1)[0];
    link?.activate(new MouseEvent('mouseup', { button: 1, metaKey: true }), link.text);

    expect(open).not.toHaveBeenCalled();
  });

  it('decorates nothing until the modifier goes down', () => {
    const stub = stubTerminal([row('https://a.io/x', 40)]);
    attachTerminalLinks(stub.term, vi.fn());

    const link = linksOn(stub, 1)[0];
    expect(link?.decorations).toEqual({ underline: false, pointerCursor: false });

    // Hovered first, modifier second: the decoration has to be pushed onto the
    // link that is already under the cursor, not just computed at provide time.
    link?.hover?.(new MouseEvent('mousemove'), link.text);
    window.dispatchEvent(meta(true));
    expect(link?.decorations).toEqual({ underline: true, pointerCursor: true });

    window.dispatchEvent(meta(false));
    expect(link?.decorations).toEqual({ underline: false, pointerCursor: false });
  });

  it('underlines a link hovered while the modifier is already down', () => {
    const stub = stubTerminal([row('https://a.io/x', 40)]);
    attachTerminalLinks(stub.term, vi.fn());

    window.dispatchEvent(meta(true));
    expect(linksOn(stub, 1)[0]?.decorations).toEqual({ underline: true, pointerCursor: true });
  });

  it('drops the modifier when the window loses focus', () => {
    const stub = stubTerminal([row('https://a.io/x', 40)]);
    attachTerminalLinks(stub.term, vi.fn());

    const link = linksOn(stub, 1)[0];
    link?.hover?.(new MouseEvent('mousemove'), link.text);
    window.dispatchEvent(meta(true));
    window.dispatchEvent(new Event('blur'));

    expect(link?.decorations).toEqual({ underline: false, pointerCursor: false });
  });

  it('leaves a link alone once the mouse has left it', () => {
    const stub = stubTerminal([row('https://a.io/x', 40)]);
    attachTerminalLinks(stub.term, vi.fn());

    const link = linksOn(stub, 1)[0];
    link?.hover?.(new MouseEvent('mousemove'), link.text);
    link?.leave?.(new MouseEvent('mousemove'), link.text);
    window.dispatchEvent(meta(true));

    expect(link?.decorations).toEqual({ underline: false, pointerCursor: false });
  });

  it('routes OSC 8 hyperlinks through the same gate', () => {
    const stub = stubTerminal([row('', 40)]);
    const open = vi.fn();
    attachTerminalLinks(stub.term, open);

    const handler = stub.options.linkHandler;
    expect(handler?.allowNonHttpProtocols).toBe(false);

    handler?.activate(new MouseEvent('click', { button: 0 }), 'https://b.io', {
      start: { x: 1, y: 1 },
      end: { x: 1, y: 1 },
    });
    expect(open).not.toHaveBeenCalled();

    handler?.activate(new MouseEvent('click', { button: 0, metaKey: true }), 'https://b.io', {
      start: { x: 1, y: 1 },
      end: { x: 1, y: 1 },
    });
    expect(open).toHaveBeenCalledWith('https://b.io');
  });

  it('unhooks everything on dispose', () => {
    const stub = stubTerminal([row('https://a.io/x', 40)]);
    attachTerminalLinks(stub.term, vi.fn()).dispose();

    expect(stub.providerDisposed()).toBe(true);
    expect(stub.options.linkHandler).toBeNull();
    // No listener left behind to write into a disposed terminal.
    expect(() => window.dispatchEvent(meta(true))).not.toThrow();
  });
});
