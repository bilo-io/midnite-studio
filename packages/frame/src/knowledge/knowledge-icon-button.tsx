import { useFrameChrome } from '../chrome/chrome-port';
import type { IconButtonProps } from '../chrome/types';

/** The app's `IconButton`, reached through the frame's chrome port rather than imported (the frame never imports an app). */
export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}
