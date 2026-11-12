import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { FrameChromeProvider } from '@midnite/studio-frame';

import { HEALTH_CHROME, HealthDialogHost } from './compose/health-chrome';
import { BiometricsView } from './views/biometrics-view';
import { NutritionView } from './views/nutrition-view';
import { ProgressView } from './views/progress-view';
import { TodayView } from './views/today-view';
import { WorkoutsView } from './views/workouts-view';

/**
 * Health as a pane inside a host's shell (Phase 128 Theme A.3): its own chrome and query client, no
 * `ReportIssueHost` — the host owns the one entry. An unknown view id renders Today.
 */
export function HealthPane({ view, onView }: { view: string; onView: (view: string) => void }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={HEALTH_CHROME}>
        {view === 'biometrics' ? <BiometricsView /> : null}
        {view === 'nutrition' ? <NutritionView onView={onView} /> : null}
        {view === 'workouts' ? <WorkoutsView /> : null}
        {view === 'progress' ? <ProgressView /> : null}
        {['biometrics', 'nutrition', 'workouts', 'progress'].includes(view) ? null : <TodayView />}
        <HealthDialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
