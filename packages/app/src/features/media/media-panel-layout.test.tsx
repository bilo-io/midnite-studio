import type { GameSummary } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import { GameCreatePanel } from './game/game-create-panel';
import { GameDetailPanel } from './game/game-detail-panel';
import { GameIteratePanel } from './game/game-iterate-panel';
import { MediaPanelBody, MediaPanelFooter, MediaPanelLayout } from './media-panel-layout';
import { SpriteCreatePanel } from './sprite/sprite-create-panel';

/**
 * Structure of the Media detail-panel layout (vitest/jsdom: classes and DOM position only; the real
 * scroll and pin behaviour needs layout and is covered by e2e/adhoc-media-panel-scroll.spec.ts).
 */
const GAME: GameSummary = {
  gameId: 'g000000000001',
  name: 'Moon Rover',
  path: '/Midnite Games/moon-rover',
  engine: 'phaser',
  dimension: '2d',
  starter: 'top-down',
  dirty: false,
  valid: true,
  issue: null,
};

afterEach(cleanup);

function expectPinnedComposer(root: HTMLElement, composer: HTMLElement) {
  const panel = root.querySelector('[data-media-panel]') as HTMLElement;
  expect(panel).not.toBeNull();
  const body = panel.querySelector('[data-media-panel-body]') as HTMLElement;
  const footer = panel.querySelector('[data-media-panel-footer]') as HTMLElement;
  expect(body.className).toContain('overflow-y-auto');
  expect(body.className).toContain('min-h-0');
  expect(body.className).toContain('flex-1');
  expect(footer.className).toContain('shrink-0');
  expect(footer.className).not.toContain('overflow');
  expect(footer.contains(composer)).toBe(true);
  expect(body.contains(composer)).toBe(false);
}

describe('MediaPanelLayout', () => {
  it('renders a scrolling body and a non-shrinking footer', () => {
    const { container } = render(
      <MediaPanelLayout as="form" aria-label="x">
        <MediaPanelBody>settings</MediaPanelBody>
        <MediaPanelFooter>composer</MediaPanelFooter>
      </MediaPanelLayout>,
    );
    expect(container.querySelector('form')?.className).toContain('h-full');
    expectPinnedComposer(container, screen.getByText('composer'));
  });
});

describe('composer panels keep the composer in the non-scrolling footer', () => {
  it('Games: create', () => {
    const { container } = renderView(<GameCreatePanel onCreated={() => {}} />, { fixtures });
    expectPinnedComposer(container, screen.getByLabelText('First prompt'));
  });

  it('Games: iterate', () => {
    const { container } = renderView(<GameIteratePanel game={GAME} />, { fixtures });
    expectPinnedComposer(container, screen.getByLabelText('Prompt'));
  });

  it('Games: detail (summary scrolls with the thread, prompt pinned)', () => {
    const { container } = renderView(<GameDetailPanel game={GAME} />, { fixtures });
    expectPinnedComposer(container, screen.getByLabelText('Prompt'));
    const body = container.querySelector('[data-media-panel-body]') as HTMLElement;
    expect(body.textContent).toContain('Moon Rover');
  });

  it('Sprites: create', () => {
    const { container } = renderView(<SpriteCreatePanel repoId="r1" onCreated={() => {}} onJob={() => {}} />, { fixtures });
    expectPinnedComposer(container, screen.getByLabelText('Prompt'));
  });
});
