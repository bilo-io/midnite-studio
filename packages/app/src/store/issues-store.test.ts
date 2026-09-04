import { afterEach, describe, expect, it } from 'vitest';

import { useIssuesStore } from './issues-store';

afterEach(() => {
  useIssuesStore.setState({ selectedIssue: {} });
});

describe('useIssuesStore', () => {
  it('selects an issue for a repo', () => {
    useIssuesStore.getState().selectIssue('repo-1', 42);
    expect(useIssuesStore.getState().selectedIssue['repo-1']).toBe(42);
  });

  it('keeps each repo’s selection independent, surviving a switch', () => {
    const { selectIssue } = useIssuesStore.getState();
    selectIssue('repo-1', 1);
    selectIssue('repo-2', 2);
    selectIssue('repo-1', 99);

    expect(useIssuesStore.getState().selectedIssue).toEqual({ 'repo-1': 99, 'repo-2': 2 });
  });
});
