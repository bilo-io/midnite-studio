import { useQuery } from '@tanstack/react-query';

import { STARTUP_KEY, StartupError, startupBridge, unwrap } from '../data/use-startup';
import type { Horizon, RunwayProjectionView } from './runway-types';

/** `['startup', 'projection', scenarioId, months]`: refetched by the same `startupChanged` invalidation as every read. */
export function useProjection(scenarioId: string, months: Horizon) {
  return useQuery<RunwayProjectionView>({
    queryKey: [...STARTUP_KEY, 'projection', scenarioId, months],
    queryFn: async () => {
      const bridge = startupBridge();
      if (bridge === undefined) throw new StartupError('io', 'Midnite Startup is not available here.');
      return unwrap(await bridge.projection({ scenarioId, months })) as RunwayProjectionView;
    },
  });
}
