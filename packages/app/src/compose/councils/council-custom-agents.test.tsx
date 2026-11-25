import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeatureFlagsStore } from '@midnite/studio-frame';
import { CouncilConfigPanel, CouncilRunView } from '@midnite/studio-feature-councils/renderer/testing';
import { createBlankAgentProfile, type AgentProfile, type Council, type CouncilRun } from '@midnite/studio-shared';

import { DialogHost } from '../../components/dialog-host';
import { StudioProviders } from '../studio-providers';

// #1699 — a council seat can be a custom agent: "Your agents" first in the member picker, the choice saved as
// `agentProfileId` beside the provider, and a deleted agent's fallback said in the config pane and the thread.

const REVIEWER: AgentProfile = { ...createBlankAgentProfile(), id: 'profile-rev', name: 'Reviewer', baseAgentId: 'claude' };
// A base a council cannot read an answer from: never offered as a seat.
const AIDER_BOT: AgentProfile = { ...createBlankAgentProfile(), id: 'profile-aider', name: 'Aider bot', baseAgentId: 'aider' };

const COUNCIL: Council = {
  id: 'c1',
  name: 'Release board',
  members: [
    { id: 'm1', name: 'Optimist', provider: 'claude', model: 'haiku-4-5', role: 'Best case.' },
    { id: 'm2', name: 'Skeptic', provider: 'agy', role: 'Worst case.' },
  ],
  synthProvider: 'claude',
  synthesisType: 'brainstorm',
  createdAt: 1,
  updatedAt: 1,
};

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <DialogHost>
        <StudioProviders>{children}</StudioProviders>
      </DialogHost>
    </QueryClientProvider>
  );
}

function stubBridge(profiles: AgentProfile[]) {
  const updateMembers = vi.fn(async (req: { id: string }) => ({ ok: true as const, value: { ...COUNCIL, ...req } }));
  const list = vi.fn(async () => ({ ok: true as const, value: { profiles } }));
  vi.stubGlobal('window', Object.assign(window, { midniteStudio: { council: { updateMembers }, agentProfile: { list } } }));
  return { updateMembers };
}

beforeEach(() => useFeatureFlagsStore.setState({ flags: { 'councils.pro': false } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the member picker', () => {
  it('lists Your agents first, and picking one saves agentProfileId on its base with no model', async () => {
    const { updateMembers } = stubBridge([REVIEWER, AIDER_BOT]);
    render(<CouncilConfigPanel council={COUNCIL} topic="" onDeleted={() => {}} />, { wrapper: Providers });

    fireEvent.click(within(screen.getByTestId('council-member-picker-0')).getByRole('button', { name: 'Provider: Claude' }));
    const list = await screen.findByRole('listbox', { name: 'Providers' });
    await waitFor(() =>
      expect(within(list).getAllByTestId('council-member-picker-0-provider-list-group').map((g) => g.textContent)).toEqual([
        'Your agents',
        'Agents',
      ]),
    );
    const options = within(list).getAllByRole('option').map((option) => option.textContent);
    expect(options[0]).toBe('Reviewer');
    expect(options).not.toContain('Aider bot');

    fireEvent.click(within(list).getByRole('option', { name: 'Reviewer' }));
    await waitFor(() => expect(updateMembers).toHaveBeenCalled(), { timeout: 2000 });
    const saved = updateMembers.mock.calls.at(-1)![0] as unknown as Council;
    expect(saved.members[0]).toEqual({ id: 'm1', name: 'Optimist', provider: 'claude', role: 'Best case.', agentProfileId: 'profile-rev' });
    // A custom agent runs its own model, so the seat offers none.
    expect(screen.queryByTestId('council-member-picker-0-model')).toBeNull();
  });

  it('says a seat whose custom agent was deleted runs as its base', async () => {
    stubBridge([]);
    const council: Council = { ...COUNCIL, members: [{ ...COUNCIL.members[0]!, agentProfileId: 'profile-gone' }, COUNCIL.members[1]!] };
    render(<CouncilConfigPanel council={council} topic="" onDeleted={() => {}} />, { wrapper: Providers });
    expect((await screen.findByTestId('council-member-fallback-0')).textContent).toContain('runs as Claude');
  });
});

describe('the thread', () => {
  const run = (member: Partial<CouncilRun['members'][number]>): CouncilRun => ({
    id: 'r1',
    councilId: 'c1',
    prompt: 'Ship it?',
    format: 'brainstorm',
    status: 'completed',
    synthProvider: 'claude',
    members: [{ memberId: 'm1', name: 'Optimist', provider: 'claude', role: 'r', status: 'succeeded', output: 'Yes.', truncated: false, startedAt: 0, ...member }],
    turns: [],
    createdAt: 0,
    updatedAt: 1,
  });

  it('names the custom agent an answer came from', async () => {
    stubBridge([REVIEWER]);
    render(<CouncilRunView run={run({ agentProfileId: 'profile-rev' })} />, { wrapper: Providers });
    fireEvent.click(screen.getByTestId('council-tab-m1'));
    await waitFor(() => expect(screen.getByTestId('council-thread').textContent).toContain('Reviewer · Claude'));
    expect(screen.queryByTestId('council-turn-notice')).toBeNull();
  });

  it('says when a deleted custom agent fell back to its base', () => {
    stubBridge([]);
    render(<CouncilRunView run={run({ agentProfileId: 'profile-gone', agentProfileFallback: 'deleted' })} />, { wrapper: Providers });
    fireEvent.click(screen.getByTestId('council-tab-m1'));
    expect(screen.getByTestId('council-turn-notice').textContent).toBe('Custom agent deleted, so this answer came from Claude.');
  });
});
