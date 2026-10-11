import { describe, expect, it } from 'vitest';

import { parseAskReply, parseIntent, type CompanionIntent, type CompanionVocabulary } from './companion';

/**
 * Phase 112 Theme H — the target-phrase grammar. Four families, in the order
 * `parseIntent` tries them: repo → agent/model → view → resource, plus the
 * follow-ups ("this", "next", "its PR", "go back") that read a whole line.
 */
const vocabulary: CompanionVocabulary = {
  views: [
    { id: 'graph', label: 'Commit Graph', keywords: 'git history commits branches log' },
    { id: 'chats', label: 'Chats', keywords: 'chats chat conversation ask' },
    { id: 'reviews', label: 'Reviews', keywords: 'pull requests prs reviews' },
    { id: 'sessions', label: 'Sessions', keywords: 'sessions terminals agents' },
    { id: 'tasks', label: 'Tasks', keywords: 'tasks issues board' },
    { id: 'settings', label: 'Settings', keywords: 'settings preferences' },
  ],
  settingsPages: [{ id: 'companion', label: 'Companion' }],
  commands: [
    { id: 'panel.back', label: 'Back', group: 'view', access: 'direct' },
    { id: 'sync.pull', label: 'Pull', group: 'sync', access: 'confirm' },
  ],
  skills: [],
  repos: ['bilo-mono', 'graph'],
};

const parse = (text: string): CompanionIntent => parseIntent(text, vocabulary);

describe('parseIntent — resource target phrases', () => {
  it.each([
    ['open my chat about auth', 'my chat about auth'],
    ['show me the latest commit', 'latest commit'],
    ['take me to PR 812', 'PR 812'],
    ['go to the pull request about the lock screen', 'pull request about the lock screen'],
    ['pull up my last chat', 'my last chat'],
    ['open the dragon model', 'dragon model'],
    ['show the commit about the lock screen', 'commit about the lock screen'],
    ['open #812', '#812'],
    ['bring up the latest workflow run', 'latest workflow run'],
    ['open the note about onboarding', 'note about onboarding'],
    ['jump to the auth session', 'auth session'],
    ['show me my most recent chat', 'my most recent chat'],
  ])('%s is an unresolved query', (text, query) => {
    expect(parse(text)).toEqual({ kind: 'navigate', query });
  });

  it.each([
    ['open chats', { kind: 'navigate', view: 'chats' }],
    ['open the commit graph', { kind: 'navigate', view: 'graph' }],
    ['show me sessions', { kind: 'navigate', view: 'sessions' }],
    ['go to the board', { kind: 'navigate', view: 'tasks' }],
    ['show me issue 212', { kind: 'navigate', view: 'tasks', issue: 212 }],
    ['open settings, companion', { kind: 'navigate', view: 'settings', page: 'companion' }],
  ] as const)('%s stays a view (view beats resource)', (text, expected) => {
    expect(parse(text)).toEqual(expected);
  });

  it('a view phrase with a recency word is a resource', () => {
    expect(parse('open the latest chats')).toEqual({ kind: 'navigate', query: 'latest chats' });
  });

  it('repo wins over everything: switch to a repo named like a kind word', () => {
    expect(parse('switch to graph')).toEqual({ kind: 'switchRepo', name: 'graph' });
    expect(parse('switch to bilo-mono')).toEqual({ kind: 'switchRepo', name: 'bilo-mono' });
  });

  it('agent/model wins over a view and a resource', () => {
    expect(parse('switch to claude').kind).toBe('switchAgent');
    expect(parse('change model to opus').kind).toBe('switchAgent');
  });

  it('a sentence with no kind word is not a resource', () => {
    expect(parse('open the pod bay doors').kind).toBe('freeform');
  });
});

describe('parseIntent — follow-ups', () => {
  it.each([
    ['the next one', { reference: 'next' }],
    ['next one', { reference: 'next' }],
    ['next', { reference: 'next' }],
    ['open the next chat', { reference: 'next', about: 'chat' }],
    ['show me the next commit', { reference: 'next', about: 'commit' }],
    ['the previous one', { reference: 'previous' }],
    ['previous commit', { reference: 'previous', about: 'commit' }],
    ['go to the previous session', { reference: 'previous', about: 'session' }],
    ['open this chat', { reference: 'this', about: 'chat' }],
    ['show this commit', { reference: 'this', about: 'commit' }],
    ['open this one', { reference: 'this' }],
    ['show me this', { reference: 'this' }],
    ['its PR', { reference: 'this', related: 'pull' }],
    ['open its PR', { reference: 'this', related: 'pull' }],
    ['show me its commit', { reference: 'this', related: 'commit' }],
    ['take me to its run', { reference: 'this', related: 'ciRun' }],
    ['open this commit\'s PR', { reference: 'this', related: 'pull', about: 'commit' }],
    ['the PR for this commit', { reference: 'this', related: 'pull', about: 'commit' }],
    ['show me the run for this commit', { reference: 'this', related: 'ciRun', about: 'commit' }],
    ['open the commit for this PR', { reference: 'this', related: 'commit', about: 'pull' }],
    ['go back', { reference: 'back' }],
    ['take me back', { reference: 'back' }],
    ['please go back', { reference: 'back' }],
  ] as const)('%s', (text, rest) => {
    expect(parse(text)).toEqual({ kind: 'navigate', ...rest });
  });

  it('a bare "this" is not a request, and an unknown noun is not a follow-up', () => {
    expect(parse('this').kind).toBe('freeform');
    expect(parse('open the next chapter').kind).not.toBe('navigate');
  });
});

describe('parseIntent — resource grammar without a vocabulary', () => {
  it('is only recognised with a vocabulary, like every navigate phrase', () => {
    expect(parseIntent('open my chat about auth').kind).toBe('freeform');
    expect(parseIntent('go back').kind).not.toBe('navigate');
  });
});

describe('parseAskReply — resource navigate shapes (Theme H router replies)', () => {
  const reply = (intent: unknown): unknown => parseAskReply(JSON.stringify({ say: 'On it.', intent }))?.intent;

  it.each([
    [{ kind: 'navigate', query: 'my last chat about auth' }],
    [{ kind: 'navigate', reference: 'next' }],
    [{ kind: 'navigate', reference: 'this', about: 'commit' }],
    [{ kind: 'navigate', reference: 'this', related: 'pull' }],
    [{ kind: 'navigate', reference: 'back' }],
    [{ kind: 'navigate', target: { kind: 'chat', id: 'c1' } }],
    [{ kind: 'navigate', target: { kind: 'commit', repoId: 'r1', sha: 'abc1234' } }],
    [{ kind: 'navigate', target: { kind: 'media', repoId: 'r1', media: 'model', project: 'dragon' } }],
  ])('%j round-trips', (intent) => {
    expect(reply(intent)).toEqual(intent);
  });

  it.each([
    [{ kind: 'navigate', related: 'issue' }],
    [{ kind: 'navigate', about: 'spaceship' }],
    [{ kind: 'navigate', reference: 'sideways' }],
    [{ kind: 'navigate', query: '' }],
    [{ kind: 'navigate', target: { kind: 'chat' } }],
  ])('%j is rejected', (intent) => {
    expect(reply(intent)).toBeUndefined();
  });
});
