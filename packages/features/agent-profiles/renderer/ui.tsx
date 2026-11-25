import { useFrameChrome, type IconButtonProps } from '@midnite/studio-frame';
import type { PageWindowRole } from '@midnite/studio-shared';

/** The frame chrome the page draws, resolved through the installed port on each render. */
export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

export function PageDetachMark({ role }: { role: PageWindowRole }) {
  const { PageDetachMark: Impl } = useFrameChrome();
  return <Impl role={role} />;
}

/** The focus ring every interactive element in this feature wears. */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background';

/** The toolbar's secondary button. */
export const SECONDARY_BUTTON = `rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-40 ${FOCUS_RING}`;

/** The toolbar's primary button. */
export const PRIMARY_BUTTON = `rounded-md border border-border bg-accent/40 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent ${FOCUS_RING}`;
