import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScienceNotebook } from '@midnite/studio-shared';

import { NotebookEditor } from './notebook-editor';

const notebook: ScienceNotebook = {
  version: 1,
  id: 'nb-aaaaaaaaaaaa',
  title: 'Kinematics',
  discipline: 'physics',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  cells: [{ kind: 'markdown', id: 'c-aaaaaaaa', source: '' }],
};

const write = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  write.mockReset().mockResolvedValue({ ok: true, value: { updatedAt: '2026-01-02T00:00:00.000Z' } });
  window.midniteStudio = { science: { write, rename: vi.fn().mockResolvedValue({ ok: true }) } } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.midniteStudio = undefined;
});

describe('NotebookEditor', () => {
  it('renders $x^2$ with KaTeX after Shift+Enter', () => {
    render(<NotebookEditor notebook={notebook} onSaved={() => undefined} />);
    const area = screen.getByLabelText('Text cell');
    fireEvent.change(area, { target: { value: 'Area is $x^2$' } });
    fireEvent.keyDown(area, { key: 'Enter', shiftKey: true });
    expect(document.querySelector('.katex')).not.toBeNull();
  });

  it('renders an unclosed formula without throwing', () => {
    render(<NotebookEditor notebook={{ ...notebook, cells: [{ kind: 'markdown', id: 'c-aaaaaaaa', source: '$\\frac{' }] }} onSaved={() => undefined} />);
    expect(screen.getByTestId('markdown-rendered')).toBeTruthy();
  });

  it('adds a compute cell and reorders it with move up', () => {
    render(<NotebookEditor notebook={notebook} onSaved={() => undefined} />);
    fireEvent.click(screen.getByText('Add cell'));
    fireEvent.click(screen.getByText('Compute'));
    const kinds = () => [...document.querySelectorAll('[data-cell-kind]')].map((e) => e.getAttribute('data-cell-kind'));
    expect(kinds()).toEqual(['markdown', 'compute']);
    fireEvent.click(screen.getAllByLabelText('Move cell up')[1]!);
    expect(kinds()).toEqual(['compute', 'markdown']);
  });

  it('writes once, 600 ms after an edit', async () => {
    render(<NotebookEditor notebook={notebook} onSaved={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Text cell'), { target: { value: 'hello' } });
    expect(write).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0].notebook.cells[0].source).toBe('hello');
  });

  it('shows "Not saved" when a write fails', async () => {
    write.mockResolvedValue({ ok: false, kind: 'error', message: 'nope' });
    render(<NotebookEditor notebook={notebook} onSaved={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Text cell'), { target: { value: 'x' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(screen.getByRole('alert').textContent).toContain('Not saved');
  });
});
