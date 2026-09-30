import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ForgeProjectField } from '@midnite/studio-shared';

import { DialogHost } from '../../../components/dialog-host';
import { ToastHost } from '../../../components/toast-host';
import { useUiStore } from '../../../store/ui-store';
import { useTerminalStore } from '../../terminal/terminal-store';
import { issueItem } from '../__fixtures__/project-item';
import { useAutomate } from './use-automate';

const PROJECT_ID = 'proj-1';

const statusField: ForgeProjectField = {
  id: 'f1',
  name: 'Status',
  dataType: 'single_select',
  options: [{ id: 'todo', name: 'Todo', color: 'GRAY' }],
};

function withStatus(item: ReturnType<typeof issueItem>) {
  return { ...item, fieldValues: { f1: { fieldId: 'f1', dataType: 'single_select' as const, optionId: 'todo', name: 'Todo' } } };
}

/** `useToasts()`/`useDialogs()` are reached unconditionally, so every render
 *  needs the hosts the real app tree provides — the same reason
 *  `use-card-play.test.tsx` wraps itself in `<DialogHost>`. */
function wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastHost>
      <DialogHost>{children}</DialogHost>
    </ToastHost>
  );
}

function renderAutomate(allItems: ReturnType<typeof issueItem>[]) {
  return renderHook(
    () =>
      useAutomate({
        projectId: PROJECT_ID,
        repoId: 'repo-1',
        worktreePath: '/repo',
        allItems,
        fields: [statusField],
        groupField: statusField,
        blockedByFieldName: 'Blocked by',
        columnSkillOverrides: useUiStore.getState().columnSkillByProject[PROJECT_ID],
      }),
    { wrapper },
  );
}

describe('useAutomate (Phase 95 Theme H)', () => {
  afterEach(cleanup);

  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {}, exitCodes: {} });
    useUiStore.setState({
      automateEnabledByProject: {},
      automateCapByProject: {},
      columnSkillByProject: {},
      terminalOpen: false,
    });
  });

  it('does nothing while disabled', () => {
    const items = [withStatus(issueItem()), withStatus(issueItem())];
    renderAutomate(items);
    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });

  it('does nothing when the Todo column has no mapped skill (out of the box)', () => {
    useUiStore.setState({ automateEnabledByProject: { [PROJECT_ID]: true } });
    const items = [withStatus(issueItem())];
    renderAutomate(items);
    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });

  it('fills up to the concurrency cap, in board order, once the Todo column is mapped', async () => {
    useUiStore.setState({
      automateEnabledByProject: { [PROJECT_ID]: true },
      automateCapByProject: { [PROJECT_ID]: 2 },
      columnSkillByProject: { [PROJECT_ID]: { todo: '/midnite-create' } },
    });
    const items = [withStatus(issueItem()), withStatus(issueItem()), withStatus(issueItem())];
    renderAutomate(items);

    await waitFor(() => expect(useTerminalStore.getState().sessions).toHaveLength(2));

    const launched = useTerminalStore.getState().sessions;
    expect(launched.map((s) => s.taskRef?.itemId)).toEqual([items[0]!.id, items[1]!.id]);
    expect(launched.every((s) => s.projectRef?.projectId === PROJECT_ID)).toBe(true);
  });

  it('stops (turns off the toggle) on the first task that exits non-zero', async () => {
    useUiStore.setState({
      automateEnabledByProject: { [PROJECT_ID]: true },
      automateCapByProject: { [PROJECT_ID]: 1 },
      columnSkillByProject: { [PROJECT_ID]: { todo: '/midnite-create' } },
    });
    const items = [withStatus(issueItem())];
    renderAutomate(items);

    await waitFor(() => expect(useTerminalStore.getState().sessions).toHaveLength(1));
    const session = useTerminalStore.getState().sessions[0]!;

    useTerminalStore.setState((s) => ({ exitCodes: { ...s.exitCodes, [session.id]: 1 } }));

    await waitFor(() => expect(useUiStore.getState().automateEnabledByProject[PROJECT_ID]).toBe(false));
  });

  it('picks up the next unblocked card once a live slot frees on a successful exit', async () => {
    useUiStore.setState({
      automateEnabledByProject: { [PROJECT_ID]: true },
      automateCapByProject: { [PROJECT_ID]: 1 },
      columnSkillByProject: { [PROJECT_ID]: { todo: '/midnite-create' } },
    });
    const items = [withStatus(issueItem()), withStatus(issueItem())];
    const { rerender } = renderAutomate(items);

    await waitFor(() => expect(useTerminalStore.getState().sessions).toHaveLength(1));
    const first = useTerminalStore.getState().sessions[0]!;

    // A clean exit both frees the slot AND (in the real app) removes the
    // session — mirrored here via `closeSession`, since `useAutomate` reads
    // liveness off `sessions`/`states`, not `exitCodes` alone, for its fill.
    useTerminalStore.setState((s) => ({ exitCodes: { ...s.exitCodes, [first.id]: 0 } }));
    useTerminalStore.getState().closeSession(first.id);
    rerender();

    await waitFor(() => expect(useTerminalStore.getState().sessions).toHaveLength(1));
    expect(useTerminalStore.getState().sessions[0]!.taskRef?.itemId).toBe(items[1]!.id);
    // Auto-mate itself is still on — only a non-zero exit stops it.
    expect(useUiStore.getState().automateEnabledByProject[PROJECT_ID]).toBe(true);
  });
});
