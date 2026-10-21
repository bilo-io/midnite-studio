import { SimplePopover } from '@midnite/studio-frame';

import type { AudioPopoverProps } from './host';

/** The instrument picker's popover when the host brings none: the frame's, which has no portal and ignores `title`. */
export function DefaultPopover({ title: _title, ...props }: AudioPopoverProps) {
  return <SimplePopover {...props} />;
}
