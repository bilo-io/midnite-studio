import { useState } from 'react';

import { Popover } from '../../components/popover';
import { MidniteIcon } from '../../components/icons/midnite-icon';

export function AssistantMenu() {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="end"
      label="Midnite Assistant"
      testId="assistant-menu"
      panelClassName="w-[400px] h-[300px] p-4 text-muted-foreground flex flex-col"
      trigger={
        <MidniteIcon aria-hidden className="h-3.5 w-3.5" />
      }
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border pb-2 text-xs font-semibold text-foreground">
          <MidniteIcon aria-hidden className="h-3.5 w-3.5" />
          <span>Assistant</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          Midnite Assistant Menu (Blank for now)
        </div>
      </div>
    </Popover>
  );
}
