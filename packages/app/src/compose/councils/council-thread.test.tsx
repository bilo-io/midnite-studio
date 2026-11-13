import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CouncilComposer,
  CouncilCreateDialog,
  CouncilRunList,
  CouncilRunView,
  turnsOf,
} from '@midnite/studio-feature-councils/renderer/testing';
import type { CouncilRun } from '@midnite/studio-shared';

import { DialogHost } from '../../components/dialog-host';
import { StudioProviders } from '../studio-providers';

// Phase 133 Themes A, C, D and E as the user meets them: the thread, the
// rail's turn counts and statuses, and the recommend flow in the new-council
// modal. Rendered under Studio's providers, since the thread takes its
// composer, markdown and agent marks through the councils host port.

const RUN: CouncilRun = {
  id: 'r1',
  councilId: 'c1',
  prompt: 'And the risks?',
  format: 'brainstorm',
  status: 'running',
  synthProvider: 'claude',
  synthModel: 'haiku',
  members: [
    { memberId: 'm1', name: 'Skeptic', provider: 'agy', role: 'r', model: 'gemini-3.8-flash-low', status: 'running', output: '', truncated: false, startedAt: 0 },
    { memberId: 'm2', name: 'Builder', provider: 'agy', role: 'r', status: 'timeout', output: '', truncated: false, error: 'Timed out after 5 min.', startedAt: 0 },
  ],
  turns: [
    {
      prompt: 'Should we ship on Friday?',
      status: 'completed',
      members: [
        { memberId: 'm1', name: 'Skeptic', provider: 'agy', role: 'r', status: 'succeeded', output: 'Not on a Friday.', truncated: false, startedAt: 0 },
        { memberId: 'm2', name: 'Builder', provider: 'agy', role: 'r', status: 'succeeded', output: 'Ship it.', truncated: false, startedAt: 0 },
      ],
      synthProvider: 'claude',
      synthesisStatus: 'succeeded',
      synthesisOutput: 'Ship on Monday.',
      createdAt: 0,
      endedAt: 1,
    },
  ],
  createdAt: 0,
  updatedAt: 2,
  turnStartedAt: 2,
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('turnsOf', () => {
  it('lists archived turns first and the run itself as the latest', () => {
    const turns = turnsOf(RUN);
    expect(turns.map((t) => [t.prompt, t.latest])).toEqual([
      ['Should we ship on Friday?', false],
      ['And the risks?', true],
    ]);
  });
});

describe('CouncilRunView', () => {
  it('shows every turn of the thread in the Synthesis tab, the live one as a working row', () => {
    render(<CouncilRunView run={RUN} />, { wrapper: Providers });
    const thread = screen.getByTestId('council-thread');
    expect(within(thread).getByText('Should we ship on Friday?')).toBeTruthy();
    expect(within(thread).getByText('Ship on Monday.')).toBeTruthy();
    expect(within(thread).getByText('And the risks?')).toBeTruthy();
    expect(within(thread).getByTestId('council-working').textContent).toContain('Waiting for Skeptic');
  });

  it("reads a member's timeout as a timeout, and offers Retry once it has settled", () => {
    render(<CouncilRunView run={RUN} />, { wrapper: Providers });
    fireEvent.click(screen.getByTestId('council-tab-m2'));
    const thread = screen.getByTestId('council-thread');
    expect(within(thread).getByText('Timed out')).toBeTruthy();
    expect(within(thread).getByText('Timed out after 5 min.')).toBeTruthy();
    expect(within(thread).getByRole('button', { name: 'Retry this member' })).toBeTruthy();
  });

  it('names the model a member was asked with', () => {
    render(<CouncilRunView run={RUN} />, { wrapper: Providers });
    fireEvent.click(screen.getByTestId('council-tab-m1'));
    expect(screen.getByTestId('council-thread').textContent).toMatch(/Antigravity · /);
    expect(screen.getByRole('button', { name: 'Skip this member' })).toBeTruthy();
  });
});

describe('CouncilRunList', () => {
  it('shows each thread with its first prompt, its status and its turn count', async () => {
    vi.stubGlobal('window', Object.assign(window, {
      midniteStudio: { council: { run: { list: vi.fn(async () => ({ runs: [RUN, { ...RUN, id: 'r2', status: 'cancelled', turns: [], prompt: 'Solo' }] })) } } },
    }));
    render(
      <CouncilRunList
        councilName="Release board"
        councilId="c1"
        activeRunId={null}
        onSelectRun={() => {}}
        onNewThread={() => {}}
        onBack={() => {}}
        onCouncilCreated={() => {}}
      />,
      { wrapper: Providers },
    );
    const rows = await screen.findAllByTestId('council-thread-row');
    expect(rows.map((r) => r.textContent)).toEqual(['SoloStopped·1 turn', 'Should we ship on Friday?Running·2 turns']);
  });
});

describe('CouncilCreateDialog — recommend', () => {
  it('lists the recommended members for editing, and creates with what the user kept', async () => {
    const recommend = vi.fn(async () => ({
      ok: true as const,
      value: {
        description: 'Weighs a release.',
        synthProvider: 'claude' as const,
        members: [
          { name: 'Skeptic', role: 'Find the worst case.', provider: 'agy' as const },
          { name: 'Builder', role: 'Find the shortest path.', provider: 'claude' as const },
        ],
      },
    }));
    vi.stubGlobal('window', Object.assign(window, { midniteStudio: { council: { recommend } } }));
    const onCreate = vi.fn();
    render(<CouncilCreateDialog onCancel={() => {}} onCreate={onCreate} />, { wrapper: Providers });

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Release board' } });
    fireEvent.change(screen.getByLabelText('Recommendation brief'), { target: { value: 'ship or hold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Recommend' }));

    await screen.findByTestId('council-recommendation');
    expect(recommend).toHaveBeenCalledWith(expect.objectContaining({ name: 'Release board', brief: 'ship or hold' }));
    expect((screen.getByLabelText('Description (optional)') as HTMLTextAreaElement).value).toBe('Weighs a release.');

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove recommended member' })[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0]![0]).toMatchObject({
      name: 'Release board',
      description: 'Weighs a release.',
      synthProvider: 'claude',
      members: [{ name: 'Skeptic', role: 'Find the worst case.', provider: 'agy' }],
    });
  });

  it('says why when no recommendation came back, and still creates with the starter members', async () => {
    const recommend = vi.fn(async () => ({ ok: false as const, kind: 'error' as const, message: 'Could not get a recommendation (claude: timed out).' }));
    vi.stubGlobal('window', Object.assign(window, { midniteStudio: { council: { recommend } } }));
    const onCreate = vi.fn();
    render(<CouncilCreateDialog onCancel={() => {}} onCreate={onCreate} />, { wrapper: Providers });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Board' } });
    fireEvent.click(screen.getByRole('button', { name: 'Recommend' }));
    expect((await screen.findByRole('alert')).textContent).toContain('claude: timed out');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Board' });
  });
});

describe('CouncilComposer', () => {
  it('hands the prompt back when main refuses the turn', async () => {
    const start = vi.fn(async () => ({ ok: false as const, kind: 'error' as const, message: 'This council has no members yet.' }));
    vi.stubGlobal('window', Object.assign(window, { midniteStudio: { council: { run: { start } } } }));
    const onRunStarted = vi.fn();
    render(<CouncilComposer councilId="c1" run={null} canStart onRunStarted={onRunStarted} />, { wrapper: Providers });
    const box = screen.getByLabelText('Council prompt') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Ship it?' } });
    fireEvent.click(screen.getByTestId('council-composer-send'));
    await waitFor(() => expect(start).toHaveBeenCalledWith({ councilId: 'c1', prompt: 'Ship it?' }));
    await waitFor(() => expect(box.value).toBe('Ship it?'));
    expect(onRunStarted).not.toHaveBeenCalled();
  });
});
