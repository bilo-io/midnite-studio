import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  type PostmanItem,
  PostmanCollectionSchema,
  type PostmanRequest,
  toDraft,
  toPostmanRequest,
} from './api-client';

const FIXTURE_DIR = join(__dirname, '__fixtures__', 'api-client');

const FIXTURES = [
  'jira.postman_collection.json',
  'auth0-management-api.postman_collection.json',
  'postman-echo.postman_collection.json',
] as const;

function loadFixture(name: (typeof FIXTURES)[number]): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
}

/**
 * Every `path.key` pair reachable by walking an object/array recursively —
 * the "key set", at every depth, not just the top level. Two values with the
 * same key set at every path have not had a key silently dropped (or dropped
 * and replaced by a same-shaped-but-different key) anywhere in the tree, which
 * is the actual passthrough acceptance criterion. Deliberately not `toEqual`
 * on the parsed object itself: this reports exactly which path lost a key
 * rather than one opaque "objects not equal" diff over a 100+ KB fixture.
 */
function keySet(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => keySet(item, `${path}[${i}]`));
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return [
      `${path}::${keys.join(',')}`,
      ...keys.flatMap((key) => keySet((value as Record<string, unknown>)[key], `${path}.${key}`)),
    ];
  }
  return [];
}

describe('PostmanCollectionSchema — real-file passthrough round-trip', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture}: every key survives parse + re-serialise`, () => {
      const original = loadFixture(fixture);
      const parsed = PostmanCollectionSchema.parse(original);
      // Round through JSON exactly as a save/export would, so the assertion
      // covers what actually reaches disk, not an in-memory zod artefact.
      const reserialised = JSON.parse(JSON.stringify(parsed));

      expect(keySet(reserialised).sort()).toEqual(keySet(original).sort());
    });
  }
});

describe('toDraft / toPostmanRequest', () => {
  it('round-trips a request carrying an unknown top-level key', () => {
    const original: PostmanRequest = {
      method: 'POST',
      url: { raw: 'https://api.example.com/widgets' },
      header: [{ key: 'X-Trace-Id', value: 'abc123' }],
      // A key this app does not model — the whole point of passthrough.
      protocolProfileBehavior: { disableBodyPruning: true },
    };
    const item: PostmanItem = { name: 'Create widget', request: original };

    const draft = toDraft(item);
    // The draft edits nothing here; toPostmanRequest should still hand back
    // every original key, merged over rather than reconstructed from scratch.
    const roundTripped = toPostmanRequest(draft, original);

    expect(roundTripped.protocolProfileBehavior).toEqual({ disableBodyPruning: true });
    expect(roundTripped.method).toBe('POST');
    expect(roundTripped.header).toEqual([{ key: 'X-Trace-Id', value: 'abc123', disabled: false }]);
  });

  it('has nothing to merge over for a request created in this app (`original: null`)', () => {
    const item: PostmanItem = {
      name: 'New request',
      request: { method: 'GET', url: 'https://example.com' },
    };
    const draft = toDraft(item);
    const built = toPostmanRequest(draft, null);

    expect(built).toEqual({
      method: 'GET',
      url: 'https://example.com',
      header: [],
    });
  });
});
