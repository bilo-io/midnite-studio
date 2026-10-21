import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GAMES_OLLAMA_WARNING } from '@midnite/studio-shared';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { GamesRootSection } from './games-root-section';

afterEach(cleanup);

describe('Settings ▸ Media ▸ Games', () => {
  it('shows the default location, the network help text and the Ollama warning', async () => {
    renderView(<GamesRootSection />, { fixtures });
    expect((await screen.findByTestId('games-root-path')).textContent).toBe('/Users/test/Midnite Games');
    expect(screen.getByText("Games can't reach the internet unless you allow it per game.")).toBeTruthy();
    expect(screen.getByTestId('games-ollama-warning').textContent).toBe(GAMES_OLLAMA_WARNING);
    // The default location has nothing to reset.
    expect(screen.getByRole('button', { name: /Reset to default/ }).hasAttribute('disabled')).toBe(true);
  });

  it('shows main’s validation message for a stored root that is no longer usable', async () => {
    renderView(<GamesRootSection />, {
      fixtures: { ...fixtures, games: { settings: { gamesRoot: '/repo/games' }, resolvedRoot: '/repo/games', rootProblem: 'This folder is inside the git repository /repo. Games are their own repositories — pick a folder outside it.' } },
    });
    expect((await screen.findByRole('alert')).textContent).toContain('This folder is inside the git repository /repo.');
    expect(screen.getByRole('button', { name: /Reset to default/ }).hasAttribute('disabled')).toBe(false);
  });

  it('changes the default engine and the squash switch through the bridge', async () => {
    renderView(<GamesRootSection />, { fixtures });
    const engine = await screen.findByLabelText('Default engine');
    fireEvent.change(engine, { target: { value: 'three' } });
    await waitFor(() => expect((screen.getByLabelText('Default engine') as HTMLSelectElement).value).toBe('three'));

    const squash = screen.getByRole('switch', { name: 'Squash each run into one commit' }) as HTMLInputElement;
    expect(squash.checked).toBe(false);
    fireEvent.click(squash);
    await waitFor(() => expect((screen.getByRole('switch', { name: 'Squash each run into one commit' }) as HTMLInputElement).checked).toBe(true));
  });
});
