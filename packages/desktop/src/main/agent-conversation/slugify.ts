/**
 * Convert a cwd path to the slug used by Claude Code in `~/.claude/projects/`.
 *
 * Claude Code replaces path separators and non-alphanumeric/hyphen/underscore
 * characters (such as `/`, `\`, `:`, `.`) with hyphens.
 */
export function slugifyCwd(cwd: string): string {
  if (!cwd) return '';
  const trimmed = cwd.replace(/[/\\]+$/, '');
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '-');
}
