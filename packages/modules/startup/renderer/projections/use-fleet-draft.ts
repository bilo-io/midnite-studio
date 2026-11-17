import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FleetProjection } from '@midnite/studio-shared';

import { useStartupWrite } from '../data/use-startup';
import { computeFleetProjection, type FleetProjectionResult } from './fleet-model';

export const SAVE_DEBOUNCE_MS = 400;

export type FleetDraft = {
  draft: FleetProjection | null;
  result: FleetProjectionResult | null;
  update: (fn: (p: FleetProjection) => FleetProjection) => void;
  pending: boolean;
  problem: string | null;
};

/**
 * A local, editable copy of the selected projection. Edits recompute instantly and save 400 ms after the last one.
 * The draft wins while dirty: the saved projection re-seeds it only on a selection change, or when it is strictly
 * newer and nothing is pending — otherwise sliders would jump mid-drag as each save refetches.
 */
export function useFleetDraft(source: FleetProjection | null, readOnly: boolean): FleetDraft {
  const write = useStartupWrite((bridge, projection: FleetProjection) => bridge.upsertFleetProjection({ projection }));
  const writeRef = useRef(write);
  writeRef.current = write;

  const [state, setState] = useState<FleetProjection | null>(source);
  const stateRef = useRef<FleetProjection | null>(source);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(0);
  const dirty = useRef(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const sync = () => setPending(timer.current !== null || inflight.current > 0);

  const save = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const projection = stateRef.current;
    if (!dirty.current || projection === null) {
      sync();
      return;
    }
    dirty.current = false;
    inflight.current += 1;
    sync();
    writeRef.current.mutate(projection, {
      onSuccess: () => setProblem(null),
      onError: (error) => setProblem(error.message),
      onSettled: () => {
        inflight.current -= 1;
        sync();
      },
    });
  }, []);

  // Selection change (or first arrival): flush what the previous draft owed, then seed from the source.
  // A newer source with nothing pending also re-seeds, so a rename from the list shows up.
  useEffect(() => {
    const current = stateRef.current;
    if (source === null) {
      if (current !== null) {
        save();
        stateRef.current = null;
        setState(null);
      }
      return;
    }
    if (current === null || current.id !== source.id) {
      save();
      stateRef.current = source;
      setState(source);
      return;
    }
    if (timer.current === null && inflight.current === 0 && !dirty.current && source.updatedAt > current.updatedAt) {
      stateRef.current = source;
      setState(source);
    }
  }, [source, save]);

  // Unmount: a pending save goes out now rather than being dropped.
  useEffect(() => () => save(), [save]);

  const update = useCallback(
    (fn: (p: FleetProjection) => FleetProjection) => {
      if (readOnly || stateRef.current === null) return;
      const next = fn(stateRef.current);
      stateRef.current = next;
      dirty.current = true;
      setState(next);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(save, SAVE_DEBOUNCE_MS);
      sync();
    },
    [readOnly, save],
  );

  // Until the effect has re-seeded, never show a draft that belongs to another projection.
  const draft = state !== null && source !== null && state.id === source.id ? state : source === null ? null : source;
  const result = useMemo(() => (draft === null ? null : computeFleetProjection(draft)), [draft]);
  return { draft, result, update, pending, problem };
}
