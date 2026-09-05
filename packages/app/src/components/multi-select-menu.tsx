import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { LuCheck, LuChevronDown } from 'react-icons/lu';

import { cascadeStyle } from '../lib/cascade';
import { useDismiss } from './use-dismiss';
import { useFocusTrap } from './use-focus-trap';

export type MultiSelectOption = {
  /** Stable identity — what `selected` holds. */
  value: string;
  label: string;
  /** Matched against the search box, in addition to `label`. */
  keywords?: string;
  icon?: ReactNode;
  /** Right-aligned adornment: a count, a HEAD dot. */
  meta?: ReactNode;
};

/**
 * A search-and-check dropdown over a list of options.
 *
 * Lifted out of the branch filter when the author filter became its second
 * instance. Everything fiddly about this control — the outside-click capture,
 * Escape, the search box, keeping "all" as a distinct row rather than a
 * checkbox that means the same thing — is the part worth having once.
 *
 * **Empty selection means "everything"**, not "nothing". Modelling all-selected
 * as the empty set is what makes a branch or an author created after the menu
 * was opened included automatically, rather than silently missing from a view
 * the user believes is unfiltered.
 */
export function MultiSelectMenu({
  options,
  selected,
  onChange,
  icon,
  allLabel,
  searchPlaceholder,
  emptyLabel,
  label,
  summarise,
}: {
  options: readonly MultiSelectOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  icon: ReactNode;
  /** Trigger text and first row when nothing is selected. */
  allLabel: string;
  searchPlaceholder: string;
  /** Shown when the search matches nothing. */
  emptyLabel: string;
  /** Accessible name of the listbox. */
  label: string;
  /** Trigger text for n > 1, e.g. `n => \`${n} branches\``. */
  summarise: (count: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) || (o.keywords ?? '').toLowerCase().includes(needle),
    );
  }, [options, query]);

  // Escape through the shared dismissal stack (Phase 62), at `menu`.
  useDismiss(open, () => setOpen(false), { layer: 'menu' });

  /*
    Trap and restore (Phase 68 Theme D). The search box's `autoFocus` put the
    keyboard *into* the panel and nothing ever brought it back out: Tab walked
    into the toolbar behind, and dismissing the menu left focus on the removed
    input, i.e. on `<body>`. The trap returns it to the trigger button it was
    opened from — and, closing by clicking that same trigger, its "focus already
    moved deliberately" clause leaves the focus the click already placed there.

    The `role="option"` arrow-key contract is deliberately still absent; that is
    the same shape of work as the context menu's and belongs with it.
  */
  useFocusTrap(listRef, open);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown, true);
    return () => window.removeEventListener('mousedown', onPointerDown, true);
  }, [open]);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const triggerLabel =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? summarise(1))
        : summarise(selected.length);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs transition-colors hover:bg-accent hover:text-foreground ${
          selected.length > 0
            ? 'border-primary/40 bg-primary/10 text-foreground'
            : 'border-border text-muted-foreground'
        }`}
      >
        {icon}
        <span className="max-w-[12rem] truncate">{triggerLabel}</span>
        <LuChevronDown
          aria-hidden
          className={`h-3 w-3 shrink-0 transition-transform duration-150 ease-in-out ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open ? (
        <div
          ref={listRef}
          tabIndex={-1}
          role="listbox"
          aria-multiselectable
          aria-label={label}
          className="absolute left-0 top-full z-menu mt-1 w-72 animate-fade-in overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="border-b border-border p-1.5">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-6 w-full rounded border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-primary"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              role="option"
              aria-selected={selected.length === 0}
              onClick={() => onChange([])}
              className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
            >
              <LuCheck
                aria-hidden
                className={`h-3.5 w-3.5 shrink-0 ${selected.length === 0 ? '' : 'invisible'}`}
              />
              <span className="font-medium">{allLabel}</span>
            </button>

            <hr className="my-1 border-border" />

            {visible.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">{emptyLabel}</p>
            ) : (
              visible.map((option, index) => {
                const isOn = selected.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isOn}
                    style={cascadeStyle(index)}
                    onClick={() => toggle(option.value)}
                    className="flex w-full animate-fade-in-up cascade-delay items-center gap-2 px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
                  >
                    <LuCheck
                      aria-hidden
                      className={`h-3.5 w-3.5 shrink-0 ${isOn ? '' : 'invisible'}`}
                    />
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                    {option.meta ? <span className="ml-auto shrink-0">{option.meta}</span> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
