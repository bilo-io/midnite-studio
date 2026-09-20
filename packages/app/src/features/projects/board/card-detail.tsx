import type { ForgeIssueRef, ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { LuX } from 'react-icons/lu';

import { IconSelect, type IconSelectOption } from '../../../components/select/icon-select';
import { UserAvatar } from '../../../components/user-avatar';
import { AGENT_COMMANDS } from '../../agent/agent-commands';
import { ExternalLink } from '../../markdown/external-link';
import { type AgentCommandId, useUiStore } from '../../../store/ui-store';
import { CardComposer } from './card-composer';
import { CONTENT_ICON } from './card-chrome';
import { ProjectFieldCell } from '../field-editor';

/**
 * The real, distinct "Not set" — Theme D's fork on whether a skill is chosen
 * reads `cardSkillByTask[key]`'s absence, so this id (never persisted) is
 * only ever the picker's own placeholder for that absence, translated back
 * to `setCardSkill(key, undefined)` the moment anything else is chosen.
 */
const NOT_SET_OPTION_ID = '__not-set__';

/** The six task-launching skills (Phase 92 Theme C) — the same catalogue the
 *  fallback menu (Theme D) draws its three from, never a wider one. */
const SKILL_OPTIONS: readonly IconSelectOption[] = [
  { id: NOT_SET_OPTION_ID, label: 'Not set' },
  ...AGENT_COMMANDS.filter((command) => command.category === 'tasks').map(
    (command): IconSelectOption => ({ id: command.id, label: command.label, icon: command.icon }),
  ),
];

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
  blockers,
}: {
  projectId: string;
  repoId: string | null;
  /** Absent when no worktree is selected — the composer needs a real `cwd`. */
  worktreePath: string | undefined;
  item: ForgeProjectItem;
  fields: readonly ForgeProjectField[];
  onClose: () => void;
  /** Forwarded to `CardComposer` unchanged — see `CardPanelStack`'s own doc
   *  comment (Phase 75 Theme G). */
  blockers?: readonly ForgeIssueRef[];
}) {
  const Icon = CONTENT_ICON[item.content.type];
  const href = item.content.type === 'draft' ? null : item.content.url;
  const number = item.content.type === 'draft' ? null : item.content.number;
  const linkedPrs = item.content.type === 'issue' ? item.content.linkedPrs ?? [] : [];

  // Composite key mirrors `useCardPlay`'s own `taskRef` — there is no single
  // id that identifies a task across a possible cross-repo project.
  const taskKey = `${projectId}:${item.id}`;
  const skillId = useUiStore((state) => state.cardSkillByTask[taskKey]);
  const setCardSkill = useUiStore((state) => state.setCardSkill);

  return (
    <div className="flex h-full flex-col" data-testid="card-detail">
      <header className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-2.5">
        <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.content.title}</p>
          {item.content.type === 'issue' ? (
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>Issue {href ? <ExternalLink href={href}>#{number}</ExternalLink> : `#${number}`}</span>
              {linkedPrs.length > 0 ? (
                <span>
                  · PRs:{' '}
                  {linkedPrs.map((pr, index) => (
                    <span key={pr.number}>
                      {index > 0 ? ' ' : null}
                      <ExternalLink href={pr.url}>#{pr.number}</ExternalLink>
                    </span>
                  ))}
                </span>
              ) : null}
            </p>
          ) : number !== null ? (
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

        <div className="mb-3">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">Skill</p>
          <IconSelect
            ariaLabel="Skill"
            options={SKILL_OPTIONS}
            value={skillId ?? NOT_SET_OPTION_ID}
            onChange={(id) =>
              setCardSkill(taskKey, id === NOT_SET_OPTION_ID ? undefined : (id as AgentCommandId))
            }
          />
        </div>

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
        <CardComposer
          projectId={projectId}
          repoId={repoId}
          worktreePath={worktreePath}
          item={item}
          blockers={blockers}
        />
      ) : (
        <p className="border-t border-border/50 px-3 py-2.5 text-[11px] text-muted-foreground">
          Select a repo checkout to launch an agent from this card.
        </p>
      )}
    </div>
  );
}
