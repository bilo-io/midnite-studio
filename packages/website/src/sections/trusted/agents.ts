import type { CSSProperties } from 'react';
import { SiCline, SiCursor, SiGithubcopilot, SiOpencode } from 'react-icons/si';

import {
  AiderIcon,
  AntigravityIcon,
  ClaudeIcon,
  CodexIcon,
  KiloIcon,
  OpenClaudeIcon,
} from './icons';

/**
 * A mark, as the marquee needs it: a component taking a class and a style.
 *
 * Declared structurally rather than as `react-icons`' own `IconType`, which is
 * what lets a hand-held SVG from `./icons` sit in the same array as a set glyph
 * without either of them knowing about the other. `strokeWidth` is in the type
 * because react-icons' components accept it; the local marks accept and ignore
 * it, since they are filled rather than stroked.
 */
export type AgentIcon = (props: {
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}) => React.ReactNode;

export type SiteAgent = {
  /** Matches the roster id in `packages/shared/src/terminal.ts`. */
  id: string;
  /** The product's own name, as it is written. */
  label: string;
  /**
   * The agent's brand colour, verbatim from its `accent` in the app's roster.
   *
   * It is what the selected logo glows in, so it has to be the *brand's* colour
   * and not a site token — the whole point of the cycle is that each logo
   * lights up as itself.
   */
  color: string;
  Icon: AgentIcon;
  /**
   * `true` when the mark carries its own colours and cannot be tinted, so the
   * marquee must not set `color` on it and the glow has to come from `color`
   * above rather than from the artwork. Only Antigravity's does.
   */
  multicolour?: boolean;
};

/**
 * The agents the app can run, for the banner.
 *
 * **A copy of `BUILTIN_AGENTS`, not an import of it.** `@midnite/studio-shared`
 * is technically importable here (the eslint boundary allows it), and this was
 * still the wrong thing to reach for: the roster entries carry `command`,
 * `args`, `resume`, `install` and a set of pty activity regexes — everything a
 * terminal needs and nothing a logo does. Importing it would put those regexes
 * in a marketing bundle and, worse, make a marquee row break when someone
 * retunes a spinner pattern. What the banner needs is three fields, and three
 * fields are cheap to keep honest: `id`, `label` and `color` below are verbatim
 * from `packages/shared/src/terminal.ts`.
 *
 * **The list is the roster and nothing else.** No logo here belongs to a
 * product the app cannot actually launch — a banner of borrowed brands is the
 * one thing this section must not become.
 *
 * Order is the roster's own, which is roughly "how much of the build it has
 * done" and reads fine as a shuffle to anyone who does not know that.
 */
export const SITE_AGENTS: readonly SiteAgent[] = [
  { id: 'claude', label: 'Claude', color: '#D97757', Icon: ClaudeIcon },
  {
    id: 'agy',
    label: 'Antigravity',
    color: '#4285F4',
    Icon: AntigravityIcon,
    multicolour: true,
  },
  { id: 'codex', label: 'Codex', color: '#10A37F', Icon: CodexIcon },
  { id: 'cursor', label: 'Cursor', color: '#0066FF', Icon: SiCursor },
  { id: 'copilot', label: 'Copilot', color: '#6E40C9', Icon: SiGithubcopilot },
  { id: 'openclaude', label: 'OpenClaude', color: '#8B5CF6', Icon: OpenClaudeIcon },
  { id: 'opencode', label: 'OpenCode', color: '#03B000', Icon: SiOpencode },
  { id: 'kilo', label: 'Kilo Code', color: '#FF5500', Icon: KiloIcon },
  { id: 'aider', label: 'Aider', color: '#D93838', Icon: AiderIcon },
  { id: 'cline', label: 'Cline', color: '#5F52FF', Icon: SiCline },
];
