import { createFrameChrome } from '@midnite/studio-frame';

function PageDetachMark({ role, className }: { role: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground ${className ?? ''}`}
      title={`Detached role: ${role}`}
    >
      Detached
    </span>
  );
}

const kit = createFrameChrome({ PageDetachMark });

export const BROWSER_CHROME = kit.chrome;

/** Mount once beside the provider so `confirm` shows a real dialog. */
export const BrowserDialogHost = kit.DialogHost;
