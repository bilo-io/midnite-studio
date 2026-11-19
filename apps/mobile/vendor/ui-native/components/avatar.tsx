import { useEffect, useState } from 'react';
import { Image, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/theme-provider';

export type AvatarProps = {
  uri?: string;
  /** Used for the initials fallback and the accessible name. */
  name: string;
  size?: 24 | 32 | 40;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Up to two initials: `bilo-io` → `BI`, `Ada Lovelace` → `AL`. */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  const letters =
    words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]![0]}${words[words.length - 1]![0]}`;
  return letters.toUpperCase();
}

/** A round picture, or initials on a muted disc when there is none or it fails to load. */
export function Avatar({ uri, name, size = 32, style, testID }: AvatarProps) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const frame = { width: size, height: size, borderRadius: theme.radius.full };
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name}
      testID={testID}
      style={[styles.disc, frame, { backgroundColor: theme.colors.muted }, style]}
    >
      {uri && !failed ? (
        <Image source={{ uri }} onError={() => setFailed(true)} style={frame} />
      ) : (
        <Text
          aria-hidden
          maxFontSizeMultiplier={1.4}
          style={{
            color: theme.colors.mutedForeground,
            fontSize: Math.round(size * 0.4),
            fontWeight: theme.font.semibold,
          }}
        >
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
