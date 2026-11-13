import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeatureFlagsStore } from '@midnite/studio-frame';
import { CouncilConfigPanel } from '@midnite/studio-feature-councils/renderer/testing';
import { COUNCIL_SYNTHESIS_PRESETS, MIDNITE_PRICING_URL, type Council } from '@midnite/studio-shared';

import { DialogHost } from '../../components/dialog-host';
import { StudioProviders } from '../studio-providers';

// Phase 134 Themes B–E as the user meets them in the config pane: the
// synthesizer card, presets bringing members, the member accordions, the
// member-count slider with its free-tier cap, and Generate with AI.

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

function stubBridge(extra: Record<string, unknown> = {}) {
  const updateMembers = vi.fn(async (req: { id: string }) => ({ ok: true as const, value: { ...COUNCIL, ...req } }));
  const openExternal = vi.fn(async () => undefined);
  vi.stubGlobal(
    'window',
    Object.assign(window, { midniteStudio: { council: { updateMembers, ...extra }, shell: { openExternal } } }),
  );
  return { updateMembers, openExternal };
}

/** Each member's accordion toggle — the header button that controls its body. */
const toggles = () =>
  screen.getAllByTestId('council-member').map((row) => row.querySelector<HTMLButtonElement>('[aria-controls^="council-member-body-"]')!);
const memberNames = () => toggles().map((toggle) => toggle.textContent);

beforeEach(() => useFeatureFlagsStore.setState({ flags: { 'councils.pro': false } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CouncilConfigPanel — synthesizer', () => {
  it('picking a preset brings its members on the agents already chosen, and saves the type', async () => {
    const { updateMembers } = stubBridge();
    render(<CouncilConfigPanel council={COUNCIL} topic="" onDeleted={() => {}} />, { wrapper: Providers });

    fireEvent.change(screen.getByLabelText('Synthesis type'), { target: { value: 'debate' } });
    expect(memberNames()).toEqual(['Affirmative', 'Negative', 'Cross-examiner']);
    // The newly revealed members cascade in.
    const rows = screen.getAllByTestId('council-member');
    expect(rows.every((row) => row.className.includes('animate-fade-in-up'))).toBe(true);
    expect(rows.map((row) => row.style.animationDelay)).toEqual(['0ms', '90ms', '180ms']);
    expect((screen.getByLabelText('Synthesis instructions') as HTMLTextAreaElement).value).toBe(
      COUNCIL_SYNTHESIS_PRESETS.debate.instructions,
    );

    await waitFor(() => expect(updateMembers).toHaveBeenCalled(), { timeout: 2000 });
    const saved = updateMembers.mock.calls.at(-1)![0] as unknown as Council;
    expect(saved.synthesisType).toBe('debate');
    expect('synthInstructions' in saved).toBe(false);
    expect(saved.members.map((m) => [m.provider, m.model])).toEqual([
      ['claude', 'haiku-4-5'],
      ['agy', undefined],
      ['agy', undefined],
    ]);
  });

  it('edited preset instructions save, and Reset to preset clears them', async () => {
    const { updateMembers } = stubBridge();
    render(<CouncilConfigPanel council={COUNCIL} topic="" onDeleted={() => {}} />, { wrapper: Providers });

    fireEvent.change(screen.getByLabelText('Synthesis instructions'), { target: { value: 'Rank by cost.' } });
    await waitFor(() => expect(updateMembers).toHaveBeenCalled(), { timeout: 2000 });
    expect(updateMembers.mock.calls.at(-1)![0]).toMatchObject({ synthInstructions: 'Rank by cost.' });

    fireEvent.click(screen.getByRole('button', { name: 'Reset to preset' }));
    expect((screen.getByLabelText('Synthesis instructions') as HTMLTextAreaElement).value).toBe(
      COUNCIL_SYNTHESIS_PRESETS.brainstorm.instructions,
    );
    await waitFor(() => expect('synthInstructions' in (updateMembers.mock.calls.at(-1)![0] as object)).toBe(false), {
      timeout: 2000,
    });
  });

  it('recommends a type for the topic, and Use applies it', () => {
    stubBridge();
    render(<CouncilConfigPanel council={COUNCIL} topic="Postgres vs MySQL for the ledger?" onDeleted={() => {}} />, {
      wrapper: Providers,
    });
    const suggestion = screen.getByTestId('council-synthesis-recommendation');
    expect(suggestion.textContent).toContain('Suggested: Debate');
    fireEvent.click(within(suggestion).getByRole('button', { name: 'Use' }));
    expect((screen.getByLabelText('Synthesis type') as HTMLSelectElement).value).toBe('debate');
    expect(screen.queryByTestId('council-synthesis-recommendation')).toBeNull();
  });

  it('Custom offers Generate with AI, which fills the instructions and the members', async () => {
    const generate = vi.fn(async (_req: unknown) => ({
      ok: true as const,
      value: {
        instructions: 'Combine into one plan.',
        members: [
          { name: 'Strategist', role: 'Set direction.', provider: 'claude' as const, model: 'haiku-4-5' },
          { name: 'Operator', role: 'Run it.', provider: 'agy' as const, model: 'gemini-3.8-flash-low' },
        ],
      },
    }));
    stubBridge({ generate });
    render(<CouncilConfigPanel council={COUNCIL} topic="Launch plan" onDeleted={() => {}} />, { wrapper: Providers });

    expect(screen.queryByRole('button', { name: 'Generate with AI' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Synthesis type'), { target: { value: 'custom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));

    await waitFor(() => expect(memberNames()).toEqual(['Strategist', 'Operator']));
    expect((screen.getByLabelText('Synthesis instructions') as HTMLTextAreaElement).value).toBe('Combine into one plan.');
    const request = generate.mock.calls[0]![0] as { topic: string; count: number; providers: { provider: string; models: string[] }[] };
    expect(request).toMatchObject({ name: 'Release board', topic: 'Launch plan', count: 2 });
    expect(request.providers.find((p) => p.provider === 'agy')?.models).toContain('gemini-3.8-flash-low');
    expect(request.providers.every((p) => !p.models.includes('default'))).toBe(true);
  });
});

describe('CouncilConfigPanel — member accordions', () => {
  it('start collapsed; the header picker and trash work collapsed, and the toggle reveals the fields', () => {
    stubBridge();
    render(<CouncilConfigPanel council={{ ...COUNCIL, members: [...COUNCIL.members, { id: 'm3', name: 'Pragmatist', provider: 'codex', role: 'r' }] }} topic="" onDeleted={() => {}} />, {
      wrapper: Providers,
    });
    expect(screen.queryByRole('textbox', { name: 'Member name' })).toBeNull();
    expect(screen.getByTestId('council-member-picker-0')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Optimist' }));
    expect(memberNames()).toEqual(['Skeptic', 'Pragmatist']);

    const toggle = toggles()[0]!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('council-member-body-m2');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect((screen.getByRole('textbox', { name: 'Member name' }) as HTMLInputElement).value).toBe('Skeptic');
  });

  it('will not remove below two members', () => {
    stubBridge();
    render(<CouncilConfigPanel council={COUNCIL} topic="" onDeleted={() => {}} />, { wrapper: Providers });
    const trash = screen.getAllByRole('button', { name: 'A council needs at least 2 members' });
    expect(trash).toHaveLength(2);
  });
});

describe('CouncilConfigPanel — member count', () => {
  it('free: past three opens the upgrade prompt, whose See pricing opens the pricing page', async () => {
    const { openExternal } = stubBridge();
    render(<CouncilConfigPanel council={COUNCIL} topic="" onDeleted={() => {}} />, { wrapper: Providers });
    const slider = screen.getByRole('slider', { name: 'Members' });

    fireEvent.change(slider, { target: { value: '3' } });
    expect(screen.getAllByTestId('council-member')).toHaveLength(3);
    expect(screen.getByTestId('council-member-count-locked')).toBeTruthy();

    fireEvent.change(slider, { target: { value: '4' } });
    expect(screen.getAllByTestId('council-member')).toHaveLength(3);
    const dialog = screen.getByRole('dialog', { name: 'Upgrade to Pro' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'See pricing' }));
    await waitFor(() => expect(openExternal).toHaveBeenCalledWith({ url: MIDNITE_PRICING_URL }));
    expect(screen.queryByRole('dialog', { name: 'Upgrade to Pro' })).toBeNull();
  });

  it('pro: the slider reaches five without a prompt', () => {
    useFeatureFlagsStore.setState({ flags: { 'councils.pro': true } });
    stubBridge();
    render(<CouncilConfigPanel council={COUNCIL} topic="" onDeleted={() => {}} />, { wrapper: Providers });
    fireEvent.change(screen.getByRole('slider', { name: 'Members' }), { target: { value: '5' } });
    expect(memberNames()).toEqual(['Optimist', 'Skeptic', 'Visionary', 'Pragmatist', 'Contrarian']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('council-member-count-locked')).toBeNull();
  });
});
