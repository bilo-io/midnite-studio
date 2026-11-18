// vitest/jsdom: findings grouped by area in the standard's order, the Fix call and the refresh it brings, the inline
// genre form and a refusal shown inline. No browser capability is needed.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { GameDiagnosis, GameFinding } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameDoctorPanel, groupFindings } from './game-doctor-panel';

const finding = (over: Partial<GameFinding> & Pick<GameFinding, 'rule' | 'area'>): GameFinding => ({
  level: 'warn',
  message: `${over.rule} message`,
  path: null,
  fixId: null,
  ...over,
});

const diagnosis = (findings: GameFinding[]): GameDiagnosis => ({
  path: '/games/alpha',
  hasManifest: true,
  findings,
  counts: { error: 0, warn: findings.length, info: 0 },
  status: findings.length ? 'warn' : 'ok',
});

const FINDINGS = [
  finding({ rule: 'levels.none', area: 'levels', level: 'info' }),
  finding({ rule: 'manifest.genre-unknown', area: 'manifest', fixId: 'set-genre' }),
  finding({ rule: 'kit.outdated', area: 'kit', fixId: 'upgrade-kit' }),
  finding({ rule: 'manifest.vendored-legacy', area: 'manifest', fixId: 'normalise-vendored' }),
];

const doctor = vi.fn();
const doctorFix = vi.fn();

beforeEach(() => {
  doctor.mockReset();
  doctorFix.mockReset();
  doctor.mockResolvedValue({ ok: true, value: diagnosis(FINDINGS) });
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { games: { doctor, doctorFix } };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

const renderPanel = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <GameDoctorPanel gameId="g1" name="Alpha" onClose={() => undefined} />
    </QueryClientProvider>,
  );

describe('groupFindings', () => {
  it('orders areas manifest, entry, kit, levels, assets and drops empty ones', () => {
    expect(groupFindings(FINDINGS).map((g) => g.area)).toEqual(['manifest', 'kit', 'levels']);
    expect(groupFindings(FINDINGS)[0]?.findings).toHaveLength(2);
  });
});

describe('GameDoctorPanel', () => {
  it('lists findings by area with unlocks, the fix hint and a Fix button only where a fixId exists', async () => {
    renderPanel();
    const manifest = await screen.findByTestId('doctor-area-manifest');
    expect(within(manifest).getAllByRole('button', { name: 'Fix' })).toHaveLength(2);
    expect(within(manifest).getAllByText(/^Unlocks:/).length).toBe(2);
    expect(within(screen.getByTestId('finding-levels.none')).queryByRole('button', { name: /Fix/ })).toBeNull();
    expect(within(screen.getByTestId('finding-kit.outdated')).getByText(/Makes a new branch/)).toBeTruthy();
    expect(doctor).toHaveBeenCalledWith({ gameId: 'g1' });
  });

  it('shows the all-clear when there are no findings', async () => {
    doctor.mockResolvedValue({ ok: true, value: diagnosis([]) });
    renderPanel();
    expect(await screen.findByText(/meets the Midnite game standard/)).toBeTruthy();
  });

  it('Fix calls doctorFix and replaces the findings with the fresh diagnosis', async () => {
    doctorFix.mockResolvedValue({
      ok: true,
      value: { commit: 'abcdef1234', diagnosis: diagnosis(FINDINGS.filter((f) => f.rule !== 'manifest.vendored-legacy')) },
    });
    renderPanel();
    const row = await screen.findByTestId('finding-manifest.vendored-legacy');
    fireEvent.click(within(row).getByRole('button', { name: 'Fix' }));
    await waitFor(() => expect(doctorFix).toHaveBeenCalledWith({ fixId: 'normalise-vendored', gameId: 'g1' }));
    await waitFor(() => expect(screen.queryByTestId('finding-manifest.vendored-legacy')).toBeNull());
    expect(screen.getByRole('status').textContent).toContain('abcdef1');
  });

  it('opens an inline genre form for set-genre and sends the chosen genre', async () => {
    doctorFix.mockResolvedValue({ ok: true, value: { commit: null, diagnosis: diagnosis(FINDINGS) } });
    renderPanel();
    const row = await screen.findByTestId('finding-manifest.genre-unknown');
    fireEvent.click(within(row).getByRole('button', { name: 'Fix' }));
    expect(doctorFix).not.toHaveBeenCalled();
    fireEvent.change(within(row).getByLabelText('Genre'), { target: { value: 'shmup' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Set genre' }));
    await waitFor(() => expect(doctorFix).toHaveBeenCalledWith({ fixId: 'set-genre', genre: 'shmup', gameId: 'g1' }));
    expect((await screen.findByRole('status')).textContent).toContain('Already fixed');
  });

  it('shows a refusal inline, as given', async () => {
    doctorFix.mockResolvedValue({ ok: false, kind: 'error', message: 'Commit or discard your changes to midnite-game.json first.' });
    renderPanel();
    const row = await screen.findByTestId('finding-manifest.vendored-legacy');
    fireEvent.click(within(row).getByRole('button', { name: 'Fix' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Commit or discard your changes to midnite-game.json first.');
  });

  it('Re-check runs the diagnosis again', async () => {
    renderPanel();
    await screen.findByTestId('doctor-area-manifest');
    fireEvent.click(screen.getByRole('button', { name: /Re-check/ }));
    await waitFor(() => expect(doctor).toHaveBeenCalledTimes(2));
  });
});
