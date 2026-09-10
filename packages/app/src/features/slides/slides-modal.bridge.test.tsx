import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import { PresentButton } from './present-button';
import { SlidesModal } from './slides-modal';
import { useSlidesStore } from './slides-store';
import { VersionPill } from '../version/version-pill';

/**
 * Migrated from `e2e/slides.spec.ts` (Phase 82 Theme C, wave 5) — the deck
 * itself (cover slide, step reveal, slide navigation, the help overlay, and
 * Escape closing it) plus presenting from the release-notes panel. 4 of the
 * original 7 tests moved here; 3 stay in Playwright, below.
 *
 * `PresentButton` + `SlidesModal` are the real, shared pair every markdown
 * surface (Files preview, a PR/review description, an issue body, release
 * notes) wires itself to — mounting them directly here (with a `Harness`
 * standing in for "whichever surface currently owns the button", the same
 * shape `diff-view.bridge.test.tsx`'s own `Harness` takes for `CommitDetail`)
 * tests the actual deck contract without needing any one surface's own tree/
 * view chrome, which is that surface's own concern to get right.
 *
 * **3 of the original 7 stay in Playwright**: "presenting from a PR
 * description", "from an Issue detail", and "a conversation comment's Present
 * button" are all about a SPECIFIC surface (Reviews' `pr-detail.tsx`, Issues'
 * `issue-detail.tsx`/`comment-thread.tsx`) correctly deriving its own
 * `MarkdownSource` and, for description-level bodies, calling
 * `setActiveMarkdown` — not about anything inside `PresentButton` or
 * `SlidesModal`. Those features belong to other Phase 82 Theme C wave 5
 * batches already migrating `e2e/reviews.spec.ts`/`e2e/issues-view.spec.ts`
 * in this same worktree, so re-deriving Reviews/Issues chrome here would
 * duplicate that work rather than add coverage; the deck-side half of the
 * contract those 3 tests also exercise (a fresh deck, the cover title, no
 * step revealed yet) is already fully covered by the tests below.
 *
 * **Lazy-chunk hazard**: `VersionPill` `React.lazy`-loads `VersionNotesPanel`
 * (`version-pill.tsx`), so its test warms that chunk in `beforeAll` —
 * `PresentButton`/`SlidesModal`/`Deck` carry no such boundary themselves.
 *
 * **Matcher/timing note, not a hazard**: the deck's title typewriter
 * (`use-title-typewriter.ts`) respects `prefers-reduced-motion`, which
 * `vitest-setup.ts`'s global `matchMedia` stub defaults to `false` for (real,
 * animated typing) — this file overrides it to `true` so every title renders
 * whole on the first paint, the same override mechanism that stub's own doc
 * comment names.
 */

beforeAll(async () => {
  await import('../version/version-notes-panel');
});

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  useSlidesStore.setState({ deck: null, activeMarkdown: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const README = [
  '# Midnite Slides',
  '',
  'A short deck to present.',
  '',
  '## First point',
  '',
  '- alpha',
  '- beta',
  '',
  '## Second point',
  '',
  'Some closing text.',
].join('\n');

/**
 * Stands in for whichever real surface currently owns the button — Files
 * preview here, mirroring `openReadmeDeck`'s own fixture in the e2e spec.
 * Its own sentinel text is deliberately NOT any text the README also
 * contains — `SlidesModal` overlays rather than unmounts what is underneath
 * it, so a shared string would make every query ambiguous between the two.
 */
function Harness() {
  return (
    <div>
      <p>file preview sentinel</p>
      <PresentButton source={{ content: README }} />
      <SlidesModal />
    </div>
  );
}

const open = () => {
  renderView(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Present as slides' }));
  return screen.getByTestId('slides-deck');
};

describe('the deck, assembled from PresentButton + SlidesModal', () => {
  it('presenting from Files: cover slide, step reveal, and slide navigation', () => {
    const deck = within(open());

    // Cover slide (the h1), title fully typed before we assert it (this file
    // forces `prefers-reduced-motion`, so it types out whole on first paint).
    expect(deck.getByRole('heading', { name: 'Midnite Slides' })).toBeTruthy();
    expect(deck.getByText('1 / 3')).toBeTruthy();

    // Advance into the cover's one step, then to the next slide.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(deck.getByText('A short deck to present.')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(deck.getByRole('heading', { name: 'First point' })).toBeTruthy();
    expect(deck.getByText('2 / 3')).toBeTruthy();

    // Steps reveal one at a time.
    expect(deck.queryByText('alpha')).toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(deck.getByText('alpha')).toBeTruthy();
    expect(deck.queryByText('beta')).toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(deck.getByText('beta')).toBeTruthy();

    // Backward navigation un-reveals before moving to the previous slide.
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(deck.queryByText('beta')).toBeNull();
    expect(deck.getByText('alpha')).toBeTruthy();

    // Home/End jump straight to the first/last slide.
    fireEvent.keyDown(window, { key: 'End' });
    expect(deck.getByRole('heading', { name: 'Second point' })).toBeTruthy();
    expect(deck.getByText('Some closing text.')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Home' });
    expect(deck.getByRole('heading', { name: 'Midnite Slides' })).toBeTruthy();

    // The slide-position rail jumps directly to a slide.
    fireEvent.click(deck.getByRole('button', { name: 'Slide 3 of 3' }));
    expect(deck.getByRole('heading', { name: 'Second point' })).toBeTruthy();
  });

  it('the help overlay toggles with ? and Escape, without closing the deck', () => {
    open();

    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Presentation shortcuts' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Presentation shortcuts' })).toBeNull();
    expect(screen.getByTestId('slides-deck')).toBeTruthy();
  });

  it('Escape closes the deck and returns to the file preview', () => {
    open();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('slides-deck')).toBeNull();
    expect(screen.getByRole('button', { name: 'Present as slides' })).toBeTruthy();
  });
});

const RELEASE_NOTES = ['# What shipped in v9.9.9', '', 'Some release notes content.'].join('\n');

describe('presenting from the release-notes panel', () => {
  it('opens a deck whose cover title is the notes’ h1', async () => {
    renderView(
      <>
        <VersionPill />
        <SlidesModal />
      </>,
      { fixtures: { ...fixtures, releaseNotesOverride: RELEASE_NOTES } },
    );

    fireEvent.click(screen.getByTestId('version-pill'));
    await screen.findByTestId('version-pill-panel');
    expect(await screen.findByText('Some release notes content.')).toBeTruthy();

    fireEvent.click(
      (await screen.findByRole('button', { name: 'Present as slides' })) as HTMLElement,
    );
    const deck = within(screen.getByTestId('slides-deck'));
    expect(deck.getByRole('heading', { name: 'What shipped in v9.9.9' })).toBeTruthy();
  });
});
