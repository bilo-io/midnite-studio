/** Tolerant readers for untyped GraphQL payloads. Every level of a response can legitimately be absent. */
export const pick = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;

export const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const asBool = (value: unknown): boolean => value === true;

export const asInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

/**
 * A line number, or null.
 *
 * `line` is genuinely null on an outdated thread and `startLine` is null on every single-line one, so null
 * is the common case rather than a fault. Zero and negatives are rejected.
 */
export const asPositiveInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;

/** `{ nodes: [...] }` connection to its node array. */
export const nodesOf = (connection: unknown): unknown[] => asArray(pick(connection, 'nodes'));
