import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUiStore } from '../../../store/ui-store';
import { ProjectsPage } from './projects-page';

const INITIAL_BLOCKED_BY_FIELD_NAME = useUiStore.getState().blockedByFieldName;

afterEach(() => {
  cleanup();
  useUiStore.setState({ blockedByFieldName: INITIAL_BLOCKED_BY_FIELD_NAME });
});

describe('ProjectsPage — dependency graph field name (Phase 75 Theme H)', () => {
  it('shows the store value, defaulting to "Blocked by"', () => {
    render(<ProjectsPage />);
    expect((screen.getByLabelText('Blocked-by field name') as HTMLInputElement).value).toBe('Blocked by');
  });

  it('typing a new name persists it to the store', () => {
    render(<ProjectsPage />);
    fireEvent.change(screen.getByLabelText('Blocked-by field name'), { target: { value: 'Depends on' } });
    expect(useUiStore.getState().blockedByFieldName).toBe('Depends on');
  });

  it('clearing it disables the field layer (an empty string, not a fallback)', () => {
    render(<ProjectsPage />);
    fireEvent.change(screen.getByLabelText('Blocked-by field name'), { target: { value: '' } });
    expect(useUiStore.getState().blockedByFieldName).toBe('');
  });
});

describe('ProjectsPage — column → skill map (Phase 95 Theme G)', () => {
  beforeEach(() => {
    useUiStore.setState({ selectedRepoId: null, projectBoardByRepo: {}, columnSkillByProject: {} });
  });

  it('asks the user to open a board first when no project is currently active', () => {
    render(<ProjectsPage />);
    expect(screen.getByText(/Open a project board first/)).toBeDefined();
    expect(screen.queryByLabelText('Skill for column "in progress"')).toBeNull();
  });

  it('shows the two built-in defaults, pre-filled, for the currently active project', () => {
    useUiStore.setState({ selectedRepoId: 'r1', projectBoardByRepo: { r1: 'PVT_1' } });
    render(<ProjectsPage />);

    expect((screen.getByLabelText('Skill for column "in progress"') as HTMLInputElement).value).toBe(
      '/midnite-create',
    );
    expect((screen.getByLabelText('Skill for column "in review"') as HTMLInputElement).value).toBe(
      '/midnite-review',
    );
  });

  it('editing a row writes a per-project override, normalised to lower case', () => {
    useUiStore.setState({ selectedRepoId: 'r1', projectBoardByRepo: { r1: 'PVT_1' } });
    render(<ProjectsPage />);

    fireEvent.change(screen.getByLabelText('Skill for column "in progress"'), {
      target: { value: '/midnite-create-adhoc' },
    });

    expect(useUiStore.getState().columnSkillByProject['PVT_1']?.['in progress']).toBe('/midnite-create-adhoc');
  });

  it('adding a new column name maps a column beyond the two defaults', () => {
    useUiStore.setState({ selectedRepoId: 'r1', projectBoardByRepo: { r1: 'PVT_1' } });
    render(<ProjectsPage />);

    fireEvent.change(screen.getByLabelText('New column name'), { target: { value: 'Backlog' } });
    fireEvent.change(screen.getByLabelText("New column's skill"), { target: { value: '/midnite-ideate' } });
    fireEvent.click(screen.getByText('Add'));

    expect(useUiStore.getState().columnSkillByProject['PVT_1']?.['backlog']).toBe('/midnite-ideate');
    expect((screen.getByLabelText('Skill for column "backlog"') as HTMLInputElement).value).toBe('/midnite-ideate');
  });

  it('a different active project shows its own, independent map', () => {
    useUiStore.setState({
      selectedRepoId: 'r1',
      projectBoardByRepo: { r1: 'PVT_1' },
      columnSkillByProject: { PVT_1: { 'in progress': '/midnite-create-adhoc' } },
    });
    render(<ProjectsPage />);
    expect((screen.getByLabelText('Skill for column "in progress"') as HTMLInputElement).value).toBe(
      '/midnite-create-adhoc',
    );
  });
});

describe('ProjectsPage — Auto-mate concurrency cap (Phase 95 Theme H)', () => {
  beforeEach(() => {
    useUiStore.setState({
      selectedRepoId: null,
      projectBoardByRepo: {},
      automateEnabledByProject: {},
      automateCapByProject: {},
    });
  });

  it('asks the user to open a board first when no project is currently active', () => {
    render(<ProjectsPage />);
    expect(screen.getByText(/No project board is open yet/)).toBeDefined();
    expect(screen.queryByLabelText('Auto-mate concurrency cap')).toBeNull();
  });

  it('shows the default cap (1) and whether Auto-mate is on, for the currently active project', () => {
    useUiStore.setState({ selectedRepoId: 'r1', projectBoardByRepo: { r1: 'PVT_1' } });
    render(<ProjectsPage />);

    expect((screen.getByLabelText('Auto-mate concurrency cap') as HTMLInputElement).value).toBe('1');
    expect(screen.getByText(/Off for this board/)).toBeDefined();
  });

  it('reflects the on state when Auto-mate is enabled for the active project', () => {
    useUiStore.setState({
      selectedRepoId: 'r1',
      projectBoardByRepo: { r1: 'PVT_1' },
      automateEnabledByProject: { PVT_1: true },
    });
    render(<ProjectsPage />);
    expect(screen.getByText(/On for this board/)).toBeDefined();
  });

  it('editing the cap writes a per-project value, clamped 1–5', () => {
    useUiStore.setState({ selectedRepoId: 'r1', projectBoardByRepo: { r1: 'PVT_1' } });
    render(<ProjectsPage />);

    fireEvent.change(screen.getByLabelText('Auto-mate concurrency cap'), { target: { value: '3' } });
    expect(useUiStore.getState().automateCapByProject['PVT_1']).toBe(3);

    fireEvent.change(screen.getByLabelText('Auto-mate concurrency cap'), { target: { value: '99' } });
    expect(useUiStore.getState().automateCapByProject['PVT_1']).toBe(5);
  });
});
