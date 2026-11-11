import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrameChromeProvider } from '@midnite/studio-frame';

import { SCIENCE_CHROME } from '../compose/science-chrome';
import { NotebooksView } from './notebooks-view';

const summary = (id: string, title: string, discipline: string) => ({ id, title, discipline, updatedAt: new Date().toISOString(), cellCount: 1 });
const list = vi.fn();

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FrameChromeProvider chrome={SCIENCE_CHROME}>
        <NotebooksView onView={() => undefined} />
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  list.mockReset();
  window.midniteStudio = { science: { list } } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('NotebooksView', () => {
  it('lists notebooks, filters by discipline and notes quarantined files', async () => {
    list.mockResolvedValue({
      ok: true,
      value: { notebooks: [summary('nb-aaaaaaaaaaaa', 'Orbits', 'physics'), summary('nb-bbbbbbbbbbbb', 'Benzene', 'chemistry')], quarantined: 2 },
    });
    mount();
    await waitFor(() => expect(screen.getByText('Orbits')).toBeTruthy());
    expect(screen.getByText('2 notebook files could not be read and were set aside')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'chemistry' }));
    expect(screen.queryByText('Orbits')).toBeNull();
    expect(screen.getByText('Benzene')).toBeTruthy();
    expect(screen.getByText('Select a notebook')).toBeTruthy();
  });

  it('shows an error banner with Retry', async () => {
    list.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'boom' });
    list.mockResolvedValue({ ok: true, value: { notebooks: [], quarantined: 0 } });
    mount();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('boom'));
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(screen.getByText('No notebooks yet')).toBeTruthy());
  });
});
