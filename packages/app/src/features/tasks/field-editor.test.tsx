import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectFieldCell } from './field-editor';

const setField = vi.fn();

vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    forgeProject: { setField },
  }),
}));

let forgeWritesEnabled = false;

vi.mock('../../store/ui-store', () => ({
  useUiStore: (selector: (state: { forgeWritesEnabled: boolean }) => unknown) =>
    selector({ forgeWritesEnabled }),
}));

/* Phase 40 Theme E's own acceptance test, verbatim from the doc. */
describe('ProjectFieldCell', () => {
  beforeEach(() => {
    setField.mockReset();
    forgeWritesEnabled = false;
  });
  afterEach(cleanup);

  it('with forgeWritesEnabled off, a text field renders disabled and no mutation is issued', () => {
    forgeWritesEnabled = false;
    const field = { id: 'f1', name: 'Status', dataType: 'text' as const };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectFieldCell projectId="PVT_1" itemId="item1" field={field} value={undefined} />
      </QueryClientProvider>,
    );

    const editor = screen.getByRole('textbox', { name: 'Status' }) as HTMLInputElement;
    expect(editor.disabled).toBe(true);
    expect(editor.title).toBe('Enable review actions in Settings → Reviews');
    expect(setField).not.toHaveBeenCalled();
  });

  it('with forgeWritesEnabled on, editing a text field commits on blur', async () => {
    forgeWritesEnabled = true;
    setField.mockResolvedValue({ ok: true, kind: 'ok' });
    const field = { id: 'f1', name: 'Status', dataType: 'text' as const };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectFieldCell projectId="PVT_1" itemId="item1" field={field} value={undefined} />
      </QueryClientProvider>,
    );

    const editor = screen.getByRole('textbox', { name: 'Status' }) as HTMLInputElement;
    expect(editor.disabled).toBe(false);

    fireEvent.change(editor, { target: { value: 'Done' } });
    fireEvent.blur(editor);

    await waitFor(() =>
      expect(setField).toHaveBeenCalledWith({
        projectId: 'PVT_1',
        itemId: 'item1',
        fieldId: 'f1',
        value: { fieldId: 'f1', dataType: 'text', text: 'Done' },
      }),
    );
  });

  it('a single_select field renders a select of the field\'s own options', () => {
    forgeWritesEnabled = true;
    const field = {
      id: 'f1',
      name: 'Status',
      dataType: 'single_select' as const,
      options: [
        { id: 'todo', name: 'Todo', color: 'GRAY' },
        { id: 'done', name: 'Done', color: 'GREEN' },
      ],
    };
    const value = { fieldId: 'f1', dataType: 'single_select' as const, optionId: 'todo', name: 'Todo' };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectFieldCell projectId="PVT_1" itemId="item1" field={field} value={value} />
      </QueryClientProvider>,
    );

    const select = screen.getByRole('combobox', { name: 'Status' }) as HTMLSelectElement;
    expect(select.value).toBe('todo');
  });

  it("a single_select field's chosen option is painted in GitHub's own colour for it", () => {
    forgeWritesEnabled = true;
    const field = {
      id: 'f1',
      name: 'Priority',
      dataType: 'single_select' as const,
      options: [
        { id: 'p0', name: 'P0', color: 'RED' },
        { id: 'p1', name: 'P1', color: 'YELLOW' },
      ],
    };
    const value = { fieldId: 'f1', dataType: 'single_select' as const, optionId: 'p0', name: 'P0' };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectFieldCell projectId="PVT_1" itemId="item1" field={field} value={value} />
      </QueryClientProvider>,
    );

    const select = screen.getByRole('combobox', { name: 'Priority' }) as HTMLSelectElement;
    expect(select.style.color).toBe('rgb(239, 68, 68)'); // RED's swatch, #EF4444
  });

  it('a single_select field with nothing chosen renders with no colour', () => {
    forgeWritesEnabled = true;
    const field = {
      id: 'f1',
      name: 'Priority',
      dataType: 'single_select' as const,
      options: [{ id: 'p0', name: 'P0', color: 'RED' }],
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectFieldCell projectId="PVT_1" itemId="item1" field={field} value={undefined} />
      </QueryClientProvider>,
    );

    const select = screen.getByRole('combobox', { name: 'Priority' }) as HTMLSelectElement;
    expect(select.style.color).toBe('');
  });

  it('an iteration field renders read-only text, never an editor', () => {
    forgeWritesEnabled = true;
    const field = { id: 'f1', name: 'Sprint', dataType: 'iteration' as const };
    const value = { fieldId: 'f1', dataType: 'iteration' as const, iterationId: 'it1', title: 'Sprint 3' };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectFieldCell projectId="PVT_1" itemId="item1" field={field} value={value} />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Sprint 3')).toBeDefined();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
