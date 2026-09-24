import { useEffect, useMemo, useRef } from 'react';

import {
  AUTOMATE_CONCURRENCY_DEFAULT,
  BUILTIN_AGENTS,
  resolveForgeGraph,
  type ForgeProjectField,
  type ForgeProjectItem,
} from '@midnite/studio-shared';

import { useToasts } from '../../../components/toast-host';
import { useUiStore } from '../../../store/ui-store';
import { resolveSessionAttribution } from '../../terminal/session-attribution';
import { startAgent } from '../../terminal/start-agent';
import { sessionPhase, useTerminalStore } from '../../terminal/terminal-store';
import { findTodoColumn, nextUnblockedCard } from './automate-derive';
import { decideColumnSkillAction, deriveColumns, resolveMostRecentAgentId } from './board-derive';

/**
 * Auto-mate (Phase 95 Theme H) — opt-in, keeps a project board's Todo column
 * moving without a human re-triggering Play for every card.
 *
 * While on: fills up to the project's concurrency cap with unblocked Todo
 * cards, launching each with its **Todo column's own mapped skill** — the
 * same `resolveColumnSkill`/`decideColumnSkillAction` machinery drag-to-skill
 * uses, applied to the column a card is already sitting in rather than one it
 * is dropped into. **Decision (unattended run):** this means Auto-mate does
 * nothing on an out-of-the-box board, where only "In progress"/"In review"
 * carry a default skill — the same "map it in Settings ▸ Projects" step
 * drag-to-skill already asks for, reused rather than inventing a second,
 * Auto-mate-only mapping surface. When a session bound to one of Auto-mate's
 * own cards exits non-zero, Auto-mate stops (the toggle flips off) rather
 * than skipping ahead — the phase doc's own recommendation.
 *
 * Deliberately project-board-only: a workflow's own Auto-mate (the phase
 * doc's "and on a workflow") needs Theme I's engine to have a board of its
 * own to drive, and is left for that theme.
 */
export function useAutomate({
  projectId,
  repoId,
  worktreePath,
  allItems,
  fields,
  groupField,
  blockedByFieldName,
  columnSkillOverrides,
}: {
  projectId: string;
  repoId: string | null;
  worktreePath: string | undefined;
  allItems: readonly ForgeProjectItem[];
  fields: readonly ForgeProjectField[];
  groupField: ForgeProjectField | null;
  blockedByFieldName: string;
  columnSkillOverrides: Readonly<Record<string, string>> | undefined;
}): void {
  const enabled = useUiStore((s) => s.automateEnabledByProject[projectId] ?? false);
  const cap = useUiStore((s) => s.automateCapByProject[projectId] ?? AUTOMATE_CONCURRENCY_DEFAULT);
  const sessions = useTerminalStore((s) => s.sessions);
  const states = useTerminalStore((s) => s.states);
  const exitCodes = useTerminalStore((s) => s.exitCodes);
  const toasts = useToasts();

  // Items Auto-mate has launched and is still waiting to see a live session
  // for — closed over the whole hook lifetime (not per-render state) so a
  // launch inside one effect pass is immediately visible to the very next
  // pass, before the store's own `sessions` list has caught up.
  const launchingRef = useRef(new Set<string>());
  // The last exit code this hook has already reacted to, per session id — a
  // `Record`, not a `Set`, because `exitCodes` never removes an entry once a
  // session has exited, so "have I seen THIS code" (not just "have I seen
  // this session before") is what tells a repeat effect run from a new exit.
  const seenExitRef = useRef<Record<string, number>>({});

  const todoColumn = useMemo(() => {
    const columns = deriveColumns(groupField, allItems);
    return findTodoColumn(columns);
  }, [groupField, allItems]);

  const graph = useMemo(
    () =>
      enabled && todoColumn
        ? resolveForgeGraph([...allItems], [...fields], { boardRepo: '', blockedByFieldName })
        : null,
    [enabled, todoColumn, allItems, fields, blockedByFieldName],
  );

  // Fills available concurrency slots — runs whenever anything that could
  // free or claim one changes. Idempotent: a pass that finds every slot full
  // (or nothing left unblocked) does nothing.
  useEffect(() => {
    if (!enabled || !todoColumn || !graph) return;

    const liveItemIds = new Set(
      sessions
        .filter(
          (s) =>
            s.surface === 'kanban' &&
            s.taskRef?.projectId === projectId &&
            sessionPhase(s, states[s.id]) === 'live',
        )
        .map((s) => s.taskRef!.itemId),
    );

    let running = liveItemIds.size;
    while (running < cap) {
      const excluded = new Set([...liveItemIds, ...launchingRef.current]);
      const next = nextUnblockedCard(todoColumn, graph, excluded);
      if (!next) break;

      const action = decideColumnSkillAction(next, todoColumn.name, columnSkillOverrides, undefined);
      // Nothing mapped for this column, or a draft with no link to hand the
      // skill — Auto-mate has nothing left it can start, so it stops here
      // rather than looping on the same unlaunchable card forever.
      if (action.kind !== 'launch') break;

      launchingRef.current.add(next.id);
      const agentId = resolveMostRecentAgentId(sessions, repoId);
      const agent = BUILTIN_AGENTS.find((a) => a.id === agentId) ?? BUILTIN_AGENTS[0]!;

      startAgent({
        repoId: repoId ?? '',
        cwd: worktreePath ?? '',
        title: next.content.type === 'draft' ? next.content.title : `#${next.content.number} ${next.content.title}`,
        prompt: `${action.skillTemplate} ${action.url}`,
        agentId: agent.id,
        command: agent.command,
        surface: 'kanban',
        taskRef: { projectId, itemId: next.id },
        ...resolveSessionAttribution(projectId),
        autoSend: true,
      });
      running += 1;
    }
    // `sessions` deliberately included — a session ending (or a new one
    // appearing from elsewhere, e.g. a manual Play) is exactly what should
    // re-run this fill.
  }, [enabled, todoColumn, graph, sessions, states, cap, projectId, repoId, worktreePath, columnSkillOverrides]);

  // Stops Auto-mate on the first failed task (the phase doc's own rule) —
  // watches every session's exit code, not just this board's, because a
  // session can carry `taskRef` after this board's own `items` prop has
  // already dropped it (a card moved off-board mid-run).
  useEffect(() => {
    if (!enabled) return;
    for (const [sessionId, code] of Object.entries(exitCodes)) {
      if (seenExitRef.current[sessionId] === code) continue;
      seenExitRef.current[sessionId] = code;

      const session = sessions.find((s) => s.id === sessionId);
      if (!session || session.surface !== 'kanban' || session.taskRef?.projectId !== projectId) continue;
      launchingRef.current.delete(session.taskRef.itemId);

      if (code !== 0) {
        useUiStore.getState().setAutomateEnabled(projectId, false);
        toasts.show({ message: `Auto-mate stopped — "${session.title}" exited with code ${code}.` });
      }
    }
  }, [enabled, exitCodes, sessions, projectId, toasts]);
}
