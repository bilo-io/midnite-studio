import { useEffect, useMemo, useState } from 'react';
import { LuCheck, LuLoaderCircle, LuPlus, LuTrash2, LuTriangleAlert, LuX } from 'react-icons/lu';

import type { AiPlanBlueprint, AiPlanTask, ForgeCapability } from '@midnite/studio-shared';

import { Modal } from '../../../components/modal';
import { IconButton } from '../../../components/icon-button';
import { TextArea, TextField } from '../../../components/form/field';
import { Spinner } from '../../../components/skeleton';
import {
  useAddProjectItem,
  useCreateIssue,
  useCreateProject,
  useForgeProjects,
  useLinkIssues,
  usePlanBlueprint,
} from '../../../services/queries';
import {
  buildPlanConfirmSteps,
  emptyPlanConfirmContext,
  runPlanConfirm,
  type PlanConfirmContext,
  type PlanConfirmMode,
  type PlanConfirmOps,
  type PlanConfirmStep,
  type PlanConfirmTarget,
} from './plan-confirm';
import { PlanGraphPreview } from './plan-graph-preview';

let nextTaskKeySeq = 0;
/** A local, human-legible task key the model never sees — never reused
 *  within one session, so a freshly added row can never collide with one
 *  the model itself proposed. */
function freshTaskKey(): string {
  nextTaskKeySeq += 1;
  return `task-${nextTaskKeySeq}`;
}

export type PlanSheetOrigin =
  | { kind: 'project'; capability: ForgeCapability | null; defaultProjectId: string | null }
  | { kind: 'subIssue'; capability: ForgeCapability | null; originNumber: number; originTitle: string };

export function PlanBlueprintSheet({
  open,
  onClose,
  repoId,
  repoName,
  worktreePath,
  agentId,
  initialPrompt,
  origin,
}: {
  open: boolean;
  onClose: () => void;
  repoId: string;
  repoName: string;
  worktreePath?: string | null | undefined;
  agentId?: string | undefined;
  initialPrompt: string;
  origin: PlanSheetOrigin;
}) {
  const plan = usePlanBlueprint();
  const createProject = useCreateProject(repoId);
  const createIssue = useCreateIssue(repoId);
  const addProjectItem = useAddProjectItem();
  const linkIssues = useLinkIssues();
  const boards = useForgeProjects(repoId, open && origin.kind === 'project');

  const [promptText, setPromptText] = useState(initialPrompt);
  const [draft, setDraft] = useState<AiPlanBlueprint | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [target, setTarget] = useState<PlanConfirmTarget>({ kind: 'none' });
  const [steps, setSteps] = useState<PlanConfirmStep[] | null>(null);
  const [confirmContext, setConfirmContext] = useState<PlanConfirmContext>(emptyPlanConfirmContext());
  const [confirming, setConfirming] = useState(false);

  const generating = plan.isPending;
  const locked = generating || confirming;

  // Fresh state every open, and an immediate first generation — the inline
  // bar already collected the prompt, so opening the sheet with nothing on
  // screen yet would just be a second click for the same intent.
  useEffect(() => {
    if (!open) return;
    setPromptText(initialPrompt);
    setDraft(null);
    setGenError(null);
    setSteps(null);
    setConfirmContext(emptyPlanConfirmContext());
    setConfirming(false);
    if (origin.kind === 'project') {
      const capability = origin.capability;
      if (origin.defaultProjectId && capability?.ops.addProjectItem) {
        setTarget({ kind: 'existing', projectId: origin.defaultProjectId });
      } else if (capability?.ops.createProject) {
        setTarget({ kind: 'new' });
      } else {
        setTarget({ kind: 'none' });
      }
    }
    generate(initialPrompt, undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per open
  }, [open]);

  function generate(prompt: string, existing: AiPlanBlueprint | undefined) {
    setGenError(null);
    plan.mutate(
      {
        ...(agentId ? { agentId } : {}),
        repoPath: worktreePath ?? null,
        repoName,
        prompt,
        ...(existing ? { existing } : {}),
        ...(origin.kind === 'subIssue'
          ? { originIssue: { number: origin.originNumber, title: origin.originTitle } }
          : {}),
      },
      {
        onSuccess: (result) => {
          if (result.ok) {
            setDraft(result.value.blueprint);
          } else {
            setGenError(result.kind === 'error' ? result.message : 'Planning failed.');
          }
        },
        onError: () => setGenError('Could not run the planner.'),
      },
    );
  }

  const rePlan = () => {
    if (!draft) return;
    generate(promptText, draft);
  };

  const updateTask = (key: string, patch: Partial<AiPlanTask>) => {
    setDraft((current) =>
      current
        ? { ...current, tasks: current.tasks.map((task) => (task.key === key ? { ...task, ...patch } : task)) }
        : current,
    );
  };

  const removeTask = (key: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.filter((task) => task.key !== key),
            edges: current.edges.filter((edge) => edge.from !== key && edge.to !== key),
          }
        : current,
    );
  };

  const addTask = () => {
    setDraft((current) =>
      current
        ? {
            ...current,
            tasks: [...current.tasks, { key: freshTaskKey(), title: 'New task', body: '', labels: [] }],
          }
        : current,
    );
  };

  const toggleBlockedBy = (taskKey: string, blockerKey: string, blocked: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const withoutThis = current.edges.filter((edge) => !(edge.from === taskKey && edge.to === blockerKey));
      return {
        ...current,
        edges: blocked ? [...withoutThis, { from: taskKey, to: blockerKey, kind: 'blockedBy' as const }] : withoutThis,
      };
    });
  };

  const mode: PlanConfirmMode | null = useMemo(() => {
    if (!draft) return null;
    return origin.kind === 'subIssue'
      ? { kind: 'subIssue', originNumber: origin.originNumber }
      : { kind: 'project', target };
  }, [draft, origin, target]);

  const previewSteps = useMemo(
    () => (draft && mode ? buildPlanConfirmSteps(draft, mode) : []),
    [draft, mode],
  );

  const confirm = async (resume: PlanConfirmStep[] | null) => {
    if (!draft || !mode) return;
    setConfirming(true);
    const startSteps = resume ?? buildPlanConfirmSteps(draft, mode);
    const ops: PlanConfirmOps = {
      createProject: async (title, description) => {
        const result = await createProject.mutateAsync({ title });
        if (!result.ok) return { ok: false, message: result.kind === 'error' ? result.message : result.hint };
        void description; // description has no dedicated write on ProjectV2 create; title-only, per Theme D.
        return { ok: true, projectId: result.project.id };
      },
      createIssue: async (taskKey) => {
        const task = draft.tasks.find((t) => t.key === taskKey);
        if (!task) return { ok: false, message: 'Task no longer exists.' };
        const result = await createIssue.mutateAsync({ title: task.title, body: task.body, labels: task.labels });
        if (!result.ok) return { ok: false, message: result.error ?? 'Could not create the issue.' };
        return { ok: true, number: result.issue.number, id: result.issue.id };
      },
      addToProject: async (projectId, contentId) => {
        const result = await addProjectItem.mutateAsync({ projectId, contentId });
        return result.ok ? { ok: true } : { ok: false, message: result.kind === 'error' ? result.message : result.hint };
      },
      linkBlockedBy: async (fromNumber, toNumber) => {
        const result = await linkIssues.mutateAsync({ repoId, kind: 'blockedBy', number: fromNumber, targetNumber: toNumber });
        return result.ok ? { ok: true } : { ok: false, message: result.error ?? 'Could not link the issues.' };
      },
      linkSubIssue: async (originNumber, childNumber) => {
        const result = await linkIssues.mutateAsync({ repoId, kind: 'subIssue', number: originNumber, targetNumber: childNumber });
        return result.ok ? { ok: true } : { ok: false, message: result.error ?? 'Could not link the sub-issue.' };
      },
    };

    const outcome = await runPlanConfirm(draft, mode, startSteps, confirmContext, ops, (nextSteps, nextContext) => {
      setSteps(nextSteps);
      setConfirmContext(nextContext);
    });
    setConfirming(false);
    setSteps(outcome.steps);
    setConfirmContext(outcome.context);
  };

  const allDone = steps !== null && steps.every((step) => step.status === 'done');
  const hasFailure = steps !== null && steps.some((step) => step.status === 'failed');
  const canConfirm =
    !locked &&
    draft !== null &&
    draft.tasks.length > 0 &&
    (origin.kind === 'subIssue' ? true : origin.capability?.ops.createIssue !== false);

  return (
    <Modal open={open} onClose={onClose} title="Plan with AI" size="lg" testId="plan-blueprint-sheet">
      <div
        className="activity-glow flex max-h-[85vh] flex-col gap-3 overflow-hidden rounded-lg p-4"
        {...(locked ? { 'data-activity-status': 'agent' } : {})}
      >
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="text-sm font-semibold">
            {origin.kind === 'subIssue' ? `Plan sub-issues of #${origin.originNumber}` : 'Plan with AI'}
          </h2>
          <IconButton icon={LuX} label="Close" size="sm" onClick={onClose} disabled={confirming} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {generating && draft === null ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner size="md" />
              <p>Drafting a plan…</p>
            </div>
          ) : genError && draft === null ? (
            <div className="flex flex-col items-start gap-2 py-6">
              <p role="alert" className="text-xs text-destructive">
                {genError}
              </p>
              <button
                type="button"
                onClick={() => generate(promptText, undefined)}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
              >
                Try again
              </button>
            </div>
          ) : draft ? (
            <div className="flex flex-col gap-4">
              {steps === null ? (
                <>
                  <section className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground">Board</span>
                    <TextField
                      value={draft.project.title}
                      onChange={(value) =>
                        setDraft((current) => (current ? { ...current, project: { ...current.project, title: value } } : current))
                      }
                      label="Board title"
                      disabled={locked}
                    />
                  </section>

                  {origin.kind === 'project' && (origin.capability?.ops.createProject || origin.capability?.ops.addProjectItem) ? (
                    <section className="flex flex-col gap-1.5 text-xs">
                      <span className="text-muted-foreground">Target</span>
                      <div role="radiogroup" aria-label="Target" className="flex flex-wrap gap-3">
                        {origin.capability?.ops.createProject ? (
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              checked={target.kind === 'new'}
                              onChange={() => setTarget({ kind: 'new' })}
                              disabled={locked}
                            />
                            New board
                          </label>
                        ) : null}
                        {origin.capability?.ops.addProjectItem ? (
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              checked={target.kind === 'existing'}
                              onChange={() =>
                                setTarget({
                                  kind: 'existing',
                                  projectId: boards.data?.projects[0]?.id ?? origin.defaultProjectId ?? '',
                                })
                              }
                              disabled={locked}
                            />
                            Existing board
                          </label>
                        ) : null}
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            checked={target.kind === 'none'}
                            onChange={() => setTarget({ kind: 'none' })}
                            disabled={locked}
                          />
                          Issues only
                        </label>
                      </div>
                      {target.kind === 'existing' ? (
                        <select
                          aria-label="Existing board"
                          value={target.projectId}
                          onChange={(event) => setTarget({ kind: 'existing', projectId: event.target.value })}
                          disabled={locked}
                          className="w-fit rounded border border-border bg-background px-1.5 py-1"
                        >
                          {(boards.data?.projects ?? []).map((board) => (
                            <option key={board.id} value={board.id}>
                              {board.title}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Tasks</span>
                      <IconButton icon={LuPlus} label="Add task" size="sm" onClick={addTask} disabled={locked} />
                    </div>
                    {draft.tasks.map((task) => (
                      <div key={task.key} className="flex flex-col gap-1.5 rounded-md border border-border p-2">
                        <div className="flex items-center gap-2">
                          <TextField
                            value={task.title}
                            onChange={(value) => updateTask(task.key, { title: value })}
                            label={`Task title (${task.key})`}
                            disabled={locked}
                            className="flex-1"
                          />
                          <IconButton
                            icon={LuTrash2}
                            label={`Remove ${task.title}`}
                            size="sm"
                            onClick={() => removeTask(task.key)}
                            disabled={locked}
                          />
                        </div>
                        <TextArea
                          value={task.body}
                          onChange={(value) => updateTask(task.key, { body: value })}
                          label={`Task body (${task.key})`}
                          rows={2}
                          disabled={locked}
                        />
                        <TextField
                          value={task.labels.join(', ')}
                          onChange={(value) =>
                            updateTask(task.key, {
                              labels: value
                                .split(',')
                                .map((label) => label.trim())
                                .filter((label) => label.length > 0),
                            })
                          }
                          label={`Labels (${task.key})`}
                          placeholder="Labels (comma-separated)"
                          disabled={locked}
                        />
                        {draft.tasks.length > 1 ? (
                          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                            <span>Blocked by:</span>
                            {draft.tasks
                              .filter((other) => other.key !== task.key)
                              .map((other) => (
                                <label key={other.key} className="flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={draft.edges.some((edge) => edge.from === task.key && edge.to === other.key)}
                                    onChange={(event) => toggleBlockedBy(task.key, other.key, event.target.checked)}
                                    disabled={locked}
                                  />
                                  {other.title}
                                </label>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </section>

                  <section className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground">Preview</span>
                    <PlanGraphPreview blueprint={draft} />
                  </section>

                  <section className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground">Re-plan with more instructions</span>
                    <div className="flex items-center gap-2">
                      <TextField value={promptText} onChange={setPromptText} disabled={locked} className="flex-1" />
                      <button
                        type="button"
                        onClick={rePlan}
                        disabled={locked}
                        className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {generating ? 'Re-planning…' : 'Re-plan'}
                      </button>
                    </div>
                  </section>
                </>
              ) : (
                <section className="flex flex-col gap-2">
                  <span className="text-xs text-muted-foreground">
                    {allDone ? 'Done.' : hasFailure ? 'Stopped — one step failed.' : 'Working…'}
                  </span>
                  <ul className="flex flex-col gap-1.5">
                    {steps.map((step) => (
                      <li key={step.id} className="flex items-start gap-2 text-xs">
                        {step.status === 'done' ? (
                          <LuCheck className="mt-0.5 shrink-0 text-green-500" />
                        ) : step.status === 'failed' ? (
                          <LuTriangleAlert className="mt-0.5 shrink-0 text-destructive" />
                        ) : step.status === 'running' ? (
                          <LuLoaderCircle className="mt-0.5 shrink-0 animate-spin text-muted-foreground" />
                        ) : (
                          <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
                        )}
                        <div className="flex flex-col">
                          <span>{step.label}</span>
                          {step.error ? <span className="text-destructive">{step.error}</span> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-1 flex shrink-0 items-center justify-end gap-2 border-t border-border pt-3">
          {previewSteps.length > 0 && steps === null ? (
            <span className="mr-auto text-[11px] text-muted-foreground">{previewSteps.length} steps on Confirm</span>
          ) : null}
          {steps !== null && hasFailure ? (
            <button
              type="button"
              onClick={() => void confirm(steps)}
              disabled={confirming}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              Retry remaining
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {allDone ? 'Close' : 'Cancel'}
          </button>
          {steps === null ? (
            <button
              type="button"
              disabled={!canConfirm}
              onClick={() => void confirm(null)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Confirm
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
