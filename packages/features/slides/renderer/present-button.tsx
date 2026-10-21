import { LuPresentation } from 'react-icons/lu';

import { useOptionalFrameChrome } from '@midnite/studio-frame';

import { useSlidesStore, type MarkdownSource } from './slides-store';

/**
 * The one "Present as slides" button, shared by every markdown surface
 * (`file-preview.tsx`, `pr-detail.tsx`, `comment-thread.tsx`) rather than each
 * importing `LuPresentation` and wiring `present()` itself. The glyph, the
 * tooltip copy and the `present()` wiring are one decision, and a shared
 * component only has to make it once.
 */
export function PresentButton({
  source,
  className,
}: {
  source: MarkdownSource;
  className?: string;
}) {
  const chrome = useOptionalFrameChrome();
  const present = () => useSlidesStore.getState().present(source);
  // Outside any chrome (a bare render) the control is still a labelled button.
  if (!chrome) {
    return (
      <button type="button" aria-label="Present as slides" title="Present as slides" className={className} onClick={present}>
        <LuPresentation aria-hidden className="h-3.5 w-3.5" />
      </button>
    );
  }
  const { IconButton } = chrome;
  return (
    <IconButton
      icon={LuPresentation}
      label="Present as slides"
      size="sm"
      className={className}
      onClick={present}
    />
  );
}
