import React, { useRef } from 'react';
import { useUiStore } from '../../store/ui-store';
import { LuCheck, LuStethoscope, LuX } from 'react-icons/lu';

import { useFocusTrap } from '../../components/use-focus-trap';

export function OnboardingModal() {
  const showOnboarding = useUiStore((s) => s.showOnboarding);
  const setShowOnboarding = useUiStore((s) => s.setShowOnboarding);
  const containerRef = useRef<HTMLDivElement>(null);

  /*
    A fullscreen modal shown to a first-time user, and until Phase 68 Theme D
    it carried no `role`, no `aria-` and no focus management at all: Tab walked
    straight out of it into the app behind, and closing it dropped focus on
    `<body>`. The skeleton below is `setup-dialog.tsx`'s, verbatim — role and
    label on the backdrop, `tabIndex={-1}` and the trapped ref on the panel —
    so the next author copies a correct one.

    Called before the early return, because a hook cannot be conditional; the
    `showOnboarding` argument is what makes it inert while the modal is closed.
  */
  useFocusTrap(containerRef, showOnboarding);

  if (!showOnboarding) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Midnite Studio"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg flex flex-col gap-4"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 font-medium text-foreground text-sm">
            <LuStethoscope className="h-4 w-4 text-primary" />
            <span>Welcome to Midnite Studio</span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShowOnboarding(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LuX aria-hidden className="h-4 w-4" />
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
