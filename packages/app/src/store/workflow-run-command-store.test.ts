import { afterEach, describe, expect, it } from 'vitest';

import { useWorkflowRunCommandStore } from './workflow-run-command-store';

afterEach(() => {
  useWorkflowRunCommandStore.setState({ handle: null });
});

describe('useWorkflowRunCommandStore', () => {
  it('starts with no handle', () => {
    expect(useWorkflowRunCommandStore.getState().handle).toBeNull();
  });

  it('registers and unregisters a handle', () => {
    const handle = { run: () => {} };
    useWorkflowRunCommandStore.getState().register(handle);
    expect(useWorkflowRunCommandStore.getState().handle).toBe(handle);

    useWorkflowRunCommandStore.getState().unregister(handle);
    expect(useWorkflowRunCommandStore.getState().handle).toBeNull();
  });

  it("a stale unregister does not clobber a newer handle that replaced it", () => {
    const first = { run: () => {} };
    const second = { run: () => {} };
    useWorkflowRunCommandStore.getState().register(first);
    useWorkflowRunCommandStore.getState().register(second);

    useWorkflowRunCommandStore.getState().unregister(first);

    expect(useWorkflowRunCommandStore.getState().handle).toBe(second);
  });
});
