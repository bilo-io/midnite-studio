import { useEffect, useId, useRef, useState } from 'react';
import { LuChevronDown } from 'react-icons/lu';

import type { IconComponent } from './icon-button';
import { Tooltip } from './tooltip';
import { useDismiss } from './use-dismiss';
import { useFocusTrap } from './use-focus-trap';

export type IconSelectOption = {
  /** Stable identity — what is passed to onChange */
  value: string;
  label: string;
  icon: IconComponent;
  /** Subtitle shown in the tooltip */
  description?: string;
};

/**
 * A compact dropdown select with an icon trigger, selected option text,
 * and a tooltip showing the label and optional description.
 *
 * The trigger displays an icon and the selected option's text. Clicking opens
 * a dropdown menu with all options displayed with icons and labels. Hovering
 * over the trigger shows a Tooltip with the field's label and a description.
 *
 * Used for camera projections, shading modes, and other compact toolbar controls.
 */
export function IconSelect({
  options,
  value,
  onChange,
  icon: Icon,
  label,
  description,
}: {
  options: readonly IconSelectOption[];
  value: string;
  onChange: (next: string) => void;
  icon: IconComponent;
  label: string;
  /** Shown as subtitle in the tooltip */
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const menuId = useId();

  const selectedOption = options.find((o) => o.value === value);

  // Dismiss on outside click through the shared dismissal stack
  useDismiss(open, () => setOpen(false), { layer: 'menu' });

  // Focus trap for keyboard navigation
  useFocusTrap(menuRef, open);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown, true);
    return () => window.removeEventListener('mousedown', onPointerDown, true);
  }, [open]);

  const tooltipContent = description ? (
    <div className="space-y-0.5">
      <div className="font-semibold">{label}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
  ) : (
    label
  );

  return (
    <div ref={boxRef} className="relative">
      <Tooltip label={tooltipContent}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-labelledby={id}
          className="flex h-6 items-center gap-1 rounded-md border border-border bg-background px-1.5 text-xs text-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
        >
          <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span id={id} className="max-w-[6rem] truncate text-left">
            {selectedOption?.label ?? 'Select'}
          </span>
          <LuChevronDown
            aria-hidden
            className={`h-3 w-3 shrink-0 transition-transform duration-150 ease-in-out ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
      </Tooltip>

      {open ? (
        <div
          ref={menuRef}
          tabIndex={-1}
          role="listbox"
          aria-label={label}
          id={menuId}
          className="absolute left-0 top-full z-menu mt-1 min-w-max animate-fade-in overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {options.map(({ value: optionValue, label: optionLabel, icon: OptionIcon }) => (
            <button
              key={optionValue}
              type="button"
              role="option"
              aria-selected={value === optionValue}
              onClick={() => {
                onChange(optionValue);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors ${
                value === optionValue
                  ? 'bg-accent text-accent-foreground'
                  : 'text-popover-foreground hover:bg-accent/60'
              }`}
            >
              <OptionIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span>{optionLabel}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
