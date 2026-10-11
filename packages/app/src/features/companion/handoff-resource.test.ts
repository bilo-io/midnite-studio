import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PendingAction } from '../../store/companion-store';
import { resetHandoffState, submitInput } from './handoff';
import { CHOICE_MEMORY_MS } from './resource-handoff';
import { fakeHandoffDeps, fakeStore } from './test-doubles';

/**
 * Phase 112 Theme H — "open my chat about auth": one match opens, several post
 * numbered chips through the one pending slot, none says so; and the chips are
 * answered by number, ordinal, a yes, or replaced by a newer request.
 */

afterEach(() => {
  resetHandoffState();
  vi.useRealTimers();
});

const chat = (id: string) => ({ kind: 'chat' as const, id });
const match = (id: string, title: string, score = 100) => ({ ref: chat(id), title, score });

function setup(matches: ReturnType<typeof match>[], over: Parameters<typeof fakeHandoffDeps>[0] = {}) {
  const store = fakeStore();
  let pending: PendingAction | null = null;
  const navigate = vi.fn(async () => ({ say: 'Here.' }));
  const find = vi.fn(async () => matches);
  const deps = fakeHandoffDeps({
    store,
    pendingAction: () => pending,
    setPendingAction: (action) => {
      pending = action;
    },
    navigate,
    resource: { find, followUp: async () => ({ ok: false, say: 'No.' }), exactScore: 1_000_000 },
    ...over,
  });
  return { store, deps, navigate, find, pending: () => pending };
}

describe('resolving a target phrase', () => {
  it('one match opens it', async () => {
    const t = setup([match('c1', 'Auth rewrite')]);
    await submitInput('open my chat about auth', t.deps);
    expect(t.navigate).toHaveBeenCalledWith({ kind: 'navigate', target: chat('c1') });
    expect(t.pending()).toBeNull();
  });

  it('none says so, naming the kind and the description', async () => {
    const t = setup([]);
    await submitInput('open my chat about auth', t.deps);
    expect(t.navigate).not.toHaveBeenCalled();
    expect(t.store.lines().at(-1)).toBe("companion: I couldn't find a chat matching auth.");
  });

  it('several say how many, read the first, and post chips', async () => {
    const t = setup([match('c1', 'Auth rewrite'), match('c2', 'Auth bug'), match('c3', 'Auth docs')]);
    await submitInput('open my chat about auth', t.deps);
    expect(t.navigate).not.toHaveBeenCalled();
    expect(t.store.lines().at(-1)).toBe('companion: Three chats match — the first is Auth rewrite.');
    const pending = t.pending();
    expect(pending?.kind).toBe('choice');
    expect(pending?.kind === 'choice' ? pending.options.map((o) => o.title) : []).toEqual([
      'Auth rewrite',
      'Auth bug',
      'Auth docs',
    ]);
  });

  it('a "last" request opens its best match without asking', async () => {
    const t = setup([match('c1', 'Newest'), match('c2', 'Older')]);
    await submitInput('open my last chat', t.deps);
    expect(t.navigate).toHaveBeenCalledWith({ kind: 'navigate', target: chat('c1') });
    expect(t.pending()).toBeNull();
  });

  it('an exact id opens its match without asking', async () => {
    const t = setup([match('c1', 'PR 812', 1_000_000), match('c2', 'Other', 40)]);
    await submitInput('open chat 812', t.deps);
    expect(t.navigate).toHaveBeenCalledTimes(1);
  });
});

describe('answering the chips', () => {
  const three = [match('c1', 'Auth rewrite'), match('c2', 'Auth bug'), match('c3', 'Auth docs')];

  it.each([
    ['two', 'c2'],
    ['the second', 'c2'],
    ['2', 'c2'],
    ['number three', 'c3'],
    ['the last one', 'c3'],
    ['first', 'c1'],
  ])('"%s" picks %s', async (reply, id) => {
    const t = setup(three);
    await submitInput('open my chat about auth', t.deps);
    await submitInput(reply, t.deps);
    expect(t.navigate).toHaveBeenCalledWith({ kind: 'navigate', target: chat(id) });
    expect(t.pending()).toBeNull();
  });

  it('a yes (or Return) opens the first', async () => {
    const t = setup(three);
    await submitInput('open my chat about auth', t.deps);
    await submitInput('yes', t.deps);
    expect(t.navigate).toHaveBeenCalledWith({ kind: 'navigate', target: chat('c1') });
  });

  it('a number past the list is not a pick', async () => {
    const t = setup(three);
    await submitInput('open my chat about auth', t.deps);
    await submitInput('seven', t.deps);
    expect(t.navigate).not.toHaveBeenCalled();
  });

  it('a new request replaces the choice', async () => {
    const t = setup(three);
    await submitInput('open my chat about auth', t.deps);
    await submitInput('what can you do', t.deps);
    expect(t.pending()).toBeNull();
    await submitInput('two', t.deps);
    expect(t.navigate).not.toHaveBeenCalledWith({ kind: 'navigate', target: chat('c2') });
  });

  it('expires after a minute: "two" is no longer a pick', async () => {
    vi.useFakeTimers();
    const t = setup(three);
    await submitInput('open my chat about auth', t.deps);
    vi.advanceTimersByTime(CHOICE_MEMORY_MS + 1);
    await submitInput('two', t.deps);
    expect(t.navigate).not.toHaveBeenCalled();
    expect(t.pending()).toBeNull();
  });

  it('"cancel" drops the choice', async () => {
    const t = setup(three);
    await submitInput('open my chat about auth', t.deps);
    await submitInput('cancel', t.deps);
    expect(t.pending()).toBeNull();
    expect(t.navigate).not.toHaveBeenCalled();
  });
});

describe('follow-ups', () => {
  it('a resolved follow-up opens its ref', async () => {
    const followUp = vi.fn(async () => ({ ok: true as const, ref: chat('c9') }));
    const t = setup([], { resource: { find: async () => [], followUp, exactScore: 1_000_000 } });
    await submitInput('the next one', t.deps);
    expect(followUp).toHaveBeenCalledWith({ reference: 'next', about: undefined, related: undefined });
    expect(t.navigate).toHaveBeenCalledWith({ kind: 'navigate', target: chat('c9') });
  });

  it('a refused follow-up speaks why', async () => {
    const t = setup([], {
      resource: { find: async () => [], followUp: async () => ({ ok: false, say: "That's the last chat." }), exactScore: 1 },
    });
    await submitInput('the next one', t.deps);
    expect(t.store.lines().at(-1)).toBe("companion: That's the last chat.");
  });
});
