import type { AppId } from '@midnite/studio-shared';
import { LuTerminal } from 'react-icons/lu';
import {
  SiAnthropic,
  SiCline,
  SiCursor,
  SiGithubcopilot,
  SiGooglecalendar,
  SiGooglegemini,
  SiMistralai,
  SiOllama,
  SiOpencode,
  SiSpotify,
  SiYoutube,
} from 'react-icons/si';

import type { IconComponent } from '../icon-button';
import { AiderIcon } from './aider-icon';
import { AntigravityIcon } from './antigravity-icon';
import { ClaudeIcon } from './claude-icon';
import { CodexIcon } from './codex-icon';
import { KiloIcon } from './kilo-icon';
import { OpenClaudeIcon } from './openclaude-icon';

/**
 * The one place an agent's `icon` key turns into a mark.
 *
 * `BUILTIN_AGENTS` promised that "adding one is an edit, not a release", and
 * for a phase the renderer did not keep its half of that: `SessionIcon`
 * hard-coded `<ClaudeIcon>` for *any* agent id, so a second entry in the roster
 * would have worn Claude's face. This registry is what makes the promise true —
 * a mark is roster data, resolved by key, exactly as `accent` already was.
 *
 * This is the one file that deliberately mixes the app's two icon families —
 * CLAUDE.md's "match the file you are editing" rule assumes a component with an
 * opinion, and fronting both is this module's entire job.
 */

/** The builtins' own marks, keyed as `AgentDefinition.icon ?? id`. */
const LOCAL_ICONS: Record<string, IconComponent> = {
  claude: ClaudeIcon,
  antigravity: AntigravityIcon,
  codex: CodexIcon,
  openclaude: OpenClaudeIcon,
  opencode: SiOpencode,
  kilo: KiloIcon,
  aider: AiderIcon,
  cursor: SiCursor,
  copilot: SiGithubcopilot,
  cline: SiCline,
};

/**
 * A curated slice of `react-icons`, so a user-added agent in `agents.json` can
 * name a brand mark without shipping an SVG — `{"icon": "SiGooglegemini"}`.
 *
 * An allow-list rather than a dynamic lookup, and this is not timidity:
 * `react-icons`' root barrel pulls every one of its ~30 sets, which CLAUDE.md
 * forbids for exactly that reason, and resolving an arbitrary name at runtime
 * would mean importing the whole `si` set to have something to resolve
 * *against*. Five named imports cost five icons. Growing this list is a
 * one-line edit, which is the same bargain the roster itself offers.
 *
 * Note there is no `SiOpenai`: react-icons 5.x does not ship one (`SiOpenaigym`
 * is a different project), which is why `codex-icon.tsx` carries OpenAI's mark
 * as a local path instead of importing it.
 */
const REACT_ICONS: Record<string, IconComponent> = {
  SiAnthropic,
  SiCline,
  SiCursor,
  SiGithubcopilot,
  SiGooglegemini,
  SiMistralai,
  SiOllama,
  SiOpencode,
};

export const AGENT_ICONS: Readonly<Record<string, IconComponent>> = {
  ...LOCAL_ICONS,
  ...REACT_ICONS,
};

/**
 * The mark for an agent, given its `icon` key and its `id`.
 *
 * `icon` defaults to `id`, which keeps the builtins from repeating themselves —
 * only `agy` names one, because "agy" is the command and "antigravity" is what
 * the mark is called.
 *
 * An unrecognised key falls back to `LuTerminal` rather than rendering
 * nothing: `agents.json` is a file a user hand-edits, and a typo there should
 * cost them their glyph, not their row.
 */
export function resolveAgentIcon(agent: { id: string; icon?: string }): IconComponent {
  const key = agent.icon ?? agent.id;
  /*
    `Object.hasOwn`, not a bare lookup: an object literal inherits
    `constructor`, `toString` and `valueOf`, so an agent whose `icon` names one
    of those resolves to a function, `??` never fires, and React is handed
    something that is not a component. The fallback below is supposed to be the
    guarantee that a typo costs a glyph rather than a row — for three
    particular typos it was costing the row.
  */
  return Object.hasOwn(AGENT_ICONS, key) ? (AGENT_ICONS[key] as IconComponent) : LuTerminal;
}

export {
  AiderIcon,
  AntigravityIcon,
  ClaudeIcon,
  CodexIcon,
  KiloIcon,
  OpenClaudeIcon,
  SiOpencode as OpenCodeIcon,
};

/**
 * The third-party apps rail's own brand marks (Phase 83 Theme C) — the same
 * curated-allow-list convention as `REACT_ICONS` above, one named import per
 * mark rather than the `react-icons/si` root barrel. A separate map from
 * `AGENT_ICONS`: these three key by `AppId`, not by an agent's roster key, and
 * mixing the two domains into one lookup would make `resolveAgentIcon`'s
 * fallback rule ("an unrecognised key becomes `LuTerminal`") apply to app ids
 * too, which is not a thing that should ever happen — the app rail's three
 * ids are a closed, exhaustively-typed union, never user text.
 */
export const APP_ICON: Readonly<Record<AppId, IconComponent>> = {
  spotify: SiSpotify,
  'google-calendar': SiGooglecalendar,
  youtube: SiYoutube,
};
