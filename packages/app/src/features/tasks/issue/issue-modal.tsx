import { LuX } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { Modal } from '../../../components/modal';
import { useForgeIssueDetail } from '../../../services/queries';
import { useActiveWorktree } from '../../../services/use-status';
import { useIssueModalStore, type IssueModalTarget } from '../../../store/issue-modal-store';
import { IssueDetail } from './issue-detail';
import { IssueDetailSkeleton } from './issue-skeleton';

/**
 * The app-wide issue modal — mounted once, from `app.tsx`, and opened through
 * `useIssueModalStore` by every surface that links to an issue (a Tasks row
 * or card, the sidebar's Issues section, the palette, an in-app forge link).
 *
 * It shows exactly what the old Issues view's detail pane did — header,
 * `IssueActionBar`, body and conversation — by mounting that same
 * `IssueDetail` inside `Modal`, which is what gives it `useDismiss` (layer
 * `dialog`, blocking, so Escape closes it and it occludes a live browser tab)
 * and `useFocusTrap`.
 */
export function IssueModalHost() {
  const target = useIssueModalStore((s) => s.target);
  const closeIssue = useIssueModalStore((s) => s.closeIssue);
  if (target === null) return null;
  // Keyed by the issue, so switching straight from one issue to another
  // remounts the detail (its comment composer and slides claim included).
  return <IssueModal key={`${target.repoId}#${target.number}`} target={target} onClose={closeIssue} />;
}

export function IssueModal({ target, onClose }: { target: IssueModalTarget; onClose: () => void }) {
  const { repoId: activeRepoId, worktreePath } = useActiveWorktree();
  const detail = useForgeIssueDetail(target.repoId, target.number);
  const issue = detail.data?.issue?.issue ?? target.seed ?? null;
  const error = detail.data?.error ?? (detail.isError ? String(detail.error) : null);

  return (
    <Modal open onClose={onClose} title={`Issue #${target.number}`} size="lg" testId="issue-modal">
      <div className="relative flex h-[min(80vh,760px)] min-h-0 flex-col">
        <IconButton
          icon={LuX}
          label="Close issue"
          size="sm"
          className="absolute right-2 top-2 z-10"
          onClick={onClose}
        />
        {issue !== null ? (
          <IssueDetail
            repoId={target.repoId}
            issue={issue}
            worktreePath={target.repoId === activeRepoId ? worktreePath : null}
          />
        ) : error !== null ? (
          <p className="px-4 py-3 text-xs text-destructive">{error}</p>
        ) : (
          <IssueDetailSkeleton />
        )}
      </div>
    </Modal>
  );
}
