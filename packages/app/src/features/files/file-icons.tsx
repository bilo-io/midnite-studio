import type { ReactNode } from 'react';

import {
  DefaultFolderIcon,
  DefaultFolderOpenedIcon,
  getIconForFile,
  getIconForFolder,
} from '@react-symbols/icons/utils';

const ICON_CLASS = 'h-3.5 w-3.5 shrink-0';

export function FileIcon({ name }: { name: string }): ReactNode {
  return getIconForFile({ fileName: name, autoAssign: true, 'aria-hidden': true, className: ICON_CLASS });
}

export function FolderIcon({ name, open }: { name: string; open: boolean }): ReactNode {
  const icon = getIconForFolder({ folderName: name, 'aria-hidden': true, className: ICON_CLASS });
  if (open && icon.type === DefaultFolderIcon) {
    return <DefaultFolderOpenedIcon aria-hidden className={ICON_CLASS} />;
  }
  return icon;
}
