// vitest/jsdom: GitHubDataSource.createIssueWithId answers with the new issue's node id and number (Phase 146 H6).
import { describe, expect, it, vi } from 'vitest';
import { GitHubDataSource } from './github-source';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const repo = { owner: 'bilo-io', name: 'midnite-studio' };

function source(createResponse: unknown) {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const query = JSON.parse(String(init?.body)).query as string;
    return query.includes('createIssue') ? json(createResponse) : json({ data: { repository: { id: 'R_1' } } });
  });
  return { fetch, ds: new GitHubDataSource({ fetch, getToken: () => 'ghp_FAKE' }) };
}

describe('createIssueWithId', () => {
  it('looks up the repo id, creates the issue and returns its id and number', async () => {
    const { ds, fetch } = source({ data: { createIssue: { issue: { id: 'I_9', number: 42, url: 'u' } } } });
    expect(await ds.createIssueWithId(repo, 'Title', 'Body')).toEqual({ ok: true, value: { id: 'I_9', number: 42 } });
    const sent = JSON.parse(String(fetch.mock.calls[1]![1]?.body));
    expect(sent.variables.input).toEqual({ repositoryId: 'R_1', title: 'Title', body: 'Body' });
  });

  it('a GraphQL error is a failed result, not a throw', async () => {
    const { ds } = source({ errors: [{ message: 'nope' }] });
    const result = await ds.createIssueWithId(repo, 'Title', '');
    expect(result.ok).toBe(false);
  });

  it('a response with no issue is an error result', async () => {
    const { ds } = source({ data: { createIssue: { issue: null } } });
    const result = await ds.createIssueWithId(repo, 'Title', '');
    expect(result.ok).toBe(false);
  });
});
