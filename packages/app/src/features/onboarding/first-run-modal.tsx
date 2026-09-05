import { useRef } from 'react';
import { useUiStore } from '../../store/ui-store';
import { HealthChecklist } from '../settings/settings-pages/health-page';
import { useFocusTrap } from '../../components/use-focus-trap';
import { useOccluder } from '../../components/use-occluder';

export function FirstRunModal() {
  const onboardedAt = useUiStore((s) => s.onboardedAt);
  const setOnboardedAt = useUiStore((s) => s.setOnboardedAt);
  const containerRef = useRef<HTMLDivElement>(null);

  useOccluder(onboardedAt === null);
  useFocusTrap(containerRef, onboardedAt === null);

  if (onboardedAt !== null) {
    return null;
  }

  const handleDismiss = () => {
    setOnboardedAt(new Date().toISOString());
  };

  return (
    <div className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 backdrop-blur-xs">
      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-run-title"
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg outline-none"
      >
        <div className="flex flex-col gap-2">
          <h2 id="first-run-title" className="text-lg font-bold text-foreground">
            Welcome to Midnite Studio
          </h2>
          <p className="text-xs text-muted-foreground">
            Let's make sure your environment is configured for the optimal git, browser, and terminal workflow.
          </p>
        </div>

        <div className="my-4 border-t border-b border-border/50 py-3">
          <HealthChecklist compact />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
