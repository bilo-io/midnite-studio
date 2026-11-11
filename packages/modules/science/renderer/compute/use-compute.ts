import { useEffect, useMemo, useRef, useState } from 'react';

import type { ScienceCell } from '@midnite/studio-shared';

import type { CellResult } from './evaluate';

/** The slice of `Worker` the hook uses, so a test can inject a fake. */
export type ComputeWorkerLike = {
  postMessage(message: { runId: number; cells: ScienceCell[] }): void;
  terminate(): void;
  onmessage: ((event: { data: { runId: number; results: Record<string, CellResult> } }) => void) | null;
};
export type ComputeWorkerFactory = () => ComputeWorkerLike;

export const COMPUTE_DEBOUNCE_MS = 300;
export const COMPUTE_TIMEOUT_MS = 2000;
export const COMPUTE_SPINNER_MS = 150;
export const STOPPED_MESSAGE = 'Stopped after 2 s — simplify the expression or split the cell';

export type ComputeState = {
  results: Record<string, CellResult>;
  /** A run has been pending for longer than the spinner delay. */
  pending: boolean;
};

/**
 * Builds the compute hook over a worker factory (Phase 126 Theme D.2). A run is posted 300 ms after the last
 * edit to a compute cell; a newer run supersedes an older one (a stale `runId` is dropped). A run that has not
 * answered in 2000 ms terminates the worker, builds a fresh one and marks every compute cell stopped.
 */
export function createUseCompute(factory: ComputeWorkerFactory | null) {
  return function useCompute(cells: readonly ScienceCell[]): ComputeState {
    const [state, setState] = useState<ComputeState>({ results: {}, pending: false });
    const worker = useRef<ComputeWorkerLike | null>(null);
    const runId = useRef(0);

    // Only compute cells matter: an edit to a text cell must not post a run.
    const key = useMemo(() => JSON.stringify(cells.filter((c) => c.kind === 'compute').map((c) => [c.id, c.source])), [cells]);

    useEffect(() => {
      if (factory === null) return;
      const spawn = () => {
        const w = factory();
        w.onmessage = (event) => {
          if (event.data.runId !== runId.current) return;
          clearTimers();
          setState({ results: event.data.results, pending: false });
        };
        worker.current = w;
      };
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let spinner: ReturnType<typeof setTimeout> | null = null;
      let debounce: ReturnType<typeof setTimeout> | null = null;
      function clearTimers() {
        if (timeout !== null) clearTimeout(timeout);
        if (spinner !== null) clearTimeout(spinner);
        timeout = spinner = null;
      }
      const computeCells = cells.filter((c) => c.kind === 'compute');
      if (computeCells.length === 0) {
        setState({ results: {}, pending: false });
        return;
      }
      debounce = setTimeout(() => {
        if (worker.current === null) spawn();
        runId.current += 1;
        const id = runId.current;
        clearTimers();
        spinner = setTimeout(() => setState((s) => ({ ...s, pending: true })), COMPUTE_SPINNER_MS);
        timeout = setTimeout(() => {
          if (runId.current !== id) return;
          worker.current?.terminate();
          worker.current = null;
          spawn();
          const stopped: Record<string, CellResult> = {};
          for (const c of computeCells) stopped[c.id] = { ok: false, line: 1, message: STOPPED_MESSAGE };
          setState({ results: stopped, pending: false });
        }, COMPUTE_TIMEOUT_MS);
        worker.current!.postMessage({ runId: id, cells: [...cells] });
      }, COMPUTE_DEBOUNCE_MS);
      return () => {
        if (debounce !== null) clearTimeout(debounce);
        clearTimers();
      };
      // `key` is the cells' compute content; `cells` itself changes on every text edit.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    useEffect(
      () => () => {
        worker.current?.terminate();
        worker.current = null;
      },
      [],
    );

    return state;
  };
}
