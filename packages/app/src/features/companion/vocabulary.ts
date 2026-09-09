import {
  COMMANDS,
  COMPANION_COMMAND_IDS,
  type CompanionCommandId,
  type CompanionVocabulary,
  type RepoDescriptor,
} from '@midnite/studio-shared';

import { AGENT_COMMANDS } from '../agent/agent-commands';
import { COMMAND_ACCESS } from '../palette/safety';
import { VIEW_LABELS, VIEW_KEYWORDS } from '../../services/palette/providers';
import { SETTINGS_PAGES, VIEW_IDS } from '../../store/ui-store';

const COMPANION_COMMAND_ID_SET = new Set<string>(COMPANION_COMMAND_IDS);

function isCompanionSkill(id: string): id is CompanionCommandId {
  return COMPANION_COMMAND_ID_SET.has(id);
}

/**
 * Everything the companion may name, from the same tables the palette
 * already renders (Finding 2, Decision 2) — never a hand-maintained second
 * list. Pure, and cheap enough that memoising on the repo list identity
 * (below) is about not reallocating the other four arrays every render
 * rather than about real cost.
 */
export function buildVocabulary(repos: readonly RepoDescriptor[]): CompanionVocabulary {
  return {
    views: VIEW_IDS.map((id) => ({
      id,
      label: VIEW_LABELS[id],
      keywords: VIEW_KEYWORDS[id],
    })),
    settingsPages: SETTINGS_PAGES.map((page) => ({ id: page.id, label: page.label })),
    commands: COMMANDS.map((cmd) => ({ cmd, access: COMMAND_ACCESS[cmd.id] }))
      .filter(
        (row): row is { cmd: (typeof COMMANDS)[number]; access: 'direct' | 'confirm' } =>
          row.access === 'direct' || row.access === 'confirm',
      )
      .map(({ cmd, access }) => ({ id: cmd.id, label: cmd.label, group: cmd.group, access })),
    skills: AGENT_COMMANDS.filter((agent): agent is typeof agent & { id: CompanionCommandId } =>
      isCompanionSkill(agent.id),
    ).map((agent) => ({ id: agent.id, label: agent.label, hint: agent.hint })),
    repos: repos.map((repo) => repo.name),
  };
}

let cache: { reposKey: readonly RepoDescriptor[]; vocabulary: CompanionVocabulary } | null = null;

/**
 * `buildVocabulary`, memoised on the repo list's identity — `runtime.ts`
 * calls this once per flow beside `refreshRoster()`, and a fresh array of
 * the same repos (a re-render, not a real roster change) should not rebuild
 * four arrays for nothing.
 */
export function vocabularyFor(repos: readonly RepoDescriptor[]): CompanionVocabulary {
  if (cache && cache.reposKey === repos) return cache.vocabulary;
  const vocabulary = buildVocabulary(repos);
  cache = { reposKey: repos, vocabulary };
  return vocabulary;
}
