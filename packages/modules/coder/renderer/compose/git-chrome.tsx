import { cloneElement, useEffect, useRef, useState } from 'react';
import { LuCheck, LuChevronDown } from 'react-icons/lu';

import {
  hueFor,
  initialsFor,
  type GitDismissOptions,
  type GitMultiSelectProps,
  type GitTooltipProps,
  type GitUserAvatarProps,
} from '@midnite/studio-frame';

/**
 * The small chrome Coder hands the frame's git graph (`GitHost`): a native-title tooltip, a plain
 * checklist dropdown for the branch and author filters, an initials avatar and an Escape listener.
 * Studio's versions sit on its dismissal stack, its occluders and Gravatar; Coder has none of those.
 */

export function CoderTooltip({ label, children }: GitTooltipProps) {
  return typeof label === 'string' ? cloneElement(children, { title: label }) : children;
}

export function CoderUserAvatar({ name, email, size = 16, className = '' }: GitUserAvatarProps) {
  const hue = hueFor(email ?? name ?? '');
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white ${className}`}
      style={{ width: size, height: size, backgroundColor: `hsl(${hue} 45% 45%)` }}
      title={name ?? undefined}
    >
      {initialsFor(name ?? '', email ?? '')}
    </span>
  );
}

/** Escape closes the surface while it is active. */
export function useCoderDismiss(active: boolean, onDismiss: () => void, _options?: GitDismissOptions): void {
  const latest = useRef(onDismiss);
  latest.current = onDismiss;
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

/** Empty selection means "everything", exactly as Studio's menu reads it. */
export function CoderMultiSelect({ options, selected, onChange, icon, allLabel, label, summarise }: GitMultiSelectProps) {
  const [open, setOpen] = useState(false);
  useCoderDismiss(open, () => setOpen(false));
  const chosen = new Set(selected);
  const trigger =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : summarise(selected.length);
  const toggle = (value: string) => {
    const next = new Set(chosen);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange([...next]);
  };
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {icon}
        <span className="max-w-40 truncate">{trigger}</span>
        <LuChevronDown aria-hidden className="h-3 w-3" />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label={label}
          aria-multiselectable
          className="absolute left-0 top-full z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
        >
          <li role="option" aria-selected={selected.length === 0}>
            <button type="button" onClick={() => onChange([])} className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-accent">
              <span className="w-3">{selected.length === 0 ? <LuCheck aria-hidden className="h-3 w-3" /> : null}</span>
              {allLabel}
            </button>
          </li>
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={chosen.has(o.value)}>
              <button type="button" onClick={() => toggle(o.value)} className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-accent">
                <span className="w-3">{chosen.has(o.value) ? <LuCheck aria-hidden className="h-3 w-3" /> : null}</span>
                {o.icon}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.meta}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
