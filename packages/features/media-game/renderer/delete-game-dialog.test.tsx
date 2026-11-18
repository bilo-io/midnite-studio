// vitest/jsdom: the blast-radius text and the exact-match gate on Move to Trash.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeleteGameDialog } from './delete-game-dialog';

const deleteInfo = vi.fn();
beforeEach(() => {
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { games: { deleteInfo } };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  vi.clearAllMocks();
});

function open(info: object, onConfirm = vi.fn()) {
  deleteInfo.mockResolvedValue({ ok: true, value: { path: '/g/alpha', name: 'Alpha', bytes: 2_621_440, ...info } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DeleteGameDialog gameId="g1" name="Alpha" onCancel={() => undefined} onConfirm={onConfirm} />
    </QueryClientProvider>,
  );
  return onConfirm;
}

describe('DeleteGameDialog', () => {
  it('shows the path, size, uncommitted files, unpushed commits and the Trash', async () => {
    open({ uncommitted: 3, unpushed: 2, hasRemote: true });
    expect(await screen.findByText('/g/alpha')).toBeTruthy();
    expect(screen.getByText('2.5 MB')).toBeTruthy();
    expect(screen.getByText('3 uncommitted files')).toBeTruthy();
    expect(screen.getByText('2 commits not pushed')).toBeTruthy();
    expect(screen.getByText(/moves the game.s folder to the Trash/)).toBeTruthy();
  });

  it('warns in red that there is no remote', async () => {
    open({ uncommitted: 0, unpushed: null, hasRemote: false });
    const warning = await screen.findByText('No remote — this is the only copy');
    expect(warning.className).toContain('text-destructive');
    expect(screen.getByText('0 uncommitted files')).toBeTruthy();
  });

  it('enables Move to Trash only on an exact name match, then confirms with the typed name', async () => {
    const onConfirm = open({ uncommitted: 0, unpushed: 0, hasRemote: true });
    await screen.findByText('/g/alpha');
    const button = screen.getByRole('button', { name: 'Move to Trash' });
    const field = screen.getByRole('textbox');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: 'alpha' } });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: 'Alpha ' } });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: 'Alpha' } });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith('Alpha');
  });
});
