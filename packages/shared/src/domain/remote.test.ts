import { describe, expect, it } from 'vitest';

import {
  RemoteSchema,
  forgeActionsUrl,
  forgeBoardsUrl,
  forgeIssueUrl,
  forgePullsUrl,
  forgeProjectUrl,
  isSupportedForgeKind,
  pickForgeRemote,
  type Forge,
  type Remote,
} from './remote';

const forge = (over: Partial<Forge> = {}): Forge => ({
  host: 'github.com',
  owner: 'o',
  repo: 'r',
  kind: 'github',
  ...over,
});

const remote = (name: string, f: Forge | null): Remote => ({
  name,
  fetchUrl: `git@example:${name}.git`,
  pushUrl: `git@example:${name}.git`,
  forge: f,
});

describe('isSupportedForgeKind', () => {
  it.each(['github', 'gitlab', 'bitbucket', 'azure'] as const)('accepts %s', (kind) => {
    expect(isSupportedForgeKind(kind)).toBe(true);
  });

  it('rejects unknown', () => {
    expect(isSupportedForgeKind('unknown')).toBe(false);
  });
});

describe('RemoteSchema', () => {
  it('defaults forge to null so a local-path remote still parses', () => {
    expect(
      RemoteSchema.parse({ name: 'local', fetchUrl: '/srv/r.git', pushUrl: '/srv/r.git' }).forge,
    ).toBeNull();
  });
});

describe('pickForgeRemote', () => {
  it('prefers origin', () => {
    const picked = pickForgeRemote([remote('upstream', forge()), remote('origin', forge())]);
    expect(picked?.name).toBe('origin');
  });

  it('falls back to the first known forge when there is no origin', () => {
    const picked = pickForgeRemote([remote('fork', forge()), remote('other', forge())]);
    expect(picked?.name).toBe('fork');
  });

  it('skips remotes with no forge and remotes on an unknown host', () => {
    // A local-path remote named `origin` must not win the preference and then
    // supply no link — the whole point of the pick is to find a linkable one.
    const picked = pickForgeRemote([
      remote('origin', null),
      remote('mirror', forge({ kind: 'unknown', host: 'git.sr.ht' })),
      remote('gh', forge()),
    ]);
    expect(picked?.name).toBe('gh');
  });

  it('returns null when nothing resolves to a forge', () => {
    expect(pickForgeRemote([remote('local', null)])).toBeNull();
    expect(pickForgeRemote([])).toBeNull();
  });
});

describe('forge URLs', () => {
  it('builds a GitHub issue URL', () => {
    expect(forgeIssueUrl(forge(), 123)).toBe('https://github.com/o/r/issues/123');
  });

  it("inserts GitLab's /-/ separator", () => {
    // Without it, a project whose group contains a path segment named `issues`
    // collides with the project's own route.
    expect(forgeIssueUrl(forge({ kind: 'gitlab', host: 'gitlab.com' }), 7)).toBe(
      'https://gitlab.com/o/r/-/issues/7',
    );
  });

  it('keeps subgroup segments in the path', () => {
    expect(
      forgeIssueUrl(
        forge({ kind: 'gitlab', host: 'gitlab.corp', owner: 'platform/infra', repo: 'tooling' }),
        9,
      ),
    ).toBe('https://gitlab.corp/platform/infra/tooling/-/issues/9');
  });

  it('builds Bitbucket and Azure issue URLs', () => {
    expect(forgeIssueUrl(forge({ kind: 'bitbucket', host: 'bitbucket.org' }), 4)).toBe(
      'https://bitbucket.org/o/r/issues/4',
    );
    expect(
      forgeIssueUrl(
        forge({ kind: 'azure', host: 'dev.azure.com', owner: 'org/proj', repo: 'svc' }),
        42,
      ),
    ).toBe('https://dev.azure.com/org/proj/_workitems/edit/42');
  });

  it('refuses to build a link for an unknown forge', () => {
    // Degrade, do not guess: an invented path 404s, and the correct rendering
    // for `#123` against an unrecognised host is plain text.
    expect(forgeIssueUrl(forge({ kind: 'unknown' }), 1)).toBeNull();
    expect(forgeProjectUrl(forge({ kind: 'unknown' }))).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])(
    'refuses the non-issue number %p',
    (n) => {
      expect(forgeIssueUrl(forge(), n)).toBeNull();
    },
  );

  it('always uses https, whatever the remote was cloned over', () => {
    // The remote may be ssh or git://; the *web* URL is https regardless.
    expect(forgeProjectUrl(forge())).toBe('https://github.com/o/r');
  });

  it('uses Azure _git grammar for the project page', () => {
    expect(
      forgeProjectUrl(
        forge({ kind: 'azure', host: 'dev.azure.com', owner: 'org/proj', repo: 'svc' }),
      ),
    ).toBe('https://dev.azure.com/org/proj/_git/svc');
  });
});

describe('forgePullsUrl / forgeActionsUrl (Phase 32 Theme F repo row)', () => {
  it('builds a GitHub PRs and Actions link', () => {
    expect(forgePullsUrl(forge())).toBe('https://github.com/o/r/pulls');
    expect(forgeActionsUrl(forge())).toBe('https://github.com/o/r/actions');
  });

  it('builds a GitLab merge-requests and pipelines link', () => {
    const gl = forge({ host: 'gitlab.com', kind: 'gitlab' });
    expect(forgePullsUrl(gl)).toBe('https://gitlab.com/o/r/-/merge_requests');
    expect(forgeActionsUrl(gl)).toBe('https://gitlab.com/o/r/-/pipelines');
  });

  it('builds Bitbucket and Azure pull and CI links', () => {
    const bb = forge({ kind: 'bitbucket', host: 'bitbucket.org' });
    expect(forgePullsUrl(bb)).toBe('https://bitbucket.org/o/r/pull-requests');
    expect(forgeActionsUrl(bb)).toBe('https://bitbucket.org/o/r/pipelines');

    const az = forge({ kind: 'azure', host: 'dev.azure.com', owner: 'org/proj', repo: 'svc' });
    expect(forgePullsUrl(az)).toBe('https://dev.azure.com/org/proj/_git/svc/pullrequests');
    expect(forgeActionsUrl(az)).toBe('https://dev.azure.com/org/proj/_build');
  });

  it('refuses an unknown forge for both', () => {
    expect(forgePullsUrl(forge({ kind: 'unknown' }))).toBeNull();
    expect(forgeActionsUrl(forge({ kind: 'unknown' }))).toBeNull();
  });
});

describe('forgeBoardsUrl (Phase 90 Theme A)', () => {
  it('returns null for GitHub and Bitbucket', () => {
    expect(forgeBoardsUrl(forge())).toBeNull();
    expect(forgeBoardsUrl(forge({ kind: 'bitbucket', host: 'bitbucket.org' }))).toBeNull();
  });

  it('builds GitLab and Azure board links', () => {
    expect(forgeBoardsUrl(forge({ kind: 'gitlab', host: 'gitlab.com' }))).toBe(
      'https://gitlab.com/o/r/-/boards',
    );
    expect(
      forgeBoardsUrl(
        forge({ kind: 'azure', host: 'dev.azure.com', owner: 'org/proj', repo: 'svc' }),
      ),
    ).toBe('https://dev.azure.com/org/proj/_boards');
  });
});
