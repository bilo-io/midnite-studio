import type { editor } from 'monaco-editor';
import { z } from 'zod';

import type { ITheme } from '@xterm/xterm';

import { githubDark } from '../presets/github-dark';
import { githubLight } from '../presets/github-light';
import { ANSI_KEYS, type StudioPalette, type StudioToken } from '../theme-types';

/**
 * Client-side VS Code theme JSON → `StudioPalette` importer (Theme E). No
 * network, no IPC channel — the settings page reads the file with a plain
 * `FileReader` and hands the raw text straight to `importVsCodeTheme`, which
 * owns its own size check and `JSON.parse` rather than trusting the caller to
 * have done either. A result envelope, not a throw, mirroring the app's
 * `GitOpResult` convention (`git-engine`'s `{ok:true}`/`{ok:false,…}` shape) so
 * the settings page renders a reason rather than adding a try/catch of its own.
 */
export type ImportVsCodeThemeResult =
  | { ok: true; palette: StudioPalette }
  | { ok: false; reason: string };

/** VS Code enforces no upper bound on a theme file; this one is arbitrary but
 * generous — real themes (even ones with hundreds of `tokenColors` rules) are
 * a few hundred KB at most, so 2 MB catches a pasted-wrong-file mistake rather
 * than a legitimately large theme. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * `$schema`-agnostic (VS Code themes carry no version marker worth pinning
 * to), `type` optional because many real themes omit it (default `'dark'`),
 * `colors`/`tokenColors` optional-with-default so an omitted key does not fail
 * validation on its own — the domain-level "both empty" check below is what
 * actually rejects a theme with nothing worth importing.
 */
const TokenColorSettingsSchema = z
  .object({
    foreground: z.string().optional(),
    background: z.string().optional(),
    fontStyle: z.string().optional(),
  })
  .partial();

const TokenColorSchema = z.object({
  scope: z.union([z.string(), z.array(z.string())]).optional(),
  settings: TokenColorSettingsSchema.optional(),
});

const VsCodeThemeSchema = z
  .object({
    name: z.string().optional(),
    type: z.enum(['dark', 'light']).optional(),
    colors: z.record(z.string()).optional().default({}),
    tokenColors: z.array(TokenColorSchema).optional().default([]),
  })
  .passthrough();

type VsCodeTheme = z.infer<typeof VsCodeThemeSchema>;

/** Strips a leading `#` and any alpha suffix (`#rrggbbaa` → `rrggbb`) — the
 * hex shape Monaco's `ITokenThemeRule`/`colors` values use, matching every
 * built-in preset (`{ token: 'comment', foreground: '8b949e', … }`). */
function toMonacoHex(hex: string): string {
  const clean = hex.replace(/^#/, '');
  return clean.length > 6 ? clean.slice(0, 6) : clean;
}

/**
 * Hex (`#rrggbb` or `#rrggbbaa`, `#` optional, 3-digit shorthand accepted) →
 * an HSL triplet without the `hsl()` wrapper (`"240 6% 10%"`), matching
 * `theme-types.ts`'s `isHslTriplet` and `tailwind.config.ts`'s own
 * `hsl(var(--token))` wrapping. Returns `undefined` for anything that is not
 * recognisably hex, so a caller can skip the token rather than write garbage.
 */
export function hexToHslTriplet(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  const clean = hex.replace(/^#/, '');
  let normalized: string;
  if (clean.length === 3) {
    normalized = clean
      .split('')
      .map((c) => c + c)
      .join('');
  } else if (clean.length === 6 || clean.length === 8) {
    normalized = clean.slice(0, 6);
  } else {
    return undefined;
  }
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return undefined;

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  // One decimal place, matching the built-in presets' own values
  // ("240 10% 3.9%") — `Math.round(x * 10) / 10` is what keeps a repeating
  // binary fraction (e.g. 0.1 + 0.2) from surfacing as a long tail of digits.
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return `${round1(h * 360)} ${round1(s * 100)}% ${round1(l * 100)}%`;
}

/** `scope` may be a single string, an array, or (less commonly but seen in
 * the wild) one comma-separated string — flattening all three shapes into one
 * rule per scope is "the single most common reason a naive importer renders a
 * theme grey" (Theme E's own framing). */
function flattenScopes(scope: string | string[] | undefined): string[] {
  if (!scope) return [];
  const list = Array.isArray(scope) ? scope : [scope];
  return list
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function mapTokenColors(tokenColors: VsCodeTheme['tokenColors']): editor.ITokenThemeRule[] {
  const rules: editor.ITokenThemeRule[] = [];
  for (const entry of tokenColors) {
    for (const scope of flattenScopes(entry.scope)) {
      const rule: editor.ITokenThemeRule = { token: scope };
      if (entry.settings?.foreground) rule.foreground = toMonacoHex(entry.settings.foreground);
      if (entry.settings?.background) rule.background = toMonacoHex(entry.settings.background);
      if (entry.settings?.fontStyle) rule.fontStyle = entry.settings.fontStyle;
      rules.push(rule);
    }
  }
  return rules;
}

/**
 * `colors.*` → `chrome` tokens. "At minimum" the doc's own five
 * (`editor.background`/`editor.foreground`/`sideBar.background`/
 * `focusBorder`/`panel.border`); the rest are best-effort fallback chains onto
 * the closest VS Code workbench colour, and any candidate that is not
 * recognisably hex is skipped rather than written as garbage — a palette's
 * `chrome` is `Partial`, and an omitted token restores `@bilo-io/ui`'s own
 * value (`use-palette-sync.ts`'s `removeProperty`) rather than stranding one.
 */
function mapChrome(colors: Record<string, string>): Partial<Record<StudioToken, string>> {
  const chrome: Partial<Record<StudioToken, string>> = {};
  const set = (token: StudioToken, ...candidates: (string | undefined)[]) => {
    for (const candidate of candidates) {
      const hsl = hexToHslTriplet(candidate);
      if (hsl) {
        chrome[token] = hsl;
        return;
      }
    }
  };

  set('--background', colors['editor.background']);
  set('--foreground', colors['editor.foreground']);
  set('--card', colors['sideBar.background'], colors['editor.background']);
  set('--card-foreground', colors['sideBar.foreground'], colors['editor.foreground']);
  set('--popover', colors['dropdown.background'], colors['editor.background']);
  set('--popover-foreground', colors['dropdown.foreground'], colors['editor.foreground']);
  set('--border', colors['panel.border'], colors['editorWidget.border']);
  set('--input', colors['input.border'], colors['panel.border']);
  set('--ring', colors['focusBorder']);
  set('--primary', colors['button.background'], colors['focusBorder']);
  set('--primary-foreground', colors['button.foreground'], colors['editor.background']);
  set('--secondary', colors['list.hoverBackground'], colors['sideBar.background']);
  set('--secondary-foreground', colors['editor.foreground']);
  set('--muted', colors['input.background'], colors['sideBar.background']);
  set('--muted-foreground', colors['descriptionForeground'], colors['editor.foreground']);
  set('--accent', colors['list.activeSelectionBackground'], colors['focusBorder']);
  set('--accent-foreground', colors['editor.foreground']);
  set('--destructive', colors['errorForeground'], colors['editorError.foreground']);
  set('--destructive-foreground', colors['editor.background']);
  // `--radius` is a length, never a colour (see `theme-types.ts`) — no VS
  // Code colour maps to it, and none of the built-in presets set it either.

  return chrome;
}

/** VS Code's own `terminal.ansi*` colour ids, in `ANSI_KEYS` order. */
const ANSI_COLOR_IDS: Record<(typeof ANSI_KEYS)[number], string> = {
  black: 'terminal.ansiBlack',
  red: 'terminal.ansiRed',
  green: 'terminal.ansiGreen',
  yellow: 'terminal.ansiYellow',
  blue: 'terminal.ansiBlue',
  magenta: 'terminal.ansiMagenta',
  cyan: 'terminal.ansiCyan',
  white: 'terminal.ansiWhite',
  brightBlack: 'terminal.ansiBrightBlack',
  brightRed: 'terminal.ansiBrightRed',
  brightGreen: 'terminal.ansiBrightGreen',
  brightYellow: 'terminal.ansiBrightYellow',
  brightBlue: 'terminal.ansiBrightBlue',
  brightMagenta: 'terminal.ansiBrightMagenta',
  brightCyan: 'terminal.ansiBrightCyan',
  brightWhite: 'terminal.ansiBrightWhite',
};

/** `colors['terminal.ansi*']` → the 16 ANSI keys, falling back to the
 * matching built-in GitHub palette's own ANSI set for any the theme omits —
 * "most do omit several" (Theme E). Background/foreground/cursor fall back
 * the same way rather than to `undefined`, which xterm would render as black
 * on black. */
function mapTerminal(colors: Record<string, string>, appearance: 'dark' | 'light'): ITheme {
  const fallback = (appearance === 'dark' ? githubDark : githubLight).terminal;
  const theme: ITheme = {
    background: colors['terminal.background'] ?? colors['editor.background'] ?? fallback.background,
    foreground: colors['terminal.foreground'] ?? colors['editor.foreground'] ?? fallback.foreground,
    cursor: colors['terminalCursor.foreground'] ?? fallback.cursor,
    selectionBackground: colors['terminal.selectionBackground'] ?? fallback.selectionBackground,
  };
  for (const key of ANSI_KEYS) {
    (theme as Record<string, string | undefined>)[key] =
      colors[ANSI_COLOR_IDS[key]] ?? (fallback as Record<string, string | undefined>)[key];
  }
  return theme;
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  return slug || 'imported';
}

/**
 * `importVsCodeTheme(json: unknown)`: a raw file's text (the settings page's
 * `FileReader` result) is handled directly — size and `JSON.parse` both
 * happen here — while an already-parsed value (as the test fixtures below
 * pass) skips straight to validation. Either way the result is the same
 * envelope, never a throw.
 */
export function importVsCodeTheme(json: unknown): ImportVsCodeThemeResult {
  let raw: unknown;

  if (typeof json === 'string') {
    const byteLength = new TextEncoder().encode(json).length;
    if (byteLength > MAX_BYTES) {
      return { ok: false, reason: 'File too large (over 2 MB)' };
    }
    try {
      raw = JSON.parse(json);
    } catch {
      return { ok: false, reason: 'Malformed JSON' };
    }
  } else {
    raw = json;
  }

  const parsedResult = VsCodeThemeSchema.safeParse(raw);
  if (!parsedResult.success) {
    const issue = parsedResult.error.issues[0];
    return {
      ok: false,
      reason: issue
        ? `Not a VS Code theme (${issue.path.join('.') || 'root'}: ${issue.message})`
        : 'Not a VS Code theme',
    };
  }
  const parsed = parsedResult.data;

  if (Object.keys(parsed.colors).length === 0 && parsed.tokenColors.length === 0) {
    return { ok: false, reason: 'Empty theme: no colors or tokenColors found' };
  }

  const appearance: 'dark' | 'light' = parsed.type ?? 'dark';
  const label = parsed.name ?? 'Imported Theme';
  const id = `vscode-${slugify(parsed.name ?? 'imported')}`;

  const palette: StudioPalette = {
    id,
    label,
    appearance,
    chrome: mapChrome(parsed.colors),
    terminal: mapTerminal(parsed.colors, appearance),
    editor: {
      base: appearance === 'dark' ? 'vs-dark' : 'vs',
      rules: mapTokenColors(parsed.tokenColors),
      // Monaco's `defineTheme` colour ids overlap almost entirely with VS
      // Code's own `colors` map (both are "workbench colour id → hex"), so
      // the parsed map is forwarded as-is rather than re-derived — Monaco
      // silently ignores any id it does not recognise.
      colors: parsed.colors,
    },
    // No general TextMate → Shiki conversion exists (Decision 8) — an
    // imported theme maps to the nearest bundled Shiki theme by `type`,
    // recorded as a known limitation rather than guessed at more precisely.
    highlight: appearance === 'dark' ? 'github-dark' : 'github-light',
  };

  return { ok: true, palette };
}
