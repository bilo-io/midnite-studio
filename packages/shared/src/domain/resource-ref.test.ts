import { describe, expect, it } from 'vitest';

import { CompanionIntentSchema } from '../companion';
import { CompanionUiActionSchema } from '../ipc/schemas';
import {
  RESOURCE_KINDS,
  RESOURCE_LINK_PREFIX,
  decodeResourceRefParam,
  resourceRefLink,
  ResourceRefSchema,
  resourceRefKey,
  resourceRefLabel,
  resourceRefRepoId,
  resourceRefsEqual,
  type ResourceKind,
  type ResourceRef,
} from './resource-ref';

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

/** One fixture per kind — `satisfies` makes a kind with no fixture a type error. */
const FIXTURES = {
  commit: { kind: 'commit', repoId: 'r1', sha: SHA },
  ref: { kind: 'ref', repoId: 'r1', fullName: 'refs/heads/main' },
  stash: { kind: 'stash', repoId: 'r1', index: 0 },
  file: { kind: 'file', repoId: 'r1', path: 'src/bar.ts', line: 12 },
  commitFile: { kind: 'commitFile', repoId: 'r1', sha: SHA, path: 'src/bar.ts' },
  pull: { kind: 'pull', repoId: 'r1', number: 812 },
  issue: { kind: 'issue', repoId: 'r1', number: 212 },
  ciRun: { kind: 'ciRun', repoId: 'r1', runId: '991', jobId: 'build' },
  chat: { kind: 'chat', id: 'c1' },
  session: { kind: 'session', id: 's1', closed: true },
  council: { kind: 'council', id: 'k1', runId: 'run-1' },
  workflow: { kind: 'workflow', id: 'w1' },
  board: { kind: 'board', repoId: 'r1', projectId: 'p1' },
  card: { kind: 'card', repoId: 'r1', projectId: 'p1', cardId: 'card-9' },
  note: { kind: 'note', id: 'n1' },
  media: { kind: 'media', repoId: 'r1', media: 'model', project: 'creatures', path: 'dragon.glb' },
  dbTable: { kind: 'dbTable', connectionId: 'db1', table: 'users' },
  apiRequest: { kind: 'apiRequest', repoId: 'r1', collectionId: 'col', itemPath: 'auth/login' },
  browserTab: { kind: 'browserTab', url: 'https://example.com/a/b?c=1' },
  setting: { kind: 'setting', page: 'companion', section: 'voice' },
} satisfies { [K in ResourceKind]: Extract<ResourceRef, { kind: K }> };

describe('ResourceRefSchema', () => {
  it.each(RESOURCE_KINDS)('round-trips a %s ref', (kind) => {
    const fixture = FIXTURES[kind];
    expect(ResourceRefSchema.parse(fixture)).toEqual(fixture);
  });

  it('lists every kind exactly once', () => {
    expect(new Set(RESOURCE_KINDS).size).toBe(RESOURCE_KINDS.length);
    expect(Object.keys(FIXTURES).sort()).toEqual([...RESOURCE_KINDS].sort());
  });

  it('rejects a missing discriminator', () => {
    expect(ResourceRefSchema.safeParse({ repoId: 'r1', sha: SHA }).success).toBe(false);
  });

  it('rejects a negative line', () => {
    expect(ResourceRefSchema.safeParse({ ...FIXTURES.file, line: -1 }).success).toBe(false);
  });

  it('rejects an unknown media kind', () => {
    expect(ResourceRefSchema.safeParse({ ...FIXTURES.media, media: 'hologram' }).success).toBe(false);
  });

  it('rejects a non-hex sha and an unknown settings page', () => {
    expect(ResourceRefSchema.safeParse({ ...FIXTURES.commit, sha: 'not-a-sha' }).success).toBe(false);
    expect(ResourceRefSchema.safeParse({ ...FIXTURES.setting, page: 'nowhere' }).success).toBe(false);
  });
});

describe('resourceRefKey / resourceRefsEqual / resourceRefRepoId', () => {
  it('is independent of field order and ignores undefined fields', () => {
    const a: ResourceRef = { kind: 'file', repoId: 'r1', path: 'x.ts' };
    const b = { path: 'x.ts', line: undefined, repoId: 'r1', kind: 'file' } as ResourceRef;
    expect(resourceRefKey(a)).toBe(resourceRefKey(b));
    expect(resourceRefsEqual(a, b)).toBe(true);
    expect(resourceRefsEqual(a, { ...a, line: 3 })).toBe(false);
  });

  it('distinguishes kinds with the same fields', () => {
    expect(resourceRefsEqual(FIXTURES.pull, { ...FIXTURES.pull, kind: 'issue' })).toBe(false);
  });

  it('returns the repo a ref is scoped to', () => {
    expect(resourceRefRepoId(FIXTURES.commit)).toBe('r1');
    expect(resourceRefRepoId(FIXTURES.chat)).toBeNull();
  });
});

describe('resourceRefLabel', () => {
  it('follows the spoken-form rules', () => {
    expect(resourceRefLabel(FIXTURES.commit)).toBe('commit a1b2c3d');
    expect(resourceRefLabel(FIXTURES.pull)).toBe('PR 812');
    expect(resourceRefLabel(FIXTURES.issue)).toBe('issue 212');
    expect(resourceRefLabel(FIXTURES.ref)).toBe('branch main');
    expect(resourceRefLabel({ ...FIXTURES.ref, fullName: 'refs/tags/v1.0' })).toBe('tag v1.0');
    expect(resourceRefLabel(FIXTURES.file)).toBe('bar.ts line 12');
    expect(resourceRefLabel(FIXTURES.commitFile)).toBe('bar.ts in commit a1b2c3d');
    expect(resourceRefLabel(FIXTURES.browserTab)).toBe('example.com');
    expect(resourceRefLabel(FIXTURES.media)).toBe('the dragon model');
    expect(resourceRefLabel(FIXTURES.dbTable)).toBe('table users');
    expect(resourceRefLabel(FIXTURES.setting)).toBe('companion settings, voice');
  });

  it('takes titles from the names map, keyed by resourceRefKey', () => {
    const names = { [resourceRefKey(FIXTURES.chat)]: 'Auth' };
    expect(resourceRefLabel(FIXTURES.chat, names)).toBe('the Auth chat');
    expect(resourceRefLabel(FIXTURES.chat)).toBe('that chat');
  });

  it('never returns an empty label', () => {
    for (const kind of RESOURCE_KINDS) expect(resourceRefLabel(FIXTURES[kind]).length).toBeGreaterThan(0);
  });
});

describe('the contract around it', () => {
  it('navigate carries a target and a reference', () => {
    const intent = { kind: 'navigate', target: FIXTURES.commit, reference: 'next' };
    expect(CompanionIntentSchema.parse(intent)).toEqual(intent);
    expect(CompanionIntentSchema.safeParse({ kind: 'navigate', reference: 'sideways' }).success).toBe(false);
  });

  it('CompanionUiAction gains reveal and find', () => {
    expect(CompanionUiActionSchema.parse({ kind: 'reveal', ref: FIXTURES.note })).toEqual({
      kind: 'reveal',
      ref: FIXTURES.note,
    });
    const find = { kind: 'find', query: 'auth', kinds: ['chat'], limit: 5 };
    expect(CompanionUiActionSchema.parse(find)).toEqual(find);
    expect(CompanionUiActionSchema.safeParse({ ...find, limit: 21 }).success).toBe(false);
    expect(CompanionUiActionSchema.safeParse({ ...find, kinds: ['nope'] }).success).toBe(false);
  });
});

describe('resourceRefLink (Phase 112 Theme I)', () => {
  it('round-trips a ref through its deep link, including non-ASCII ids', () => {
    const ref = { kind: 'note', id: 'naïve ☃' } as const;
    const link = resourceRefLink(ref);
    expect(link.startsWith(RESOURCE_LINK_PREFIX)).toBe(true);
    expect(decodeResourceRefParam(link.slice(RESOURCE_LINK_PREFIX.length))).toEqual(ref);
  });

  it('decodes malformed input to null', () => {
    expect(decodeResourceRefParam('%%%')).toBeNull();
    expect(decodeResourceRefParam('e30')).toBeNull();
  });
});
