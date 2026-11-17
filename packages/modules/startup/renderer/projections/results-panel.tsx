import type { FleetProjection } from '@midnite/studio-shared';

import type { FleetProjectionResult } from './fleet-model';

export type ResultsProps = {
  draft: FleetProjection;
  result: FleetProjectionResult;
  update: (fn: (p: FleetProjection) => FleetProjection) => void;
  pending: boolean;
  problem: string | null;
  readOnly: boolean;
};

export function ResultsPanel({ draft }: ResultsProps) {
  return <h2>{draft.name}</h2>;
}
