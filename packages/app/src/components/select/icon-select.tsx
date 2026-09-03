import Select, { type ClassNamesConfig, type MultiValueRemoveProps } from 'react-select';
import { LuX } from 'react-icons/lu';

import type { IconComponent } from '../icon-button';

/**
 * One row: an id/label pair, an optional leading glyph and its colour, and an
 * optional reason it can't be picked right now.
 *
 * Shared between the agent picker and the model picker (`card-composer.tsx`)
 * so both draw from the same searchable, icon-fronted control rather than
 * each hand-rolling its own `react-select` wiring and theming.
 */
export type IconSelectOption = {
  id: string;
  label: string;
  icon?: IconComponent;
  /** Roster `accent` — a colour Tailwind has never seen, same reasoning as `IconButton`'s `style` prop. */
  iconColor?: string;
  /**
   * Hover title on the row — what this option actually does, when the label
   * cannot say it. `disabledReason` outranks it: "why can't I pick this" is
   * the more urgent answer whenever both are set.
   */
  hint?: string;
  isDisabled?: boolean;
  disabledReason?: string;
};

/**
 * `unstyled` + Tailwind's own utility classes via `classNames`, rather than
 * `react-select`'s inline `styles` object — the same tokens (`bg-background`,
 * `border-border`, `bg-accent`, …) the rest of the app already themes off of,
 * so this control tracks the light/dark toggle for free instead of carrying a
 * second palette.
 */
const BASE_CLASS_NAMES: ClassNamesConfig<IconSelectOption, boolean> = {
  control: ({ isFocused, isDisabled }) =>
    `flex min-h-0 items-center gap-1 rounded-md border px-1.5 py-1 text-xs transition-colors ${
      isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-text'
    } ${isFocused ? 'border-ring ring-1 ring-ring' : 'border-border hover:border-foreground/30'}`,
  valueContainer: () => 'gap-1.5 px-0.5',
  input: () => 'text-foreground',
  placeholder: () => 'text-muted-foreground',
  singleValue: () => 'flex min-w-0 items-center gap-1.5 text-foreground',
  indicatorsContainer: () => 'text-muted-foreground',
  dropdownIndicator: () => 'px-1',
  clearIndicator: () => 'px-1 hover:text-foreground',
  indicatorSeparator: () => 'bg-border',
  menu: () => 'z-20 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-lg',
  menuList: () => 'max-h-56 overflow-y-auto py-1',
  option: ({ isFocused, isSelected, isDisabled }) =>
    `flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-xs ${
      isDisabled
        ? 'cursor-not-allowed opacity-50'
        : isSelected
          ? 'bg-accent text-accent-foreground'
          : isFocused
            ? 'bg-accent/60 text-foreground'
            : 'text-foreground'
    }`,
  noOptionsMessage: () => 'px-2 py-1.5 text-muted-foreground',
  /*
    Multi only, and unused by the single-value control — one table rather than
    two, so a chip in the day picker is themed off the same tokens as the
    single-value row above it.
  */
  multiValue: () =>
    'flex min-w-0 items-center overflow-hidden rounded border border-border/60 bg-accent/60',
  multiValueLabel: () => 'truncate pl-1 pr-0.5 py-[1px] text-[10px] leading-tight text-foreground',
  multiValueRemove: () =>
    'flex items-center pr-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-foreground',
};

/**
 * The one cast in this file, and it is a variance workaround rather than a
 * lie: every entry above is keyed by a component whose props are generic in
 * `IsMulti`, so a table typed `boolean` is not assignable to the `false` (or
 * `true`) config each `Select` asks for even though every function in it
 * ignores that parameter. Writing the table twice was the alternative, and the
 * copies would drift.
 */
function classNamesFor<IsMulti extends boolean>(): ClassNamesConfig<IconSelectOption, IsMulti> {
  return BASE_CLASS_NAMES as ClassNamesConfig<IconSelectOption, IsMulti>;
}

function OptionLabel({ option }: { option: IconSelectOption }) {
  const Icon = option.icon;
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={option.disabledReason ?? option.hint}>
      {Icon ? (
        <Icon aria-hidden className="size-3.5 shrink-0" style={{ color: option.iconColor }} />
      ) : null}
      <span className="truncate">{option.label}</span>
    </span>
  );
}

/**
 * Render the menu into `document.body` instead of beside the control.
 *
 * Needed wherever the select sits inside an `overflow: hidden` box — the loop
 * composer's `<Collapse>` sections are exactly that, and an inline menu there
 * is clipped to the accordion body rather than overlaying the form. Fixed
 * positioning comes with it, which is what keeps the menu attached to its
 * control while the composer's own settings region scrolls.
 *
 * Opt-in rather than always-on: a portalled menu is no longer inside the
 * control's own subtree, which changes what a `within(container)` query — a
 * test's or a click-outside handler's — can see.
 */
const PORTAL_PROPS = {
  menuPortalTarget: typeof document === 'undefined' ? undefined : document.body,
  menuPosition: 'fixed',
  /*
    The one place this file uses `styles` rather than a Tailwind class, because
    a class cannot win here: `menuPortalCSS` is the one style function
    `react-select` does NOT drop under `unstyled`, so it always emits
    `zIndex: 1` through emotion — and emotion injects its `<style>` into
    `<head>` at first render, after the build-time Tailwind link, so at equal
    specificity emotion wins. A `z-[60]` class was silently doing nothing, and
    a menu overlapping the FAB button (`z-20`) would have opened underneath it.
  */
  styles: { menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 60 }) },
} as const;

export function IconSelect({
  ariaLabel,
  options,
  value,
  onChange,
  isSearchable = true,
  isDisabled = false,
  menuInPortal = false,
  placeholder,
}: {
  ariaLabel: string;
  options: readonly IconSelectOption[];
  value: string;
  onChange: (id: string) => void;
  isSearchable?: boolean;
  isDisabled?: boolean;
  /** See {@link PORTAL_PROPS} — for a select inside an `overflow: hidden` box. */
  menuInPortal?: boolean;
  placeholder?: string;
}) {
  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <Select<IconSelectOption, false>
      {...(menuInPortal ? PORTAL_PROPS : {})}
      aria-label={ariaLabel}
      classNamePrefix="icon-select"
      unstyled
      classNames={classNamesFor<false>()}
      options={options}
      value={selected}
      isSearchable={isSearchable}
      isDisabled={isDisabled || options.length === 0}
      placeholder={placeholder ?? 'Select…'}
      isOptionDisabled={(option) => option.isDisabled === true}
      getOptionValue={(option) => option.id}
      getOptionLabel={(option) => option.label}
      formatOptionLabel={(option) => <OptionLabel option={option} />}
      onChange={(next) => {
        if (next) onChange(next.id);
      }}
    />
  );
}

/**
 * The same control, many-of-N — the day-of-week picker in the loop composer's
 * schedule (and whatever else needs a searchable set rather than a row of
 * checkboxes).
 *
 * `closeMenuOnSelect={false}` and `hideSelectedOptions={false}`: picking days
 * is one gesture over a list of seven, so the menu staying open with every
 * option still on it — the selected ones marked — is what makes "Mon, Wed and
 * Fri" one visit instead of three.
 *
 * Selection order is whatever the user clicked; the caller canonicalises
 * (`resolveLoopDays` in the loop composer's case) rather than this control
 * pretending to know what order the ids mean anything in.
 */
export function MultiIconSelect({
  ariaLabel,
  options,
  values,
  onChange,
  isSearchable = true,
  isDisabled = false,
  menuInPortal = false,
  placeholder,
}: {
  ariaLabel: string;
  options: readonly IconSelectOption[];
  values: readonly string[];
  onChange: (ids: string[]) => void;
  isSearchable?: boolean;
  isDisabled?: boolean;
  /** See {@link PORTAL_PROPS} — for a select inside an `overflow: hidden` box. */
  menuInPortal?: boolean;
  placeholder?: string;
}) {
  const selected = options.filter((option) => values.includes(option.id));

  return (
    <Select<IconSelectOption, true>
      {...(menuInPortal ? PORTAL_PROPS : {})}
      aria-label={ariaLabel}
      classNamePrefix="icon-select"
      unstyled
      isMulti
      closeMenuOnSelect={false}
      hideSelectedOptions={false}
      /*
        No clear-all ×. Every chip carries its own, and the one-click version
        of "remove them all" is a state the caller has to warn about rather
        than a shortcut worth offering — an empty day set is a schedule
        mid-edit. It also costs a chip's width in a 320px panel.
      */
      isClearable={false}
      classNames={classNamesFor<true>()}
      components={{ MultiValueRemove }}
      options={options}
      value={selected}
      isSearchable={isSearchable}
      isDisabled={isDisabled || options.length === 0}
      placeholder={placeholder ?? 'Select…'}
      isOptionDisabled={(option) => option.isDisabled === true}
      getOptionValue={(option) => option.id}
      getOptionLabel={(option) => option.label}
      formatOptionLabel={(option) => <OptionLabel option={option} />}
      onChange={(next) => onChange(next.map((option) => option.id))}
    />
  );
}

/**
 * The chip's own × — `react-select`'s default is a 20px SVG sized for a
 * full-height control, which on a 10px chip in a 320px panel is most of the
 * chip. `innerProps` carries the click handler and the class from the table
 * above, so this only swaps the glyph.
 *
 * `role="button"` and a name of its own, because `innerProps` carries neither:
 * `removeProps` in react-select is the three pointer handlers and nothing
 * else, so a custom component that drops the default role (or hides itself
 * with `aria-hidden`, as this did) leaves a screen-reader user no announced
 * way to drop a value — Backspace and nothing else. `aria-hidden` belongs on
 * the glyph inside it, which is decoration.
 */
function MultiValueRemove({ innerProps, data }: MultiValueRemoveProps<IconSelectOption, true>) {
  return (
    <div {...innerProps} role="button" aria-label={`Remove ${data.label}`}>
      <LuX aria-hidden className="size-2.5" />
    </div>
  );
}
