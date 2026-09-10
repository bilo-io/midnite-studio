import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { VideoView } from './video-view';

/**
 * Migrated from `e2e/video-studio.spec.ts` (Phase 82 Theme C, wave 5).
 *
 * `video-file-list.test.tsx`/`video-project-detail.test.tsx`/
 * `video-project-list.test.tsx`/`video-studio-pane.test.tsx` already exercise
 * all of `VideoView`'s three panes in isolation; what only the assembled
 * `VideoView` shows — and what this e2e spec's own doc comment names as the
 * point of the file — is that the three panes actually wire together:
 * selecting a project in the list drives both the centre and detail panes,
 * and creating one round-trips through `video.project.create` into the list.
 * All 5 of the original tests port cleanly; none is left in Playwright.
 *
 * `VideoView` has no internal `React.lazy` boundary of its own (only the
 * outer `view-registry.tsx` lazy-loads the *view*, bypassed by mounting the
 * component directly) — so no chunk warm-up is needed, the same conclusion
 * `actions-view.bridge.test.tsx` reached for `ActionsView`.
 */

const PROJECT = { id: 'showreel', title: 'COP31 showreel', valid: true, composition: 'Main' };

async function open(data: MockFixtures = fixtures): Promise<void> {
  renderView(<VideoView />, { fixtures: data });
  // `VideoProjectList`'s own query settling is the first observable state.
  await screen.findByText(/No projects yet|COP31 showreel/);
}

afterEach(cleanup);

describe('VideoView, assembled through the real bridge', () => {
  it('no projects yet shows the empty state', async () => {
    await open();
    expect(screen.getByText('No projects yet')).toBeTruthy();
    expect(screen.getByText('Select a project')).toBeTruthy();
  });

  it('selecting a project drives the centre and detail panes', async () => {
    await open({ ...fixtures, video: { projects: [PROJECT] } });

    // A regex, not the exact string: the row's accessible name is "COP31
    // showreel Main" (title + composition in one button), unlike Playwright's
    // own substring-matching `getByRole({name})` the e2e original used.
    fireEvent.click(screen.getByRole('button', { name: /COP31 showreel/ }));
    expect(await screen.findByText("The studio isn't running.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start studio' })).toBeTruthy();
  });

  it('a studio in a failed state shows its stderr and a retry button', async () => {
    // The fixture seeds `studioStatus` as the outcome `studio.start` itself
    // returns, not what an initial `status` fetch would find — the app's
    // global `staleTime: Infinity` means that fetch never runs on mount, so
    // the mutation's own response, written directly to the query cache, is
    // the only real path a project reaches a non-'stopped' state through
    // (see this test's e2e original for the same reasoning).
    await open({
      ...fixtures,
      video: {
        projects: [PROJECT],
        studioStatus: { [PROJECT.id]: { state: 'failed', stderr: ['Error: EADDRINUSE'] } },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /COP31 showreel/ }));
    expect(await screen.findByRole('button', { name: 'Start studio' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start studio' }));

    expect(await screen.findByText('The studio failed to start')).toBeTruthy();
    expect(screen.getByText('Error: EADDRINUSE')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('a project missing node/npx shows the toolchain warning', async () => {
    await open({
      ...fixtures,
      video: {
        projects: [PROJECT],
        toolchain: {
          [PROJECT.id]: {
            node: { found: false, reason: 'node not on PATH.' },
            npx: { found: true, path: '/usr/bin/npx' },
          },
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /COP31 showreel/ }));
    expect(await screen.findByText('node/npx not found')).toBeTruthy();
    expect(screen.getByText('node not on PATH.')).toBeTruthy();
  });

  it('creating a project adds it to the list and selects it', async () => {
    await open();

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const input = await screen.findByPlaceholderText('COP31 showreel');
    fireEvent.change(input, { target: { value: 'My New Video' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('button', { name: /My New Video/ })).toBeTruthy();
    expect(await screen.findByText("The studio isn't running.")).toBeTruthy();
  });
});
