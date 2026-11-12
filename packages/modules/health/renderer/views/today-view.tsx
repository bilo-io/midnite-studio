import { LuLayoutDashboard } from 'react-icons/lu';

import { EmptyView } from './empty-view';

/** Today — an empty state in Theme A. */
export function TodayView() {
  return <EmptyView id="today" icon={LuLayoutDashboard} title="Nothing logged today" body="Your numbers stay on this Mac." />;
}
