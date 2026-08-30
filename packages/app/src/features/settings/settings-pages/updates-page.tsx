import React from 'react';
import { LuDownload } from 'react-icons/lu';
import { Accordion } from '@bilo-io/ui';

export function UpdatesPage() {
  const hasBridge = typeof window !== 'undefined' && Boolean(window.midniteStudio?.update);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="App Updates" icon={<LuDownload className="h-4 w-4 text-primary" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3 text-xs">
          <p className="text-muted-foreground">
            Configure auto-update channels and manually check for new releases of Midnite Studio.
          </p>

          {!hasBridge ? (
            <div className="rounded border border-border bg-muted/40 p-3 text-muted-foreground">
              Available in the desktop app.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-foreground">Current Version: </span>
                  <span className="font-mono text-muted-foreground">v0.1.0</span>
                </div>
                <button
                  type="button"
                  onClick={() => window.midniteStudio?.update.check()}
                  className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                >
                  Check for Updates
                </button>
              </div>

              <div className="rounded border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                This build is in development mode or ad-hoc signed, so automatic background updating is disabled.
              </div>
            </div>
          )}
        </div>
      </Accordion>
    </div>
  );
}
