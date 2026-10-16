// @vitest-environment node
import { schemas } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

/** Every property name reachable from a zod schema — enough to prove a response can carry no key field. */
function propertyNames(schema: z.ZodTypeAny, seen = new Set<unknown>()): string[] {
  if (seen.has(schema)) return [];
  seen.add(schema);
  const def = schema._def as Record<string, unknown>;
  const names: string[] = [];
  const next = (child: unknown): void => {
    if (child && typeof child === 'object' && '_def' in child) names.push(...propertyNames(child as z.ZodTypeAny, seen));
  };
  if (typeof (schema as { shape?: unknown }).shape === 'object') {
    for (const [name, child] of Object.entries((schema as z.AnyZodObject).shape)) {
      names.push(name);
      next(child);
    }
  }
  for (const field of ['type', 'innerType', 'schema', 'left', 'right', 'valueType', 'in', 'out', 'unwrap']) next(def[field]);
  if (Array.isArray(def['options'])) def['options'].forEach(next);
  if (Array.isArray(def['items'])) def['items'].forEach(next);
  if (typeof def['getter'] === 'function') next((def['getter'] as () => unknown)());
  return names;
}

describe('finance and markets wire schemas', () => {
  const entries = Object.entries(schemas).filter(([name]) => /^(Finance|Markets)/.test(name));

  it('guard: the filter actually finds the finance schemas', () => {
    expect(entries.length).toBeGreaterThanOrEqual(15);
  });

  it('guard: the walker sees through the result envelope', () => {
    expect(propertyNames(schemas.FinanceQuoteResponse)).toEqual(expect.arrayContaining(['price', 'currency']));
  });

  it('no response (or request) schema has a field that could carry an API key', () => {
    const offenders = entries.flatMap(([name, schema]) =>
      propertyNames(schema as z.ZodTypeAny)
        .filter((property) => /key|token|secret|password|credential/i.test(property))
        .map((property) => `${name}.${property}`),
    );
    expect(offenders).toEqual([]);
  });
});
