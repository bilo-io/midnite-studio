// vitest/jsdom: DOM text, roles, focus and calls over a mock bridge; no real layout is needed.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentsList } from './agents-list';
import { useAgentProfiles } from './use-agent-profiles';
import { failingListBridge, mockBridge, mountWith, rosterWithout } from './test-harness';
import { profileFixture } from './testing';

afterEach(() => {
  cleanup();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

function Harness({ onOpen = vi.fn() }: { onOpen?: (...args: never[]) => void }) {
  const { profiles, loading, error, refetch } = useAgentProfiles();
  return <AgentsList profiles={profiles} loading={loading} error={error} onRetry={refetch} onOpen={onOpen as never} />;
}

const a = profileFixture({ id: 'profile-a', name: 'Alpha', updatedAt: 10, accent: '#ff0000', description: 'First one' });
const b = profileFixture({ id: 'profile-b', name: 'Bravo', updatedAt: 30 });
const c = profileFixture({ id: 'profile-c', name: 'Charlie', updatedAt: 20 });

describe('AgentsList states', () => {
  it('shows the loading copy and skeletons while the list loads', () => {
    mockBridge([]);
    mountWith(<Harness />);
    expect(screen.getByText('Loading your agents…')).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it('shows the failure copy and Retry refetches', async () => {
    const bridge = failingListBridge('disk is on fire');
    mountWith(<Harness />);
    await screen.findByText("Couldn't load your agents.");
    expect(screen.getByText('disk is on fire')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(bridge.list).toHaveBeenCalledTimes(2));
  });

  it('shows the empty copy, the three templates and "Start from scratch"', async () => {
    mockBridge([]);
    mountWith(<Harness />);
    await screen.findByText('No agents yet');
    expect(
      screen.getByText('An agent is one of your CLIs with its own model, instructions, tools and limits. Start from a template or from scratch.'),
    ).toBeTruthy();
    for (const id of ['reviewer', 'researcher', 'builder']) expect(screen.getByTestId(`agents-empty-template-${id}`)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start from scratch' })).toBeTruthy();
  });

  it('opens an unsaved template draft from the empty state', async () => {
    mockBridge([]);
    const onOpen = vi.fn();
    mountWith(<Harness onOpen={onOpen} />);
    fireEvent.click(await screen.findByTestId('agents-empty-template-reviewer'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'Reviewer' }), true);
  });
});

describe('AgentsList cards', () => {
  it('sorts by updatedAt, newest first', async () => {
    mockBridge([a, b, c]);
    mountWith(<Harness />);
    await screen.findByTestId('agent-profile-profile-a');
    const ids = screen.getAllByRole('article').map((el) => el.getAttribute('data-testid'));
    expect(ids).toEqual(['agent-profile-profile-b', 'agent-profile-profile-c', 'agent-profile-profile-a']);
  });

  it('paints the stripe in the profile accent and gives every icon button a named label', async () => {
    mockBridge([a]);
    mountWith(<Harness />);
    const card = await screen.findByTestId('agent-profile-profile-a');
    expect((within(card).getByTestId('agent-stripe') as HTMLElement).style.background).toBe('rgb(255, 0, 0)');
    for (const verb of ['Edit', 'Duplicate', 'Export', 'Delete']) {
      expect(within(card).getByRole('button', { name: `${verb} Alpha` })).toBeTruthy();
    }
  });

  it('collapses chips past six into +N with the rest in the title', async () => {
    const many = profileFixture({
      id: 'profile-many',
      name: 'Many',
      blueprint: {
        orchestrate: { options: ['langgraph', 'crewai', 'llamaindex-workflows', 'custom'], note: '' },
        ground: { options: ['vector-db', 'hybrid-search', 'managed-kb'], note: '' },
      },
    });
    mockBridge([many]);
    mountWith(<Harness />);
    const more = await screen.findByTestId('agent-chips-more');
    expect(more.textContent).toBe('+1');
    expect(more.getAttribute('title')).toBe('Managed knowledge bases');
  });

  it('shows the filter only above six agents', async () => {
    const six = Array.from({ length: 6 }, (_, i) => profileFixture({ id: `profile-s${i}`, name: `Six ${i}`, updatedAt: i }));
    mockBridge(six);
    const first = mountWith(<Harness />);
    await screen.findByTestId('agent-profile-profile-s0');
    expect(screen.queryByPlaceholderText('Filter agents…')).toBeNull();
    first.unmount();
    cleanup();

    mockBridge([...six, profileFixture({ id: 'profile-s6', name: 'Seventh', updatedAt: 7 })]);
    mountWith(<Harness />);
    const input = await screen.findByPlaceholderText('Filter agents…');
    fireEvent.change(input, { target: { value: 'sevent' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText(/No agents match/)).toBeTruthy();
    fireEvent.click(within(screen.getByText(/No agents match/)).getByRole('button', { name: 'Clear filter' }));
    expect(screen.getAllByRole('article')).toHaveLength(7);
  });

  it('flags a base CLI missing from the roster', async () => {
    mockBridge([profileFixture({ id: 'profile-x', name: 'Orphan', baseAgentId: 'ghost' })]);
    mountWith(<Harness />);
    await screen.findByText('Base CLI not found');
  });
});

describe('AgentsList actions', () => {
  it('duplicates with a copy name and focuses the copy', async () => {
    const bridge = mockBridge([a]);
    mountWith(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate Alpha' }));
    await waitFor(() => expect(bridge.save).toHaveBeenCalled());
    const saved = bridge.save.mock.calls[0]![0] as unknown as { profile: { id: string; name: string }; expectedUpdatedAt: number | null };
    expect(saved.profile.name).toBe('Alpha copy');
    expect(saved.expectedUpdatedAt).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector(`[data-profile-name="${saved.profile.id}"]`)));
  });

  it('puts the live session count in the delete confirm', async () => {
    mockBridge([a]);
    const { confirm } = mountWith(<Harness />, { useLiveSessionCount: () => 2 });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Alpha' }));
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delete Alpha?',
        confirmLabel: 'Delete agent',
        danger: true,
        warnings: ['2 running sessions keep going with the settings they started with.'],
      }),
    );
  });

  it('has no warnings without a live-session hook, and singularises one session', async () => {
    mockBridge([a]);
    const first = mountWith(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Alpha' }));
    expect(first.confirm.mock.calls[0]![0].warnings).toEqual([]);
    first.unmount();
    cleanup();
    mockBridge([a]);
    const second = mountWith(<Harness />, { useLiveSessionCount: () => 1 });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Alpha' }));
    expect(second.confirm.mock.calls[0]![0].warnings).toEqual(['1 running session keeps going with the settings they started with.'.replace('keeps', 'keep')]);
  });

  it('focuses the next card after a delete, else the previous, else New agent', async () => {
    const bridge = mockBridge([a, b, c]);
    const { confirm } = mountWith(<Harness />);
    // Sorted: Bravo, Charlie, Alpha. Delete Bravo (first) -> Charlie.
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Bravo' }));
    confirm.mock.calls[0]![0].onConfirm();
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-profile-name="profile-c"]')));
    // Delete Alpha (last) -> previous, Charlie.
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Alpha' }));
    confirm.mock.calls[1]![0].onConfirm();
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-profile-name="profile-c"]')));
    // Delete the last remaining -> New agent.
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Charlie' }));
    confirm.mock.calls[2]![0].onConfirm();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('agents-new')));
    expect(bridge.delete).toHaveBeenCalledTimes(3);
  });

  it('focuses the imported card', async () => {
    const bridge = mockBridge([a]);
    mountWith(<Harness />);
    await screen.findByTestId('agent-profile-profile-a');
    bridge.import.mockImplementationOnce(async () => ({ ok: true as const, value: { profile: b } }));
    bridge.list.mockImplementation(async () => ({ ok: true as const, value: { profiles: [a, b] } }));
    fireEvent.click(screen.getByTestId('agents-import'));
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-profile-name="profile-b"]')));
  });
});

describe('AgentsList launch', () => {
  it('has no Launch button without useLaunchProfile', async () => {
    mockBridge([a]);
    mountWith(<Harness />);
    await screen.findByTestId('agent-profile-profile-a');
    expect(screen.queryByRole('button', { name: /Launch/ })).toBeNull();
  });

  it('is disabled with the host reason', async () => {
    mockBridge([a]);
    mountWith(<Harness />, { useLaunchProfile: () => ({ launch: vi.fn(), disabledReason: 'No repository is open' }) });
    const button = await screen.findByTestId('agent-launch-profile-a');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('title')).toBe('No repository is open');
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe('No repository is open');
  });

  it('is disabled when the base CLI is not installed', async () => {
    mockBridge([a]);
    mountWith(<Harness />, { ...rosterWithout(['claude']), useLaunchProfile: () => ({ launch: vi.fn(), disabledReason: null }) });
    const button = await screen.findByTestId('agent-launch-profile-a');
    expect(button.getAttribute('title')).toMatch(/is not installed$/);
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('is disabled when the base is missing from the roster', async () => {
    mockBridge([a]);
    mountWith(<Harness />, { ...rosterWithout([], ['claude']), useLaunchProfile: () => ({ launch: vi.fn(), disabledReason: null }) });
    const button = await screen.findByTestId('agent-launch-profile-a');
    expect(button.getAttribute('title')).toBe('Base CLI not found');
  });

  it('launches the profile when enabled', async () => {
    mockBridge([a]);
    const launch = vi.fn(async () => undefined);
    mountWith(<Harness />, { useLaunchProfile: () => ({ launch, disabledReason: null }) });
    fireEvent.click(await screen.findByTestId('agent-launch-profile-a'));
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ id: 'profile-a' }));
  });
});

describe('TemplateMenu', () => {
  it('opens on click, moves with arrows, picks with Enter and closes with Escape', async () => {
    mockBridge([a]);
    const onOpen = vi.fn();
    mountWith(<Harness onOpen={onOpen} />);
    await screen.findByTestId('agent-profile-profile-a');
    const trigger = screen.getByTestId('agents-template-menu');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(trigger);
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getByTestId('agents-template-reviewer'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('agents-template-researcher'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByTestId('agents-template-reviewer'));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    fireEvent.click(document.activeElement!);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'Researcher' }), true);
  });
});
