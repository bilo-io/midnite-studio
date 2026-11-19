import { ForwardRefExoticComponent } from 'react';
import { JSX } from 'react';
import { PressableProps } from 'react-native';
import { ReactNode } from 'react';
import { RefAttributes } from 'react';
import { StyleProp } from 'react-native';
import { Text as Text_2 } from 'react-native';
import { TextInput } from 'react-native';
import { TextInputProps } from 'react-native';
import { TextProps } from 'react-native';
import { TextStyle } from 'react-native';
import { View } from 'react-native';
import { ViewProps } from 'react-native';
import { ViewStyle } from 'react-native';

/** Domain accent hues (task status, item kind, workflow-node category). */
declare const accentHues: {
    readonly status: {
        readonly light: {
            readonly backlog: "240 4% 50%";
            readonly todo: "217 91% 60%";
            readonly wip: "38 92% 50%";
            readonly waiting: "280 65% 60%";
            readonly done: "142 71% 45%";
            readonly abandoned: "0 0% 60%";
        };
        readonly dark: {
            readonly backlog: "240 5% 65%";
            readonly todo: "217 91% 68%";
            readonly wip: "38 92% 60%";
            readonly waiting: "280 65% 70%";
            readonly done: "142 71% 55%";
            readonly abandoned: "0 0% 50%";
        };
    };
    readonly kind: {
        readonly light: {
            readonly bug: "0 84% 60%";
            readonly feature: "262 83% 58%";
            readonly question: "217 91% 60%";
            readonly chore: "240 4% 46%";
            readonly unknown: "240 4% 60%";
        };
        readonly dark: {
            readonly bug: "0 84% 65%";
            readonly feature: "262 83% 68%";
            readonly question: "217 91% 68%";
            readonly chore: "240 5% 60%";
            readonly unknown: "240 5% 55%";
        };
    };
    readonly node: {
        readonly light: {
            readonly trigger: "217 91% 60%";
            readonly action: "262 83% 58%";
            readonly logic: "38 92% 50%";
            readonly data: "173 80% 40%";
            readonly storage: "333 80% 52%";
        };
        readonly dark: {
            readonly trigger: "217 91% 68%";
            readonly action: "262 83% 68%";
            readonly logic: "38 92% 60%";
            readonly data: "173 70% 50%";
            readonly storage: "333 75% 62%";
        };
    };
};

/**
 * A titled disclosure section, the web Accordion's uppercase header with an
 * optional icon, count and action. Uncontrolled; the trigger is a button that
 * reports `expanded`, and the body animates with LayoutAnimation on native.
 */
export declare function Accordion({ title, count, icon, action, defaultOpen, variant, children, style, }: AccordionProps): JSX.Element;

export declare type AccordionProps = {
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

/** The top bar: leading slot, a title block that fills the row, trailing slot. */
export declare function AppBar({ title, subtitle, leading, trailing, onTitlePress, insetTop, style, testID, }: AppBarProps): JSX.Element;

export declare type AppBarProps = {
    title: ReactNode;
    subtitle?: string;
    leading?: ReactNode;
    trailing?: ReactNode;
    /** Makes the title block a button (a repo switcher, say). */
    onTitlePress?: () => void;
    /** The safe-area top inset; the library takes no safe-area dependency. */
    insetTop?: number;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

/** A round picture, or initials on a muted disc when there is none or it fails to load. */
export declare function Avatar({ uri, name, size, style, testID }: AvatarProps): JSX.Element;

export declare type AvatarProps = {
    uri?: string;
    /** Used for the initials fallback and the accessible name. */
    name: string;
    size?: 24 | 32 | 40;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

/**
 * A small status pill. `neutral` and `primary` are solid fills; the semantic
 * tones are their hue at 0.15 behind `foreground` text, with a full-strength
 * dot carrying the hue (light-mode amber cannot hold 4.5:1 as text).
 */
export declare function Badge({ tone, children, style, testID }: BadgeProps): JSX.Element;

export declare type BadgeProps = {
    tone?: BadgeTone;
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

/** What a numeric badge shows: the count, `99+` past 99, nothing at 0. */
export declare function badgeText(badge: number | boolean | undefined): string | null;

export declare type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

/**
 * The tab bar: equal-width items, the active one on an accent pill. Its props
 * map straight from an expo-router `tabBar` (state.routes → items,
 * state.index → activeKey, navigation.navigate → onChange).
 */
export declare function BottomNav({ items, activeKey, onChange, insetBottom, hideLabels, style, testID, }: BottomNavProps): JSX.Element;

export declare type BottomNavItem = {
    key: string;
    label: string;
    /** A node, or a render function given the ink for the item's state (as expo-router's `tabBarIcon`). */
    icon: ReactNode | ((state: {
        color: string;
        focused: boolean;
    }) => ReactNode);
    /** A count (capped at `99+`) or `true` for a dot. */
    badge?: number | boolean;
};

export declare type BottomNavProps = {
    items: BottomNavItem[];
    activeKey: string;
    onChange: (key: string) => void;
    /** The safe-area bottom inset. */
    insetBottom?: number;
    /** Icons only (large Dynamic Type); each tab keeps its label as its name. */
    hideLabels?: boolean;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

/**
 * The primary action, with the web Button's five variants and four sizes. A
 * `Pressable` with `accessibilityRole="button"`; `disabled` and `loading` both
 * block presses and are reported to assistive tech.
 */
export declare const Button: ForwardRefExoticComponent<Omit<PressableProps, "children" | "style"> & {
variant?: ButtonVariant;
size?: ButtonSize;
/** A string is set in the label style; anything else (an icon, a row) renders as given. */
children?: ReactNode;
/** Covers the content with a spinner (the button keeps its width), blocks presses and reports busy. */
loading?: boolean;
style?: StyleProp<ViewStyle>;
textStyle?: StyleProp<TextStyle>;
} & RefAttributes<View>>;

export declare type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** A string is set in the label style; anything else (an icon, a row) renders as given. */
    children?: ReactNode;
    /** Covers the content with a spinner (the button keeps its width), blocks presses and reports busy. */
    loading?: boolean;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
};

export declare type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

export declare type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';

/**
 * The bordered surface, with header, title and content parts, as on the web.
 * Each part is a plain `View` (the title a `Text` with the header role) and
 * forwards its props, accessibility ones included.
 */
export declare const Card: ForwardRefExoticComponent<ViewProps & RefAttributes<View>>;

export declare const CardContent: ForwardRefExoticComponent<ViewProps & RefAttributes<View>>;

export declare const CardHeader: ForwardRefExoticComponent<ViewProps & RefAttributes<View>>;

export declare const CardTitle: ForwardRefExoticComponent<TextProps & RefAttributes<Text_2>>;

/** A compact label or filter pill. Pressable when `onPress` is set. */
export declare function Chip({ label, color, selected, onPress, leading, style, testID }: ChipProps): JSX.Element;

export declare type ChipProps = {
    label: string;
    /** A hex fill (`#rrggbb`, `rrggbb` or `#rgb`: a label or option colour); the text picks black or white to read on it. Anything else is ignored. */
    color?: string;
    selected?: boolean;
    onPress?: () => void;
    leading?: ReactNode;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

export declare type ColorName = keyof ColorScale;

/** Semantic color tokens for one theme — mirrors the `:root` / `.dark` blocks. */
declare type ColorScale = {
    background: Hsl;
    foreground: Hsl;
    card: Hsl;
    cardForeground: Hsl;
    primary: Hsl;
    primaryForeground: Hsl;
    secondary: Hsl;
    secondaryForeground: Hsl;
    muted: Hsl;
    mutedForeground: Hsl;
    accent: Hsl;
    accentForeground: Hsl;
    destructive: Hsl;
    destructiveForeground: Hsl;
    success: Hsl;
    successForeground: Hsl;
    popover: Hsl;
    popoverForeground: Hsl;
    border: Hsl;
    input: Hsl;
    ring: Hsl;
};

export declare type ColorScheme = 'light' | 'dark';

/** `fg` over `tint` laid on `bg` at `alpha`: text on a translucent badge or diff row. */
export declare function contrastOverTint(fg: string, tint: string, alpha: number, bg: string): number;

/**
 * The WCAG contrast ratio (1–21) of `fg` drawn on `bg`. A translucent `fg` is
 * composited over `bg`; a translucent `bg` is composited over white.
 */
export declare function contrastRatio(fg: string, bg: string): number;

/** Black or white text for a `#rrggbb` fill, whichever reads (WCAG luminance split at 0.179). */
export declare function contrastTextForHex(hex: string): '#000000' | '#ffffff';

export declare function createTheme(scheme: ColorScheme, options?: ThemeOptions): Theme;

export declare type ElevationLevel = 0 | 1 | 2 | 3;

/** A ready-made shadow style: iOS shadow keys plus the Android `elevation`. */
export declare type ElevationStyle = {
    shadowColor: string;
    shadowOffset: {
        width: number;
        height: number;
    };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
};

/** The centred "nothing here" block: icon, title, a line of body, an optional action. */
export declare function EmptyState({ icon, title, body, action, style, testID }: EmptyStateProps): JSX.Element;

export declare type EmptyStateProps = {
    icon?: ReactNode;
    title: string;
    body?: string;
    action?: {
        label: string;
        onPress: () => void;
    };
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

/** The floating action button: a plain primary disc, absolutely positioned. */
export declare function Fab({ icon, label, onPress, position, offsetBottom, style, testID, expanded, }: FabProps): JSX.Element;

export declare type FabProps = {
    icon: ReactNode;
    /** The accessible name. */
    label: string;
    onPress: () => void;
    position?: 'bottom-right' | 'bottom-left';
    /** Distance from the bottom edge (nav height + inset + space[4], typically). */
    offsetBottom?: number;
    style?: StyleProp<ViewStyle>;
    testID?: string;
    /** Extra a11y state (SpeedDial sets `expanded`). */
    expanded?: boolean;
};

declare type FieldProps = TextInputProps & {
    /** A visible label above the field; it is also the accessible name unless `accessibilityLabel` is set. */
    label?: string;
    /** Read-only and dimmed (`editable={false}`), and reported as disabled. */
    disabled?: boolean;
};

/** A bare HSL triplet (`H S% L%`), consumed as `hsl(var(--token))` / `hsl(${value})`. */
declare type Hsl = string;

/**
 * `240 10% 3.9%` → `hsl(240, 10%, 3.9%)` (or `hsla(…, alpha)`). The comma
 * form, because every React Native version's colour parser accepts it.
 */
export declare function hsl(triplet: Hsl, alpha?: number): string;

/** A round icon-only button with a 44dp minimum hit target. */
export declare function IconButton({ icon, label, onPress, variant, size, disabled, style, testID, }: IconButtonProps): JSX.Element;

export declare type IconButtonProps = {
    icon: ReactNode;
    /** The accessible name: an icon alone says nothing to a screen reader. */
    label: string;
    onPress: () => void;
    variant?: 'ghost' | 'filled';
    size?: 32 | 40;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

/** Up to two initials: `bilo-io` → `BI`, `Ada Lovelace` → `AL`. */
export declare function initialsOf(name: string): string;

/** A single-line text field on the design tokens. Give it a `label` or an `accessibilityLabel`. */
export declare const Input: ForwardRefExoticComponent<TextInputProps & {
label?: string;
disabled?: boolean;
} & RefAttributes<TextInput>>;

export declare type InputProps = FieldProps;

/** Whether an accent needs the 1dp outline in this scheme. */
export declare function isLowContrastAccent(scheme: ColorScheme, group: 'status' | 'kind', name: string): boolean;

export declare type KindAccent = keyof (typeof accentHues.kind)['light'];

/** A list row: 56dp (72 with a subtitle), leading and trailing slots, a hairline divider. */
export declare function ListRow({ title, subtitle, leading, trailing, meta, onPress, onLongPress, numberOfLines, divider, style, testID, }: ListRowProps): JSX.Element;

export declare type ListRowProps = {
    title: string;
    subtitle?: string;
    leading?: ReactNode;
    trailing?: ReactNode;
    /** A short right-aligned value (a count, a setting's current value). */
    meta?: string;
    onPress?: () => void;
    onLongPress?: () => void;
    /** Title line clamp. */
    numberOfLines?: number;
    /** Drop the hairline divider (the last row of a group). */
    divider?: boolean;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

/**
 * Every accent under 3:1 against its scheme's background. A component drawing
 * one of these as a stroke or dot adds a 1dp `border` outline so it still reads.
 */
export declare const LOW_CONTRAST_ACCENTS: readonly LowContrastAccent[];

export declare type LowContrastAccent = {
    scheme: ColorScheme;
    group: 'status' | 'kind';
    name: StatusAccent | KindAccent;
    ratio: number;
};

/**
 * The crescent beside the wordmark. The mark is the website's PNG, inverted for
 * the dark theme ahead of time (RN has no cross-platform CSS filter), and
 * inlined as a data URI so no bundler has to ship an asset file. One image
 * with the logo's name to assistive tech.
 */
export declare function MidniteLogo({ size, markOnly, product, textSize, style, ...props }: MidniteLogoProps): JSX.Element;

export declare type MidniteLogoProps = Omit<ViewProps, 'children'> & {
    /** The crescent's size in dp. */
    size?: number;
    /** The crescent alone, without the wordmark. */
    markOnly?: boolean;
    product?: string;
    /** The wordmark's qualifier size; see Wordmark `size`. */
    textSize?: number;
};

/** The WCAG 1.4.11 floor for strokes and dots. */
export declare const NON_TEXT_CONTRAST = 3;

/** Where `t` (0–1) falls along a ramp of HSL stops, as an `hsl()` colour. */
export declare function rampAt(stops: readonly Hsl[], t: number): string;

export declare type Segment = {
    key: string;
    label: string;
    icon?: ReactNode;
};

/**
 * Full-width segments (Board | List | Graph): `Tabs` stretched, under the
 * key/label shape the mobile screens use.
 */
export declare function SegmentedControl({ segments, value, onChange, accessibilityLabel, style, testID, }: SegmentedControlProps): JSX.Element;

export declare type SegmentedControlProps = {
    segments: Segment[];
    value: string;
    onChange: (key: string) => void;
    /** Accessible name of the tab list. */
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

/**
 * A modal panel that slides in from the left (a drawer) or up from the bottom,
 * over the scrim. Swipe it back the way it came, tap the scrim, or press
 * Android back (`onRequestClose`) to close.
 */
export declare function Sheet({ open, onOpenChange, side, title, children, widthFraction, snapPoints, modal, insetTop, insetBottom, style, testID, }: SheetProps): JSX.Element;

export declare type SheetProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    side: 'left' | 'bottom';
    title?: string;
    children: ReactNode;
    /** Left sheet width as a fraction of the screen, capped at 360dp. */
    widthFraction?: number;
    /** Bottom sheet heights as fractions of the screen, smallest first. */
    snapPoints?: number[];
    /**
     * `false` draws the sheet in place (absolutely filling its parent) instead of
     * in a native `Modal`: for a sheet inside a frame, such as a showcase phone.
     */
    modal?: boolean;
    /** Safe-area insets in dp: a drawer pads both, a bottom sheet the bottom. */
    insetTop?: number;
    insetBottom?: number;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

/** A loading placeholder block that pulses; a static block under reduce motion. */
export declare function Skeleton({ width, height, radius, style, testID }: SkeletonProps): JSX.Element;

export declare type SkeletonProps = {
    width: number | `${number}%`;
    height: number;
    /** Corner radius in dp; defaults to `radius.sm`. */
    radius?: number;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

/**
 * A range slider in pure React Native: a PanResponder over a painted track, no
 * native module. Drag or tap the track; screen readers get the adjustable role
 * with increment/decrement actions; on the web (react-native-web) it takes
 * focus and answers the arrow, Page and Home/End keys like `<input type=range>`.
 */
export declare function Slider({ value, defaultValue, min, max, step, onValueChange, onSlidingComplete, color, label, accessibilityLabel, disabled, style, testID, }: SliderProps): JSX.Element;

export declare type SliderProps = {
    /** Controlled value. Leave undefined (and pass `defaultValue`) for uncontrolled. */
    value?: number;
    /** Starting value when uncontrolled. Defaults to `min`. */
    defaultValue?: number;
    min?: number;
    max?: number;
    step?: number;
    /** Called with each new value while dragging or stepping. */
    onValueChange?: (value: number) => void;
    /** Called once when a drag ends. */
    onSlidingComplete?: (value: number) => void;
    /** The fill and knob colour. Defaults to the primary token. */
    color?: string;
    /** A visible label above the track; also the accessible name unless `accessibilityLabel` is set. */
    label?: string;
    accessibilityLabel?: string;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

/** Clamped to [min, max] and snapped to `step`, as the web slider's `sliderValue`. */
export declare function snapValue(value: number, min: number, max: number, step: number): number;

export declare type SpaceStep = keyof typeof spacing;

/** Spacing scale — Tailwind's default steps, in rem. Keys are the Tailwind step names. */
declare const spacing: {
    readonly '0': "0";
    readonly '0.5': "0.125rem";
    readonly '1': "0.25rem";
    readonly '2': "0.5rem";
    readonly '3': "0.75rem";
    readonly '4': "1rem";
    readonly '5': "1.25rem";
    readonly '6': "1.5rem";
    readonly '8': "2rem";
    readonly '10': "2.5rem";
    readonly '12': "3rem";
};

/**
 * A FAB that fans out actions above it over a scrim. Tapping the scrim or an
 * action closes it. Render it as the last child of the screen container (above
 * the content, below the nav) so the scrim covers the content.
 */
export declare function SpeedDial({ open, onOpenChange, actions, icon, openIcon, label, position, offsetBottom, style, testID, }: SpeedDialProps): JSX.Element;

export declare type SpeedDialAction = {
    key: string;
    label: string;
    icon: ReactNode;
    onPress: () => void;
    /** Drawn at 0.4 with a "Coming soon" suffix, and inert. */
    disabled?: boolean;
};

export declare type SpeedDialProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    actions: SpeedDialAction[];
    icon: ReactNode;
    /** Shown while open; without it `icon` rotates 45° (plus → ×). */
    openIcon?: ReactNode;
    /** The FAB's accessible name. */
    label?: string;
    position?: 'bottom-right' | 'bottom-left';
    offsetBottom?: number;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

export declare type StatusAccent = keyof (typeof accentHues.status)['light'];

/**
 * A controlled on/off toggle with the switch role, drawn like the web Switch
 * (a 36×20 track, the thumb sliding 16dp). It is the design-system look; reach
 * for RN's own `Switch` when the platform control is wanted instead.
 */
export declare function Switch({ checked, onCheckedChange, disabled, accessibilityState, style, ...props }: SwitchProps): JSX.Element;

export declare type SwitchProps = Omit<PressableProps, 'children' | 'style' | 'onPress'> & {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
};

export declare interface TabOption<T extends string> {
    value: T;
    label: string;
    icon?: ReactNode;
}

/**
 * The segmented control: a tab list whose segments are tabs, the selected one
 * on the accent fill. Controlled, like the web Tabs; the caller renders the
 * matching panel.
 */
export declare function Tabs<T extends string>({ options, value, onChange, accessibilityLabel, stretch, style, testID, }: TabsProps<T>): JSX.Element;

export declare type TabsProps<T extends string> = {
    options: TabOption<T>[];
    value: T;
    onChange: (value: T) => void;
    /** Accessible name of the tab list. */
    accessibilityLabel: string;
    /** Stretch the segments to share the full width — the usual phone layout. */
    stretch?: boolean;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

/** A multi-line text field matching Input: at least 80dp tall, text from the top. */
export declare const Textarea: ForwardRefExoticComponent<TextInputProps & {
label?: string;
disabled?: boolean;
} & RefAttributes<TextInput>>;

export declare type TextareaProps = FieldProps;

export declare type Theme = {
    scheme: ColorScheme;
    /** Every semantic colour token, ready for a style. */
    colors: Record<ColorName, string>;
    /** A token at an alpha: the native spelling of Tailwind's `bg-primary/90`. */
    alpha: (name: ColorName, alpha: number) => string;
    /** The radius scale in dp (`lg` is the base `--radius`). */
    radius: {
        sm: number;
        md: number;
        lg: number;
        full: number;
    };
    /** Spacing in dp, keyed by the Tailwind step (`space[4]` is 16). */
    space: Record<SpaceStep, number>;
    /** Font size and line height in dp per step. */
    type: Record<TypeStep, {
        fontSize: number;
        lineHeight: number;
    }>;
    font: {
        regular: '400';
        medium: '500';
        semibold: '600';
        /** `Menlo` on iOS, `monospace` elsewhere. */
        mono: string;
    };
    /** Shadow styles, levels 0 (none) to 3 (FAB). */
    elevation: Record<ElevationLevel, ElevationStyle>;
    /** Durations in ms and the standard easing. */
    motion: {
        fast: number;
        base: number;
        slow: number;
        easing: (t: number) => number;
    };
    /** Domain accents as colours, for this scheme. */
    accents: {
        status: Record<StatusAccent, string>;
        kind: Record<KindAccent, string>;
    };
    /** The overlay behind a sheet or speed dial. */
    scrim: string;
    brand: {
        /** The six HSL stops of the wordmark ramp, left to right. */
        ramp: readonly Hsl[];
        glow: string;
        /** The face "Midnite" is set in; undefined falls back to the platform face. */
        fontFamily: string | undefined;
    };
};

export declare type ThemeOptions = {
    /** The family name the app registered the Damion face under, if it loaded one. */
    brandFontFamily?: string;
};

/**
 * Light/dark for every component below it, from the @bilo-io/ui tokens. It
 * follows the device scheme unless `scheme` pins one, so a host app with its own
 * theme switch passes its resolved value down.
 */
export declare function ThemeProvider({ scheme, brandFontFamily, children, }: ThemeProviderProps): JSX.Element;

export declare type ThemeProviderProps = {
    /** Pin light or dark. Omit to follow the device (`useColorScheme`). */
    scheme?: ColorScheme;
    /**
     * The family name the app registered Damion under (e.g. with expo-font). On
     * native, omit it until the font is loaded.
     */
    brandFontFamily?: string;
    children: ReactNode;
};

/** A token length (`0.5rem`, `4px`, `calc(0.5rem - 2px)`) in dp. */
export declare function toDp(length: string): number;

export declare type TypeStep = keyof typeof typography.fontSize;

/** Typography scale — sizes with their line heights, weights and families. */
declare const typography: {
    readonly fontSize: {
        readonly xs: {
            readonly fontSize: "0.75rem";
            readonly lineHeight: "1rem";
        };
        readonly sm: {
            readonly fontSize: "0.875rem";
            readonly lineHeight: "1.25rem";
        };
        readonly base: {
            readonly fontSize: "1rem";
            readonly lineHeight: "1.5rem";
        };
        readonly lg: {
            readonly fontSize: "1.125rem";
            readonly lineHeight: "1.75rem";
        };
        readonly xl: {
            readonly fontSize: "1.25rem";
            readonly lineHeight: "1.75rem";
        };
        readonly '2xl': {
            readonly fontSize: "1.5rem";
            readonly lineHeight: "2rem";
        };
    };
    readonly fontWeight: {
        readonly regular: 400;
        readonly medium: 500;
        readonly semibold: 600;
    };
    readonly fontFamily: {
        readonly sans: "system-ui, sans-serif";
        readonly mono: "ui-monospace, Menlo, monospace";
    };
};

/** The active theme. Without a provider, the device scheme's. */
export declare function useTheme(): Theme;

/** The value under `x` dp along a track `width` wide (the knob's centre travels inside it). */
export declare function valueAt(x: number, width: number, min: number, max: number, step: number): number;

/** An `hsl()` colour from the theme at an alpha (`hsl(…)` → `hsla(…, alpha)`); for accents, which `alpha()` does not cover. */
export declare function withAlpha(color: string, alpha: number): string;

/**
 * "Midnite UI" — the brand face for the name, the UI face for the qualifier.
 * React Native cannot clip a gradient to text without a native module, so the
 * rainbow tone steps the ramp letter by letter: each glyph takes the ramp
 * colour at its position. The face is Damion where the app registered it
 * (`ThemeProvider brandFontFamily`); on the web it comes from
 * `@bilo-io/ui/brand.css`.
 */
export declare function Wordmark({ product, tone, size, color, style, ...props }: WordmarkProps): JSX.Element;

export declare type WordmarkProps = Omit<TextProps, 'children'> & {
    /** The second half: "Midnite **UI**", "Midnite **Mobile UI**". Omit for "Midnite" alone. */
    product?: string;
    tone?: WordmarkTone;
    /** The qualifier's font size in dp; "Midnite" is set 1.35× larger, as on the web. */
    size?: number;
    /** The colour under `tone="inherit"`. */
    color?: string;
};

export declare type WordmarkTone = 
/** The brand ramp across the letters of "Midnite", with the glow behind them. */
'rainbow'
/** One colour: `color`, or the foreground token. */
| 'inherit';

export { }
