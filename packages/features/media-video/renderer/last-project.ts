/**
 * Which video project Video reselects on entry: the remembered one for this
 * repo if it still exists, else `null` (the empty "Select a project" state —
 * never an arbitrary project the user did not pick).
 */
export function pickInitialProject(projectIds: readonly string[], remembered: string | null | undefined): string | null {
  if (!remembered) return null;
  return projectIds.includes(remembered) ? remembered : null;
}
