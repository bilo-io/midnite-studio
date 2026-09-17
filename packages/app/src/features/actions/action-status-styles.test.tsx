import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ForgePull, ForgeRun } from '@midnite/studio-shared';

import { useReviewsStore } from '../../store/reviews-store';
import { useUiStore } from '../../store/ui-store';
import {
  findRunPrNumber,
  getActionItemStyle,
  RunPrLink,
} from './action-status-styles';

const makeRun = (over: Partial<ForgeRun>): ForgeRun => ({
  id: '1',
  name: 'CI',
  status: 'completed',
  conclusion: 'success',
  headBranch: 'main',
  headSha: '1234567890abcdef',
  createdAt: '2026-09-17T12:00:00Z',
  startedAt: '2026-09-17T12:00:00Z',
  updatedAt: '2026-09-17T12:05:00Z',
  url: 'https://github.com/bilo-io/midnite-studio/actions/runs/1',
  event: 'push',
  workflowId: 'w1',
  workflowName: 'CI',
  displayTitle: 'CI Run',
  number: 101,
  attempt: 1,
  ...over,
});

const makePull = (over: Partial<ForgePull>): ForgePull => ({
  id: 'p1',
  number: 42,
  title: 'My PR',
  state: 'open',
  isDraft: false,
  reviewDecision: 'APPROVED',
  headBranch: 'feature/cool-stuff',
  author: 'tester',
  url: 'https://github.com/bilo-io/midnite-studio/pull/42',
  checks: 'passing',
  mergedAt: null,
  closedAt: null,
  ...over,
});

describe('getActionItemStyle', () => {
  it('returns green text and actions-glow-ok for ok tone', () => {
    const style = getActionItemStyle('ok');
    expect(style.textClass).toContain('text-emerald-500');
    expect(style.glowClass).toBe('actions-glow-ok');
    expect(style.rowClass).toBe('');
  });

  it('returns red text and actions-glow-fail for fail tone', () => {
    const style = getActionItemStyle('fail');
    expect(style.textClass).toContain('text-red-500');
    expect(style.glowClass).toBe('actions-glow-fail');
    expect(style.rowClass).toBe('');
  });

  it('returns orange text and actions-item-running for busy tone', () => {
    const style = getActionItemStyle('busy');
    expect(style.textClass).toContain('text-orange-500');
    expect(style.rowClass).toBe('actions-item-running');
  });

  it('returns muted text for idle tone', () => {
    const style = getActionItemStyle('idle');
    expect(style.textClass).toBe('text-muted-foreground');
    expect(style.glowClass).toBe('');
    expect(style.rowClass).toBe('');
  });
});

describe('findRunPrNumber', () => {
  it('resolves PR number by matching head branch against pulls list', () => {
    const run = makeRun({ headBranch: 'feature/cool-stuff' });
    const pulls = [makePull({ number: 99, headBranch: 'feature/cool-stuff' })];
    expect(findRunPrNumber(run, pulls)).toBe(99);
  });

  it('resolves PR number from headBranch pattern', () => {
    const run = makeRun({ headBranch: 'pull/123/merge' });
    expect(findRunPrNumber(run, [])).toBe(123);

    const runPr = makeRun({ headBranch: 'pr-456' });
    expect(findRunPrNumber(runPr, [])).toBe(456);
  });

  it('resolves PR number from displayTitle pattern', () => {
    const run = makeRun({ displayTitle: 'feat(knowledge): add stuff (#436)' });
    expect(findRunPrNumber(run, [])).toBe(436);

    const runMerge = makeRun({ displayTitle: 'Merge pull request #789 from branch' });
    expect(findRunPrNumber(runMerge, [])).toBe(789);
  });

  it('returns null when no PR number can be resolved', () => {
    const run = makeRun({ headBranch: 'main', displayTitle: 'chore: plain commit' });
    expect(findRunPrNumber(run, [])).toBeNull();
  });
});

describe('RunPrLink', () => {
  beforeEach(() => {
    useUiStore.setState({ selectedRepoId: 'repo-1', activeView: 'actions' });
    useReviewsStore.setState({ selectedPull: {} });
  });

  afterEach(cleanup);

  it('renders PR number and navigates to reviews view on click', () => {
    render(<RunPrLink repoId="repo-1" prNumber={42} />);

    const link = screen.getByRole('button', { name: 'Open review #42' });
    expect(link.textContent).toContain('#42');

    fireEvent.click(link);

    expect(useUiStore.getState().selectedRepoId).toBe('repo-1');
    expect(useReviewsStore.getState().selectedPull['repo-1']).toBe(42);
    expect(useUiStore.getState().activeView).toBe('reviews');
  });

  it('stops click propagation so parent row selection is not triggered', () => {
    let parentClicked = false;
    render(
      <div onClick={() => { parentClicked = true; }}>
        <RunPrLink repoId="repo-1" prNumber={42} />
      </div>,
    );

    const link = screen.getByRole('button', { name: 'Open review #42' });
    fireEvent.click(link);

    expect(parentClicked).toBe(false);
  });

  it('handles keyboard enter key', () => {
    render(<RunPrLink repoId="repo-1" prNumber={88} />);

    const link = screen.getByRole('button', { name: 'Open review #88' });
    fireEvent.keyDown(link, { key: 'Enter' });

    expect(useReviewsStore.getState().selectedPull['repo-1']).toBe(88);
    expect(useUiStore.getState().activeView).toBe('reviews');
  });
});
