/**
 * The eight manual tab-group colours, as CSS custom-property names —
 * `styles.css` carries the actual HSL values (light + `.dark`). A
 * `BrowserTabGroup.color` stores one of these names, not a raw HSL triple,
 * so retheming the palette later never touches persisted data.
 */
export const TAB_GROUP_COLORS = [
  '--tab-group-1',
  '--tab-group-2',
  '--tab-group-3',
  '--tab-group-4',
  '--tab-group-5',
  '--tab-group-6',
  '--tab-group-7',
  '--tab-group-8',
] as const;

export type TabGroupColor = (typeof TAB_GROUP_COLORS)[number];

export const DEFAULT_TAB_GROUP_COLOR: TabGroupColor = '--tab-group-1';

/** A deterministic colour for a repo-derived group, so the same repo always gets the same chip. */
export function colorForRepoId(repoId: string): TabGroupColor {
  let hash = 0;
  for (let i = 0; i < repoId.length; i += 1) hash = (hash * 31 + repoId.charCodeAt(i)) | 0;
  const index = Math.abs(hash) % TAB_GROUP_COLORS.length;
  return TAB_GROUP_COLORS[index] ?? DEFAULT_TAB_GROUP_COLOR;
}

/** `hsl(var(--tab-group-N))` for an inline style — mirrors how ref-badge.tsx reaches the lane ramp. */
export function tabGroupColorValue(color: string): string {
  return `hsl(var(${color}))`;
}
