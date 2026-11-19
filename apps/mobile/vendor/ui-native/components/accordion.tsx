import { type ReactNode, useState } from 'react';
import {
  LayoutAnimation,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { a11yState } from '../lib/a11y';
import { useTheme } from '../theme/theme-provider';

export type AccordionProps = {
  title: string;
  /** A badge after the title. */
  count?: number;
  /** Leading glyph. */
  icon?: ReactNode;
  /** Trailing control, outside the trigger. */
  action?: ReactNode;
  defaultOpen?: boolean;
  /** `card`: a bordered surface split by a rule. `bare`: no frame; a rule runs after the title. */
  variant?: 'card' | 'bare';
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * A titled disclosure section, the web Accordion's uppercase header with an
 * optional icon, count and action. Uncontrolled; the trigger is a button that
 * reports `expanded`, and the body animates with LayoutAnimation on native.
 */
export function Accordion({
  title,
  count,
  icon,
  action,
  defaultOpen = false,
  variant = 'card',
  children,
  style,
}: AccordionProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const bare = variant === 'bare';
  const muted = theme.colors.mutedForeground;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };

  return (
    <View
      style={[
        !bare && [
          styles.card,
          {
            borderRadius: theme.radius.lg,
            borderColor: theme.colors.border,
            backgroundColor: theme.alpha('card', 0.6),
          },
        ],
        style,
      ]}
    >
      <View style={[styles.header, bare ? styles.headerBare : styles.headerCard]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={typeof count === 'number' ? `${title}, ${count}` : title}
          {...a11yState({ expanded: open })}
          onPress={toggle}
          style={styles.trigger}
        >
          <View
            pointerEvents="none"
            style={[
              styles.chevron,
              { borderColor: muted, transform: [{ rotate: open ? '45deg' : '-45deg' }] },
            ]}
          />
          {icon ? <View pointerEvents="none">{icon}</View> : null}
          <Text style={[styles.title, { color: muted }]}>{title}</Text>
          {typeof count === 'number' ? (
            <View style={[styles.count, { backgroundColor: theme.alpha('muted', 0.6) }]}>
              <Text style={[styles.countText, { color: muted }]}>{count}</Text>
            </View>
          ) : null}
          {bare ? (
            <View style={[styles.rule, { backgroundColor: theme.alpha('border', 0.6) }]} />
          ) : null}
        </Pressable>
        {action ? <View>{action}</View> : null}
      </View>
      {open ? (
        <View style={bare ? null : [styles.body, { borderTopColor: theme.alpha('border', 0.6) }]}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  headerCard: { minHeight: 52, paddingVertical: 10 },
  headerBare: { paddingVertical: 8 },
  trigger: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  // A drawn chevron (two borders of a turned square), so there is no icon dependency.
  chevron: {
    width: 7,
    height: 7,
    marginHorizontal: 4,
    marginTop: -2,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
  },
  title: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  count: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontSize: 10, fontWeight: '500', fontVariant: ['tabular-nums'] },
  rule: { flex: 1, height: 1 },
  body: { borderTopWidth: 1 },
});
