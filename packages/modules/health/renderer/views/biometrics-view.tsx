import { LuScale } from 'react-icons/lu';

import { EmptyView } from './empty-view';

/** Biometrics — an empty state in Theme A. */
export function BiometricsView() {
  return <EmptyView id="biometrics" icon={LuScale} title="No measurements yet" body="Weigh in to start your trend." />;
}
