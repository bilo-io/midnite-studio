import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FieldNameSchema,
  GAME_ENTITY_DEFAULT_SCHEMAS,
  GameEntityTypeSchema,
  entitySchemaFor,
  entityTypesFor,
  fieldTiledType,
} from './game-entity-types';
import { GAME_LEVEL_ENTITY_TYPES_2D, GAME_LEVEL_ENTITY_TYPES_3D } from './game-level';
import { GAME_ASSET_KINDS, GameManifestSchema } from './media-game';
import { SPAWNER_DEFAULT_DENSITY, SPAWNER_TYPE, spawnerInfo } from './game-level-overlays';

const base = { version: 1, name: 'g', engine: 'phaser', dimension: '2d', perspective: 'platformer', genre: null, starter: 'blank', kitVersion: '0.12.0' };
const templates = join(__dirname, '../../../templates/media-game');

function* files(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(js|mjs|ts|json|tmj|md)$/.test(n)) yield p;
  }
}

describe('entity type schemas', () => {
  it('A1: a manifest without entityTypes parses unchanged', () => {
    const m = GameManifestSchema.parse(base);
    expect(m.entityTypes).toBeUndefined();
    expect(GameManifestSchema.safeParse({ ...base, entityTypes: [{ type: 'door' }] }).success).toBe(true);
  });

  it('A2: a manifest entry overrides a default and a new type appears', () => {
    const m = GameManifestSchema.parse({
      ...base,
      entityTypes: [
        { type: 'enemy', fields: [{ kind: 'bool', name: 'boss' }] },
        { type: 'door', fields: [{ kind: 'link', name: 'opens', targetTypes: ['switch'] }] },
      ],
    });
    expect(entitySchemaFor(m, 'enemy')?.fields.map((f) => f.name)).toEqual(['boss']);
    expect(entitySchemaFor(null, 'enemy')?.fields.map((f) => f.name)).toEqual(['speed', 'hp']);
    expect(entityTypesFor(m, '2d').map((t) => t.type)).toContain('door');
    expect(entityTypesFor(m, '2d').filter((t) => t.type === 'enemy')).toHaveLength(1);
    expect(entitySchemaFor(m, 'nope')).toBeNull();
    expect(entitySchemaFor(null, 'light', '2d')).toBeNull();
  });

  it('A3: FieldName rejects midnite.foo and 9lives', () => {
    expect(FieldNameSchema.safeParse('midnite.foo').success).toBe(false);
    expect(FieldNameSchema.safeParse('midnite_foo').success).toBe(false);
    expect(FieldNameSchema.safeParse('9lives').success).toBe(false);
    expect(FieldNameSchema.safeParse('speed').success).toBe(true);
  });

  it('A4: every default field name occurs in the kit or a starter', () => {
    const text = [...files(templates)].map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const t of GAME_ENTITY_DEFAULT_SCHEMAS) for (const f of t.fields) expect(text, `${t.type}.${f.name}`).toMatch(new RegExp(`\\b${f.name}\\b`));
  });

  it('A5: fieldTiledType maps kinds to Tiled property types', () => {
    const parse = (f: unknown) => GameEntityTypeSchema.parse({ type: 'x', fields: [f] }).fields[0]!;
    expect(fieldTiledType(parse({ kind: 'link', name: 'a' }))).toBe('object');
    expect(fieldTiledType(parse({ kind: 'asset', name: 'a', assetKind: 'model' }))).toBe('string');
    expect(fieldTiledType(parse({ kind: 'color', name: 'a' }))).toBe('color');
    expect(fieldTiledType(parse({ kind: 'number', name: 'a', integer: true }))).toBe('int');
    expect(fieldTiledType(parse({ kind: 'number', name: 'a' }))).toBe('float');
    expect(fieldTiledType(parse({ kind: 'enum', name: 'a', options: ['x'] }))).toBe('string');
    expect(fieldTiledType(parse({ kind: 'bool', name: 'a' }))).toBe('bool');
  });

  it('A6: spawner is a default schema with exactly the fields the editor writes', () => {
    const s = entitySchemaFor(null, SPAWNER_TYPE)!;
    expect(s.fields.map((f) => f.name)).toEqual(['spawns', 'density']);
    const density = s.fields[1]!;
    expect(density.kind === 'number' && density.default).toBe(SPAWNER_DEFAULT_DENSITY);
    expect(density.kind === 'number' && density.min).toBe(0);
    expect(s.fields[0]!.kind === 'string' && s.fields[0]!.default).toBe(spawnerInfo({}).spawns);
    // An existing spawner zone, written before schemas, still reads as it did.
    expect(spawnerInfo({ properties: [{ name: 'spawns', value: 'pedestrians' }] })).toEqual({ spawns: 'pedestrians', density: 1 });
  });

  it('defaults cover the level entity type lists and the asset kinds stay one list', () => {
    const names = (d: '2d' | '3d') => entityTypesFor(null, d).map((t) => t.type).sort();
    expect(names('2d')).toEqual([...GAME_LEVEL_ENTITY_TYPES_2D].sort());
    expect(names('3d')).toEqual([...GAME_LEVEL_ENTITY_TYPES_3D].sort());
    expect(GAME_ASSET_KINDS).toContain('model');
  });
});
