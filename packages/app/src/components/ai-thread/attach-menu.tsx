import { useState } from 'react';
import { LuPlus } from 'react-icons/lu';

import type { IconComponent } from '../icon-button';
import { Popover } from '../popover';

export interface AttachOption {
  id: string;
  label: string;
  icon: IconComponent;
  onSelect: () => void;
  disabled?: boolean;
  /** Why it is disabled — shown as the row's title. */
  reason?: string;
}

/**
 * The composer's "+" — a drop-up menu of whatever a prompt can be given
 * besides text (an imported file, say). Sits in `AiComposer`'s `leading` slot,
 * bottom-left beside the mic, and opens upward because the composer sits at
 * the bottom of its panel.
 */
export function AttachMenu({
  options,
  label = 'Attach',
  testId = 'attach-menu',
}: {
  options: readonly AttachOption[];
  label?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      label={label}
      side="top"
      align="start"
      open={open}
      onOpenChange={setOpen}
      testId={testId}
      triggerClassName="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      panelClassName="min-w-[10rem] p-1"
      trigger={<LuPlus aria-hidden className="h-3.5 w-3.5" />}
    >
      <div role="menu" aria-label={label} className="flex flex-col">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              disabled={option.disabled}
              title={option.disabled ? option.reason : undefined}
              onClick={() => {
                setOpen(false);
                option.onSelect();
              }}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {option.label}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
