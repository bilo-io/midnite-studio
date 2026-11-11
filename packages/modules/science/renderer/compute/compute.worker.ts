import type { ScienceCell } from '@midnite/studio-shared';

import { evaluateNotebook, type CellResult } from './evaluate';

export type ComputeRequest = { runId: number; cells: ScienceCell[] };
export type ComputeResponse = { runId: number; results: Record<string, CellResult> };

/** The compute worker (Phase 126 Theme D.2): answers each run with every compute cell's result. */
self.onmessage = (event: MessageEvent<ComputeRequest>) => {
  const { runId, cells } = event.data;
  const response: ComputeResponse = { runId, results: evaluateNotebook(cells) };
  (self as unknown as Worker).postMessage(response);
};
