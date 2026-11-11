import { useState, type FormEvent } from 'react';

import { MILESTONE_STATUSES, type Milestone } from '@midnite/studio-shared';

import { useStartupWrite } from '../data/use-startup';
import { wouldCreateCycle } from './roadmap-model';

const FIELD = 'h-8 w-full rounded-md border border-border bg-background px-2 text-sm';
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';

/**
 * The add/edit side sheet. The dependency list greys out every choice `wouldCreateCycle` rejects (the milestone
 * itself, and anything that already depends on it); main re-checks and answers `cycle`, shown as it arrives.
 */
export function MilestoneSheet({
  milestone,
  milestones,
  onClose,
}: {
  /** The milestone being edited, or `null` for a new one. */
  milestone: Milestone | null;
  milestones: readonly Milestone[];
  onClose: () => void;
}) {
  const save = useStartupWrite((bridge, next: Milestone) => bridge.upsertMilestone({ milestone: next }));
  const remove = useStartupWrite((bridge, id: string) => bridge.removeMilestone({ id }));
  const [id] = useState(() => milestone?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(milestone?.title ?? '');
  const [description, setDescription] = useState(milestone?.description ?? '');
  const [status, setStatus] = useState<Milestone['status']>(milestone?.status ?? 'planned');
  const [start, setStart] = useState(milestone?.start ?? '');
  const [due, setDue] = useState(milestone?.due ?? '');
  const [owner, setOwner] = useState(milestone?.owner ?? '');
  const [tags, setTags] = useState((milestone?.tags ?? []).join(', '));
  const [dependsOn, setDependsOn] = useState<string[]>(milestone?.dependsOn ?? []);
  const [problem, setProblem] = useState<string | null>(null);

  const others = milestones.filter((m) => m.id !== id);

  function toggle(dependencyId: string): void {
    setDependsOn((current) => (current.includes(dependencyId) ? current.filter((x) => x !== dependencyId) : [...current, dependencyId]));
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (title.trim() === '') return setProblem('Give the milestone a title.');
    if (due === '') return setProblem('Pick a due date.');
    if (start !== '' && start > due) return setProblem('The start cannot be after the due date.');
    if (dependsOn.length > 20) return setProblem('A milestone depends on at most 20 others.');
    setProblem(null);
    const tagList = tags.split(',').map((t) => t.trim()).filter((t) => t !== '');
    save.mutate(
      {
        id,
        title: title.trim(),
        description,
        status,
        ...(start !== '' ? { start } : {}),
        due,
        dependsOn,
        ...(owner.trim() !== '' ? { owner: owner.trim() } : {}),
        tags: tagList,
      },
      { onSuccess: onClose },
    );
  }

  const message = problem ?? save.error?.message ?? remove.error?.message ?? null;

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-4" aria-label={milestone ? 'Edit milestone' : 'Add milestone'}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{milestone ? 'Edit milestone' : 'Add milestone'}</h2>
        <label className={LABEL}>
          Title
          <input className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </label>
        <label className={LABEL}>
          Description
          <textarea className={`${FIELD} h-16 py-1`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </label>
        <label className={LABEL}>
          Status
          <select className={FIELD} value={status} onChange={(e) => setStatus(e.target.value as Milestone['status'])}>
            {MILESTONE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={LABEL}>
            Start (optional)
            <input className={FIELD} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className={LABEL}>
            Due
            <input className={FIELD} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <label className={LABEL}>
          Owner (optional)
          <input className={FIELD} value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={80} />
        </label>
        <label className={LABEL}>
          Tags (comma separated)
          <input className={FIELD} value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs font-medium text-muted-foreground">Depends on</legend>
          {others.length === 0 ? <p className="text-xs text-muted-foreground">No other milestones yet.</p> : null}
          {others.map((other) => {
            const checked = dependsOn.includes(other.id);
            const blocked = !checked && wouldCreateCycle(milestones, id, [...dependsOn, other.id]);
            return (
              <label key={other.id} className={`flex items-center gap-2 text-xs ${blocked ? 'opacity-50' : ''}`} title={blocked ? 'That would make a loop' : undefined}>
                <input type="checkbox" checked={checked} disabled={blocked} onChange={() => toggle(other.id)} />
                {other.title}
              </label>
            );
          })}
        </fieldset>
        {message !== null ? (
          <p role="alert" className="text-xs text-red-500">
            {message}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button type="submit" disabled={save.isPending} className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60">
            Save
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-border px-3 text-sm">
            Cancel
          </button>
          {milestone ? (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate(milestone.id, { onSuccess: onClose })}
              className="ml-auto h-8 rounded-md border border-border px-3 text-sm text-red-500"
            >
              Delete
            </button>
          ) : null}
        </div>
      </form>
    </aside>
  );
}
