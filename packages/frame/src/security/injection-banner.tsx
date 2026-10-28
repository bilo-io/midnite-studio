import { LuShieldAlert } from 'react-icons/lu';

import { injectionSignalLabel, type SecurityScanContentResponse } from '@midnite/studio-shared';

/**
 * The warning on a draft part that scored above the injection threshold (Phase 121 Theme A).
 *
 * It names the signals, never accuses: the detector gives a score, not a verdict, and a document
 * about injection trips it too. The three answers are the whole contract: send it as it is, send
 * it with the flagged runs cut out, or leave it out.
 */
export function InjectionBanner({
  subject,
  scan,
  onProceed,
  onStrip,
  onDrop,
  fenced = true,
}: {
  /** What the banner is about: the attachment's name, a page title. */
  subject: string;
  scan: SecurityScanContentResponse;
  onProceed: () => void;
  onStrip: () => void;
  onDrop: () => void;
  /** Whether what is sent is fenced as untrusted data. False where the text is the user's own prompt. */
  fenced?: boolean;
}) {
  const names = scan.signals.map((s) => injectionSignalLabel(s.id));
  const button = 'rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-accent';
  return (
    <div
      role="alert"
      data-testid="injection-banner"
      className="mb-1.5 flex flex-col gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs"
    >
      <p className="flex items-start gap-1.5 text-foreground">
        <LuShieldAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          <span className="font-medium">{subject}</span> contains {names.join(', ')}. It may be written to steer the assistant rather
          than to inform it. {fenced ? 'It is sent as untrusted data either way.' : ''}
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5 pl-5">
        <button type="button" className={button} onClick={onProceed}>
          Proceed
        </button>
        <button type="button" className={button} onClick={onStrip} disabled={scan.stripped === undefined}>
          Strip flagged runs
        </button>
        <button type="button" className={button} onClick={onDrop}>
          Drop
        </button>
      </div>
    </div>
  );
}
