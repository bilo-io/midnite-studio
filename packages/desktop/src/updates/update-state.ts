export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

export type UpdateState = {
  phase: UpdatePhase;
  version: string | null;
  percent: number | null;
  error: string | null;
  manualInstall?: boolean;
};

export const IDLE_STATE: UpdateState = {
  phase: 'idle',
  version: null,
  percent: null,
  error: null,
};

export function checkingState(): UpdateState {
  return { phase: 'checking', version: null, percent: null, error: null };
}

export function availableState(version: string): UpdateState {
  return { phase: 'available', version, percent: null, error: null };
}

export function notAvailableState(): UpdateState {
  return IDLE_STATE;
}

export function downloadingState(progress: { percent?: number }, version: string): UpdateState {
  const percent = Math.max(0, Math.min(100, Math.round(progress.percent ?? 0)));
  return { phase: 'downloading', version, percent, error: null };
}

export function downloadedState(version: string): UpdateState {
  return { phase: 'downloaded', version, percent: 100, error: null };
}

export function errorState(err: string, version: string | null = null): UpdateState {
  return { phase: 'error', version, percent: null, error: err };
}
