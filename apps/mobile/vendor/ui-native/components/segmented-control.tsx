import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { Tabs } from './tabs';

export type Segment = { key: string; label: string; icon?: ReactNode };

export type SegmentedControlProps = {
  segments: Segment[];
  value: string;
  onChange: (key: string) => void;
  /** Accessible name of the tab list. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Full-width segments (Board | List | Graph): `Tabs` stretched, under the
 * key/label shape the mobile screens use.
 */
export function SegmentedControl({
  segments,
  value,
  onChange,
  accessibilityLabel = 'View',
  style,
  testID,
}: SegmentedControlProps) {
  return (
    <Tabs
      options={segments.map((s) => ({ value: s.key, label: s.label, icon: s.icon }))}
      value={value}
      onChange={onChange}
      accessibilityLabel={accessibilityLabel}
      stretch
      style={style}
      testID={testID}
    />
  );
}
