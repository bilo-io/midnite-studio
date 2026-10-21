import { MEDIA_PROMPT_BOX, MEDIA_PROMPT_CONTROL } from '@midnite/studio-frame';
import { LuImagePlus, LuSend } from 'react-icons/lu';

import { useModelHost, type ModelComposerProps } from './host';

/**
 * The prompt box beside Generate: the host's (Studio's is the ai-thread composer with its engine picker,
 * mic, "+" menu and spoken outcome), else this plain one — a textarea, a native engine `<select>` and an
 * "Attach image" button. Cmd/Ctrl+Enter sends, as it does in Studio.
 */
export function ModelComposer(props: ModelComposerProps) {
  const { Composer } = useModelHost();
  if (Composer) return <Composer {...props} />;
  return <PlainComposer {...props} />;
}

function PlainComposer({ ariaLabel, value, onChange, onSend, canSend, sendTooltip, sendAriaLabel, rows, placeholder, testIdPrefix, picker, attach }: ModelComposerProps) {
  return (
    <div className={MEDIA_PROMPT_BOX}>
      <textarea
        aria-label={ariaLabel}
        data-testid={`${testIdPrefix}-input`}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSend) {
            event.preventDefault();
            onSend();
          }
        }}
        className={`${MEDIA_PROMPT_CONTROL} resize-none`}
      />
      <div className="flex items-center gap-1 px-1 pb-1">
        <select
          aria-label="Engine"
          data-testid={picker.testId}
          value={picker.provider}
          onChange={(event) => picker.onProviderChange(event.target.value)}
          className="h-6 min-w-0 rounded-md border border-border bg-background px-1 text-[11px] text-foreground"
        >
          {picker.providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {picker.models.length > 0 ? (
          <select
            aria-label="Model"
            value={picker.model}
            onChange={(event) => picker.onModelChange(event.target.value)}
            className="h-6 min-w-0 flex-1 rounded-md border border-border bg-background px-1 text-[11px] text-foreground"
          >
            {picker.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          data-testid={attach.testId}
          aria-label={attach.label}
          title={attach.label}
          onClick={attach.onSelect}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LuImagePlus aria-hidden className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={sendAriaLabel}
          title={sendTooltip}
          disabled={!canSend}
          onClick={onSend}
          className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground disabled:opacity-40"
        >
          <LuSend aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
