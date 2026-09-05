import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { LuCircleDot, LuGitPullRequest, LuNotebookPen, LuX } from 'react-icons/lu';

import type { IconComponent } from '../../../components/icon-button';
import { UserAvatar } from '../../../components/user-avatar';
import { ExternalLink } from '../../markdown/external-link';
import { CardComposer } from './card-composer';
import { ProjectFieldCell } from '../field-editor';

/**
 * A card's detail (Phase 41 Theme B): the item's body, assignees and every
 * field, editable through the same `ProjectFieldCell` the table uses — plus
 * the agent composer (Theme G) at the bottom, when a repo checkout is open
 * to launch it against.
 *
 * **No outer sizing/border of its own (Phase 50 Theme D).** `card-panel-stack.tsx`
 * now owns the `w-80 shrink-0 border-l` chrome, since it wraps this in a
 * `panel-stack` pane sized by its own container — a second border here would
 * double up against the wrapper's.
 */
export function CardDetail({
  projectId,
  repoId,
  worktreePath,
  item,
  fields,
  onClose,
}: {
  projectId: string;
  repoId: string | null;
  /** Absent when no worktree is selected — the composer needs a real `cwd`. */
  worktreePath: string | undefined;
  item: ForgeProjectItem;
  fields: readonly ForgeProjectField[];
  onClose: () => void;
}) {
  const Icon = CONTENT_ICON[item.content.type];
  const href = item.content.type === 'draft' ? null : item.content.url;
  const number = item.content.type === 'draft' ? null : item.content.number;

  return (
    <div className="flex h-full flex-col" data-testid="card-detail">
      <header className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-2.5">
        <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.content.title}</p>
          {number !== null ? (
            <p className="text-[11px] text-muted-foreground">
              {href ? <ExternalLink href={href}>#{number}</ExternalLink> : `#${number}`}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LuX aria-hidden className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {item.content.assignees.length > 0 ? (
          <div className="mb-3">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Assignees</p>
            <div className="flex flex-wrap items-center gap-2">
              {item.content.assignees.map((login) => (
                <div key={login} className="flex items-center gap-1.5 text-xs">
                  <UserAvatar login={login} size={16} detail="Assignee" />
                  <span>{login}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2.5">
          {fields.map((field) => (
            <div key={field.id}>
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">{field.name}</p>
              <ProjectFieldCell
                projectId={projectId}
                itemId={item.id}
                field={field}
                value={item.fieldValues[field.id]}
              />
            </div>
          ))}
        </div>
      </div>

      {repoId && worktreePath ? (
        <CardComposer projectId={projectId} repoId={repoId} worktreePath={worktreePath} item={item} />
      ) : (
        <p className="border-t border-border/50 px-3 py-2.5 text-[11px] text-muted-foreground">
          Select a repo checkout to launch an agent from this card.
        </p>
      )}
    </div>
  );
}

const CONTENT_ICON: Record<ForgeProjectItem['content']['type'], IconComponent> = {
  issue: LuCircleDot,
  pull: LuGitPullRequest,
  draft: LuNotebookPen,
};
