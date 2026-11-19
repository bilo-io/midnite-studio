import { useLocalSearchParams } from 'expo-router';
import { PullDetailScreen } from '../../src/reviews/pull-detail-screen';

export default function PullRoute() {
  const { number } = useLocalSearchParams<{ number: string }>();
  return <PullDetailScreen n={Number(number)} />;
}
