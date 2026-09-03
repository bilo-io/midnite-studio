import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { SetupDialog } from './setup-dialog';

function installBridge(overrides: Partial<MidniteStudioBridge['scaffold']> = {}) {
  const plan = vi.fn();
  const apply = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    scaffold: { plan, apply, ...overrides } as unknown as MidniteStudioBridge['scaffold'],
  } as Partial<MidniteStudioBridge>;
  return { plan, apply };
}

const PLAN = {
  targetRoot: '/tmp/repo',
  templateVersion: '1.0.0',
  entries: [
    { path: '.claude/skills/midnite-exec/SKILL.md', status: 'create' as const, bytes: 10 },
    { path: '.midnite/tasks/_INDEX.md', status: 'stale' as const, bytes: 20 },
    { path: 'CLAUDE.md', status: 'locally-edited' as const, bytes: 30 },
    { path: 'AGENTS.md', status: 'unchanged' as const, bytes: 40 },
  ],
};

describe('SetupDialog', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('shows a loading state, then the plan grouped by status', async () => {
    const { plan } = installBridge();
    plan.mockResolvedValue({ ok: true, value: PLAN });

    render(
      <SetupDialog repoId="r1" repoName="midnite-studio" hasExistingKit={false} onClose={vi.fn()} />,
    );

    expect(screen.getByText(/Reading the template/)).toBeDefined();
    expect(await screen.findByText('.claude/skills/midnite-exec/SKILL.md')).toBeDefined();
    expect(screen.getByText('.midnite/tasks/_INDEX.md')).toBeDefined();
    expect(screen.getByText('CLAUDE.md')).toBeDefined();
    expect(screen.getByText('AGENTS.md')).toBeDefined();
    expect(plan).toHaveBeenCalledWith({ repoId: 'r1' });
  });

  it('reads "Set up this repo" for a repo with no existing kit, and the update wording otherwise', async () => {
    const { plan } = installBridge();
    plan.mockResolvedValue({ ok: true, value: { ...PLAN, entries: [] } });

    const { rerender } = render(
      <SetupDialog repoId="r1" repoName="repo" hasExistingKit={false} onClose={vi.fn()} />,
    );
    expect(await screen.findByRole('dialog', { name: 'Set up this repo' })).toBeDefined();

    rerender(<SetupDialog repoId="r1" repoName="repo" hasExistingKit={true} onClose={vi.fn()} />);
    expect(await screen.findByRole('dialog', { name: 'Update onboarding kit' })).toBeDefined();
  });

  it('reports the locally-edited count as excluded from the write, before Apply', async () => {
    const { plan } = installBridge();
    plan.mockResolvedValue({ ok: true, value: PLAN });

    render(<SetupDialog repoId="r1" repoName="repo" hasExistingKit={false} onClose={vi.fn()} />);

    expect(await screen.findByText(/1 file locally edited, excluded from the write/)).toBeDefined();
  });

  it('Apply sends only create/stale paths, never the locally-edited or unchanged ones', async () => {
    const { plan, apply } = installBridge();
    plan.mockResolvedValue({ ok: true, value: PLAN });
    apply.mockResolvedValue({ ok: true, value: { written: [], skipped: [] } });
    render(<SetupDialog repoId="r1" repoName="repo" hasExistingKit={false} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));

    expect(apply).toHaveBeenCalledWith({
      repoId: 'r1',
      paths: ['.claude/skills/midnite-exec/SKILL.md', '.midnite/tasks/_INDEX.md'],
    });
  });

  it('shows the result state after Apply, including a skipped reason', async () => {
    const { plan, apply } = installBridge();
    plan.mockResolvedValue({ ok: true, value: PLAN });
    apply.mockResolvedValue({
      ok: true,
      value: {
        written: ['.claude/skills/midnite-exec/SKILL.md'],
        skipped: [{ path: '.midnite/tasks/_INDEX.md', reason: 'changed on disk since the plan was read' }],
      },
    });
    render(<SetupDialog repoId="r1" repoName="repo" hasExistingKit={false} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('1 written.')).toBeDefined();
    expect(screen.getByText(/1 skipped/)).toBeDefined();
    expect(screen.getByText('changed on disk since the plan was read', { exact: false })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDefined();
  });

  it('renders the plan failure reason rather than a generic error', async () => {
    const { plan } = installBridge();
    plan.mockResolvedValue({ ok: false, kind: 'error', message: 'Disk is full.' });

    render(<SetupDialog repoId="r1" repoName="repo" hasExistingKit={false} onClose={vi.fn()} />);

    expect(await screen.findByText('Disk is full.')).toBeDefined();
  });
});
