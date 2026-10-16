import { useFrameChrome, type IconButtonProps } from '@midnite/studio-frame';
import type { PageWindowRole } from '@midnite/studio-shared';

import {
  useWorkflowsHost,
  type WorkflowsModalProps,
  type WorkflowsMultiSelectMenuProps,
  type WorkflowsPopoverProps,
  type WorkflowsTreeSectionProps,
} from './host';

/**
 * The chrome the Graphs view draws, resolved through the installed ports on
 * each render (Phase 113 Theme N) — the same names and props the view imported
 * from the app's `components/`, so its call sites read as they did. The host
 * object is stable, so the component each wrapper resolves to keeps its
 * identity across renders and nothing remounts.
 */

export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

export function PageDetachMark({ role }: { role: PageWindowRole }) {
  const { PageDetachMark: Impl } = useFrameChrome();
  return <Impl role={role} />;
}

export function Modal(props: WorkflowsModalProps) {
  const { Modal: Impl } = useWorkflowsHost();
  return <Impl {...props} />;
}

export function Popover(props: WorkflowsPopoverProps) {
  const { Popover: Impl } = useWorkflowsHost();
  return <Impl {...props} />;
}

export function MultiSelectMenu(props: WorkflowsMultiSelectMenuProps) {
  const { MultiSelectMenu: Impl } = useWorkflowsHost();
  return <Impl {...props} />;
}

export function TreeSection(props: WorkflowsTreeSectionProps) {
  const { TreeSection: Impl } = useWorkflowsHost();
  return <Impl {...props} />;
}
