import { useTheme } from '@bilo-io/ui-native';
import { Linking, Text } from 'react-native';
import { linkify } from './linkify';

export function LinkedText({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text style={[theme.type.sm, { color: theme.colors.foreground }]} selectable>
      {linkify(children).map((part, i) =>
        part.url ? (
          <Text
            key={i}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(part.url!).catch(() => undefined)}
            style={{ color: theme.colors.primary, textDecorationLine: 'underline' }}
          >
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}
