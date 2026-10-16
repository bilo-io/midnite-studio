import { useFrameChrome, type IconButtonProps } from '@midnite/studio-frame';
import type { PageWindowRole } from '@midnite/studio-shared';

/** The frame chrome the Tests view draws, under the names it always imported (the chats feature's pattern). */
export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

export function PageDetachMark({ role }: { role: PageWindowRole }) {
  const { PageDetachMark: Impl } = useFrameChrome();
  return <Impl role={role} />;
}
