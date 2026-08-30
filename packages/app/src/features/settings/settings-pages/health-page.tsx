import React, { useEffect, useState } from 'react';
import { LuCheck, LuStethoscope, LuX } from 'react-icons/lu';
import { Accordion } from '@bilo-io/ui';

export function HealthPage() {
  const [health, setHealth] = useState<{
    git: { path: string | null; version: string | null };
    shell: string | null;
    sshAgent: { running: boolean; keys: number };
    cli: { installed: boolean; path: string | null; target: string | null; managed: boolean };
  } | null>(null);

  useEffect(() => {
    if (!window.midniteStudio?.systemHealth) return;
    void window.midniteStudio.systemHealth().then(setHealth);
  }, []);

  const hasBridge = typeof window !== 'undefined' && Boolean(window.midniteStudio?.systemHealth);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="System Health & Diagnostics" icon={<LuStethoscope className="h-4 w-4 text-primary" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3 text-xs">
          <p className="text-muted-foreground">
            System toolchain status, Git CLI paths, and terminal broker requirements.
          </p>

          {!hasBridge ? (
            <div className="rounded border border-border bg-muted/40 p-3 text-muted-foreground">
              Available in the desktop app.
            </div>
          ) : (
            <div className="rounded border border-border bg-muted/40 p-3 text-xs flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Git Path & Version</span>
                <span className="font-mono text-foreground flex items-center gap-1">
                  <LuCheck className="text-emerald-500" /> {health?.git.version || 'System / Dugite'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Default Shell</span>
                <span className="font-mono text-foreground flex items-center gap-1">
                  <LuCheck className="text-emerald-500" /> {health?.shell || '/bin/zsh'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">SSH Agent</span>
                <span className="font-mono text-foreground flex items-center gap-1">
                  {health?.sshAgent.running ? (
                    <>
                      <LuCheck className="text-emerald-500" /> {health.sshAgent.keys} key(s) loaded
                    </>
                  ) : (
                    <>
                      <LuX className="text-muted-foreground" /> Not running / No keys
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">CLI Binary</span>
                <span className="font-mono text-foreground">
                  {health?.cli.installed ? health.cli.path : 'Not installed'}
                </span>
              </div>
            </div>
          )}
        </div>
      </Accordion>
    </div>
  );
}
