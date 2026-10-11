import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ResourceKind, ResourceRef } from '@midnite/studio-shared';

import {
  EXACT_SCORE,
  SOURCE_RESULT_CAP,
  defaultBoost,
  findResources,
  paletteItemIds,
  scoreCandidate,
  type FindOptions,
  type ResourceCandidate,
  type ResourceSource,
  type SourceQuery,
} from './resolve';
import { useRevealHistory } from './reveal-history';
import { useFrecencyStore } from '../../../services/palette/frecency-store';

/**
 * Phase 112 Theme G — `findResources` against fake sources: no bridge, no
 * stores, no wall clock. The one timeout case runs on fake timers.
 */

const R = 'repo-1';
const chat = (id: string, title: string, at: number, extra: Partial<ResourceCandidate> = {}): ResourceCandidate => ({
  ref: { kind: 'chat', id },
  title,
  at,
  ...extra,
});
const commit = (sha: string, title: string, at: number, extra: Partial<ResourceCandidate> = {}): ResourceCandidate => ({
  ref: { kind: 'commit', repoId: R, sha },
  title,
  at,
  ...extra,
});

function source(id: string, kinds: ResourceKind[], candidates: ResourceCandidate[] | ((q: SourceQuery) => ResourceCandidate[]), extra: Partial<ResourceSource> = {}): ResourceSource {
  return {
    id,
    kinds,
    load: vi.fn(async (q: SourceQuery) => (typeof candidates === 'function' ? candidates(q) : candidates)),
    ...extra,
  };
}

const CHATS = source('chats', ['chat'], [
  chat('c1', 'Auth refactor', 100),
  chat('c2', 'Lock screen polish', 300),
  chat('c3', 'Billing questions', 200, { keywords: 'stripe webhooks auth tokens' }),
]);
const COMMITS = source('commits', ['commit'], [
  commit('aaaaaaa1', 'fix(lock): lock screen ignores Escape', 500),
  commit('bbbbbbb2', 'feat: auth tokens', 400),
]);

const run = (query: string, opts: FindOptions = {}) =>
  findResources(query, { sources: [CHATS, COMMITS], repoId: R, boost: () => 1, ...opts });
const refs = (matches: { ref: ResourceRef }[]) => matches.map((m) => m.ref);

afterEach(() => {
  vi.useRealTimers();
});

describe('findResources', () => {
  it('ranks fuzzy title matches across sources', async () => {
    const matches = await run('lock screen');
    expect(refs(matches).slice(0, 2)).toEqual(
      expect.arrayContaining([
        { kind: 'chat', id: 'c2' },
        { kind: 'commit', repoId: R, sha: 'aaaaaaa1' },
      ]),
    );
    expect(refs(matches)).not.toContainEqual({ kind: 'chat', id: 'c1' });
  });

  it('narrows to the kind a word names, and never asks a source that cannot answer', async () => {
    const chats = source('chats', ['chat'], [chat('c2', 'Lock screen polish', 300)]);
    const commits = source('commits', ['commit'], [commit('aaaaaaa1', 'lock screen fix', 500)]);
    const matches = await findResources('the chat about the lock screen', { sources: [chats, commits], repoId: R, boost: () => 1 });
    expect(refs(matches)).toEqual([{ kind: 'chat', id: 'c2' }]);
    expect(commits.load).not.toHaveBeenCalled();
  });

  it('lets the caller’s kinds win when the query names another kind', async () => {
    // "commit" here is part of a chat's title, not the kind the caller wants.
    const chats = source('chats', ['chat'], [chat('c9', 'Commit message style', 1)]);
    const matches = await findResources('commit message', { sources: [chats, COMMITS], repoId: R, kinds: ['chat'], boost: () => 1 });
    expect(refs(matches)).toEqual([{ kind: 'chat', id: 'c9' }]);
  });

  it('matches non-title text as plain words and requires every term', async () => {
    const matches = await run('stripe auth');
    expect(refs(matches)).toEqual([{ kind: 'chat', id: 'c3' }]);
  });

  it('keeps a source-matched candidate whose words were only in a body', async () => {
    const commits = source('commits', ['commit'], [commit('ccccccc3', 'chore: tidy', 1, { matched: true })]);
    const matches = await findResources('commit about debounce', { sources: [commits], repoId: R, boost: () => 1 });
    expect(refs(matches)).toEqual([{ kind: 'commit', repoId: R, sha: 'ccccccc3' }]);
  });

  describe('exact ids', () => {
    it('a sha a source resolved wins outright, alone', async () => {
      const commits = source('commits', ['commit'], (q) =>
        q.exact.some((id) => id.type === 'sha') ? [commit('a1b2c3d4e5', 'commit a1b2c3d', 0, { exact: true })] : [],
      );
      const matches = await findResources('a1b2c3d', { sources: [commits, CHATS], repoId: R, boost: () => 1 });
      expect(matches).toEqual([{ ref: { kind: 'commit', repoId: R, sha: 'a1b2c3d4e5' }, title: 'commit a1b2c3d', score: EXACT_SCORE }]);
    });

    it('"PR 812" names the PR even when no list has it loaded', async () => {
      const pulls = source('pulls', ['pull'], [{ ref: { kind: 'pull', repoId: R, number: 5 }, title: 'Other', at: 5 }]);
      const matches = await findResources('PR 812', { sources: [pulls], repoId: R });
      expect(matches).toEqual([{ ref: { kind: 'pull', repoId: R, number: 812 }, title: 'PR 812', score: EXACT_SCORE }]);
    });

    it('a bare "#812" a source knows comes back as that kind only', async () => {
      const issues = source('issues', ['issue'], [{ ref: { kind: 'issue', repoId: R, number: 812 }, title: 'Crash on boot', exact: true }]);
      const pulls = source('pulls', ['pull'], []);
      const matches = await findResources('open #812', { sources: [issues, pulls], repoId: R });
      expect(refs(matches)).toEqual([{ kind: 'issue', repoId: R, number: 812 }]);
      expect(matches[0]?.title).toBe('Crash on boot');
    });

    it('an unknown bare "#812" offers both a PR and an issue', async () => {
      const matches = await findResources('#812', { sources: [], repoId: R });
      expect(refs(matches)).toEqual([
        { kind: 'pull', repoId: R, number: 812 },
        { kind: 'issue', repoId: R, number: 812 },
      ]);
    });

    it('needs a repo to synthesise a forge ref', async () => {
      expect(await findResources('PR 812', { sources: [], repoId: null })).toEqual([]);
    });
  });

  describe('recency words', () => {
    it('"my last chat" is the newest chat, with no fuzzy matching', async () => {
      const matches = await run('open my last chat');
      expect(refs(matches)[0]).toEqual({ kind: 'chat', id: 'c2' });
      expect(refs(matches)).toEqual([
        { kind: 'chat', id: 'c2' },
        { kind: 'chat', id: 'c3' },
        { kind: 'chat', id: 'c1' },
      ]);
    });

    it('"the previous chat" is the one before the newest', async () => {
      const matches = await run('the previous chat');
      expect(refs(matches)[0]).toEqual({ kind: 'chat', id: 'c3' });
    });

    it('orders a described recency query newest first', async () => {
      const chats = source('chats', ['chat'], [chat('old', 'Auth one', 1), chat('new', 'Auth two', 9)]);
      const matches = await findResources('latest chat about auth', { sources: [chats], repoId: R, boost: () => 1 });
      expect(refs(matches)).toEqual([
        { kind: 'chat', id: 'new' },
        { kind: 'chat', id: 'old' },
      ]);
    });

    it('a bare "latest" names nothing', async () => {
      expect(await run('latest')).toEqual([]);
    });
  });

  it('breaks a score tie by recency', async () => {
    const chats = source('chats', ['chat'], [chat('older', 'Deploy notes', 10), chat('newer', 'Deploy notes', 20)]);
    const matches = await findResources('deploy notes chat', { sources: [chats], repoId: R, boost: () => 1 });
    expect(refs(matches)).toEqual([
      { kind: 'chat', id: 'newer' },
      { kind: 'chat', id: 'older' },
    ]);
  });

  it('drops a source that runs past the timeout and answers with the rest', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const slow: ResourceSource = {
      id: 'slow',
      kinds: ['commit'],
      load: (q) =>
        new Promise((resolve) => {
          q.signal.addEventListener('abort', () => {
            aborted = true;
          });
          setTimeout(() => resolve([commit('ddddddd4', 'lock screen', 1)]), 10_000);
        }),
    };
    const pending = findResources('lock screen', { sources: [CHATS, slow], repoId: R, boost: () => 1, timeoutMs: 300 });
    await vi.advanceTimersByTimeAsync(300);
    const matches = await pending;
    expect(refs(matches)).toEqual([{ kind: 'chat', id: 'c2' }]);
    expect(aborted).toBe(true);
  });

  it('drops a source that throws', async () => {
    const broken: ResourceSource = { id: 'broken', kinds: ['commit'], load: async () => Promise.reject(new Error('boom')) };
    const matches = await findResources('lock screen', { sources: [CHATS, broken], repoId: R, boost: () => 1 });
    expect(refs(matches)).toEqual([{ kind: 'chat', id: 'c2' }]);
  });

  it('caps each source’s contribution and the answer', async () => {
    const many = source('many', ['chat'], Array.from({ length: 40 }, (_, i) => chat(`m${i}`, `Release ${i}`, i)));
    const all = await findResources('release chat', { sources: [many], repoId: R, boost: () => 1, limit: 20 });
    expect(all).toHaveLength(SOURCE_RESULT_CAP);
    const few = await findResources('release chat', { sources: [many], repoId: R, boost: () => 1, limit: 3 });
    expect(few).toHaveLength(3);
    const clamped = await findResources('release chat', { sources: [many], repoId: R, boost: () => 1, limit: 99 });
    expect(clamped.length).toBeLessThanOrEqual(20);
  });

  it('narrows media to the tab its word names', async () => {
    const model: ResourceSource = source('media:model', ['media'], [{ ref: { kind: 'media', repoId: R, media: 'model', project: 'p', path: 'p/dragon.obj' }, title: 'dragon' }], { media: ['model'] });
    const image: ResourceSource = source('media:image', ['media'], [{ ref: { kind: 'media', repoId: R, media: 'image', project: 'p', path: 'p/dragon.png' }, title: 'dragon' }], { media: ['image'] });
    const matches = await findResources('pull up the dragon model', { sources: [model, image], repoId: R, boost: () => 1 });
    expect(refs(matches)).toEqual([{ kind: 'media', repoId: R, media: 'model', project: 'p', path: 'p/dragon.obj' }]);
    expect(image.load).not.toHaveBeenCalled();
  });

  it('lets a boost lift one of two equal matches', async () => {
    const chats = source('chats', ['chat'], [chat('a', 'Standup', 5), chat('b', 'Standup', 1)]);
    const matches = await findResources('standup chat', {
      sources: [chats],
      repoId: R,
      boost: (ref) => (ref.kind === 'chat' && ref.id === 'b' ? 1.2 : 1),
    });
    expect(refs(matches)[0]).toEqual({ kind: 'chat', id: 'b' });
  });

  it('clips titles and details and drops duplicate refs', async () => {
    const long = 'x'.repeat(300);
    const chats = source('chats', ['chat'], [chat('dup', `alpha ${long}`, 2, { detail: `d ${long}` }), chat('dup', 'alpha', 1)]);
    const matches = await findResources('alpha chat', { sources: [chats], repoId: R, boost: () => 1 });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.title.length).toBeLessThanOrEqual(120);
    expect(matches[0]!.detail!.length).toBeLessThanOrEqual(80);
  });

  it('answers nothing for an empty or all-stopword query', async () => {
    expect(await run('')).toEqual([]);
    expect(await run('open the')).toEqual([]);
  });
});

describe('scoreCandidate', () => {
  const q = (terms: string[], softTerms: string[] = []) => ({ terms, softTerms, description: terms.join(' ') });

  it('accepts a tight typo and rejects scattered subsequence noise', () => {
    expect(scoreCandidate(chat('x', 'Release checklist', 0), q(['relase']))).not.toBeNull();
    expect(scoreCandidate(chat('x', 'a long title about unrelated things here', 0), q(['auth']))).toBeNull();
  });

  it('scores a soft term as a bonus, never a requirement', () => {
    const page = { ref: { kind: 'setting', page: 'terminal', section: 'memory' } as ResourceRef, title: 'Terminal settings — Memory' };
    const withSoft = scoreCandidate(page, q(['memory'], ['terminal']))!;
    const without = scoreCandidate(page, q(['memory']))!;
    expect(withSoft).toBeGreaterThan(without);
    expect(scoreCandidate(page, q(['memory'], ['council']))).toBe(without);
  });
});

describe('defaultBoost', () => {
  afterEach(() => {
    useRevealHistory.getState().clear();
    useFrecencyStore.setState({ entries: {} });
  });

  it('is 1 for a ref with no history, and lifts a recently revealed one within the cap', () => {
    const ref: ResourceRef = { kind: 'chat', id: 'c1' };
    expect(defaultBoost(ref)).toBe(1);
    useRevealHistory.getState().record(ref);
    expect(defaultBoost(ref)).toBeGreaterThan(1);
    expect(defaultBoost(ref)).toBeLessThanOrEqual(1.25);
  });

  it('carries palette frecency over through the shared item id', () => {
    const ref: ResourceRef = { kind: 'setting', page: 'terminal' };
    expect(paletteItemIds(ref)).toEqual(['settings:terminal']);
    useFrecencyStore.setState({ entries: { 'settings:terminal': { count: 5, lastAt: Date.now() } } });
    expect(defaultBoost(ref)).toBeGreaterThan(1);
  });
});
