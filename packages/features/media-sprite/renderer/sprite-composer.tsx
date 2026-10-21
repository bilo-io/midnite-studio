import { PromptTextarea } from '@midnite/studio-frame';

import { useSpriteHost, type SpriteComposerProps } from './host';

/**
 * The prompt box under the create form (Phase 113 Theme S): the host's own composer — Studio's draws the
 * ai-thread box with its provider/model picker and voice — or, with none installed, a plain textarea and a
 * Send button. The same props either way, so the form's "can I send, and why not" rules stay in one place.
 */
export function SpriteComposer(props: SpriteComposerProps) {
  const { Composer } = useSpriteHost();
  if (Composer) return <Composer {...props} />;
  return <PlainComposer {...props} />;
}

function PlainComposer({ ariaLabel, value, onChange, onSend, canSend, sendTooltip, sendAriaLabel, rows, dimmed, placeholder, testIdPrefix }: SpriteComposerProps) {
  return (
    <div className="flex flex-col gap-2" data-testid={`${testIdPrefix}-plain`}>
      <PromptTextarea
        aria-label={ariaLabel}
        rows={rows}
        value={value}
        disabled={dimmed}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSend) {
            event.preventDefault();
            onSend();
          }
        }}
      />
      <button
        type="button"
        aria-label={sendAriaLabel}
        title={sendTooltip}
        disabled={!canSend}
        onClick={onSend}
        className="h-8 rounded-md bg-primary text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        {sendAriaLabel}
      </button>
    </div>
  );
}
