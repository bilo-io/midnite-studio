import React from 'react';
import { useUiStore } from '../../store/ui-store';
import { LuCheck, LuStethoscope, LuX } from 'react-icons/lu';

export function OnboardingModal() {
  const showOnboarding = useUiStore((s) => s.showOnboarding);
  const setShowOnboarding = useUiStore((s) => s.setShowOnboarding);

  if (!showOnboarding) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 font-medium text-foreground text-sm">
            <LuStethoscope className="h-4 w-4 text-primary" />
            <span>Welcome to Midnite Studio</span>
          </div>
          <button
            type="button"
            onClick={() => setShowOnboarding(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Your workspace setup for Git, terminal brokers, and embedded developer tools is ready.
        </p>

        <div className="rounded border border-border bg-muted/40 p-3 text-xs flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Git Binary</span>
            <span className="font-mono text-foreground flex items-center gap-1"><LuCheck className="text-emerald-500" /> System / Dugite</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Default Shell</span>
            <span className="font-mono text-foreground flex items-center gap-1"><LuCheck className="text-emerald-500" /> /bin/zsh</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">CLI Tool</span>
            <span className="font-mono text-foreground">midnite-studio</span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => setShowOnboarding(false)}
            className="rounded bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
