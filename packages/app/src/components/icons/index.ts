import { Terminal } from 'lucide-react';
import {
  SiAnthropic,
  SiGithubcopilot,
  SiGooglegemini,
  SiMistralai,
  SiOllama,
  SiOpencode,
} from 'react-icons/si';

import type { IconComponent } from '../icon-button';
import { AntigravityIcon } from './antigravity-icon';
import { ClaudeIcon } from './claude-icon';
import { CodexIcon } from './codex-icon';
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

/** The five builtins' own marks, keyed as `AgentDefinition.icon ?? id`. */
const LOCAL_ICONS: Record<string, IconComponent> = {
  claude: ClaudeIcon,
  antigravity: AntigravityIcon,
  codex: CodexIcon,
  openclaude: OpenClaudeIcon,
  opencode: SiOpencode,
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
 * An unrecognised key falls back to lucide's `Terminal` rather than rendering
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
  return Object.hasOwn(AGENT_ICONS, key) ? (AGENT_ICONS[key] as IconComponent) : Terminal;
}

export { AntigravityIcon, ClaudeIcon, CodexIcon, OpenClaudeIcon, SiOpencode as OpenCodeIcon };
