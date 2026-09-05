import type { ConnectionConfig } from '@midnite/studio-shared';
import { create } from 'zustand';

import { bridge } from '../services/bridge';

/**
 * The Database view's connections list — a module-scope `create()` like
 * every other store in this directory.
 *
 * Not a TanStack Query hook, unlike `services/queries.ts`'s repo-scoped reads:
 * a connection is global (not per-repo), and the empty/loading/error states
 * this store tracks map directly onto the three states Theme E's shell
 * renders (`EmptyState`, `LoadingRegion`, prose) rather than needing a
 * query-cache layer on top.
 */
export type DatabaseConnectionsStatus = 'idle' | 'loading' | 'ready' | 'error';

export type DatabaseConnectionsState = {
  status: DatabaseConnectionsStatus;
  connections: ConnectionConfig[];
  /** One sentence for the empty-state prose, set only on `status === 'error'`. */
  error: string | null;
  selectedConnectionId: string | null;

  load: () => Promise<void>;
  select: (id: string | null) => void;
  /** Merge a saved connection into the list — insert if new, replace if not. */
  upsert: (config: ConnectionConfig) => void;
  remove: (id: string) => void;
};

export const useDatabaseConnectionsStore = create<DatabaseConnectionsState>((set) => ({
  status: 'idle',
  connections: [],
  error: null,
  selectedConnectionId: null,

  load: async () => {
    const api = bridge();
    if (!api) {
      set({ status: 'error', error: 'No connection to the app.' });
      return;
    }
    set({ status: 'loading', error: null });
    try {
      const connections = await api.db.listConnections();
      set({ status: 'ready', connections });
    } catch {
      set({ status: 'error', error: 'Could not load database connections.' });
    }
  },

  select: (id) => set({ selectedConnectionId: id }),

  upsert: (config) =>
    set((state) => {
      const index = state.connections.findIndex((c) => c.id === config.id);
      const connections =
        index === -1
          ? [...state.connections, config]
          : state.connections.map((c) => (c.id === config.id ? config : c));
      return { connections, status: 'ready' };
    }),

  remove: (id) =>
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
      selectedConnectionId: state.selectedConnectionId === id ? null : state.selectedConnectionId,
    })),
}));
