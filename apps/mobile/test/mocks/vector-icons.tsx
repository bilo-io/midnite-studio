import { Text } from 'react-native';

// jsdom has no icon font: an icon renders as its glyph name so a test can find it.
export function Feather({ name }: { name: string; size?: number; color?: string }) {
  return <Text accessibilityLabel={`icon:${name}`}>{`[${name}]`}</Text>;
}
