import { LuTrendingUp } from 'react-icons/lu';

import { EmptyView } from './empty-view';

/** Progress — an empty state in Theme A. */
export function ProgressView() {
  return <EmptyView id="progress" icon={LuTrendingUp} title="Nothing to plot yet" body="Charts appear once you log something." />;
}
