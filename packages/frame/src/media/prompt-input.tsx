import { forwardRef, type TextareaHTMLAttributes } from 'react';

/**
 * Wrapper classes for every AI prompt box in Media — the rainbow
 * `.gradient-border` at rest, brightening, rotating and pulsing on focus
 * (`.media-prompt` in styles.css). Spread onto any box that contains the
 * focusable control; `:focus-within` drives it.
 */
export const MEDIA_PROMPT_BOX = 'media-prompt gradient-border rounded-md bg-background';

/** The bare control inside a prompt box: no border or ring of its own. */
export const MEDIA_PROMPT_CONTROL =
  'w-full bg-transparent px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none';

/** A textarea wearing the media prompt gradient border. */
export const PromptTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function PromptTextarea({ className = '', ...rest }, ref) {
    return (
      <div className={MEDIA_PROMPT_BOX}>
        <textarea ref={ref} className={`${MEDIA_PROMPT_CONTROL} ${className}`} {...rest} />
      </div>
    );
  },
);
