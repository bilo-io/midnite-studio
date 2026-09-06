import { LuCircleDot, LuGitPullRequest, LuNotebookPen } from 'react-icons/lu';

import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

import type { IconComponent } from '../../../components/icon-button';
import { UserAvatar } from '../../../components/user-avatar';
import { formatFieldValue } from '../field-editor';
import { ExternalLink } from '../../markdown/external-link';

/**
 * Extracted from `task-card.tsx` (Phase 75 Theme D) so the dependency graph's
 * own node can wear the exact same title/number/assignee/chip chrome a
 * kanban card does, rather than a second hand-rolled copy that drifts from
 * it the first time either one changes.
 *
 * `CONTENT_ICON` also replaces `card-detail.tsx`'s own byte-for-byte
 * duplicate (`card-detail.tsx:104–108` before this) — both import it from
 * here now, which is a free correctness win the phase doc calls out.
 *
 * **Does not move:** `data-card-id`/`tabIndex` (`task-card.tsx`'s own root),
 * the reveal-terminal button, and the glow class — those stay put because
 * `board-view.tsx`'s `moveFocusTo` and dnd both key off the card's own root
 * element, which this file never renders.
 */
export const CONTENT_ICON: Record<ForgeProjectItem['content']['type'], IconComponent> = {
  issue: LuCircleDot,
  pull: LuGitPullRequest,
  draft: LuNotebookPen,
};

/** Icon + truncated title — the first line of a card or a graph node alike. */
export function CardTitleRow({ icon: Icon, title }: { icon: IconComponent; title: string }) {
  return (
    <>
      <Icon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </>
  );
}

/**
 * `#number`, linked when a URL exists — its own click target, stopped from
 * bubbling to whatever opens the item's detail pane. `null` renders an empty
 * span so a number-less row (a draft) keeps its neighbour's layout.
 */
export function CardNumberRow({ number, href }: { number: number | null; href: string | null }) {
  if (number === null) return <span />;
  return href ? (
    <span onClick={(event) => event.stopPropagation()}>
      <ExternalLink href={href}>
        <span className="text-[11px] text-muted-foreground">#{number}</span>
      </ExternalLink>
    </span>
  ) : (
    <span className="text-[11px] text-muted-foreground">#{number}</span>
  );
}

/** Overlapping assignee avatars, GitHub's own `<login>.png` convention. */
export function CardAssignees({ assignees }: { assignees: readonly string[] }) {
  if (assignees.length === 0) return null;
  return (
    <div className="flex -space-x-1.5">
      {assignees.map((login) => (
        <UserAvatar key={login} login={login} size={16} className="border border-background" detail="Assignee" />
      ))}
    </div>
  );
}

/**
 * One chip per non-`Status` field with a value — field-value chips via
 * `formatFieldValue`, never labels (the item carries no labels field at
 * all). `data-card-chip` is new here (Theme D's own level-of-detail rule
 * queries for it at low zoom); harmless on the card, which never zooms.
 */
export function CardFieldChips({
  item,
  fields,
}: {
  item: ForgeProjectItem;
  fields: readonly ForgeProjectField[];
}) {
  const chips = fields
    .map((field) => ({ field, text: formatFieldValue(item.fieldValues[field.id]) }))
    .filter((chip) => chip.text.length > 0);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span
          key={chip.field.id}
          data-card-chip
          className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {chip.text}
        </span>
      ))}
    </div>
  );
}
