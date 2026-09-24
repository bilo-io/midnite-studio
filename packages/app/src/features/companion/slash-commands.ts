import { COMPANION_VERBS, type CompanionCommandId } from '@midnite/studio-shared';

import { fuzzyMatch } from '../../services/palette/fuzzy-match';
import { companionPorts } from './companion-ports';
import { buildVocabulary } from './vocabulary';

/**
 * The companion input's "/" popover (Ad Hoc: companion input + voice
 * improvements).
 *
 * **Every entry here is sourced from a registry that already exists** —
 * never hand-authored — so a suggestion this popover offers is guaranteed to
 * be something the companion's own natural-language grammar
 * (`parseIntent`, `packages/shared/src/companion.ts`) already knows how to
 * run:
 *
 * - `command` rows are `vocabulary.commands` — `COMMANDS`
 *   (`shared/src/keybindings.ts`) filtered down to the `direct`/`confirm`
 *   tier `COMMAND_ACCESS` (`features/palette/safety.ts`) already allows the
 *   companion to run, the exact same allowlist `parseIntent`'s `run` intent
 *   resolves against. Accepting one submits its label as a plain line
 *   (`companionPorts().submit(cmd.label)`), which is indistinguishable from
 *   the user having typed or said it — the existing intent parser, and its
 *   `confirm`-tier gating, do the rest. Nothing here bypasses that gate.
 * - `skill` rows are `vocabulary.skills` — `AGENT_COMMANDS`
 *   (`features/agent/agent-commands.ts`) filtered to the subset the
 *   companion can name (`COMPANION_COMMAND_IDS`). These take a free-text
 *   argument (a task description, an issue to fix), so accepting one
 *   *inserts* `COMPANION_VERBS[id][0]` — the same longest-first canonical
 *   phrase `parseIntent` itself matches first — plus a trailing space, and
 *   leaves the textarea for the user to finish and send.
 * - `control` rows are the companion's own two zero-argument voice controls
 *   (stop, repeat) — not a `CommandId` or an `AgentCommandId` at all, so
 *   they are the one small hand-written list here, reached through the same
 *   `companionPorts()` seam `voice-ports.ts` already registers.
 *
 * `buildVocabulary([])` — the empty array is the `repos` field, which this
 * popover never reads; passing real repos would only make this module
 * depend on a query it has no other reason to run.
 */
export type SlashCommandKind = 'command' | 'skill' | 'control';

export type SlashCommandItem = {
  id: string;
  kind: SlashCommandKind;
  label: string;
  description: string;
};

/** `CommandGroup` (`shared/src/keybindings.ts`) → the popover's one-word category. */
const GROUP_LABEL: Record<string, string> = {
  repository: 'Repository',
  view: 'View',
  sync: 'Sync',
  terminal: 'Terminal',
  status: 'Status',
  graph: 'Graph',
  operation: 'Operation',
  palette: 'Palette',
  files: 'Files',
  window: 'Window',
};

const CONTROLS: readonly SlashCommandItem[] = [
  {
    id: 'control:stop',
    kind: 'control',
    label: 'Stop',
    description: 'Stop the companion mid-sentence.',
  },
  {
    id: 'control:repeat',
    kind: 'control',
    label: 'Repeat',
    description: 'Say the last reply again.',
  },
];

/** Every item the popover can show, unfiltered and in a stable default order. */
export function allSlashCommands(): SlashCommandItem[] {
  const vocabulary = buildVocabulary([]);

  const skills: SlashCommandItem[] = vocabulary.skills.map((skill) => ({
    id: `skill:${skill.id}`,
    kind: 'skill',
    label: skill.label,
    description: skill.hint,
  }));

  const commands: SlashCommandItem[] = vocabulary.commands.map((cmd) => ({
    id: `command:${cmd.id}`,
    kind: 'command',
    label: cmd.label,
    description: `${GROUP_LABEL[cmd.group] ?? cmd.group} command`,
  }));

  return [...CONTROLS, ...skills, ...commands];
}

/**
 * Filtered and ranked by `query` (the text typed after "/"), capped so the
 * inline popover never grows past a handful of rows — it sits above a
 * docked input bar, not a full-screen palette.
 */
export function filterSlashCommands(query: string, limit = 8): SlashCommandItem[] {
  const items = allSlashCommands();
  if (query.trim().length === 0) return items.slice(0, limit);

  const scored = items
    .map((item) => ({
      item,
      score: Math.max(
        fuzzyMatch(query, item.label)?.score ?? -1,
        (fuzzyMatch(query, item.description)?.score ?? -1) * 0.7,
      ),
    }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((row) => row.item);
}

/**
 * What accepting `item` does to the textarea's value — insert-with-space for
 * a `skill` (it still needs an argument), or `null` for a `command`/`control`,
 * which {@link runSlashCommand} runs directly instead of leaving in the box.
 */
export function slashInsertText(item: SlashCommandItem): string | null {
  if (item.kind !== 'skill') return null;
  const phrases = COMPANION_VERBS[item.id.slice('skill:'.length) as CompanionCommandId];
  return `${phrases[0]} `;
}

/** Run a `command`/`control` row immediately, through the ports `voice-ports.ts`/`runtime.ts` already register. */
export function runSlashCommand(item: SlashCommandItem): void {
  if (item.kind === 'command') {
    companionPorts().submit(item.label);
    return;
  }
  if (item.id === 'control:stop') {
    companionPorts().interrupt();
    return;
  }
  if (item.id === 'control:repeat') {
    companionPorts().repeat();
  }
}
