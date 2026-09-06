import { Accordion } from '@bilo-io/ui';
import { LuSend } from 'react-icons/lu';

import { useUiStore } from '../../../store/ui-store';
import { Field } from './controls';

/** The bounds the number input clamps to. A request that may run for an hour
 *  is not a timeout, and one that gives up in under a second is a flake
 *  generator on any real staging API. */
const MIN_TIMEOUT_S = 1;
const MAX_TIMEOUT_S = 600;

/**
 * Phase 66 Theme E — the one setting the send engine reads.
 *
 * A fixed timeout was the alternative and it does not work: a slow staging
 * API and a hung one are indistinguishable at any single value, so the number
 * has to be the user's. 30 s is the default the engine falls back to when the
 * renderer sends no `timeoutMs` at all.
 */
export function ApiClientPage() {
  const requestTimeoutS = useUiStore((s) => s.apiClientRequestTimeoutS);
  const setRequestTimeoutS = useUiStore((s) => s.setApiClientRequestTimeoutS);

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Requests" icon={<LuSend className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-4 p-3">
          <Field
            label="Request timeout"
            hint="How long to wait before aborting a request. A slow staging API and a hung one are indistinguishable at any fixed value, so this is yours to set."
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={MIN_TIMEOUT_S}
                max={MAX_TIMEOUT_S}
                step={1}
                value={requestTimeoutS}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  setRequestTimeoutS(
                    Math.min(MAX_TIMEOUT_S, Math.max(MIN_TIMEOUT_S, Math.round(next))),
                  );
                }}
                className="h-7 w-24 rounded-md border border-border/60 bg-card/50 px-2 text-xs"
                aria-label="Request timeout in seconds"
              />
              <span className="text-xs text-muted-foreground">seconds</span>
            </div>
          </Field>

          <div className="space-y-1.5 rounded-md border border-border/60 bg-card/50 p-3 text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground">Where a secret lives, for now</p>
            <p>
              Auth values you type into a request are stored in the collection file in{' '}
              <strong>plain text</strong>. Masking them here without somewhere safe to put them
              would imply a protection that is not there. Environments with a gitignored secret
              overlay come in a later release.
            </p>
          </div>
        </div>
      </Accordion>
    </div>
  );
}
