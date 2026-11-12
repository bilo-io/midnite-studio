import { LuUtensils } from 'react-icons/lu';

import { EmptyView } from './empty-view';

/** Nutrition — an empty state in Theme A. */
export function NutritionView() {
  return <EmptyView id="nutrition" icon={LuUtensils} title="No meals logged" body="Log a meal to see your calories." />;
}
