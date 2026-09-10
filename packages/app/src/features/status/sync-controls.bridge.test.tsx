import type { BranchStatus } from '@midnite/studio-shared';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import type { StatusTarget } from '../../services/use-status';
import { useTerminalStore } from '../terminal/terminal-store';
import { SyncControls } from './sync-controls';

/**
 * Migrated from `e2e/sync-button.spec.ts` (Phase 82 Theme C, wave 5) — the
 * button's label/count reading, the fetch→pull→push ordering, publishing an
 * unpublished branch, stopping at a conflicted pull with the files named, and
 * handing the repair to Claude in a terminal without running it. 6 of the
 * original 7 tests moved here; 1 stays in Playwright, below.
 *
 * Wrapped in `<ToastHost>` (not part of `renderView`'s own provider stack):
 * `useTargetedGitOp` (`services/use-status.ts`) calls `useToasts()`
 * unconditionally, and mounting `SyncControls` bare throws
 * "useToasts must be used inside <ToastHost>" the moment a sync runs — the
 * same reasoning `status-panel.bridge.test.tsx` already documents for the
 * same hook.
 *
 * **1 of the original 7 stays in Playwright.** "the rail names the file
 * browser Explorer, not Files or Folder" is not about `SyncControls` at all —
 * it asserts on the whole nav rail (`getByRole('link', {name: …})`), which
 * `renderView` never mounts. Left in `e2e/sync-button.spec.ts` as the file's
 * own surviving smoke test.
 *
 * **"hands the repair to Claude" reads `useTerminalStore` rather than the
 * bridge's `window.__mstudioPty`.** `startClaude` (`start-claude.ts` →
 * `start-agent.ts`) only ever calls `useTerminalStore.getState().openSession`
 * + `.queueInput` — the actual `pty.create` bridge call is a side effect of
 * the terminal PANEL noticing the new queued session and creating a real pty
 * for it, which lives entirely outside `SyncControls` and is never mounted
 * here. The store write is exactly what the e2e assertion is really about
 * (a session queued, not yet run, carrying the right prompt) and is fully
 * reachable under jsdom with no terminal UI at all — asserting on it is a
 * substitution for the *mechanism*, not a weaker version of the *assertion*.
 */

const target: StatusTarget = { repoId: 'repo-1', worktreePath: '/tmp/midnite-studio' };

function renderSync(branch: BranchStatus, data: MockFixtures = fixtures) {
  return renderView(
    <ToastHost>
      <SyncControls target={target} branch={branch} />
    </ToastHost>,
    { fixtures: data },
  );
}

const opCalls = () =>
  (window as unknown as { __mstudioOps: { op: string; args: unknown }[] }).__mstudioOps;

const syncButton = () => screen.getByRole('button', { name: /^Sync —|^Publish branch —|^Fetch —/ });

beforeEach(() => {
  useTerminalStore.setState({ sessions: [], pendingInput: {} });
});

afterEach(cleanup);

describe('SyncControls, assembled through the real bridge', () => {
  it('carries the plan in its accessible name and the counts as text', () => {
    renderSync({
      head: 'main',
      oid: 'a'.repeat(40),
      upstream: 'origin/main',
      ahead: 2,
      behind: 3,
      unborn: false,
      detached: false,
    });

    // The label is the whole plan, so the click is never a surprise. (The
    // e2e original also asserted no bare Push/Pull buttons exist elsewhere in
    // the app — trivially true here, since `SyncControls` is the only thing
    // mounted, so that half of the assertion carries no information under a
    // component-only render and is not restated.)
    const button = screen.getByRole('button', { name: 'Sync — Fetch, then pull 3 and push 2.' });
    expect(button).toBeTruthy();
    expect(button.textContent).toContain('↑2');
    expect(button.textContent).toContain('↓3');
  });

  it('fetches, then pulls, then pushes — in that order', async () => {
    renderSync({
      head: 'main',
      oid: 'a'.repeat(40),
      upstream: 'origin/main',
      ahead: 2,
      behind: 3,
      unborn: false,
      detached: false,
    });

    fireEvent.click(syncButton());

    await waitFor(() => expect(opCalls().map((c) => c.op)).toEqual(['fetch', 'pull', 'push']));
  });

  it('publishes an unpublished branch rather than silently doing nothing', async () => {
    renderSync({
      head: 'feature/x',
      oid: 'a'.repeat(40),
      upstream: null,
      ahead: 0,
      behind: 0,
      unborn: false,
      detached: false,
    });

    const publish = screen.getByRole('button', { name: /^Publish branch/ });
    expect(publish.textContent).toContain('publish');
    fireEvent.click(publish);

    // `-u`, because the branch has no upstream to push to yet.
    await waitFor(() =>
      expect(opCalls()).toMatchObject([
        { op: 'fetch' },
        { op: 'push', args: { setUpstream: true } },
      ]),
    );
  });

  it('stops at a conflicted pull and names the repair in the button', async () => {
    renderSync(
      {
        head: 'main',
        oid: 'a'.repeat(40),
        upstream: 'origin/main',
        ahead: 2,
        behind: 3,
        unborn: false,
        detached: false,
      },
      {
        ...fixtures,
        opResults: {
          pull: { ok: false, kind: 'conflict', op: 'merge', files: ['src/a.ts', 'src/b.ts'] },
        },
      },
    );

    fireEvent.click(syncButton());

    const dialog = await screen.findByRole('dialog');
    expect(
      screen.getByRole('heading', { name: 'The pull left 2 files conflicted' }),
    ).toBeTruthy();
    // The files are named. "Something conflicted" is not a state anyone can act on.
    expect(dialog.textContent).toContain('src/a.ts');

    // No push after a conflicted pull: it would push a half-merged tree.
    await waitFor(() => expect(opCalls().map((c) => c.op)).toEqual(['fetch', 'pull']));
  });

  it('hands the repair to Claude, in a terminal, without running it', async () => {
    renderSync(
      {
        head: 'main',
        oid: 'a'.repeat(40),
        upstream: 'origin/main',
        ahead: 2,
        behind: 3,
        unborn: false,
        detached: false,
      },
      {
        ...fixtures,
        opResults: {
          pull: { ok: false, kind: 'conflict', op: 'merge', files: ['src/a.ts'] },
        },
      },
    );

    fireEvent.click(syncButton());
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resolve the 1 merge conflict with Claude' }),
    );

    await waitFor(() => expect(useTerminalStore.getState().sessions.at(-1)).toMatchObject({
      kind: 'agent',
      agentId: 'claude',
    }));

    // Exactly one, from a cold terminal.
    const sessions = useTerminalStore.getState().sessions;
    expect(sessions).toHaveLength(1);

    const session = sessions[0]!;
    const typed = useTerminalStore.getState().pendingInput[session.id] ?? '';
    expect(typed).toContain('src/a.ts');
    expect(typed).toContain('Never force-push');
    // Single-quoted, so the backticked `git pull` in the prompt is text rather
    // than a command substitution the shell would run.
    expect(typed).toMatch(/^claude '/);
    // And NOT executed: the user's Return is the confirmation.
    expect(typed.endsWith('\r')).toBe(false);
  });

  it('offers a rebase when the push is rejected, not a force-push', async () => {
    renderSync(
      {
        head: 'main',
        oid: 'a'.repeat(40),
        upstream: 'origin/main',
        ahead: 2,
        behind: 0,
        unborn: false,
        detached: false,
      },
      {
        ...fixtures,
        opResults: {
          push: {
            ok: false,
            kind: 'error',
            message: 'The push was rejected.',
            stderr:
              'hint: Updates were rejected because the remote contains work (non-fast-forward)',
          },
        },
      },
    );

    fireEvent.click(syncButton());

    const dialog = await screen.findByRole('dialog');
    expect(
      screen.getByRole('button', { name: 'Rebase onto origin/main and push, with Claude' }),
    ).toBeTruthy();
    // Nowhere in the dialog is force offered, in any casing.
    expect(dialog.textContent).not.toMatch(/force/i);
  });
});
