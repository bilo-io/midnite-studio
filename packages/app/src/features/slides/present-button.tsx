import { LuPresentation } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { useSlidesStore, type MarkdownSource } from './slides-store';

/**
 * The one "Present as slides" button, shared by every markdown surface
 * (`file-preview.tsx`, `pr-detail.tsx`, `comment-thread.tsx`) rather than each
 * importing `LuPresentation` and wiring `present()` itself — two of those
 * three files are on `lucide-react` today, and CLAUDE.md's icon rule is to
 * match the family already in the file being edited, not introduce a second
 * one per call site. A shared component only has to make that choice once.
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
