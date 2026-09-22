import {
  EMPTY_ISSUE_LINK_SET,
  type Forge,
  type ForgeProject,
  type ForgeProjectField,
  type ForgeProjectFieldsResult,
  type ForgeProjectFieldValue,
  type ForgeProjectItem,
  type ForgeProjectItemsResult,
  type ForgeProjectsResult,
  type ForgeProjectWriteResult,
} from '@midnite/studio-shared';

import { gitlabCliStatus, glGet, glPut, nextPageCursor, projectId, type GitLabContext } from './gitlab-client';
import { asArray, asId, asNumber, asString, asStringLoose, row } from './gitlab-json';
import { mapIssueState } from './gitlab-mappers';

/**
 * Issue Boards → `ForgeProject`, the phase doc's own call: "the closest
 * analogue to ProjectV2… its 'fields' are label-backed lists rather than
 * typed custom fields, so `ForgeProjectField` carries a single synthetic
 * single-select field whose options are the board's lists." Epics are out
 * (GitLab Premium).
 *
 * **One field, always named `list`.** A board's columns are exactly one
 * dimension — which list an issue sits in — represented as GitLab's own
 * label, so there is exactly one field to read and one to write, never a
 * per-board schema the way ProjectV2's custom fields are.
 */

const BOARD_FIELD_ID = 'list';
const ITEMS_PER_PAGE = 50;

type GitLabList = { id: number; name: string; color: string };

async function fetchLabelLists(
  ctx: GitLabContext,
  forge: Forge,
  boardId: string,
): Promise<GitLabList[] | null> {
  const result = await glGet<unknown[]>(ctx, `projects/${projectId(forge)}/boards/${boardId}/lists`, {
    per_page: 100,
  });
  if (!result.ok) return null;

  const lists: GitLabList[] = [];
  for (const raw of asArray(result.data)) {
    const r = row(raw);
    if (!r) continue;
    // `backlog`/`closed` are derived, system lists with no label of their
    // own — an issue cannot be "set" into them by adding a label, so they
    // are not settable options on the synthetic field.
    if (asString(r['list_type']) && r['list_type'] !== 'label') continue;
    const label = row(r['label']);
    if (!label) continue;
    const id = asNumber(r['id']);
    if (id === null) continue;
    lists.push({ id, name: asStringLoose(label['name']), color: (asString(label['color']) ?? '').replace(/^#/, '') });
  }
  return lists;
}

export async function listBoards(ctx: GitLabContext, forge: Forge): Promise<ForgeProjectsResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, projects: [], error: null, kind: 'ok' };

  const result = await glGet<unknown[]>(ctx, `projects/${projectId(forge)}/boards`, { per_page: 100 });
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      return { cli, projects: [], error: result.error, kind: 'insufficient-scope' };
    }
    return { cli, projects: [], error: result.error, kind: 'error' };
  }

  const projects: ForgeProject[] = asArray(result.data)
    .map((raw) => row(raw))
    .filter((r): r is Record<string, unknown> => r !== null)
    .map((r) => {
      const id = asId(r['id']);
      return {
        id,
        number: asNumber(r['id']) ?? 0,
        title: asStringLoose(r['name']),
        url: `https://${forge.host}/${forge.owner}/${forge.repo}/-/boards/${id}`,
        closed: false,
        // Every board a project-scoped `GET .../boards` returns belongs to
        // this repository — GitLab has no cross-project board the way a
        // GitHub org-wide ProjectV2 can be linked to many repos.
        linkedToRepo: true,
      };
    });
  return { cli, projects, error: null, kind: 'ok' };
}

export async function boardFields(
  ctx: GitLabContext,
  forge: Forge,
  boardId: string,
): Promise<ForgeProjectFieldsResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, fields: [], error: null, kind: 'ok' };

  const lists = await fetchLabelLists(ctx, forge, boardId);
  if (lists === null) return { cli, fields: [], error: 'Could not load this board’s lists.', kind: 'error' };

  const field: ForgeProjectField = {
    id: BOARD_FIELD_ID,
    name: 'List',
    dataType: 'single_select',
    options: lists.map((l) => ({ id: String(l.id), name: l.name, color: l.color })),
  };
  return { cli, fields: [field], error: null, kind: 'ok' };
}

export async function boardItems(
  ctx: GitLabContext,
  forge: Forge,
  boardId: string,
  cursor?: string,
): Promise<ForgeProjectItemsResult> {
  const cli = gitlabCliStatus(ctx);
  if (cli.reason !== 'ready') return { cli, items: [], nextCursor: null, error: null, kind: 'ok' };

  const lists = await fetchLabelLists(ctx, forge, boardId);
  if (lists === null) {
    return { cli, items: [], nextCursor: null, error: 'Could not load this board’s lists.', kind: 'error' };
  }
  if (lists.length === 0) return { cli, items: [], nextCursor: null, error: null, kind: 'ok' };

  // The cursor sweeps one list-page at a time: `${listIndex}:${page}`. This
  // is a real, resumable cursor — just shaped around GitLab's per-list
  // pagination rather than one flat page spanning every list the way a
  // GraphQL board read would return, because the REST boards API has no
  // single "every item on this board" endpoint.
  const [listIndexRaw, pageRaw] = (cursor ?? '0:1').split(':');
  let listIndex = Number.parseInt(listIndexRaw ?? '0', 10);
  const page = Number.parseInt(pageRaw ?? '1', 10);
  if (!Number.isFinite(listIndex) || listIndex < 0 || listIndex >= lists.length) listIndex = 0;

  const list = lists[listIndex]!;
  const result = await glGet<unknown[]>(
    ctx,
    `projects/${projectId(forge)}/boards/${boardId}/lists/${list.id}/issues`,
    { page: Number.isFinite(page) && page > 0 ? page : 1, per_page: ITEMS_PER_PAGE },
  );
  if (!result.ok) return { cli, items: [], nextCursor: null, error: result.error, kind: 'error' };

  const items: ForgeProjectItem[] = asArray(result.data)
    .map((raw) => row(raw))
    .filter((r): r is Record<string, unknown> => r !== null)
    .map((r) => {
      const iid = asNumber(r['iid']) ?? 0;
      const fieldValue: ForgeProjectFieldValue = {
        fieldId: BOARD_FIELD_ID,
        dataType: 'single_select',
        optionId: String(list.id),
        name: list.name,
      };
      return {
        id: String(iid),
        content: {
          type: 'issue',
          id: asId(r['id']),
          number: iid,
          repo: '',
          title: asStringLoose(r['title']),
          url: asString(r['web_url']) ?? '',
          state: mapIssueState(asString(r['state']) ?? 'opened'),
          assignees: asArray(r['assignees'])
            .map((a) => row(a)?.['username'])
            .filter((v): v is string => typeof v === 'string'),
          // The list-issues endpoint does not include the description, and
          // fetching it per item would be an N+1 this listing does not pay —
          // the board card composer (Phase 41 Theme G) is the one consumer
          // that would want it, and is out of this theme's scope.
          body: '',
          labels: asArray(r['labels']).filter((v): v is string => typeof v === 'string'),
          dependencies: EMPTY_ISSUE_LINK_SET,
          linkedPrs: [],
        },
        fieldValues: { [BOARD_FIELD_ID]: fieldValue },
      };
    });

  const cursorHeaders = result.headers;
  const nextPage = nextPageCursor(cursorHeaders);
  const nextCursor = nextPage !== null ? `${listIndex}:${nextPage}` : listIndex + 1 < lists.length ? `${listIndex + 1}:1` : null;

  return { cli, items, nextCursor, error: null, kind: 'ok' };
}

/**
 * Moves an issue between lists by rewriting its labels: strips every label
 * that names one of the board's own lists, then adds the target list's
 * label. GitLab has no board-item field to PATCH the way ProjectV2 does —
 * the label *is* the field.
 */
export async function setItemField(
  ctx: GitLabContext,
  forge: Forge,
  request: { projectId: string; itemId: string; fieldId: string; value: ForgeProjectFieldValue },
): Promise<ForgeProjectWriteResult> {
  const value = request.value;
  if (request.fieldId !== BOARD_FIELD_ID || value.dataType !== 'single_select') {
    return { ok: false, kind: 'error', message: 'GitLab boards only support setting the List field.' };
  }

  const lists = await fetchLabelLists(ctx, forge, request.projectId);
  if (lists === null) return { ok: false, kind: 'error', message: 'Could not load this board’s lists.' };
  const targetList = lists.find((l) => String(l.id) === value.optionId);
  if (!targetList) return { ok: false, kind: 'error', message: 'Unknown list.' };

  const issue = await glGet<Record<string, unknown>>(ctx, `projects/${projectId(forge)}/issues/${request.itemId}`);
  if (!issue.ok) {
    if (issue.status === 401 || issue.status === 403) {
      return { ok: false, kind: 'insufficient-scope', hint: 'This GitLab token needs the `api` scope.' };
    }
    return { ok: false, kind: 'error', message: issue.error };
  }

  const listLabelNames = new Set(lists.map((l) => l.name));
  const currentLabels = asArray(issue.data['labels']).filter((v): v is string => typeof v === 'string');
  const nextLabels = [...currentLabels.filter((name) => !listLabelNames.has(name)), targetList.name];

  const updated = await glPut(ctx, `projects/${projectId(forge)}/issues/${request.itemId}`, {
    labels: nextLabels.join(','),
  });
  if (!updated.ok) {
    if (updated.status === 401 || updated.status === 403) {
      return { ok: false, kind: 'insufficient-scope', hint: 'This GitLab token needs the `api` scope.' };
    }
    return { ok: false, kind: 'error', message: updated.error };
  }
  return { ok: true, kind: 'ok' };
}
