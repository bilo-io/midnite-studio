import React, { useEffect, useState } from 'react';
import { LuTerminal } from 'react-icons/lu';
import { Accordion } from '@bilo-io/ui';

type CliInstallState = { installed: boolean; path: string | null; target: string | null; managed: boolean };

export function CliPage() {
  const [status, setStatus] = useState<CliInstallState | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    if (!window.midniteStudio?.cli) return;
    const res = await window.midniteStudio.cli.status();
    setStatus(res);
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  const handleInstall = async () => {
    if (!window.midniteStudio?.cli) return;
    setLoading(true);
    await window.midniteStudio.cli.install({ target: 'auto' });
    await fetchStatus();
    setLoading(false);
  };

  const handleUninstall = async () => {
    if (!window.midniteStudio?.cli) return;
    setLoading(true);
    await window.midniteStudio.cli.uninstall();
    await fetchStatus();
    setLoading(false);
  };

  const hasBridge = typeof window !== 'undefined' && Boolean(window.midniteStudio?.cli);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Command Line Integration" icon={<LuTerminal className="h-4 w-4 text-primary" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3 text-xs">
          <p className="text-muted-foreground">
            Install the <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground">midnite-studio</code> CLI binary into your system PATH to open repositories from your terminal.
          </p>

          {!hasBridge ? (
            <div className="rounded border border-border bg-muted/40 p-3 text-muted-foreground">
              Available in the desktop app.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-foreground">Status: </span>
                  <span className="text-muted-foreground">
                    {status?.installed ? `Installed at ${status.path}` : 'Not installed'}
                  </span>
                </div>
                {status?.installed ? (
                  <button
                    type="button"
                    disabled={loading || !status.managed}
                    onClick={handleUninstall}
                    className="rounded border border-border bg-card px-3 py-1 text-xs text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    Uninstall
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleInstall}
                    className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Install CLI
                  </button>
                )}
              </div>

              {!status?.managed && status?.installed ? (
                <p className="text-xs text-muted-foreground italic">
                  Managed outside Midnite Studio.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </Accordion>
    </div>
  );
}
