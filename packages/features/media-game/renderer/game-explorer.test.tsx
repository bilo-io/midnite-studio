// vitest/jsdom: Open Game sits before New game, a click asks main for the folder dialog, the empty state offers both.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameExplorer } from './game-explorer';
import { useAddGame } from './use-games';

const add = vi.fn();
const list = vi.fn();

beforeEach(() => {
  add.mockReset();
  list.mockReset();
  list.mockResolvedValue({ games: [] });
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { games: { list, add } };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

function Harness({ onNew = () => undefined, onAdded = () => undefined }: { onNew?: () => void; onAdded?: (id: string) => void }) {
  const addGame = useAddGame();
  return (
    <GameExplorer
      selectedId={null}
      onSelect={() => undefined}
      onNew={onNew}
      opening={addGame.isPending}
      onOpen={() =>
        addGame.mutate(undefined, {
          onSuccess: (result) => {
            if (result.ok && result.value.status !== 'cancelled') onAdded(result.value.gameId);
          },
        })
      }
    />
  );
}

function renderExplorer(ui = <Harness />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('GameExplorer Open Game', () => {
  it('renders Open Game immediately before New game in the header', async () => {
    renderExplorer();
    await screen.findByText(/No games yet/);
    const header = screen.getByTestId('game-explorer').firstElementChild as HTMLElement;
    const labels = Array.from(header.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual(['Open Game', 'New game']);
  });

  it('asks main to add with an empty request and reports the added game', async () => {
    add.mockResolvedValue({ ok: true, value: { status: 'added', gameId: 'g1', path: '/x' } });
    const onAdded = vi.fn();
    renderExplorer(<Harness onAdded={onAdded} />);
    await screen.findByText(/No games yet/);
    const header = screen.getByTestId('game-explorer').firstElementChild as HTMLElement;
    fireEvent.click(Array.from(header.querySelectorAll('button')).find((b) => b.textContent === 'Open Game')!);
    await waitFor(() => expect(add).toHaveBeenCalledWith({}));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('g1'));
  });

  it('does nothing further when the dialog is cancelled', async () => {
    add.mockResolvedValue({ ok: true, value: { status: 'cancelled' } });
    const onAdded = vi.fn();
    renderExplorer(<Harness onAdded={onAdded} />);
    await screen.findByText(/No games yet/);
    const header = screen.getByTestId('game-explorer').firstElementChild as HTMLElement;
    fireEvent.click(Array.from(header.querySelectorAll('button')).find((b) => b.textContent === 'Open Game')!);
    await waitFor(() => expect(add).toHaveBeenCalled());
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('shows both actions in the empty state', async () => {
    renderExplorer();
    expect(await screen.findByText('No games yet. Create one from a starter, or open one you already have.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Open Game' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'New game' })).toHaveLength(2);
  });
});
