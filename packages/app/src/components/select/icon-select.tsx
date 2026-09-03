import Select, { type ClassNamesConfig } from 'react-select';

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
const classNames: ClassNamesConfig<IconSelectOption, false> = {
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
};

function OptionLabel({ option }: { option: IconSelectOption }) {
  const Icon = option.icon;
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={option.disabledReason}>
      {Icon ? (
        <Icon aria-hidden className="size-3.5 shrink-0" style={{ color: option.iconColor }} />
      ) : null}
      <span className="truncate">{option.label}</span>
    </span>
  );
}

export function IconSelect({
  ariaLabel,
  options,
  value,
  onChange,
  isSearchable = true,
  isDisabled = false,
  placeholder,
}: {
  ariaLabel: string;
  options: readonly IconSelectOption[];
  value: string;
  onChange: (id: string) => void;
  isSearchable?: boolean;
  isDisabled?: boolean;
  placeholder?: string;
}) {
  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <Select<IconSelectOption, false>
      aria-label={ariaLabel}
      classNamePrefix="icon-select"
      unstyled
      classNames={classNames}
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
