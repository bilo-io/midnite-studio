import { LuCircleDot, LuGitPullRequest, LuNotebookPen, LuX } from 'react-icons/lu';

import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

import type { IconComponent } from '../../../components/icon-button';
import { ProjectFieldCell } from '../field-editor';
import { ExternalLink } from '../../markdown/external-link';

/**
 * A card's detail (Phase 41 Theme B): the item's body, assignees and every
 * field, editable through the same `ProjectFieldCell` the table uses.
 *
 * **No agent composer here.** The phase doc names one for this pane, but it
 * belongs to Theme G, which does not exist yet — this pane is read-and-edit
 * only, exactly like the table it shares its editors with.
 */
export function CardDetail({
  projectId,
  item,
  fields,
  onClose,
}: {
  projectId: string;
  item: ForgeProjectItem;
  fields: readonly ForgeProjectField[];
  onClose: () => void;
}) {
  const Icon = CONTENT_ICON[item.content.type];
  const href = item.content.type === 'draft' ? null : item.content.url;
  const number = item.content.type === 'draft' ? null : item.content.number;

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-border" data-testid="card-detail">
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
            <p className="text-xs">{item.content.assignees.join(', ')}</p>
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
    </div>
  );
}

const CONTENT_ICON: Record<ForgeProjectItem['content']['type'], IconComponent> = {
  issue: LuCircleDot,
  pull: LuGitPullRequest,
  draft: LuNotebookPen,
};
