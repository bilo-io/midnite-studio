import { beforeEach, describe, expect, it } from 'vitest';

import { useRepoForgeRegistry } from './repo-forge-registry';
import { resolveInAppRoute } from './link-route-resolver';

beforeEach(() => {
  useRepoForgeRegistry.setState({
    byForgeKey: { 'github.com/bilo-io/midnite-studio': 'repo-1' },
  });
});

describe('resolveInAppRoute', () => {
  it('resolves a pull request URL to the Reviews view', () => {
    expect(resolveInAppRoute('https://github.com/bilo-io/midnite-studio/pull/42')).toEqual({
      view: 'reviews',
      repoId: 'repo-1',
      pull: 42,
    });
  });

  it('resolves an issue URL to the Issues view', () => {
    expect(resolveInAppRoute('https://github.com/bilo-io/midnite-studio/issues/7')).toEqual({
      view: 'issues',
      repoId: 'repo-1',
      issue: 7,
    });
  });

  it('resolves a workflow run URL to the Actions view', () => {
    expect(
      resolveInAppRoute('https://github.com/bilo-io/midnite-studio/actions/runs/123456'),
    ).toEqual({ view: 'actions', repoId: 'repo-1', runId: '123456' });
  });

  it('resolves the bare repo URL to the Graph view', () => {
    expect(resolveInAppRoute('https://github.com/bilo-io/midnite-studio')).toEqual({
      view: 'graph',
      repoId: 'repo-1',
    });
  });

  it('a trailing slash on the bare repo URL still resolves', () => {
    expect(resolveInAppRoute('https://github.com/bilo-io/midnite-studio/')).toEqual({
      view: 'graph',
      repoId: 'repo-1',
    });
  });

  it('matches case-insensitively: host and owner casing does not have to agree', () => {
    expect(resolveInAppRoute('https://GitHub.com/Bilo-IO/midnite-studio/pull/1')).toEqual({
      view: 'reviews',
      repoId: 'repo-1',
      pull: 1,
    });
  });

  it('a GitLab-shaped merge request URL resolves the same way', () => {
    useRepoForgeRegistry.setState({
      byForgeKey: { 'gitlab.example.com/platform/infra': 'repo-2' },
    });
    expect(
      resolveInAppRoute('https://gitlab.example.com/platform/infra/-/merge_requests/9'),
    ).toEqual({ view: 'reviews', repoId: 'repo-2', pull: 9 });
  });

  it('returns null for a repo Midnite has no registered forge for', () => {
    expect(resolveInAppRoute('https://github.com/someone-else/other-repo/pull/1')).toBeNull();
  });

  it('returns null for a registered repo but an unrecognised subpath', () => {
    expect(
      resolveInAppRoute('https://github.com/bilo-io/midnite-studio/settings/collaboration'),
    ).toBeNull();
  });

  it('returns null for a non-forge URL entirely', () => {
    expect(resolveInAppRoute('https://example.com/whatever')).toBeNull();
  });

  it('returns null for a malformed URL rather than throwing', () => {
    expect(resolveInAppRoute('not a url')).toBeNull();
  });

  it('returns null for a non-http(s) protocol, even one that parses fine', () => {
    expect(resolveInAppRoute('mailto:bilo@example.com')).toBeNull();
  });

  it('returns null when the registry is empty', () => {
    useRepoForgeRegistry.setState({ byForgeKey: {} });
    expect(resolveInAppRoute('https://github.com/bilo-io/midnite-studio/pull/1')).toBeNull();
  });
});
