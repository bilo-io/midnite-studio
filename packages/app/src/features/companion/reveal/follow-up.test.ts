import type { ResourceRef } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { resolveFollowUp, type FollowUpDeps } from './follow-up';

/** Phase 112 Theme H — the follow-up rules over injected reads, no store in sight. */

const commit = (sha: string): ResourceRef => ({ kind: 'commit', repoId: 'r1', sha });
const chat = (id: string): ResourceRef => ({ kind: 'chat', id });
const pull = (number: number): ResourceRef => ({ kind: 'pull', repoId: 'r1', number });

function deps(over: Partial<FollowUpDeps> = {}): FollowUpDeps {
  return {
    selection: () => null,
    history: () => [],
    siblings: async () => null,
    related: async () => null,
    ...over,
  };
}

describe('"this"', () => {
  it('is the live selection', async () => {
    const result = await resolveFollowUp({ reference: 'this' }, deps({ selection: () => chat('a'), history: () => [chat('z')] }));
    expect(result).toEqual({ ok: true, ref: chat('a') });
  });

  it('falls back to the last thing revealed', async () => {
    const result = await resolveFollowUp({ reference: 'this' }, deps({ history: () => [commit('abc1234')] }));
    expect(result).toEqual({ ok: true, ref: commit('abc1234') });
  });

  it('"this chat" skips a selection of another kind and finds the chat in history', async () => {
    const result = await resolveFollowUp(
      { reference: 'this', about: 'chat' },
      deps({ selection: () => commit('abc1234'), history: () => [commit('abc1234'), chat('a')] }),
    );
    expect(result).toEqual({ ok: true, ref: chat('a') });
  });

  it('says so when there is nothing, naming the kind', async () => {
    expect(await resolveFollowUp({ reference: 'this', about: 'commit' }, deps())).toEqual({
      ok: false,
      say: "There's no commit selected.",
    });
    expect((await resolveFollowUp({ reference: 'this' }, deps())).ok).toBe(false);
  });
});

describe('next / previous', () => {
  const list = [chat('a'), chat('b'), chat('c')];
  const withList = (selected: ResourceRef) => deps({ selection: () => selected, siblings: async () => list });

  it('steps to the adjacent item in the same list', async () => {
    expect(await resolveFollowUp({ reference: 'next' }, withList(chat('b')))).toEqual({ ok: true, ref: chat('c') });
    expect(await resolveFollowUp({ reference: 'previous' }, withList(chat('b')))).toEqual({ ok: true, ref: chat('a') });
  });

  it('stops at either end', async () => {
    expect(await resolveFollowUp({ reference: 'next' }, withList(chat('c')))).toEqual({ ok: false, say: "That's the last chat." });
    expect(await resolveFollowUp({ reference: 'previous' }, withList(chat('a')))).toEqual({ ok: false, say: "That's the first chat." });
  });

  it('a kind with no list says it cannot step', async () => {
    const result = await resolveFollowUp({ reference: 'next' }, deps({ selection: () => commit('abc1234') }));
    expect(result).toEqual({ ok: false, say: "I can't step through commits yet." });
  });

  it('an item that has left the list is not guessed at', async () => {
    const result = await resolveFollowUp({ reference: 'next' }, withList(chat('gone')));
    expect(result.ok).toBe(false);
  });
});

describe('related hops', () => {
  it('commit → PR asks the RELATED map', async () => {
    const result = await resolveFollowUp(
      { reference: 'this', related: 'pull' },
      deps({ selection: () => commit('abc1234'), related: async (_from, to) => (to === 'pull' ? pull(812) : null) }),
    );
    expect(result).toEqual({ ok: true, ref: pull(812) });
  });

  it('a hop with no answer says what was missing', async () => {
    const result = await resolveFollowUp({ reference: 'this', related: 'pull' }, deps({ selection: () => commit('abc1234') }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.say).toMatch(/couldn't find a pull request/);
  });

  it('a kind with no row for that hop says it cannot', async () => {
    const result = await resolveFollowUp({ reference: 'this', related: 'pull' }, deps({ selection: () => chat('a') }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.say).toMatch(/can't get from/);
  });
});
