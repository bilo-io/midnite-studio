import { Image, StyleSheet, Text, type TextProps, View, type ViewProps } from 'react-native';

import darkMark from '../brand/midnite-logo-dark.png?inline';
import lightMark from '../brand/midnite-logo-light.png?inline';
import { rampAt } from '../theme/palette';
import { useTheme } from '../theme/theme-provider';

export type WordmarkTone =
  /** The brand ramp across the letters of "Midnite", with the glow behind them. */
  | 'rainbow'
  /** One colour: `color`, or the foreground token. */
  | 'inherit';

export type WordmarkProps = Omit<TextProps, 'children'> & {
  /** The second half: "Midnite **UI**", "Midnite **Mobile UI**". Omit for "Midnite" alone. */
  product?: string;
  tone?: WordmarkTone;
  /** The qualifier's font size in dp; "Midnite" is set 1.35× larger, as on the web. */
  size?: number;
  /** The colour under `tone="inherit"`. */
  color?: string;
};

const LETTERS = 'Midnite'.split('');

/**
 * "Midnite UI" — the brand face for the name, the UI face for the qualifier.
 * React Native cannot clip a gradient to text without a native module, so the
 * rainbow tone steps the ramp letter by letter: each glyph takes the ramp
 * colour at its position. The face is Damion where the app registered it
 * (`ThemeProvider brandFontFamily`); on the web it comes from
 * `@bilo-io/ui/brand.css`.
 */
export function Wordmark({
  product,
  tone = 'rainbow',
  size = 16,
  color,
  style,
  ...props
}: WordmarkProps) {
  const theme = useTheme();
  const rainbow = tone === 'rainbow';
  const ink = color ?? theme.colors.foreground;

  return (
    <Text
      numberOfLines={1}
      {...props}
      style={[styles.wordmark, { fontSize: size, color: ink }, style]}
    >
      <Text
        style={[
          styles.brand,
          { fontSize: size * 1.35, fontFamily: theme.brand.fontFamily },
          rainbow && {
            textShadowColor: theme.brand.glow,
            textShadowRadius: size * 0.5,
            textShadowOffset: { width: 0, height: 0 },
          },
        ]}
      >
        {rainbow
          ? LETTERS.map((letter, i) => (
              <Text key={i} style={{ color: rampAt(theme.brand.ramp, i / (LETTERS.length - 1)) }}>
                {letter}
              </Text>
            ))
          : 'Midnite'}
      </Text>
      {product ? (
        <Text style={[styles.product, rainbow && { color: theme.colors.mutedForeground }]}>
          {` ${product}`}
        </Text>
      ) : null}
    </Text>
  );
}

export type MidniteLogoProps = Omit<ViewProps, 'children'> & {
  /** The crescent's size in dp. */
  size?: number;
  /** The crescent alone, without the wordmark. */
  markOnly?: boolean;
  product?: string;
  /** The wordmark's qualifier size; see Wordmark `size`. */
  textSize?: number;
};

/**
 * The crescent beside the wordmark. The mark is the website's PNG, inverted for
 * the dark theme ahead of time (RN has no cross-platform CSS filter), and
 * inlined as a data URI so no bundler has to ship an asset file. One image
 * with the logo's name to assistive tech.
 */
export function MidniteLogo({
  size = 28,
  markOnly = false,
  product,
  textSize = 16,
  style,
  ...props
}: MidniteLogoProps) {
  const theme = useTheme();
  const name = product ? `Midnite ${product}` : 'Midnite';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      {...props}
      style={[styles.logo, style]}
    >
      <Image
        source={{ uri: theme.scheme === 'dark' ? darkMark : lightMark }}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
      {markOnly ? null : <Wordmark product={product} size={textSize} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { includeFontPadding: false },
  brand: { fontWeight: '400', letterSpacing: 0.4 },
  product: { fontWeight: '500' },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
