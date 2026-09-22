import { Terminal } from '@xterm/xterm';
import { describe, expect, it } from 'vitest';

import type { ITheme } from '@xterm/xterm';

import { importVsCodeTheme } from './importers/vscode-theme-importer';
import synthwave84Json from './importers/__fixtures__/synthwave-84.json?raw';
import { ANSI_KEYS } from './theme-types';

/**
 * vitest/jsdom, not e2e (Phase 82's rule, same call as the rest of this
 * phase's guard tests): this needs a real `@xterm/xterm` v6 `Terminal` and
 * its real internal `ThemeService`, not a browser — proving xterm still
 * *reads* every `ITheme` key our theme engine and the VS Code importer
 * produce needs no GPU, layout or real DOM beyond jsdom's (the same
 * `new Terminal(); term.open(container)` pattern `terminal-links.test.ts`'s
 * "real v6 Terminal" describe block already uses, with no canvas mocking —
 * `vitest-setup.ts` already stubs `getContext` to `null` globally, which is
 * enough for the DOM renderer this exercises).
 *
 * Phase 88 Theme D: diffing v6's real `ITheme` (`xterm.d.ts`) against
 * `theme-types.ts`/`vscode-theme-importer.ts` found the delta is exactly
 * what Theme A's own Decisions already recorded — four new *optional* keys
 * (`scrollbarSliderBackground`, `scrollbarSliderHoverBackground`,
 * `scrollbarSliderActiveBackground`, `overviewRulerBorder`), additive,
 * nothing removed or renamed. Neither file needed a source edit, and the
 * phase doc's Decisions section already settled leaving the four new keys
 * defaulted rather than mapping them in the importer (VS Code's theme JSON
 * has no equivalent concept for any of them).
 *
 * `moon run app:typecheck` proves our `ITheme` producers still satisfy the
 * *type*. It proves nothing about whether xterm's real `ThemeService` still
 * *reads* every one of those keys at runtime — a future major could rename
 * or silently stop honouring one (exactly the class of break Theme E's
 * attach test exists for, one layer up) and every type check here would
 * stay green. This is that runtime half, for `ITheme` specifically:
 * construct a real v6 `Terminal`, read xterm's own `ThemeService.colors`
 * back out (not part of the public API — same internals-reach pattern as
 * `xterm-attach.test.ts`'s `_core._store`), and assert every key we set is
 * the key xterm actually applied.
 */

/** `ThemeService` (`browser/services/ThemeService.ts`) is xterm's own
 * internal home for the resolved theme — not exposed on the public
 * `Terminal` type, so this reaches through `_core` the same way the other
 * Theme B/E guard tests in this phase do. */
function themeColors(
  term: Terminal,
): Record<string, { css: string } | { css: string }[] | undefined> {
  return (
    term as unknown as {
      _core: {
        _themeService: { colors: Record<string, { css: string } | { css: string }[] | undefined> };
      };
    }
  )._core._themeService.colors;
}

function mount(theme: ITheme): Terminal {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const term = new Terminal({ theme });
  term.open(container);
  return term;
}

describe('ITheme, read by a real v6 Terminal', () => {
  it('threads every documented ITheme key into ThemeService.colors, including the four v6 added', () => {
    // Every key `ITheme` documents, each a distinct sentinel colour so a
    // mix-up (e.g. `cursor`/`cursorAccent` swapped) would also fail.
    // Fully-opaque 6-digit hex so `ThemeService`'s own colour math ports it
    // straight through as `.css` (see `Color.ts`'s `css.toColor`/`blend`) —
    // no rounding or alpha-forcing to account for here.
    const theme = {
      foreground: '#111111',
      background: '#222222',
      cursor: '#333333',
      cursorAccent: '#444444',
      selectionForeground: '#555555',
      scrollbarSliderBackground: '#666666',
      scrollbarSliderHoverBackground: '#777777',
      scrollbarSliderActiveBackground: '#888888',
      overviewRulerBorder: '#999999',
      black: '#000001',
      red: '#000002',
      green: '#000003',
      yellow: '#000004',
      blue: '#000005',
      magenta: '#000006',
      cyan: '#000007',
      white: '#000008',
      brightBlack: '#000009',
      brightRed: '#00000a',
      brightGreen: '#00000b',
      brightYellow: '#00000c',
      brightBlue: '#00000d',
      brightMagenta: '#00000e',
      brightCyan: '#00000f',
      brightWhite: '#000010',
    } satisfies ITheme;

    const term = mount(theme);
    const colors = themeColors(term);

    expect((colors.foreground as { css: string }).css).toBe(theme.foreground);
    expect((colors.background as { css: string }).css).toBe(theme.background);
    // Blended against background, but a fully-opaque source colour blends
    // through unchanged (`color.blend`'s `alpha === 1` shortcut) — still a
    // real assertion that xterm read the key, not a given.
    expect((colors.cursor as { css: string }).css).toBe(theme.cursor);
    expect((colors.cursorAccent as { css: string }).css).toBe(theme.cursorAccent);
    expect((colors.selectionForeground as { css: string }).css).toBe(theme.selectionForeground);
    expect((colors.scrollbarSliderBackground as { css: string }).css).toBe(
      theme.scrollbarSliderBackground,
    );
    expect((colors.scrollbarSliderHoverBackground as { css: string }).css).toBe(
      theme.scrollbarSliderHoverBackground,
    );
    expect((colors.scrollbarSliderActiveBackground as { css: string }).css).toBe(
      theme.scrollbarSliderActiveBackground,
    );
    expect((colors.overviewRulerBorder as { css: string }).css).toBe(theme.overviewRulerBorder);

    const ansi = colors.ansi as { css: string }[];
    for (const [index, key] of ANSI_KEYS.entries()) {
      expect(ansi[index]?.css, `ansi[${index}] (${key})`).toBe(theme[key]);
    }

    term.dispose();
  });

  it('a VS Code import threads its terminal palette into the same real ThemeService, end to end', () => {
    // Theme D's other checklist item: "confirm a VS Code theme import still
    // produces a valid terminal palette end to end" — not just that
    // `mapTerminal` returns the right strings (already covered by
    // `vscode-theme-importer.test.ts`), but that xterm's real v6
    // `ThemeService` actually applies every one of them.
    const result = importVsCodeTheme(synthwave84Json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const term = mount(result.palette.terminal);
    const colors = themeColors(term);

    expect((colors.foreground as { css: string }).css).toBe(result.palette.terminal.foreground);
    expect((colors.background as { css: string }).css).toBe(result.palette.terminal.background);

    const ansi = colors.ansi as { css: string }[];
    for (const [index, key] of ANSI_KEYS.entries()) {
      expect(ansi[index]?.css, `ansi[${index}] (${key})`).toBe(result.palette.terminal[key]);
    }

    term.dispose();
  });
});
