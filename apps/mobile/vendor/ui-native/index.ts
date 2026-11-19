// @bilo-io/ui-native — the React Native companion to @bilo-io/ui.
//
// The same primitives drawn with View/Text/Pressable/TextInput and plain
// StyleSheet, on the same token values: every colour and radius is read from
// `@bilo-io/ui/tokens`, never copied, and the build inlines them into dist (no
// runtime dependency on @bilo-io/ui). Web-only pieces of @bilo-io/ui
// (canvas backdrops, portals, SVG charts, the reading typography) have no
// counterpart here; see the README for the list and why.

export {
  createTheme,
  hsl,
  rampAt,
  toDp,
  withAlpha,
  type ColorName,
  type ElevationLevel,
  type ElevationStyle,
  type KindAccent,
  type SpaceStep,
  type StatusAccent,
  type TypeStep,
  type ColorScheme,
  type Theme,
  type ThemeOptions,
} from './theme/palette';
export {
  contrastOverTint,
  contrastRatio,
  contrastTextForHex,
  isLowContrastAccent,
  LOW_CONTRAST_ACCENTS,
  NON_TEXT_CONTRAST,
  type LowContrastAccent,
} from './theme/contrast';
export { ThemeProvider, useTheme, type ThemeProviderProps } from './theme/theme-provider';

export { Accordion, type AccordionProps } from './components/accordion';
export { AppBar, type AppBarProps } from './components/app-bar';
export { Avatar, initialsOf, type AvatarProps } from './components/avatar';
export { Badge, type BadgeProps, type BadgeTone } from './components/badge';
export {
  BottomNav,
  badgeText,
  type BottomNavItem,
  type BottomNavProps,
} from './components/bottom-nav';
export {
  MidniteLogo,
  Wordmark,
  type MidniteLogoProps,
  type WordmarkProps,
  type WordmarkTone,
} from './components/brand';
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './components/button';
export { Card, CardContent, CardHeader, CardTitle } from './components/card';
export { Chip, type ChipProps } from './components/chip';
export { EmptyState, type EmptyStateProps } from './components/empty-state';
export { Fab, type FabProps } from './components/fab';
export { IconButton, type IconButtonProps } from './components/icon-button';
export { Input, type InputProps } from './components/input';
export { ListRow, type ListRowProps } from './components/list-row';
export {
  SegmentedControl,
  type Segment,
  type SegmentedControlProps,
} from './components/segmented-control';
export { Sheet, type SheetProps } from './components/sheet';
export { Skeleton, type SkeletonProps } from './components/skeleton';
export { Slider, snapValue, valueAt, type SliderProps } from './components/slider';
export { SpeedDial, type SpeedDialAction, type SpeedDialProps } from './components/speed-dial';
export { Switch, type SwitchProps } from './components/switch';
export { Tabs, type TabOption, type TabsProps } from './components/tabs';
export { Textarea, type TextareaProps } from './components/textarea';
