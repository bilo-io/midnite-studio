import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SCIENCE_TEMPLATES } from '../templates';
import { scienceUiStore } from '../science-ui-store';
import { TemplatesView } from './templates-view';

const create = vi.fn();
const view = (onView = vi.fn()) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TemplatesView onView={onView} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  create.mockReset().mockResolvedValue({ ok: true, value: { notebook: { id: 'nb-aaaaaaaaaaaa' } } });
  window.midniteStudio = { science: { create } } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('TemplatesView', () => {
  it('lists every template and filters by discipline', () => {
    view();
    expect(screen.getAllByText('Use template')).toHaveLength(SCIENCE_TEMPLATES.length);
    fireEvent.click(screen.getByRole('button', { name: 'physics' }));
    expect(screen.getAllByText('Use template')).toHaveLength(SCIENCE_TEMPLATES.filter((t) => t.discipline === 'physics').length);
  });

  it('creates a copy with fresh cell ids, selects it and opens the notebooks view', async () => {
    const onView = vi.fn();
    view(onView);
    fireEvent.click(screen.getAllByText('Use template')[0]!);
    await waitFor(() => expect(onView).toHaveBeenCalledWith('notebooks'));
    const req = create.mock.calls[0]![0];
    expect(req.title).toBe(SCIENCE_TEMPLATES[0]!.title);
    expect(req.cells.map((c: { id: string }) => c.id)).not.toEqual(SCIENCE_TEMPLATES[0]!.cells.map((c) => c.id));
    expect(scienceUiStore().getState().lastNotebookId).toBe('nb-aaaaaaaaaaaa');
  });

  it('shows the error and stays when the create fails', async () => {
    create.mockResolvedValue({ ok: false, kind: 'error', message: 'disk full' });
    const onView = vi.fn();
    view(onView);
    fireEvent.click(screen.getAllByText('Use template')[0]!);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('disk full'));
    expect(onView).not.toHaveBeenCalled();
  });
});
