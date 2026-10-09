import { defaultGameOptions } from '@midnite/studio-shared';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { GameCreatePanel } from './game-create-panel';
import { deriveWizard, initialWizardState, wizardReducer, type WizardState } from './game-wizard-model';

/**
 * The new-game wizard (dimension, perspective, genre, fine-tune) — jsdom: roles, text and keys only.
 * Step flow, filtering, clearing on a changed earlier choice, dots, keyboard and per-genre defaults.
 */

type MockGames = { calls: Array<Record<string, unknown>> };
const mockGames = (): MockGames => (window as unknown as { __mstudioMockGames: MockGames }).__mstudioMockGames;

afterEach(cleanup);

const mount = () => renderView(<GameCreatePanel onCreated={() => {}} />, { fixtures });
const heading = () => screen.getByTestId('game-wizard-heading').textContent;
const card = (name: string) => screen.getByRole('button', { name });
const dot = (n: number, label: string) => screen.getByRole('button', { name: `Step ${n} of 4: ${label}` });
const next = () => screen.getByRole('button', { name: /Next/ });
const back = () => screen.getByRole('button', { name: /Back/ });

describe('wizard reducer', () => {
  const at = (patch: Partial<WizardState>): WizardState => ({ ...initialWizardState(), ...patch });

  it('clears perspective and genre when the dimension changes, keeps them when it does not', () => {
    const s = at({ dimension: '2d', perspective: 'top-down', genre: 'rts', step: 3 });
    expect(wizardReducer(s, { type: 'dimension', value: '3d', current: '2d' })).toMatchObject({ dimension: '3d', perspective: null, genre: null, step: 1 });
    expect(wizardReducer(s, { type: 'dimension', value: '2d', current: '2d' })).toMatchObject({ perspective: 'top-down', genre: 'rts', step: 1 });
  });

  it('keeps a genre the new perspective still offers and clears one it does not', () => {
    const s = at({ dimension: '2d', perspective: 'top-down', genre: 'rts', step: 1 });
    expect(wizardReducer(s, { type: 'perspective', value: 'isometric' })).toMatchObject({ genre: 'rts', step: 2 });
    expect(wizardReducer(s, { type: 'perspective', value: 'platformer' })).toMatchObject({ genre: null });
    expect(wizardReducer({ ...s, genre: 'blank' }, { type: 'perspective', value: 'platformer' })).toMatchObject({ genre: 'blank' });
  });

  it('seeds the options from the genre when it changes, and leaves them alone when it does not', () => {
    const s = at({ dimension: '3d', perspective: 'third-person', step: 2 });
    const picked = wizardReducer(s, { type: 'genre', value: 'soulslike' });
    expect(picked.options.bosses).toBe(true);
    const edited = { ...picked, options: { ...picked.options, bosses: false } };
    expect(wizardReducer(edited, { type: 'genre', value: 'soulslike' }).options.bosses).toBe(false);
    expect(wizardReducer(edited, { type: 'genre', value: 'blank' }).options).toEqual(defaultGameOptions(null));
  });

  it('derives the reachable step from what has been picked', () => {
    expect(deriveWizard(initialWizardState(), '2d').reached).toBe(1);
    expect(deriveWizard(at({ perspective: 'platformer' }), '2d').reached).toBe(2);
    expect(deriveWizard(at({ perspective: 'platformer', genre: 'blank' }), '2d').reached).toBe(3);
    // A pick that does not fit the dimension is ignored.
    expect(deriveWizard(at({ dimension: '3d', perspective: 'platformer' }), '2d').perspectiveChosen).toBe(false);
  });
});

describe('GameCreatePanel wizard', () => {
  it('starts on the dimension step with the prompt pinned in the footer', () => {
    const { container } = mount();
    expect(heading()).toBe('Pick a dimension');
    expect(screen.getByRole('radiogroup', { name: 'Dimension' })).toBeTruthy();
    const footer = container.querySelector('[data-media-panel-footer]') as HTMLElement;
    expect(within(footer).getByLabelText('First prompt')).toBeTruthy();
    expect(within(footer).getByRole('navigation', { name: 'Wizard steps' })).toBeTruthy();
  });

  it('advances on every pick, filtering perspective then genre by what came before', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: '2D' }));
    expect(heading()).toBe('Pick a perspective');
    expect(screen.getAllByRole('button', { pressed: false }).map((b) => b.getAttribute('aria-label'))).toEqual(
      expect.arrayContaining(['Platformer', 'Top-down', 'Isometric', '2.5D raycaster']),
    );
    expect(screen.queryByRole('button', { name: 'First person' })).toBeNull();

    fireEvent.click(card('Top-down'));
    expect(heading()).toBe('Pick a genre');
    const genres = ['Blank base', 'RTS', 'Top-down crime'];
    for (const g of genres) expect(card(g)).toBeTruthy();
    // FPS needs the raycaster, ARPG runs isometric or top-down (so is offered), shooters are 3D.
    expect(screen.queryByRole('button', { name: 'FPS' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Shooter' })).toBeNull();

    fireEvent.click(card('RTS'));
    expect(heading()).toBe('Fine-tune the game');
    expect(screen.getByTestId('game-wizard-trail').textContent).toBe('2D › Top-down › RTS');
  });

  it('filters 3D by perspective: the fighter and soulslike are third person only', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: '3D' }));
    fireEvent.click(card('First person'));
    expect(screen.queryByRole('button', { name: 'Fighter' })).toBeNull();
    expect(card('Shooter')).toBeTruthy();
    expect(card('Open world')).toBeTruthy();
    fireEvent.click(dot(2, 'Perspective'));
    fireEvent.click(card('Third person'));
    expect(card('Fighter')).toBeTruthy();
    expect(card('Soulslike')).toBeTruthy();
  });

  it('clears a later choice that no longer fits when an earlier step changes', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: '3D' }));
    fireEvent.click(card('Third person'));
    fireEvent.click(card('Fighter'));
    expect(heading()).toBe('Fine-tune the game');

    // Back to perspective, first person: the fighter no longer fits, so the genre step is open again.
    fireEvent.click(dot(2, 'Perspective'));
    fireEvent.click(card('First person'));
    expect(heading()).toBe('Pick a genre');
    expect(dot(4, 'Fine-tune').hasAttribute('disabled')).toBe(true);

    // Back to dimension, 2D: perspective is cleared too.
    fireEvent.click(dot(1, 'Dimension'));
    fireEvent.click(screen.getByRole('radio', { name: '2D' }));
    expect(heading()).toBe('Pick a perspective');
    expect(dot(3, 'Genre').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('game-wizard-trail').textContent).toBe('2D');
  });

  it('shows the current dot and only unlocks the steps already reached', () => {
    mount();
    expect(dot(1, 'Dimension').getAttribute('aria-current')).toBe('step');
    expect(dot(2, 'Perspective').hasAttribute('disabled')).toBe(false);
    expect(dot(3, 'Genre').hasAttribute('disabled')).toBe(true);
    expect(dot(4, 'Fine-tune').hasAttribute('disabled')).toBe(true);
    fireEvent.click(dot(2, 'Perspective'));
    expect(dot(2, 'Perspective').getAttribute('aria-current')).toBe('step');
    expect(heading()).toBe('Pick a perspective');
  });

  it('Back and Next walk the steps; Next waits for a pick', () => {
    mount();
    expect(back().hasAttribute('disabled')).toBe(true);
    fireEvent.click(next());
    expect(heading()).toBe('Pick a perspective');
    expect(next().hasAttribute('disabled')).toBe(true);
    fireEvent.click(card('Isometric'));
    fireEvent.click(back());
    expect(heading()).toBe('Pick a perspective');
    expect(next().hasAttribute('disabled')).toBe(false);
    fireEvent.click(next());
    expect(heading()).toBe('Pick a genre');
  });

  it('arrow keys step the wizard, except inside the prompt or the name field', () => {
    mount();
    fireEvent.keyDown(screen.getByTestId('game-wizard-heading'), { key: 'ArrowRight' });
    expect(heading()).toBe('Pick a perspective');
    fireEvent.keyDown(screen.getByLabelText('First prompt'), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByPlaceholderText('Moon Rover'), { key: 'ArrowLeft' });
    expect(heading()).toBe('Pick a perspective');
    fireEvent.keyDown(screen.getByTestId('game-wizard-heading'), { key: 'ArrowRight' });
    expect(heading()).toBe('Pick a perspective'); // nothing picked yet: no further
    fireEvent.keyDown(screen.getByTestId('game-wizard-heading'), { key: 'ArrowLeft' });
    expect(heading()).toBe('Pick a dimension');
  });

  it('seeds fine-tune defaults from the genre', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: '2D' }));
    fireEvent.click(card('Top-down'));
    fireEvent.click(card('Top-down crime'));
    const sw = (name: string) => screen.getByRole('switch', { name }) as HTMLInputElement;
    expect(sw('Law enforcement').checked).toBe(true);
    expect(sw('Wanted / bounty system').checked).toBe(true);
    expect(sw('Day/night cycle').checked).toBe(true);
    expect(sw('Bosses').checked).toBe(false);
    expect(screen.getByRole('slider', { name: 'Minutes per game day' })).toBeTruthy();

    fireEvent.click(dot(3, 'Genre'));
    fireEvent.click(card('RTS'));
    expect(sw('Law enforcement').checked).toBe(false);
    expect(sw('Missions').checked).toBe(true);
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('soulslike defaults bosses on', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: '3D' }));
    fireEvent.click(card('Third person'));
    fireEvent.click(card('Soulslike'));
    expect((screen.getByRole('switch', { name: 'Bosses' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('group', { name: 'Cameras' })).toBeTruthy();
  });

  it('disables options that do not fit, with the reason as a tooltip, and cascades dependants', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: '3D' }));
    fireEvent.click(card('Third person'));
    fireEvent.click(card('Fighter'));
    const day = screen.getByRole('switch', { name: 'Day/night cycle' }) as HTMLInputElement;
    expect(day.disabled).toBe(true);
    expect(day.closest('label')?.getAttribute('title')).toMatch(/single stage/);
    expect(screen.getByTestId('game-wizard-versus')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Cameras' })).toBeNull();

    fireEvent.click(dot(3, 'Genre'));
    fireEvent.click(card('Open world'));
    const sw = (name: string) => screen.getByRole('switch', { name }) as HTMLInputElement;
    expect(sw('Wanted / bounty system').checked).toBe(true);
    fireEvent.click(sw('Law enforcement'));
    expect(sw('Law enforcement').checked).toBe(false);
    expect(sw('Wanted / bounty system').checked).toBe(false);
    expect(sw('Wanted / bounty system').disabled).toBe(true);
    expect(sw('Wanted / bounty system').closest('label')?.getAttribute('title')).toMatch(/needs law enforcement/);
  });

  it('the day-length slider runs from 2 to 60 minutes', () => {
    mount();
    fireEvent.click(screen.getByRole('radio', { name: '3D' }));
    fireEvent.click(card('Third person'));
    fireEvent.click(card('Open world'));
    const slider = screen.getByRole('slider', { name: 'Minutes per game day' }) as HTMLInputElement;
    expect([slider.min, slider.max]).toEqual(['2', '60']);
    expect(slider.value).toBe('4');
    fireEvent.change(slider, { target: { value: '20' } });
    expect(screen.getByText('20 min')).toBeTruthy();
  });

  it('creating sends the chosen starter and options, and the form resets', async () => {
    let created: string | null = null;
    renderView(<GameCreatePanel onCreated={(id) => (created = id)} />, { fixtures });
    fireEvent.change(screen.getByPlaceholderText('Moon Rover'), { target: { value: 'Neon Drift' } });
    fireEvent.click(screen.getByRole('radio', { name: '2D' }));
    fireEvent.click(card('Top-down'));
    fireEvent.click(card('Top-down crime'));
    fireEvent.click(screen.getByRole('button', { name: 'Create game' }));
    await waitFor(() => expect(created).not.toBeNull());
    const call = mockGames().calls.find((c) => c['call'] === 'create');
    expect(call).toMatchObject({
      name: 'Neon Drift',
      engine: 'phaser',
      perspective: 'top-down',
      genre: 'crime',
      starter: 'crime@top-down',
      options: { lawEnforcement: true, wanted: true, dayNight: { enabled: true, minutesPerDay: 4 }, bosses: false },
    });
    await waitFor(() => expect(heading()).toBe('Pick a dimension'));
    expect((screen.getByPlaceholderText('Moon Rover') as HTMLInputElement).value).toBe('');
  });

  it('with a first prompt, the agent receives it followed by the Requested features list', async () => {
    renderView(<GameCreatePanel onCreated={() => {}} />, { fixtures });
    fireEvent.change(screen.getByPlaceholderText('Moon Rover'), { target: { value: 'Souls' } });
    fireEvent.click(screen.getByRole('radio', { name: '3D' }));
    fireEvent.click(card('Third person'));
    fireEvent.click(card('Soulslike'));
    fireEvent.change(screen.getByLabelText('First prompt'), { target: { value: 'A ruined cathedral' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create and run' }));
    await waitFor(() => expect(mockGames().calls.some((c) => c['call'] === 'agentRun')).toBe(true));
    const run = mockGames().calls.find((c) => c['call'] === 'agentRun')!;
    const prompt = String(run['prompt']);
    expect(prompt.startsWith('A ruined cathedral\n\nRequested features')).toBe(true);
    expect(prompt).toContain('- Bosses:');
    expect(prompt).not.toContain('- Law enforcement:');
  });
});
