import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CHANNELS, FEATURE_PLACEMENT, FEATURE_VIEWS, placementOwners, schemas } from '@midnite/studio-shared';

import { vaultManifest } from './manifest';
import { vaultResponseSchemas } from './response-schemas';
import { vaultViews } from './renderer';

/** The template's contract (see the monitor's): manifest, shared registrations and the renderer agree. */
describe('vault manifest', () => {
  it('owns what the placement map says it owns', () => {
    expect(placementOwners(FEATURE_PLACEMENT[vaultManifest.feature])[0]).toBe(vaultManifest.owner);
  });

  it('lists exactly its shared view registration', () => {
    expect(vaultManifest.views.map((v) => v.id)).toEqual([...FEATURE_VIEWS.vault]);
  });

  it('gives the renderer a loader for every view, and nothing else', () => {
    expect(Object.keys(vaultViews).sort()).toEqual(vaultManifest.views.map((v) => v.id).sort());
  });

  it('names only real channels', () => {
    const known = new Set<string>(Object.values(CHANNELS));
    for (const channel of vaultManifest.ipc) expect(known.has(channel), channel).toBe(true);
  });
});

/**
 * The hard rule: no stored value reaches a renderer from anything the Vault
 * calls or registers. Request schemas may carry a value INTO main; the
 * responses below must carry none back.
 */
const FORBIDDEN = /^(value|values|secret|secrets|password|passwd|token|accessToken|apiKey|plaintext|credential|credentials)$/i;

/** Every field name reachable from a zod schema, with its path. */
function fieldNames(schema: z.ZodTypeAny, path = ''): string[] {
  const def = schema._def as { typeName: string } & Record<string, unknown>;
  switch (def.typeName) {
    case 'ZodObject': {
      const shape = (schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
      return Object.entries(shape).flatMap(([k, v]) => [`${path}${k}`, ...fieldNames(v, `${path}${k}.`)]);
    }
    case 'ZodArray':
      return fieldNames(def.type as z.ZodTypeAny, path);
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
      return fieldNames(def.innerType as z.ZodTypeAny, path);
    case 'ZodEffects':
      return fieldNames(def.schema as z.ZodTypeAny, path);
    case 'ZodUnion':
      return (def.options as z.ZodTypeAny[]).flatMap((o) => fieldNames(o, path));
    case 'ZodDiscriminatedUnion':
      return (def.options as z.ZodTypeAny[]).flatMap((o) => fieldNames(o, path));
    default:
      return [];
  }
}

describe('vault: no stored value reaches a renderer', () => {
  it('never registers secretsGet, the one channel that returns plaintext', () => {
    expect(vaultManifest.ipc).not.toContain(CHANNELS.secretsGet);
  });

  it('has a response schema for every channel it reaches, and no more', () => {
    expect(Object.keys(vaultResponseSchemas).sort()).toEqual([...vaultManifest.ipc].sort());
  });

  it('carries no value-shaped field in any reachable response', () => {
    for (const [channel, schema] of Object.entries(vaultResponseSchemas)) {
      const names = fieldNames(schema as z.ZodTypeAny);
      const leaked = names.filter((n) => FORBIDDEN.test(n.split('.').pop() ?? n));
      expect(leaked, channel).toEqual([]);
    }
  });

  it('the walker sees real fields (guard against a vacuous pass)', () => {
    const names = fieldNames(vaultResponseSchemas[CHANNELS.forgeAccounts] as z.ZodTypeAny);
    expect(names).toContain('hasToken');
    expect(fieldNames(z.object({ nested: z.array(z.object({ password: z.string() })) }))).toContain('nested.password');
    expect(fieldNames(vaultResponseSchemas[CHANNELS.forgeAccountAdd] as z.ZodTypeAny)).toContain('account');
  });

  it('the walker would catch SecretsGetResponse', () => {
    expect(fieldNames(schemas.SecretsGetResponse).some((n) => FORBIDDEN.test(n))).toBe(true);
  });
});
