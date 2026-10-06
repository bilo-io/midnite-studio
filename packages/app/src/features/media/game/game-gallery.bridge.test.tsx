import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { GameTab } from './game-tab';

/** The perspective × genre gallery in the create panel (Phase 107 Theme K) — jsdom: roles, text and keys only. */

afterEach(cleanup);

const cell = (name: string) => screen.getByRole('button', { name });

describe('GameGallery', () => {
  it('shows genres down and perspectives across, bases first', async () => {
    renderView(<GameTab />, { fixtures });
    const grid = await screen.findByRole('grid', { name: 'Starter templates' });
    expect(within(grid).getAllByRole('columnheader').map((h) => h.textContent).filter(Boolean)).toEqual([
      'Platformer',
      'Top-down',
      'Isometric',
      '2.5D raycaster',
    ]);
    expect(within(grid).getAllByRole('rowheader').map((h) => h.textContent)).toEqual([
      'No genre',
      'FPS',
      'RTS',
      'ARPG',
      'Top-down crime',
    ]);
  });

  it('disables a genre cell the genre does not offer, with its reason', async () => {
    renderView(<GameTab />, { fixtures });
    await screen.findByRole('grid');
    const fps = cell('FPS, Top-down');
    expect(fps.getAttribute('aria-disabled')).toBe('true');
    expect(fps.getAttribute('title')).toBe('The FPS genre needs the raycaster.');
  });

  it('makes the 2D genre cells selectable, and keeps the 3D genres not available yet', async () => {
    renderView(<GameTab />, { fixtures });
    await screen.findByRole('grid');
    for (const name of ['FPS, 2.5D raycaster', 'RTS, Top-down', 'RTS, Isometric', 'ARPG, Isometric', 'Top-down crime, Top-down']) {
      expect(cell(name).getAttribute('aria-disabled'), name).toBe('false');
    }
    const rts = cell('RTS, Isometric');
    fireEvent.click(rts);
    expect(rts.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: '3D' }));
    const shooter = cell('Shooter, First person');
    expect(shooter.getAttribute('aria-disabled')).toBe('true');
    expect(shooter.getAttribute('title')).toMatch(/Not available yet/);
    fireEvent.click(shooter);
    expect(shooter.getAttribute('aria-pressed')).toBe('false');
  }, 20_000);

  it('picks a base, and the 3D toggle shows the camera checkboxes for third person', async () => {
    renderView(<GameTab />, { fixtures });
    await screen.findByRole('grid');
    expect(cell('No genre, Platformer').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(cell('No genre, Isometric'));
    expect(cell('No genre, Isometric').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('Cameras')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: '3D' }));
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent).filter(Boolean)).toEqual(['First person', 'Third person']);
    expect(cell('Fighter, First person').getAttribute('title')).toBe('Fighters use the versus camera only.');
    fireEvent.click(cell('No genre, Third person'));
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    expect((screen.getByLabelText('Directly behind') as HTMLInputElement).checked).toBe(true);
  });

  it('moves between cells with the arrow keys', async () => {
    renderView(<GameTab />, { fixtures });
    await screen.findByRole('grid');
    const start = cell('No genre, Platformer');
    start.focus();
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell('No genre, Top-down'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell('FPS, Top-down'));
  });
});
