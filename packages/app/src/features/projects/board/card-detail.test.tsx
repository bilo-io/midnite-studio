import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ForgeIssueRef, ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { EMPTY_ISSUE_LINK_SET } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { CardDetail } from './card-detail';

afterEach(cleanup);

const setField = vi.fn();

const NO_OPS = {
  createIssue: false,
  editIssue: false,
  deleteIssue: false,
  createProject: false,
  editProject: false,
  deleteProject: false,
  addProjectItem: false,
  removeProjectItem: false,
  linkBlockedBy: false,
  linkSubIssue: false,
};
const NO_CAPABILITY = {
  pulls: 'none' as const,
  issues: 'none' as const,
  checks: 'none' as const,
  projects: 'none' as const,
  threadResolution: 'none' as const,
  requestChanges: 'none' as const,
  repoListing: 'none' as const,
  ops: NO_OPS,
};
const FULL_CAPABILITY = { ...NO_CAPABILITY, ops: { ...NO_OPS, editIssue: true, deleteIssue: true } };
const capabilities = vi.fn(async () => NO_CAPABILITY);
const remotesList = vi.fn(async () => [
  {
    name: 'origin',
    fetchUrl: 'https://github.com/acme/widgets.git',
    pushUrl: 'https://github.com/acme/widgets.git',
    forge: { kind: 'github' as const, host: 'github.com', owner: 'acme', repo: 'widgets' },
  },
]);
let repoSkills: { name: string; description: string; source: '.claude' }[] = [];
const listRepoSkills = vi.fn(async (_req: { repoId: string; agentId?: string }) => ({
  ok: true as const,
  value: { skills: repoSkills },
}));
vi.mock('../../../services/bridge', () => ({
  bridge: () => ({
    scaffold: { listRepoSkills },
    forgeProject: { setField },
    forgeAccounts: { capabilities },
    remotes: { list: remotesList },
    terminal: { list: vi.fn(async () => ({ sessions: [] })), save: vi.fn() },
    agent: { list: vi.fn(async () => ({ agents: [], status: [] })) },
  }),
  hasBridge: () => true,
}));

let forgeWritesEnabled = true;
const setCardSkill = vi.fn();
let cardSkillByTask: Record<string, string> = {};
function makeUseUiStore() {
  const useUiStoreFn = (
    selector: (state: {
      forgeWritesEnabled: boolean;
      cardSkillByTask: Record<string, string>;
      setCardSkill: typeof setCardSkill;
      primaryAgent: string;
      agentSkills: Record<string, string>;
    }) => unknown,
  ) =>
    selector({
      forgeWritesEnabled,
      cardSkillByTask,
      setCardSkill,
      primaryAgent: 'claude',
      agentSkills: {
        execBacklog: '/midnite-create',
        execAdhoc: '/midnite-create-adhoc',
        addressIssue: '/midnite-address-issue',
        brainstorm: '/midnite-ideate',
        refine: '/midnite-refine',
        verifyPhase: '/midnite-verify',
        execSwarm: '/midnite-swarm',
      },
    });
  // `Modal`'s own `useDismiss`/`useFocusTrap` read the occluder counter
  // through `useUiStore.getState()` directly (not the hook), which only
  // fires once a dialog this test mounts actually opens — Theme E's
  // `IssueDialog` is the first thing in this file to do that.
  useUiStoreFn.getState = () => ({ incrementOccluders: () => {}, decrementOccluders: () => {} });
  return useUiStoreFn;
}
vi.mock('../../../store/ui-store', () => ({ useUiStore: makeUseUiStore() }));

const statusField: ForgeProjectField = {
  id: 'f-status',
  name: 'Status',
  dataType: 'single_select',
  options: [{ id: 'todo', name: 'Todo', color: 'GRAY' }],
};
const priorityField: ForgeProjectField = { id: 'f-priority', name: 'Priority', dataType: 'text' };

const item: ForgeProjectItem = {
  id: 'item1',
  content: {
    type: 'issue',
    id: 'I_1',
    number: 42,
    repo: '',
    title: 'Fix the flaky test',
    url: 'https://github.com/acme/widgets/issues/42',
    state: 'open',
    assignees: ['octocat'],
    body: 'Steps to reproduce…',
    labels: ['bug'],
    dependencies: EMPTY_ISSUE_LINK_SET,
    linkedPrs: [],
  },
  fieldValues: {
    'f-status': { fieldId: 'f-status', dataType: 'single_select', optionId: 'todo', name: 'Todo' },
    'f-priority': { fieldId: 'f-priority', dataType: 'text', text: 'High' },
  },
};

function renderDetail(
  onClose = vi.fn(),
  overrides: {
    repoId?: string | null;
    worktreePath?: string;
    blockers?: readonly ForgeIssueRef[];
    item?: ForgeProjectItem;
  } = {},
) {
  // Distinguishes "key absent, use the default" from "key present as
  // `undefined`" — the no-worktree test needs the latter, and `??` cannot
  // tell them apart.
  const repoId = 'repoId' in overrides ? overrides.repoId! : 'repo-1';
  const worktreePath = 'worktreePath' in overrides ? overrides.worktreePath : '/repo';
  const itemToRender = overrides.item ?? item;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <CardDetail
          projectId="PVT_1"
          repoId={repoId}
          worktreePath={worktreePath}
          item={itemToRender}
          fields={[statusField, priorityField]}
          onClose={onClose}
          blockers={overrides.blockers}
        />
      </DialogHost>
    </QueryClientProvider>,
  );
}

describe('CardDetail', () => {
  beforeEach(() => {
    setField.mockReset();
    setCardSkill.mockReset();
    listRepoSkills.mockClear();
    repoSkills = [];
    forgeWritesEnabled = true;
    cardSkillByTask = {};
    capabilities.mockReset();
    capabilities.mockResolvedValue(NO_CAPABILITY);
  });

  it('renders the title, the number linked to github.com, and assignees', () => {
    renderDetail();

    expect(screen.getByText('Fix the flaky test')).toBeDefined();
    expect(screen.getByText(/Issue/)).toBeDefined();
    const link = screen.getByText('#42').closest('a');
    expect(link?.getAttribute('href')).toBe('https://github.com/acme/widgets/issues/42');
    expect(screen.getByText('octocat')).toBeDefined();
  });

  it('renders linked PRs when present', () => {
    if (item.content.type !== 'issue') throw new Error('expected issue');
    const itemWithPrs: ForgeProjectItem = {
      ...item,
      content: {
        ...item.content,
        linkedPrs: [
          { number: 10, url: 'https://github.com/acme/widgets/pull/10' },
          { number: 12, url: 'https://github.com/acme/widgets/pull/12' },
        ],
      },
    };
    renderDetail(vi.fn(), { item: itemWithPrs });

    expect(screen.getByText(/PRs:/)).toBeDefined();
    const pr10 = screen.getByText('#10').closest('a');
    expect(pr10?.getAttribute('href')).toBe('https://github.com/acme/widgets/pull/10');
    const pr12 = screen.getByText('#12').closest('a');
    expect(pr12?.getAttribute('href')).toBe('https://github.com/acme/widgets/pull/12');
  });

  it('renders every field, editable through the same editor the table uses', () => {
    renderDetail();

    expect(screen.getByRole('combobox', { name: 'Status' })).toBeDefined();
    expect((screen.getByRole('textbox', { name: 'Priority' }) as HTMLInputElement).value).toBe('High');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderDetail(onClose);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('renders the agent composer when a repo checkout is open', () => {
    renderDetail();
    expect(screen.getByTestId('card-composer')).toBeDefined();
    expect(screen.getByTestId('card-start')).toBeDefined();
  });

  it('shows a placeholder instead of the composer when no worktree is selected', () => {
    renderDetail(vi.fn(), { worktreePath: undefined });
    expect(screen.queryByTestId('card-composer')).toBeNull();
    expect(screen.getByText(/Select a repo checkout/)).toBeDefined();
  });

  it('forwards blockers to the composer, disabling Start (Phase 75 Theme G)', () => {
    renderDetail(vi.fn(), { blockers: [{ repo: '', number: 199 }] });

    const start = screen.getByTestId('card-start');
    expect(start).toHaveProperty('disabled', true);
    expect(start.getAttribute('title')).toBe('Blocked by #199');
  });

  describe('the Skill picker — a combobox over the repo\'s own skills', () => {
    const MIDNITE = [
      { name: 'midnite-refine', description: 'Deepen a phase doc.', source: '.claude' as const },
      { name: 'midnite-create', description: 'Build a phase slice and merge it.', source: '.claude' as const },
      { name: 'midnite-create-adhoc', description: 'Build a one-off task.', source: '.claude' as const },
      { name: 'graphify', description: 'Knowledge graph.', source: '.claude' as const },
    ];
    const combobox = () => screen.getByRole('combobox', { name: 'Skill' }) as HTMLInputElement;

    it('prepopulates with /midnite-create-adhoc for an ad hoc card nobody has chosen for', () => {
      renderDetail();
      expect(combobox().value).toBe('/midnite-create-adhoc');
    });

    it('prepopulates with /midnite-create for a card whose title names a phase', () => {
      renderDetail(vi.fn(), { item: { ...item, content: { ...item.content, title: 'Phase 98 Theme D' } } as ForgeProjectItem });
      expect(combobox().value).toBe('/midnite-create');
    });

    it("shows the card's own stored text, verbatim, and maps a legacy command id to its template", () => {
      cardSkillByTask = { 'PVT_1:item1': '/midnite-create 98 D' };
      renderDetail();
      expect(combobox().value).toBe('/midnite-create 98 D');
      cleanup();

      cardSkillByTask = { 'PVT_1:item1': 'brainstorm' };
      renderDetail();
      expect(combobox().value).toBe('/midnite-ideate');
    });

    it('prepopulates an unchosen card with the most recently used skill on any card', () => {
      cardSkillByTask = { 'PVT_1:other': '/midnite-refine', 'PVT_1:newest': '/midnite-verify 12' };
      renderDetail();
      expect(combobox().value).toBe('/midnite-verify 12');
    });

    it('asks main for the repo skills and lists the midnite ones first, with descriptions', async () => {
      repoSkills = MIDNITE;
      renderDetail();
      expect(listRepoSkills).toHaveBeenCalledWith({ repoId: 'repo-1', agentId: 'claude' });

      fireEvent.click(combobox());
      const listbox = await screen.findByRole('listbox', { name: 'Skill suggestions' });
      await screen.findByText('midnite-create');
      const groups = [...listbox.querySelectorAll('[role="group"]')].map(
        (group) => group.querySelector('[role="presentation"]')?.textContent,
      );
      expect(groups).toEqual(['Midnite skills', 'Other repo skills']);
      const options = within(listbox).getAllByRole('option').map((option) => option.querySelector('.font-mono')?.textContent);
      expect(options).toEqual(['midnite-create', 'midnite-create-adhoc', 'midnite-refine', 'graphify']);
      expect(screen.getByText('Build a one-off task.')).toBeDefined();
    });

    it('falls back to the built-in task catalogue when the repo has no midnite skills', async () => {
      repoSkills = [];
      renderDetail();
      fireEvent.click(combobox());
      expect(await screen.findByText('Adhoc Task')).toBeDefined();
      expect(screen.getByText('Backlog Task')).toBeDefined();
      expect(screen.queryByText('PR Review')).toBeNull();
    });

    it('picking a suggestion persists its /name under the composite key', async () => {
      repoSkills = MIDNITE;
      renderDetail();
      fireEvent.click(combobox());
      fireEvent.click(await screen.findByText('midnite-refine'));
      expect(setCardSkill).toHaveBeenCalledWith('PVT_1:item1', '/midnite-refine');
    });

    it('typed free text is committed verbatim on Enter', () => {
      renderDetail();
      fireEvent.change(combobox(), { target: { value: "midnite-create 98 D --note 'it's'" } });
      fireEvent.keyDown(combobox(), { key: 'Enter' });
      expect(setCardSkill).toHaveBeenCalledWith('PVT_1:item1', "midnite-create 98 D --note 'it's'");
    });
  });

  describe('Edit issue (Phase 95 Theme E)', () => {
    it('has no Edit button when the capability grants no issue write', async () => {
      renderDetail();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.queryByRole('button', { name: 'Edit issue' })).toBeNull();
    });

    it('opens IssueDialog on the current issue when the capability allows it', async () => {
      // `mockResolvedValue`, not `-Once` — `useActiveForgeCapability` queries
      // twice (once for the transient `'unknown'` kind before `useRemotes`
      // resolves, once for the real `'github'` kind after), and a `-Once`
      // override would be consumed by the first, leaving the button gated on
      // the default no-ops answer.
      capabilities.mockResolvedValue(FULL_CAPABILITY);
      renderDetail();

      const editButton = await screen.findByRole('button', { name: 'Edit issue' });
      fireEvent.click(editButton);

      expect(await screen.findByText('Edit issue #42')).toBeDefined();
    });
  });
});
