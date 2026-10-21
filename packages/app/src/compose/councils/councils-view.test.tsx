import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CouncilsView } from '@midnite/studio-feature-councils/renderer/testing';
import type { Council } from '@midnite/studio-shared';

import { DialogHost } from '../../components/dialog-host';
import { useUiStore } from '../../store/ui-store';
import { StudioProviders } from '../studio-providers';

// Needs a real render under Studio's providers: the view reads its pane widths
// and the config pane's collapsed flag through the host port, from `ui-store`.

const COUNCIL: Council = {
  id: 'c1',
  name: 'Release board',
  members: [{ id: 'm1', name: 'Skeptic', provider: 'codex', role: 'Worst case.' }],
  synthProvider: 'opencode',
  createdAt: 1,
  updatedAt: 1,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CouncilsView under Studio providers', () => {
  it('lists the councils main returns and prompts for a selection', async () => {
    vi.stubGlobal('window', Object.assign(window, {
      midniteStudio: {
        council: {
          list: vi.fn(async () => ({ councils: [COUNCIL] })),
          get: vi.fn(async () => ({ council: COUNCIL })),
          run: { listForCouncil: vi.fn(async () => ({ runs: [] })) },
        },
      },
    }));
    useUiStore.setState({ councilConfigCollapsed: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DialogHost>
          <StudioProviders>
            <CouncilsView />
          </StudioProviders>
        </DialogHost>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('Release board')).toBeTruthy());
    expect(screen.getByText('Select a council')).toBeTruthy();
  });
});
