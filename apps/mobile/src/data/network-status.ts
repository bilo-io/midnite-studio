// App-wide connectivity as the queries see it (Phase 146 L4). Two `network` failures in a row raise the offline banner;
// the next fetch that reaches the server (any success, or any failure that is not `network`) clears it.
import { create } from 'zustand';

export const OFFLINE_AFTER = 2;

interface NetworkStatus {
  consecutiveFailures: number;
  offline: boolean;
  recordNetworkFailure(): void;
  recordReached(): void;
}

export const useNetworkStatus = create<NetworkStatus>((set) => ({
  consecutiveFailures: 0,
  offline: false,
  recordNetworkFailure: () =>
    set((s) => {
      const consecutiveFailures = s.consecutiveFailures + 1;
      return { consecutiveFailures, offline: consecutiveFailures >= OFFLINE_AFTER };
    }),
  recordReached: () => set((s) => (s.consecutiveFailures === 0 && !s.offline ? s : { consecutiveFailures: 0, offline: false })),
}));
