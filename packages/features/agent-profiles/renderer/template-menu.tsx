import { useEffect, useRef, useState } from 'react';
import { LuChevronDown, LuLayoutTemplate } from 'react-icons/lu';

import { FOCUS_RING, SECONDARY_BUTTON } from './ui';
import { AGENT_PROFILE_TEMPLATES, type AgentProfileTemplate } from './templates';

/**
 * "New from template": a button that opens a `role="menu"` of the starter agents. The feature's
 * own, because `FrameDialogs.openMenu` is optional and absent in some apps. ArrowUp/ArrowDown move,
 * Enter picks, Escape closes and refocuses the button.
 */
export function TemplateMenu({ onPick }: { onPick: (template: AgentProfileTemplate) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (open) items.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const close = (): void => {
    setOpen(false);
    button.current?.focus();
  };
  const count = AGENT_PROFILE_TEMPLATES.length;

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="agents-template-menu"
        className={`inline-flex items-center gap-1.5 ${SECONDARY_BUTTON}`}
        onClick={() => {
          setActive(0);
          setOpen((v) => !v);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(0);
            setOpen(true);
          }
        }}
      >
        <LuLayoutTemplate aria-hidden className="h-3.5 w-3.5" />
        New from template
        <LuChevronDown aria-hidden className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="New from template"
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((i) => (i + 1) % count);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((i) => (i - 1 + count) % count);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          {AGENT_PROFILE_TEMPLATES.map((template, index) => (
            <button
              key={template.id}
              ref={(el) => {
                items.current[index] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={index === active ? 0 : -1}
              data-testid={`agents-template-${template.id}`}
              className={`flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${FOCUS_RING}`}
              onClick={() => {
                setOpen(false);
                onPick(template);
              }}
            >
              <span className="font-medium">{template.label}</span>
              <span className="text-[11px] text-muted-foreground">{template.summary}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
