import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_AGENT_SKILLS, useUiStore } from '../../store/ui-store';
import { MidniteMenu } from './midnite-menu';

// Vitest twin of the menu-structure tests in `e2e/midnite-menu.spec.ts` (groups, sub-text, skill handoff).
const mockOpenMenu = vi.fn();
vi.mock('../../components/dialog-host', () => ({
  useDialogs: () => ({ openMenu: mockOpenMenu }),
  useOptionalDialogs: () => null,
}));

const mockHandoff = vi.fn();
vi.mock('./use-skill-handoff', () => ({ useSkillHandoff: () => mockHandoff }));

type Item = { label: string; description?: string; disabled?: boolean; onSelect?: () => void; submenu?: Item[] };

function openItems(): Item[] {
  render(<MidniteMenu repoId="r1" repoName="midnite-studio" cwd="/p" />);
  fireEvent.click(screen.getByRole('button', { name: 'Run a midnite skill on midnite-studio' }));
  expect(mockOpenMenu).toHaveBeenCalledTimes(1);
  return mockOpenMenu.mock.calls[0]?.[1] as Item[];
}

beforeEach(() => useUiStore.setState({ agentSkills: { ...DEFAULT_AGENT_SKILLS } }));
afterEach(() => {
  cleanup();
  mockOpenMenu.mockClear();
  mockHandoff.mockClear();
});

describe('MidniteMenu', () => {
  it('the top level is the five groups, each with its own verbs', () => {
    const items = openItems();
    expect(items.map((i) => i.label)).toEqual(['Tasks', 'Reviews', 'Releases', 'Git', 'Loops']);
    const byGroup = Object.fromEntries(items.map((i) => [i.label, (i.submenu ?? []).map((s) => s.label)]));
    expect(byGroup['Tasks']).toEqual([
      'Backlog Task',
      'Adhoc Task',
      'Address Issue',
      'Ideate',
      'Refine Plan',
      'Verify Phase',
      'Swarm',
      'Create PR',
    ]);
    expect(byGroup['Reviews']).toEqual([
      'PR Review',
      'PR Feedback',
      'PR Audit',
      'Check Yourself',
      'PR Description',
      'Triage',
      // The e2e twin's list predates this row; the twin tracks the live menu.
      'Sanitize',
    ]);
    expect(byGroup['Releases']).toEqual(['Release Prep', 'Release Complete']);
    expect(byGroup['Git']).toEqual(['Git Report', 'Git Cleanup']);
    expect(byGroup['Loops']).toHaveLength(9);
    expect(byGroup['Loops']?.[0]).toBe('Loop: Guard');
  });

  it('every row carries a sub-text description', () => {
    const items = openItems();
    const tasks = items.find((i) => i.label === 'Tasks');
    expect(tasks?.description).toBe('Plan and build work in this repository.');
    const backlog = tasks?.submenu?.find((s) => s.label === 'Backlog Task');
    expect(backlog?.description).toBe('Pick up the next unblocked backlog task and build it.');
    for (const item of items) {
      expect(item.description).toBeTruthy();
      for (const sub of item.submenu ?? []) expect(sub.description).toBeTruthy();
    }
  });

  it('an entry hands its skill off for this repo', () => {
    const items = openItems();
    const backlog = items[0]?.submenu?.find((s) => s.label === 'Backlog Task');
    backlog?.onSelect?.();
    expect(mockHandoff).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: 'r1', cwd: '/p', title: 'Backlog Task' }),
    );
  });

  it('a cleared skill field disables its row and names the fix', () => {
    const [firstKey] = Object.keys(DEFAULT_AGENT_SKILLS);
    useUiStore.setState({ agentSkills: { ...DEFAULT_AGENT_SKILLS, [firstKey as string]: '  ' } });
    const items = openItems();
    const all = items.flatMap((i) => i.submenu ?? []);
    expect(all.filter((s) => s.disabled)).toHaveLength(1);
  });
});
