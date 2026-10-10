import { describe, expect, it, vi } from 'vitest';

import { RESOURCE_KINDS, type ResourceRef } from '@midnite/studio-shared';

import type { NavigationState } from '../navigate';
import { revealResource, revealSay, type RevealDeps } from './reveal';
import { REVEALERS } from './revealers';
import { REVEAL_HISTORY_LIMIT, lastRevealed, useRevealHistory } from './reveal-history';
import type { RevealOutcome, RevealerTable } from './types';

/**
 * Phase 112 Theme B — one case per plan branch of `revealResource`, against
 * fake deps and fake revealers (no store, no bridge), plus the stub table and
 * the `lastRevealed` slot.
 */

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const COMMIT: ResourceRef = { kind: 'commit', repoId: 'r1', sha: SHA };
const CHAT: ResourceRef = { kind: 'chat', id: 'c1' };
const BROWSER: ResourceRef = { kind: 'browserTab', url: 'https://example.com/x' };

const baseState: NavigationState = {
  windowRole: 'main',
  detachedPages: [],
  panelDetached: {
    terminal: false,
    repos: false,
    fab: false,
    companion: false,
    browser: false,
    'apps-spotify': false,
    'apps-google-calendar': false,
    'apps-youtube': false,
    game: false,
  },
  locked: false,
  repoId: 'r1',
};

const revealed = (label: string): RevealOutcome => ({ ok: true, did: 'revealed', label });

/** Every kind succeeds with its own kind as the label, and records what it was asked. */
function fakeRevealers(seen: { ref: ResourceRef; focusedWindow: boolean }[]): RevealerTable {
  return Object.fromEntries(
    RESOURCE_KINDS.map((kind) => [
      kind,
      {
        view: REVEALERS[kind].view,
        reveal: async (ref: ResourceRef, ctx: { focusedWindow: boolean }) => {
          seen.push({ ref, focusedWindow: ctx.focusedWindow });
          return revealed(kind);
        },
      },
    ]),
  ) as unknown as RevealerTable;
}

function makeDeps(over: Partial<RevealDeps> & { state?: Partial<NavigationState> } = {}) {
  const seen: { ref: ResourceRef; focusedWindow: boolean }[] = [];
  const order: string[] = [];
  const { state, ...rest } = over;
  const deps: RevealDeps = {
    navigationState: () => ({ ...baseState, ...state }),
    hasRepo: vi.fn(async () => true),
    selectRepo: vi.fn(() => order.push('selectRepo')),
    setActiveView: vi.fn(() => order.push('setActiveView')),
    unsavedPending: vi.fn(() => false),
    focusRole: vi.fn(),
    relayToMain: vi.fn(async (ref: ResourceRef) => ({ ok: true, did: 'relayed', label: ref.kind, say: 'from main' }) as const),
    record: vi.fn(),
    revealers: fakeRevealers(seen),
    ...rest,
  };
  return { deps, seen, order };
}

describe('revealResource — the plan', () => {
  it('switches to the revealer view, reveals, and records', async () => {
    const { deps, seen } = makeDeps();
    const outcome = await revealResource(COMMIT, { caller: 'companion' }, deps);
    expect(outcome).toEqual(revealed('commit'));
    expect(deps.setActiveView).toHaveBeenCalledWith('graph');
    expect(seen).toEqual([{ ref: COMMIT, focusedWindow: false }]);
    expect(deps.record).toHaveBeenCalledWith(COMMIT);
  });

  it('focuses a detached page instead of switching the main view', async () => {
    const { deps, seen } = makeDeps({ state: { detachedPages: ['graph'] } });
    const outcome = await revealResource(COMMIT, { caller: 'companion' }, deps);
    expect(deps.focusRole).toHaveBeenCalledWith('graph');
    expect(deps.setActiveView).not.toHaveBeenCalled();
    expect(seen[0]?.focusedWindow).toBe(true);
    expect(outcome).toEqual({ ok: true, did: 'focused-window', label: 'commit' });
  });

  it('relays from a popout and reports main’s answer, revealing nothing locally', async () => {
    const { deps, seen } = makeDeps({ state: { windowRole: 'companion' } });
    const outcome = await revealResource(CHAT, { caller: 'companion' }, deps);
    expect(deps.relayToMain).toHaveBeenCalledWith(CHAT);
    expect(seen).toEqual([]);
    expect(revealSay(outcome)).toBe('from main');
  });

  it('refuses while locked, before touching repo or view', async () => {
    const { deps, seen } = makeDeps({ state: { locked: true } });
    const outcome = await revealResource(COMMIT, { caller: 'mcp' }, deps);
    expect(outcome).toMatchObject({ ok: false, reason: 'locked' });
    expect(deps.selectRepo).not.toHaveBeenCalled();
    expect(deps.setActiveView).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it('returns blocked-unsaved when the guard holds the view switch, selecting nothing', async () => {
    const { deps, seen } = makeDeps({ unsavedPending: () => true });
    const outcome = await revealResource(CHAT, { caller: 'companion' }, deps);
    expect(outcome).toMatchObject({ ok: false, reason: 'blocked-unsaved' });
    expect(seen).toEqual([]);
    expect(deps.record).not.toHaveBeenCalled();
  });

  it('switches repo before the view for a ref in another repo', async () => {
    const { deps, order } = makeDeps({ state: { repoId: 'other' } });
    await revealResource(COMMIT, { caller: 'companion' }, deps);
    expect(deps.selectRepo).toHaveBeenCalledWith('r1');
    expect(order).toEqual(['selectRepo', 'setActiveView']);
  });

  it('stops when the unsaved guard holds the repo switch', async () => {
    const { deps, seen } = makeDeps({ state: { repoId: 'other' }, unsavedPending: () => true });
    const outcome = await revealResource(COMMIT, { caller: 'companion' }, deps);
    expect(outcome).toMatchObject({ ok: false, reason: 'blocked-unsaved' });
    expect(deps.setActiveView).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it('answers no-repo for a repo that is not open', async () => {
    const { deps } = makeDeps({ state: { repoId: 'other' }, hasRepo: async () => false });
    const outcome = await revealResource(COMMIT, { caller: 'link' }, deps);
    expect(outcome).toMatchObject({ ok: false, reason: 'no-repo' });
    expect(deps.selectRepo).not.toHaveBeenCalled();
  });

  it('does not switch repo for an app-wide ref', async () => {
    const { deps } = makeDeps({ state: { repoId: null } });
    await revealResource(CHAT, { caller: 'companion' }, deps);
    expect(deps.selectRepo).not.toHaveBeenCalled();
    expect(deps.setActiveView).toHaveBeenCalledWith('chats');
  });

  it('skips the view step for a kind that lives in a panel', async () => {
    const { deps, seen } = makeDeps();
    await revealResource(BROWSER, { caller: 'companion' }, deps);
    expect(deps.setActiveView).not.toHaveBeenCalled();
    expect(seen).toHaveLength(1);
  });

  it('passes a revealer’s failure through and records nothing', async () => {
    const { deps } = makeDeps();
    deps.revealers = {
      ...deps.revealers,
      commit: { view: 'graph', reveal: async () => ({ ok: false, reason: 'not-found', say: 'gone' }) },
    };
    const outcome = await revealResource(COMMIT, { caller: 'companion' }, deps);
    expect(outcome).toEqual({ ok: false, reason: 'not-found', say: 'gone' });
    expect(deps.record).not.toHaveBeenCalled();
  });
});

describe('the stub table (Theme B lands every kind as unavailable)', () => {
  it.each([COMMIT, CHAT])('$kind says it cannot pick the thing out yet', async (ref) => {
    const { deps } = makeDeps();
    deps.revealers = REVEALERS;
    const outcome = await revealResource(ref, { caller: 'companion' }, deps);
    expect(outcome).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(revealSay(outcome)).toMatch(/^I can't pick out .+ yet\.$/);
  });

  it('routes a live session to no view and a closed one to Sessions', () => {
    const view = REVEALERS.session.view as (ref: { kind: 'session'; id: string; closed?: boolean }) => string | null;
    expect(view({ kind: 'session', id: 's' })).toBeNull();
    expect(view({ kind: 'session', id: 's', closed: true })).toBe('sessions');
  });
});

describe('revealSay', () => {
  it('speaks "Here\'s {label}." by default and a focused window by name', () => {
    expect(revealSay({ ok: true, did: 'revealed', label: 'PR 812' })).toBe("Here's PR 812.");
    expect(revealSay({ ok: true, did: 'focused-window', label: 'commit a1b2c3d' })).toBe(
      'Commit a1b2c3d is in its own window — bringing it forward.',
    );
    expect(revealSay({ ok: true, did: 'revealed', label: 'x', say: 'Custom.' })).toBe('Custom.');
  });
});

describe('lastRevealed', () => {
  it('keeps the newest first, de-duplicated, capped', () => {
    useRevealHistory.getState().clear();
    for (let n = 1; n <= REVEAL_HISTORY_LIMIT + 5; n += 1) {
      useRevealHistory.getState().record({ kind: 'pull', repoId: 'r1', number: n }, n);
    }
    useRevealHistory.getState().record({ kind: 'pull', repoId: 'r1', number: 10 }, 999);
    const entries = useRevealHistory.getState().entries;
    expect(entries).toHaveLength(REVEAL_HISTORY_LIMIT);
    expect(entries[0]).toEqual({ ref: { kind: 'pull', repoId: 'r1', number: 10 }, at: 999 });
    expect(entries.filter((entry) => entry.ref.kind === 'pull' && entry.ref.number === 10)).toHaveLength(1);
    expect(lastRevealed()).toEqual({ kind: 'pull', repoId: 'r1', number: 10 });
  });
});
