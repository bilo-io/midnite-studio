import { describe, expect, it } from 'vitest';

import {
  RemoteSchema,
  forgeIssueUrl,
  forgeProjectUrl,
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
});
