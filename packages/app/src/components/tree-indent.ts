/**
 * The sidebar tree's indent ladder — one step per level of nesting, spelled out
 * once because Tailwind cannot build class names at runtime.
 *
 * The step is 12px, the same one `change-tree.tsx` computes inline for the
 * Changes panel's directory tree, so the two trees in the app nest at the same
 * rate.
 *
 * Index by the depth of the thing being indented:
 *
 * ```
 *  0  pl-3   a panel's own sections   Staged / Unstaged, at the top of Changes
 *  1  pl-8   a repository's sections  Local / Remotes / Tags / Worktrees / …
 *  2  pl-11  their rows, and a group  a branch; the `origin` heading
 *  3  pl-14  a group's own rows       origin/main
 * ```
 *
 * Depth 0 is the odd one: it sits at the top of its panel with nothing above it
 * to nest under, so it takes the panel's own 12px gutter rather than a rung of
 * this ladder. Everything from depth 1 down is measured from the repository row,
 * whose chevron sits at 22px — grip, then chevron — so a section heading lands
 * 10px right of it and its rows 12px right of that. That relationship is the
 * whole point: a heading has to sit LEFT of the rows it owns and RIGHT of the
 * row that owns it, or the tree reads as a flat list with bold lines in it.
 */
export const TREE_INDENT = ['pl-3', 'pl-8', 'pl-11', 'pl-14'] as const;
