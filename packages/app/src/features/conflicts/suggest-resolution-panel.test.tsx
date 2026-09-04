import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CouncilRun, MidniteStudioBridge } from '@midnite/studio-shared';

import { SuggestResolutionPanel } from './suggest-resolution-panel';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function runAt(status: CouncilRun['status'], overrides: Partial<CouncilRun> = {}): CouncilRun {
  return {
    id: 'run-1',
    councilId: 'c1',
    prompt: 'p',
    format: 'brainstorm',
    status,
    synthProvider: 'agy',
    members: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function installBridge({
  start,
  get,
}: {
  start: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
}) {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    council: {
      run: { start, get },
    },
  } as unknown as Partial<MidniteStudioBridge>;
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('SuggestResolutionPanel', () => {
  it('starts a run with the exact councilId and prompt it was given', async () => {
    const start = vi.fn().mockResolvedValue({ ok: true, value: runAt('completed', { synthesisOutput: 'Take theirs.' }) });
    const get = vi.fn().mockResolvedValue({ run: runAt('completed', { synthesisOutput: 'Take theirs.' }) });
    installBridge({ start, get });

    render(<SuggestResolutionPanel councilId="c1" prompt="resolve this" />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a resolution' }));

    await waitFor(() => expect(start).toHaveBeenCalledWith({ councilId: 'c1', prompt: 'resolve this' }));
  });

  it('shows the synthesis text once the run completes', async () => {
    const start = vi.fn().mockResolvedValue({ ok: true, value: runAt('running') });
    const get = vi.fn().mockResolvedValue({ run: runAt('completed', { synthesisOutput: 'Accept theirs — it fixes the bug.' }) });
    installBridge({ start, get });

    render(<SuggestResolutionPanel councilId="c1" prompt="p" />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a resolution' }));

    expect(await screen.findByText('Accept theirs — it fixes the bug.')).toBeTruthy();
  });

  it('shows a thinking state while the run is still in progress', async () => {
    const start = vi.fn().mockResolvedValue({ ok: true, value: runAt('running') });
    const get = vi.fn().mockResolvedValue({ run: runAt('running') });
    installBridge({ start, get });

    render(<SuggestResolutionPanel councilId="c1" prompt="p" />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a resolution' }));

    expect(await screen.findByText('Thinking…')).toBeTruthy();
  });

  it('shows the failure reason rather than a blank panel when the run fails', async () => {
    const start = vi.fn().mockResolvedValue({ ok: true, value: runAt('running') });
    const get = vi.fn().mockResolvedValue({ run: runAt('failed', { synthesisError: 'The provider timed out.' }) });
    installBridge({ start, get });

    render(<SuggestResolutionPanel councilId="c1" prompt="p" />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a resolution' }));

    expect(await screen.findByText('The provider timed out.')).toBeTruthy();
  });
});
