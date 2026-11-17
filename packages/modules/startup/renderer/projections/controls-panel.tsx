import type { FleetProjection } from '@midnite/studio-shared';

export function ControlsPanel(_: { draft: FleetProjection; update: (fn: (p: FleetProjection) => FleetProjection) => void; readOnly: boolean }) {
  return null;
}
