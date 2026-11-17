import type { FleetProjection, PlanLine } from '@midnite/studio-shared';

/** The Runway lines a projection has written, in plan order. */
export const linkedLines = (lines: readonly PlanLine[], projectionId: string): PlanLine[] => lines.filter((l) => l.source?.projectionId === projectionId);

/** The oldest sync among the linked lines, or `null` when none are linked. */
export function oldestSync(linked: readonly PlanLine[]): string | null {
  let oldest: string | null = null;
  for (const l of linked) {
    const at = l.source?.syncedAt;
    if (at !== undefined && (oldest === null || at < oldest)) oldest = at;
  }
  return oldest;
}

/** True when the projection changed after its lines were last written (ISO timestamps compare as strings). */
export function isStale(projection: Pick<FleetProjection, 'updatedAt'>, linked: readonly PlanLine[]): boolean {
  const synced = oldestSync(linked);
  return synced !== null && projection.updatedAt > synced;
}

/** `YYYY-MM` of the month after `now`. */
export function nextMonth(now: Date = new Date()): string {
  const o = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
  return `${Math.floor(o / 12)}-${String((o % 12) + 1).padStart(2, '0')}`;
}
