import type { ForgeProjectItem, RepoSkill } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { issueItem } from '../__fixtures__/project-item';
import { touchCardSkill } from './card-skill-lru';
import {
  buildSkillSuggestions,
  defaultCardSkill,
  filterSkillSuggestions,
  isAdhocCard,
  recentCardSkills,
  resolveCardSkillText,
} from './card-skill';

const AGENT_SKILLS = {
  execBacklog: '/midnite-create',
  execAdhoc: '/midnite-create-adhoc',
  addressIssue: '/midnite-address-issue',
  brainstorm: '/midnite-ideate',
  refine: '/midnite-refine',
  verifyPhase: '/midnite-verify',
  execSwarm: '/midnite-swarm',
};

const skill = (name: string, description = `${name} does things`): RepoSkill => ({
  name,
  description,
  source: '.claude',
});

const REPO_SKILLS: RepoSkill[] = [
  skill('graphify', 'Knowledge graph queries'),
  skill('midnite-triage'),
  skill('midnite-release-prep', 'Prepare a release branch'),
  skill('midnite-create-adhoc'),
  skill('midnite-create'),
  skill('midnite-zzz-custom'),
  skill('pr-review'),
];

const card = (title: string): ForgeProjectItem =>
  issueItem({ id: 'item-1', content: { type: 'issue', title } as never });

describe('resolveCardSkillText', () => {
  it('keeps free text verbatim', () => {
    expect(resolveCardSkillText('/midnite-create 98 D', AGENT_SKILLS)).toBe('/midnite-create 98 D');
    expect(resolveCardSkillText('midnite-create 98 D', AGENT_SKILLS)).toBe('midnite-create 98 D');
  });

  it('maps a legacy AgentCommandId to its (possibly edited) template', () => {
    expect(resolveCardSkillText('brainstorm', AGENT_SKILLS)).toBe('/midnite-ideate');
    expect(resolveCardSkillText('execAdhoc', { ...AGENT_SKILLS, execAdhoc: '/my-adhoc' })).toBe('/my-adhoc');
  });

  it('treats blank and absent as unset', () => {
    expect(resolveCardSkillText(undefined, AGENT_SKILLS)).toBeUndefined();
    expect(resolveCardSkillText('   ', AGENT_SKILLS)).toBeUndefined();
  });
});

describe('recentCardSkills — the LRU, most recent first', () => {
  it('reads touchCardSkill insertion order backwards, deduplicated', () => {
    let map: Record<string, string> = {};
    map = touchCardSkill(map, 'p:a', '/midnite-refine');
    map = touchCardSkill(map, 'p:b', '/midnite-create 98 D');
    map = touchCardSkill(map, 'p:c', '/midnite-refine');
    // Re-touching `a` makes it the newest, even with the same value as `c`.
    map = touchCardSkill(map, 'p:a', 'brainstorm');
    expect(recentCardSkills(map, AGENT_SKILLS)).toEqual([
      '/midnite-ideate',
      '/midnite-refine',
      '/midnite-create 98 D',
    ]);
  });

  it('honours the limit', () => {
    const map = { 'p:a': '/a', 'p:b': '/b', 'p:c': '/c' };
    expect(recentCardSkills(map, AGENT_SKILLS, 2)).toEqual(['/c', '/b']);
  });
});

describe('defaultCardSkill — the prepopulation rule', () => {
  it("1. the card's own stored skill wins", () => {
    expect(
      defaultCardSkill({
        item: card('Phase 3'),
        taskKey: 'p:item-1',
        cardSkillByTask: { 'p:item-1': '/midnite-create 98 D', 'p:other': '/midnite-refine' },
        agentSkills: AGENT_SKILLS,
      }),
    ).toBe('/midnite-create 98 D');
  });

  it('2. else the most recently used skill on any card', () => {
    expect(
      defaultCardSkill({
        item: card('Phase 3'),
        taskKey: 'p:item-1',
        cardSkillByTask: { 'p:x': '/midnite-verify', 'p:y': '/midnite-refine' },
        agentSkills: AGENT_SKILLS,
      }),
    ).toBe('/midnite-refine');
  });

  it('3. else /midnite-create-adhoc for an ad hoc card, 4. else /midnite-create', () => {
    const args = { taskKey: 'p:item-1', cardSkillByTask: {}, agentSkills: AGENT_SKILLS };
    expect(defaultCardSkill({ ...args, item: card('Fix the flaky test') })).toBe('/midnite-create-adhoc');
    expect(defaultCardSkill({ ...args, item: card('Phase 98 — Theme D') })).toBe('/midnite-create');
  });

  it('survives an unhydrated store', () => {
    expect(
      defaultCardSkill({ item: card('x'), taskKey: 'k', cardSkillByTask: undefined, agentSkills: undefined }),
    ).toBe('/midnite-create-adhoc');
  });
});

describe('isAdhocCard', () => {
  it('is any card whose title names no phase number', () => {
    expect(isAdhocCard(card('Fix the picker'))).toBe(true);
    expect(isAdhocCard(card('Rephase the thing'))).toBe(true);
    expect(isAdhocCard(card('Phase 12 Theme A'))).toBe(false);
    expect(isAdhocCard(card('[phase-7] cleanup'))).toBe(false);
  });
});

describe('buildSkillSuggestions', () => {
  it('orders Recent, then midnite in workflow order, then other repo skills by name', () => {
    const list = buildSkillSuggestions({
      repoSkills: REPO_SKILLS,
      recent: ['/midnite-triage', 'free text 1'],
      agentSkills: AGENT_SKILLS,
    });
    expect(list.map((s) => [s.group, s.value])).toEqual([
      ['recent', '/midnite-triage'],
      ['recent', 'free text 1'],
      ['midnite', '/midnite-create'],
      ['midnite', '/midnite-create-adhoc'],
      ['midnite', '/midnite-release-prep'],
      // `/midnite-triage` is already under Recent, so it is not repeated.
      ['midnite', '/midnite-zzz-custom'],
      ['other', '/graphify'],
      ['other', '/pr-review'],
    ]);
    // A recent entry borrows the description of the skill it invokes.
    expect(list[0]?.description).toBe('midnite-triage does things');
    expect(list.find((s) => s.value === '/midnite-release-prep')?.description).toBe('Prepare a release branch');
  });

  it('falls back to the built-in task commands when the repo has no midnite skills', () => {
    const list = buildSkillSuggestions({ repoSkills: [skill('graphify')], recent: [], agentSkills: AGENT_SKILLS });
    expect(list.filter((s) => s.group === 'builtin').map((s) => s.value)).toEqual([
      '/midnite-create',
      '/midnite-create-adhoc',
      '/midnite-address-issue',
      '/midnite-ideate',
      '/midnite-refine',
      '/midnite-verify',
      '/midnite-swarm',
    ]);
    expect(list.at(-1)).toMatchObject({ group: 'other', value: '/graphify' });
  });
});

describe('filterSkillSuggestions', () => {
  const list = buildSkillSuggestions({ repoSkills: REPO_SKILLS, recent: [], agentSkills: AGENT_SKILLS });
  const values = (query: string) => filterSkillSuggestions(list, query).map((s) => s.value);

  it('shows everything for an empty query', () => {
    expect(values('  ')).toHaveLength(list.length);
  });

  it('matches the first word against the skill name, sigil or not', () => {
    expect(values('create')).toEqual(['/midnite-create', '/midnite-create-adhoc']);
    expect(values('/midnite-create-a')).toEqual(['/midnite-create-adhoc']);
    expect(values('$graph')).toEqual(['/graphify']);
  });

  it('keeps the skill while args follow it', () => {
    expect(values('/midnite-create 98 D')).toEqual(['/midnite-create', '/midnite-create-adhoc']);
  });

  it('matches the whole query against descriptions', () => {
    expect(values('release branch')).toEqual(['/midnite-release-prep']);
    expect(values('knowledge')).toEqual(['/graphify']);
  });

  it('is empty for text nothing matches — free text stays free', () => {
    expect(values('write me a haiku')).toEqual([]);
  });
});
