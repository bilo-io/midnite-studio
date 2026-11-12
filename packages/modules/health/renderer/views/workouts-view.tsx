import { LuDumbbell } from 'react-icons/lu';

import { EmptyView } from './empty-view';

/** Workouts — an empty state in Theme A. */
export function WorkoutsView() {
  return <EmptyView id="workouts" icon={LuDumbbell} title="No workout plans" body="Pick a starter plan or build your own." />;
}
