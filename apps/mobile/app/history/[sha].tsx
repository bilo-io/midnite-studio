import { useLocalSearchParams } from 'expo-router';
import { CommitDetailScreen } from '../../src/history/commit-detail-screen';

export default function CommitRoute() {
  const { sha } = useLocalSearchParams<{ sha: string }>();
  return <CommitDetailScreen sha={String(sha)} />;
}
