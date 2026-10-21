import type { ForgeProjectsResult } from '@midnite/studio-shared';

import { bridge } from '../../../../services/bridge';
import { keys, type ForgeProjectItemsPage } from '../../../../services/queries';
import { sessionLabel, useTerminalStore } from '../../../terminal/terminal-store';
import type { ResourceCandidate, ResourceSource } from '../resolve';
import { cachedOne } from './util';

/**
 * Agent-work sources: chats, live and closed sessions, councils, workflows
 * (and their runs, when the query asks for a run), boards and cards. Chat
 * previews feed matching through `keywords` and never come back as a field.
 */

/** Workflows whose run history is read when the query asks for a run — the most recently edited. */
const WORKFLOW_RUNS_FROM = 5;

const chats: ResourceSource = {
  id: 'chats',
  kinds: ['chat'],
  load: async () => {
    const api = bridge();
    if (!api) return [];
    const { chats: list } = await api.chats.list();
    return list.map((chat) => ({
      ref: { kind: 'chat' as const, id: chat.id },
      title: chat.title || 'Untitled chat',
      detail: [chat.repoName, chat.engine].filter(Boolean).join(' · '),
      keywords: `${chat.preview} ${chat.model ?? ''}`,
      at: chat.updatedAt,
    }));
  },
};

const liveSessions: ResourceSource = {
  id: 'sessions:live',
  kinds: ['session'],
  load: async () => {
    const { sessions, autoNames } = useTerminalStore.getState();
    // FAB sessions never show in the terminal panel, so there is nowhere to reveal them.
    return sessions
      .filter((session) => session.surface !== 'fab')
      .map((session) => ({
        ref: { kind: 'session' as const, id: session.id },
        title: sessionLabel(session, autoNames[session.id], session.agentId),
        detail: `${session.title} · live`,
        keywords: `${session.kind} ${session.agentId ?? ''} ${session.cwd}`,
        at: session.createdAt,
      }));
  },
};

const closedSessions: ResourceSource = {
  id: 'sessions:closed',
  kinds: ['session'],
  load: async () => {
    const api = bridge();
    if (!api) return [];
    const { sessions } = await api.sessions.history();
    return sessions.map((session) => ({
      ref: { kind: 'session' as const, id: session.id, closed: true },
      title: session.name ?? session.agentId ?? 'Terminal',
      detail: `${session.title} · closed`,
      keywords: `${session.kind} ${session.cwd}`,
      at: session.closedAt,
    }));
  },
};

const councils: ResourceSource = {
  id: 'councils',
  kinds: ['council'],
  load: async () => {
    const api = bridge();
    if (!api) return [];
    const { councils: list } = await api.council.list();
    return list.map((council) => ({
      ref: { kind: 'council' as const, id: council.id },
      title: council.name,
      detail: `council · ${council.members.length} members`,
      keywords: council.description ?? '',
      at: council.updatedAt,
    }));
  },
};

const workflows: ResourceSource = {
  id: 'workflows',
  kinds: ['workflow'],
  load: async (q) => {
    const api = bridge();
    if (!api) return [];
    const { workflows: list } = await api.workflow.list();
    const out: ResourceCandidate[] = list.map((workflow) => ({
      ref: { kind: 'workflow' as const, id: workflow.id },
      title: workflow.name,
      detail: 'workflow',
      keywords: workflow.description ?? '',
      at: workflow.updatedAt,
    }));
    // Runs only when a run is what was asked for — "the last run of deploy" — never on every find.
    const wantsRuns = q.headWord === 'run' || q.headWord === 'runs' || q.softTerms.some((term) => term === 'run' || term === 'runs');
    if (!wantsRuns) return out;
    const recent = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, WORKFLOW_RUNS_FROM);
    const histories = await Promise.all(recent.map((workflow) => api.workflow.runs.list({ workflowId: workflow.id })));
    for (const { runs } of histories) {
      for (const run of runs) {
        out.push({
          ref: { kind: 'workflow', id: run.workflowId, runId: run.id },
          title: `${run.workflowName} run`,
          detail: `workflow run · ${run.status}`,
          at: run.startedAt,
        });
      }
    }
    return out;
  },
};

/** Boards and their cards, from what the Tasks view already fetched — a find never walks a board's pages. */
const boards: ResourceSource = {
  id: 'boards',
  kinds: ['board', 'card'],
  load: async (q) => {
    if (q.repoId === null) return [];
    const repoId = q.repoId;
    const projects = cachedOne<ForgeProjectsResult>(keys.forgeProjects(repoId))?.projects ?? [];
    const out: ResourceCandidate[] = [];
    for (const project of projects) {
      out.push({
        ref: { kind: 'board', repoId, projectId: project.id },
        title: project.title,
        detail: project.closed ? 'board · closed' : 'board',
      });
      const items = cachedOne<ForgeProjectItemsPage>(keys.forgeProjectItems(project.id))?.items ?? [];
      for (const item of items) {
        const content = item.content;
        const number = content.type === 'draft' ? '' : ` · #${content.number}`;
        out.push({
          ref: { kind: 'card', repoId, projectId: project.id, cardId: item.id },
          title: content.title,
          detail: `card on ${project.title}${number}`,
          keywords: `${content.type === 'draft' ? 'draft' : content.state} ${'labels' in content ? content.labels.join(' ') : ''} ${content.assignees.join(' ')}`,
        });
      }
    }
    return out;
  },
};

export const AGENT_SOURCES: readonly ResourceSource[] = [chats, liveSessions, closedSessions, councils, workflows, boards];
