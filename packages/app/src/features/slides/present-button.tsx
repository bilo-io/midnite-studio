import { LuPresentation } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
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
  return (
    <IconButton
      icon={LuPresentation}
      label="Present as slides"
      size="sm"
      className={className}
      onClick={() => useSlidesStore.getState().present(source)}
    />
  );
}
