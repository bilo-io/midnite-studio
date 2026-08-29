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
      panelClassName="w-[400px] h-[300px] p-4 flex items-center justify-center text-muted-foreground"
      trigger={
        <>
          <MidniteIcon aria-hidden className="h-3.5 w-3.5" />
          <span className="status-label ml-1.5">Assistant</span>
        </>
      }
    >
      <div>Midnite Assistant Menu (Blank for now)</div>
    </Popover>
  );
}
