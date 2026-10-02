import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { DEFAULT_LAYOUT } from '../../../store/ui-store';
import { VideoTab } from './video-tab';

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
  renderView(<VideoTab />, { fixtures: data });
  // `VideoProjectList`'s own query settling is the first observable state.
  await screen.findByText(/No projects yet|COP31 showreel/);
}

afterEach(cleanup);

describe('Media ▸ Video, assembled through the real bridge', () => {
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

  it('the toolbar shows the title after the root badge, with Render as the last control', async () => {
    await open({ ...fixtures, video: { projects: [PROJECT] } });
    fireEvent.click(screen.getByRole('button', { name: /COP31 showreel/ }));
    const title = await screen.findByTestId('video-toolbar-title');
    expect(title.textContent).toBe('COP31 showreel');
    const bar = title.parentElement as HTMLElement;
    const badge = screen.getByTestId('video-root-source');
    expect(badge.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const controls = Array.from(bar.querySelectorAll('button'));
    expect(controls.at(-1)?.textContent).toContain('Render');
    expect(controls.at(-1)?.className).toContain('ml-auto');
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

  it('the empty state CTA starts a new video project', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'New video project' }));
    fireEvent.change(await screen.findByPlaceholderText('COP31 showreel'), { target: { value: 'Teaser' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('button', { name: /Teaser/ })).toBeTruthy();
  });

  it('renders resizable panels with resize handles', async () => {
    await open();
    const listHandle = screen.getByRole('separator', { name: 'Resize video explorer' });
    const detailHandle = screen.getByRole('separator', { name: 'Resize video detail' });
    expect(listHandle).toBeTruthy();
    expect(detailHandle).toBeTruthy();

    expect((listHandle.previousElementSibling as HTMLElement).style.width).toBe(
      `${DEFAULT_LAYOUT.mediaVideoExplorerWidth}px`,
    );
    expect((detailHandle.nextElementSibling as HTMLElement).style.width).toBe(
      `${DEFAULT_LAYOUT.mediaVideoDetailWidth}px`,
    );
  });

  // --- Phase 99 Theme D -------------------------------------------------------

  it('no resolvable root shows Setup Video, which scaffolds and selects the example project', async () => {
    renderView(<VideoTab />, {
      fixtures: { ...fixtures, video: { resolution: { root: null, source: null, setupTarget: '/repo/.midnite/media/video' } } },
      uiState: { selectedRepoId: 'repo-1' },
    });
    expect(await screen.findByRole('heading', { name: 'Set up Video' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Setup Video' }));
    expect(await screen.findByTestId('video-root-source')).toHaveProperty('dataset.source', 'repo-media');
  });

  it('the toolbar names where the root resolved from', async () => {
    await open({
      ...fixtures,
      video: { projects: [PROJECT], resolution: { root: '/r', source: 'repo', setupTarget: '/r/.midnite/media/video' } },
    });
    expect(screen.getByTestId('video-root-source').textContent).toContain('This repo');
  });

  it('the detail pane follows the selection kind — project, iteration, asset', async () => {
    await open({
      ...fixtures,
      video: {
        projects: [PROJECT],
        files: {
          'showreel:output': [
            { name: 'v1-rough.mp4', isDir: false, size: 10, mtimeMs: 1 },
            { name: 'v2-final.mp4', isDir: false, size: 20, mtimeMs: 2 },
            { name: 'CHANGELOG.md', isDir: false, size: 5, mtimeMs: 2 },
          ],
          '-:assets': [{ name: 'logo.png', isDir: false, size: 2048, mtimeMs: 1 }],
        },
        fileContent: { 'showreel:output/CHANGELOG.md': '# log\n\n## v2-final — 2026-09-30\n\n- tightened the intro\n' },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /COP31 showreel/ }));
    expect(await screen.findByRole('button', { name: /New iteration/ })).toBeTruthy();

    // Iterations list newest first under the expanded project.
    const iterations = await screen.findAllByRole('button', { name: /^v\d-/ });
    expect(iterations.map((b) => b.textContent)).toEqual(['v2-final.mp4', 'v1-rough.mp4']);

    fireEvent.click(iterations[0]!);
    expect(await screen.findByText('tightened the intro')).toBeTruthy();
    expect(screen.getByLabelText('Compare with')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /logo\.png/ }));
    expect(await screen.findByText('assets/logo.png')).toBeTruthy();
    expect(screen.getByTestId('media-readout').textContent).toContain('2.0 KB');
  });
});
