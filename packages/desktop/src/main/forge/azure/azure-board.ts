import {
  EMPTY_ISSUE_LINK_SET,
  type Forge,
  type ForgeAccount,
  type ForgeProject,
  type ForgeProjectField,
  type ForgeProjectFieldsResult,
  type ForgeProjectFieldValue,
  type ForgeProjectItem,
  type ForgeProjectItemsResult,
  type ForgeProjectsResult,
  type ForgeProjectWriteResult,
} from '@midnite/studio-shared';

import { azGet, azPost, azWorkItemPatch, azureCliStatus, defaultTeamFor, stateCategoriesFor } from './azure-client';
import { asId, asNumber, asStringLoose, fields, row } from './azure-json';
import { mapWorkItemStateCategory } from './azure-mappers';

/**
 * Azure Boards → `ForgeProject`, Theme G's own analogue of `gitlab-board.ts`'s
 * Issue Boards mapping — the phase doc calls Boards "the best board fidelity
 * of the three new providers", and this is the one genuine advantage over
 * GitLab's label-backed columns: a Kanban column's `stateMappings` is a real,
 * per-work-item-type `{witName: stateName}` table the Boards Columns API
 * hands back directly, so an item's column is computed from its own
 * `System.WorkItemType`/`System.State` with no second per-item lookup — no
 * WEF-prefixed reportable field, no OData.
 *
 * **Scoped to the project's default team** (`azure-client.ts`'s
 * `defaultTeamFor`) — Azure Boards nests under `{org}/{project}/{team}`, and
 * the public REST API has no "every team's boards" listing. A genuinely
 * multi-team project would need a team picker this theme does not build; the
 * common single-team project (the default `{project} Team` Azure creates)
 * is what this reads. **Queries and backlogs are out of scope** (the phase
 * doc's own line) — `boardItems` below reads every work item in the project
 * and buckets it by column, not a saved query or a filtered backlog view.
 *
 * **Unverified against a live organization** — same caveat every adapter in
 * this phase carries for its least-common endpoint (`gitlab-read.ts`'s
 * `scopeQuery`, `azure-reads.ts`'s `fetchPrDiff`): Boards Columns'
 * `stateMappings` shape is documented but this app has not exercised it
 * end to end.
 */

const BOARD_FIELD_ID = 'column';
const ITEMS_PER_PAGE = 200;

type BoardColumn = { id: string; name: string; stateMappings: Record<string, string> };

async function fetchColumnsForTeam(
  forge: Forge,
  account: ForgeAccount | null,
  team: string,
  boardId: string,
): Promise<BoardColumn[] | null> {
  const result = await azGet<{ value?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(
    forge,
    account,
    `work/boards/${encodeURIComponent(boardId)}/columns`,
    undefined,
    { team },
  );
  if (!result.ok) return null;
  const raw = Array.isArray(result.data) ? result.data : (result.data.value ?? []);

  const columns: BoardColumn[] = [];
  for (const entry of raw) {
    const r = row(entry);
    if (!r) continue;
    const id = asId(r['id']) || asStringLoose(r['name']);
    const stateMappingsRaw = row(r['stateMappings']) ?? {};
    const stateMappings: Record<string, string> = {};
    for (const [type, state] of Object.entries(stateMappingsRaw)) {
      if (typeof state === 'string') stateMappings[type] = state;
    }
    columns.push({ id, name: asStringLoose(r['name']), stateMappings });
  }
  return columns;
}

export async function listBoards(forge: Forge, account: ForgeAccount | null): Promise<ForgeProjectsResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, projects: [], error: null, kind: 'ok' };

  const team = await defaultTeamFor(forge, account);
  if (!team) return { cli, projects: [], error: 'Could not resolve this project’s default team.', kind: 'error' };

  const result = await azGet<{ value?: Array<Record<string, unknown>> }>(forge, account, 'work/boards', undefined, { team });
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      return { cli, projects: [], error: result.error, kind: 'insufficient-scope' };
    }
    return { cli, projects: [], error: result.error, kind: 'error' };
  }

  const boardsUrl = `https://${forge.host}/${forge.owner}/_boards`;
  const projects: ForgeProject[] = (result.data.value ?? [])
    .map((raw, index) => {
      const r = row(raw);
      if (!r) return null;
      const id = asId(r['id']) || asStringLoose(r['name']);
      const project: ForgeProject = {
        id,
        // Azure boards have no numeric ordinal of their own (each board's
        // `id` is the backlog-level name, e.g. "Stories") — a 1-based index
        // over the listing is the same synthetic surrogate GitLab's own
        // `listBoards` falls back to when a provider's id is not numeric.
        number: index + 1,
        title: asStringLoose(r['name']),
        url: `${boardsUrl}/board/t/${encodeURIComponent(team)}/${encodeURIComponent(id)}`,
        closed: false,
        // Boards are project-wide, never linked to one repository the way a
        // GitHub ProjectV2 can be scoped — the same "always true" answer
        // `gitlab-board.ts` gives for GitLab's own project-scoped Issue Boards.
        linkedToRepo: true,
      };
      return project;
    })
    .filter((p): p is ForgeProject => p !== null);

  return { cli, projects, error: null, kind: 'ok' };
}

export async function boardFields(
  forge: Forge,
  account: ForgeAccount | null,
  boardId: string,
): Promise<ForgeProjectFieldsResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, fields: [], error: null, kind: 'ok' };

  const team = await defaultTeamFor(forge, account);
  if (!team) return { cli, fields: [], error: 'Could not resolve this project’s default team.', kind: 'error' };

  const columns = await fetchColumnsForTeam(forge, account, team, boardId);
  if (columns === null) return { cli, fields: [], error: 'Could not load this board’s columns.', kind: 'error' };

  const field: ForgeProjectField = {
    id: BOARD_FIELD_ID,
    name: 'Column',
    dataType: 'single_select',
    options: columns.map((c) => ({ id: c.id, name: c.name, color: '' })),
  };
  return { cli, fields: [field], error: null, kind: 'ok' };
}

export async function boardItems(
  forge: Forge,
  account: ForgeAccount | null,
  boardId: string,
  cursor?: string,
): Promise<ForgeProjectItemsResult> {
  const cli = await azureCliStatus(account);
  if (cli.reason !== 'ready') return { cli, items: [], nextCursor: null, error: null, kind: 'ok' };

  const team = await defaultTeamFor(forge, account);
  if (!team) return { cli, items: [], nextCursor: null, error: 'Could not resolve this project’s default team.', kind: 'error' };

  const columns = await fetchColumnsForTeam(forge, account, team, boardId);
  if (columns === null) return { cli, items: [], nextCursor: null, error: 'Could not load this board’s columns.', kind: 'error' };
  if (columns.length === 0) return { cli, items: [], nextCursor: null, error: null, kind: 'ok' };

  // Every work item type any column maps — the board's own applicable
  // backlog types, read off the columns' state mappings rather than a
  // second backlog-configuration call.
  const types = [...new Set(columns.flatMap((c) => Object.keys(c.stateMappings)))];
  if (types.length === 0) return { cli, items: [], nextCursor: null, error: null, kind: 'ok' };

  const page = Number.parseInt(cursor ?? '1', 10) || 1;
  const typeList = types.map((t) => `'${t.replace(/'/g, "''")}'`).join(',');
  const query = `SELECT TOP ${ITEMS_PER_PAGE * page} [System.Id] FROM WorkItems WHERE [System.WorkItemType] IN (${typeList}) ORDER BY [System.ChangedDate] DESC`;

  const queried = await azPost<{ workItems?: Array<{ id?: unknown }> }>(forge, account, 'wit/wiql', { query });
  if (!queried.ok) return { cli, items: [], nextCursor: null, error: queried.error, kind: 'error' };

  const allIds = (queried.data.workItems ?? []).map((w) => asId(row(w)?.['id'])).filter((id) => id.length > 0);
  const pageIds = allIds.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  if (pageIds.length === 0) return { cli, items: [], nextCursor: null, error: null, kind: 'ok' };

  const hydrated = await azGet<{ value?: unknown[] }>(forge, account, 'wit/workitems', {
    ids: pageIds.join(','),
    fields: 'System.Id,System.Title,System.State,System.WorkItemType,System.AssignedTo,System.Tags',
  });
  if (!hydrated.ok) return { cli, items: [], nextCursor: null, error: hydrated.error, kind: 'error' };

  const items: ForgeProjectItem[] = [];
  for (const raw of hydrated.data.value ?? []) {
    const f = fields(raw);
    const type = asStringLoose(f['System.WorkItemType']);
    const stateName = asStringLoose(f['System.State']);
    const column = columns.find((c) => c.stateMappings[type] === stateName);
    if (!column) continue; // Not currently mapped onto any visible column — off-board by construction, not an error.

    const id = asId(f['System.Id']) || asId(row(raw)?.['id']);
    const iid = asNumber(f['System.Id']) ?? asNumber(row(raw)?.['id']) ?? 0;
    const categories = await stateCategoriesFor(forge, account, type);
    const fieldValue: ForgeProjectFieldValue = {
      fieldId: BOARD_FIELD_ID,
      dataType: 'single_select',
      optionId: column.id,
      name: column.name,
    };
    const assignedTo = row(f['System.AssignedTo']);
    const assignee = assignedTo ? asStringLoose(assignedTo['uniqueName']) || asStringLoose(assignedTo['displayName']) : '';

    items.push({
      id,
      content: {
        type: 'issue',
        id,
        number: iid,
        repo: '',
        title: asStringLoose(f['System.Title']),
        url: `https://${forge.host}/${forge.owner}/_workitems/edit/${id}`,
        state: mapWorkItemStateCategory(categories?.get(stateName) ?? null),
        assignees: assignee ? [assignee] : [],
        body: '',
        labels: asStringLoose(f['System.Tags'])
          .split(';')
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
        dependencies: EMPTY_ISSUE_LINK_SET,
        linkedPrs: [],
      },
      fieldValues: { [BOARD_FIELD_ID]: fieldValue },
    });
  }

  const nextCursor = allIds.length > page * ITEMS_PER_PAGE ? String(page + 1) : null;
  return { cli, items, nextCursor, error: null, kind: 'ok' };
}

/**
 * Moves a work item between columns by writing the column's own mapped
 * `System.State` for that item's type — the reverse of `boardItems`'s own
 * lookup, and the reason Boards Columns' `stateMappings` is the whole design
 * here (no label rewrite the way `gitlab-board.ts`'s `setItemField` needs).
 */
export async function setItemField(
  forge: Forge,
  account: ForgeAccount | null,
  request: { projectId: string; itemId: string; fieldId: string; value: ForgeProjectFieldValue },
): Promise<ForgeProjectWriteResult> {
  const value = request.value;
  if (request.fieldId !== BOARD_FIELD_ID || value.dataType !== 'single_select') {
    return { ok: false, kind: 'error', message: 'Azure Boards only support setting the Column field.' };
  }

  const team = await defaultTeamFor(forge, account);
  if (!team) return { ok: false, kind: 'error', message: 'Could not resolve this project’s default team.' };

  const columns = await fetchColumnsForTeam(forge, account, team, request.projectId);
  if (columns === null) return { ok: false, kind: 'error', message: 'Could not load this board’s columns.' };
  const targetColumn = columns.find((c) => c.id === value.optionId);
  if (!targetColumn) return { ok: false, kind: 'error', message: 'Unknown column.' };

  const item = await azGet<Record<string, unknown>>(forge, account, `wit/workitems/${request.itemId}`, {
    fields: 'System.WorkItemType',
  });
  if (!item.ok) {
    if (item.status === 401 || item.status === 403) {
      return { ok: false, kind: 'insufficient-scope', hint: 'This Azure DevOps PAT needs the Work Items (read & write) scope.' };
    }
    return { ok: false, kind: 'error', message: item.error ?? 'Could not load this work item.' };
  }

  const type = asStringLoose(fields(item.data)['System.WorkItemType']);
  const targetState = targetColumn.stateMappings[type];
  if (!targetState) {
    return { ok: false, kind: 'error', message: `This column has no state mapped for "${type}".` };
  }

  const patched = await azWorkItemPatch(forge, account, `wit/workitems/${request.itemId}`, [
    { op: 'add', path: '/fields/System.State', value: targetState },
  ]);
  if (!patched.ok) {
    if (patched.status === 401 || patched.status === 403) {
      return { ok: false, kind: 'insufficient-scope', hint: 'This Azure DevOps PAT needs the Work Items (read & write) scope.' };
    }
    return { ok: false, kind: 'error', message: patched.error ?? 'Could not update this work item’s state.' };
  }
  return { ok: true, kind: 'ok' };
}
