import { describe, expect, it } from 'vitest';

import { CLOSED, FINALE, INTRO, dotStates, initialStep, nextStep, prevStep, resumePageId } from './setup-machine';

const page = (index: number) => ({ kind: 'page', index }) as const;

describe('setup page state machine (Phase 98 Theme A)', () => {
  it('walks intro → every page → finale → closed', () => {
    expect(nextStep(INTRO, 2)).toEqual(page(0));
    expect(nextStep(page(0), 2)).toEqual(page(1));
    expect(nextStep(page(1), 2)).toEqual(FINALE);
    expect(nextStep(FINALE, 2)).toEqual(CLOSED);
    expect(nextStep(CLOSED, 2)).toEqual(CLOSED);
  });

  it('goes straight from intro to finale when there are no pages', () => {
    expect(nextStep(INTRO, 0)).toEqual(FINALE);
    expect(prevStep(FINALE, 0)).toEqual(INTRO);
  });

  it('Back retraces, stops at the intro, and the finale returns to the last page', () => {
    expect(prevStep(FINALE, 2)).toEqual(page(1));
    expect(prevStep(page(1), 2)).toEqual(page(0));
    expect(prevStep(page(0), 2)).toEqual(INTRO);
    expect(prevStep(INTRO, 2)).toEqual(INTRO);
    expect(prevStep(CLOSED, 2)).toEqual(CLOSED);
  });

  it('opens at a named page, or the intro for none or an unknown one', () => {
    const ids = ['machine', 'forges'];
    expect(initialStep('forges', ids)).toEqual(page(1));
    expect(initialStep(null, ids)).toEqual(INTRO);
    expect(initialStep('gone', ids)).toEqual(INTRO);
  });
});

describe('dotStates', () => {
  const ids = ['a', 'b', 'c'];

  it('marks the current page active, earlier pages done, later ones upcoming', () => {
    expect(dotStates(page(1), ids, [])).toEqual(['done', 'active', 'upcoming']);
  });

  it('shows an earlier skipped page as skipped rather than done', () => {
    expect(dotStates(page(2), ids, ['a'])).toEqual(['skipped', 'done', 'active']);
  });

  it('has every dot ahead at the intro and behind at the finale', () => {
    expect(dotStates(INTRO, ids, [])).toEqual(['upcoming', 'upcoming', 'upcoming']);
    expect(dotStates(FINALE, ids, ['b'])).toEqual(['done', 'skipped', 'done']);
  });
});

describe('resumePageId (Theme C)', () => {
  const ids = ['git', 'forges', 'accounts'];
  const at = (lastPageId: string | null, skippedPageIds: string[] = []) => resumePageId(ids, { lastPageId, skippedPageIds });

  it('never started a page: the first one', () => {
    expect(at(null)).toBe('git');
  });

  it('left with X: the page it was left on', () => {
    expect(at('forges')).toBe('forges');
  });

  it('left with Skip: the next page not skipped', () => {
    expect(at('git', ['git'])).toBe('forges');
    expect(at('git', ['git', 'forges'])).toBe('accounts');
  });

  it('everything from there on skipped: back to the page it was left on', () => {
    expect(at('accounts', ['accounts'])).toBe('accounts');
  });

  it('a page since removed falls back to scanning from the start', () => {
    expect(at('gone', ['git'])).toBe('forges');
  });

  it('no pages: nowhere', () => {
    expect(resumePageId([], { lastPageId: null, skippedPageIds: [] })).toBeNull();
  });
});
