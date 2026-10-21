import { useMemo } from 'react';

import { useFrameChrome, type FrameDialogs, type IconButtonProps } from '@midnite/studio-frame';
import type { PageWindowRole } from '@midnite/studio-shared';

import {
  useDatabaseHost,
  type DatabaseQueryEditorProps,
  type DatabaseTooltipProps,
  type DatabaseTreeSectionProps,
} from './host';

/**
 * The chrome the Database tool draws, resolved through the installed ports on each render (Phase 113
 * Theme O) — the forge and chats features' `ui.tsx` pattern. The views imported these straight from
 * the app's `components/`; the wrappers keep those call sites as they were while the implementation
 * is whichever the composing app installed.
 */

export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

export function PageDetachMark({ role }: { role: PageWindowRole }) {
  const { PageDetachMark: Impl } = useFrameChrome();
  return <Impl role={role} />;
}

/** The dialog host's confirms and notices. */
export function useDialogs(): FrameDialogs {
  const dialogs = useFrameChrome().useDialogs();
  return useMemo(() => dialogs, [dialogs]);
}

export function Tooltip(props: DatabaseTooltipProps) {
  const { Tooltip: Impl } = useDatabaseHost();
  return <Impl {...props} />;
}

export function TreeSection(props: DatabaseTreeSectionProps) {
  const { TreeSection: Impl } = useDatabaseHost();
  return <Impl {...props} />;
}

export function QueryEditor(props: DatabaseQueryEditorProps) {
  const { QueryEditor: Impl } = useDatabaseHost();
  return <Impl {...props} />;
}
