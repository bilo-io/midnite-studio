// vitest/jsdom: the Export pair's calls and inline failure, over a mock bridge.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExportButtons } from './export-buttons';
import { u } from './test-fixtures';
import { renderWithChrome } from './test-harness';

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

const install = (startup: object) => {
  window.midniteStudio = { startup: { ...startup, onChanged: () => () => undefined } } as unknown as typeof window.midniteStudio;
};

describe('ExportButtons', () => {
  it('asks main for the CSV and the PDF of the saved projection, and shows nothing on success or cancel', async () => {
    const csv = vi.fn(async () => ({ ok: true, value: { saved: true } }));
    const pdf = vi.fn(async () => ({ ok: true, value: { saved: false } }));
    install({ exportFleetProjectionCsv: csv, exportFleetProjectionPdf: pdf });
    renderWithChrome(<ExportButtons projectionId={u(1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(csv).toHaveBeenCalledWith({ projectionId: u(1) }));
    await waitFor(() => expect(pdf).toHaveBeenCalledWith({ projectionId: u(1) }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('shows a failure inline', async () => {
    install({ exportFleetProjectionCsv: vi.fn(async () => ({ ok: false, kind: 'io', message: 'Could not export the CSV: disk full' })) });
    renderWithChrome(<ExportButtons projectionId={u(1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect((await screen.findByRole('alert')).textContent).toContain('disk full');
  });
});
