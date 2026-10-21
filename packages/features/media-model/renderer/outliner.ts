import { parentIndices, type ModelSpec } from '@midnite/studio-shared';

export type OutlinerRow = {
  index: number;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  /** Hidden itself or through an ancestor. */
  hidden: boolean;
};

/**
 * The outliner's rows in tree order (roots and children in part order). Children of a collapsed
 * part are left out; `collapsed` holds part ids (the index as a string for a part without one).
 */
export function buildOutline(spec: ModelSpec, collapsed: ReadonlySet<string> = new Set()): OutlinerRow[] {
  const parents = parentIndices(spec.parts);
  const children = new Map<number | null, number[]>();
  spec.parts.forEach((_, i) => {
    const key = parents[i] ?? null;
    children.set(key, [...(children.get(key) ?? []), i]);
  });
  const key = (i: number): string => spec.parts[i]!.id ?? String(i);
  const rows: OutlinerRow[] = [];
  const walk = (i: number, depth: number, hidden: boolean): void => {
    const kids = children.get(i) ?? [];
    const isHidden = hidden || spec.parts[i]!.hidden === true;
    const isCollapsed = kids.length > 0 && collapsed.has(key(i));
    rows.push({ index: i, depth, hasChildren: kids.length > 0, collapsed: isCollapsed, hidden: isHidden });
    if (!isCollapsed) for (const k of kids) walk(k, depth + 1, isHidden);
  };
  for (const root of children.get(null) ?? []) walk(root, 0, false);
  return rows;
}

/** Indices between two rows (inclusive) in outline order — what Shift+click selects. */
export function rangeBetween(rows: readonly OutlinerRow[], a: number, b: number): number[] {
  const from = rows.findIndex((r) => r.index === a);
  const to = rows.findIndex((r) => r.index === b);
  if (from < 0 || to < 0) return [b];
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  return rows.slice(lo, hi + 1).map((r) => r.index);
}
