import { LuFileText } from 'react-icons/lu';

import type { MediaTabDescriptor } from '@midnite/studio-frame';

import { DocsTab } from './docs-tab';

/**
 * Media ▸ Docs' renderer half (Phase 113 Theme Q). It never imports
 * media-core: the layout, explorer and data hooks come through the frame's
 * `useMediaKit()`, which the app's `MediaShell` installs, and what differs per
 * app comes through {@link DocsHost}.
 *
 * Nothing here pulls Tiptap eagerly — the editor is its own lazy chunk behind
 * `docs-tab.tsx` (`docs-tab.test.ts` holds that line).
 */
export { mediaDocsManifest, type MediaDocsManifest } from '../manifest';
export {
  DocsHostProvider,
  useDocsHost,
  type DocsHost,
  type DocPresentButtonProps,
  type DocThreadPanelProps,
  type LastDoc,
} from './host';
export { applyProposal, normalizeMarkdown } from './doc-thread';
export { lineDiff, type DiffLine } from './line-diff';
export { useDocThread } from './use-doc-thread';
export type { DocRef, DocSession } from './use-doc-session';

/** The Docs tab, for an app's `MediaShell` registry. */
export const mediaDocsTab = {
  id: 'doc',
  label: 'Docs',
  icon: LuFileText,
  Component: DocsTab,
} as const satisfies MediaTabDescriptor;
