import { cloneElement, useEffect, useState } from 'react';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';

import type { MediaAccordionProps } from '@midnite/studio-frame';

import type { MediaMenuProps, MediaTooltipProps } from './host';

/*
  Plain chrome for an app that has none of its own (Phase 113 Theme Q) — what
  `createStandaloneMediaHost` hands the shell when the app passes nothing.
  Studio passes its own tooltip, context menu and accordion instead.
*/

/** The label as the element's native tooltip and accessible description. */
export function StandaloneTooltip({ label, children }: MediaTooltipProps) {
  return cloneElement(children, { title: typeof label === 'string' ? label : undefined });
}

/** A small fixed-position menu; Escape or a click outside closes it. */
export function StandaloneMenu({ position, items, onClose }: MediaMenuProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        role="menu"
        className="absolute min-w-32 rounded-md border border-border bg-popover p-1 text-xs shadow-md"
        style={{ left: position.x, top: position.y }}
        onClick={(event) => event.stopPropagation()}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role={item.checkKind === 'radio' ? 'menuitemradio' : 'menuitem'}
            aria-checked={item.checkKind === 'radio' ? item.checked === true : undefined}
            className="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Collapsible sections whose open state lives for the session. */
export function StandaloneAccordion({ id, sections }: MediaAccordionProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <div className="flex flex-col" data-accordion={id}>
      {sections.map((section) => {
        const open = !collapsed.has(section.id);
        const Chevron = open ? LuChevronDown : LuChevronRight;
        return (
          <section key={section.id}>
            <div className="flex h-7 items-center gap-1 px-2 text-xs">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(section.id)}
                className="flex min-w-0 flex-1 items-center gap-1 text-left font-medium text-primary"
              >
                <Chevron aria-hidden className="h-3.5 w-3.5 shrink-0" />
                {section.icon}
                <span className="truncate">{section.title}</span>
                {section.count !== undefined ? (
                  <span className="tabular-nums text-muted-foreground/70">{section.count}</span>
                ) : null}
              </button>
              {section.actions}
            </div>
            {open ? section.children : null}
          </section>
        );
      })}
    </div>
  );
}
