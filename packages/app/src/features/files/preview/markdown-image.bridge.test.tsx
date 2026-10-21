import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { makeFixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { FilePreview } from './file-preview';
import { MarkdownPreview } from './markdown-preview';

/**
 * Images in the Files pane's markdown preview. The bytes never come through
 * an IPC call: a local image is an `<img>` on the jailed `mstudio-file://`
 * protocol main already serves media through, so what is asserted here is the
 * URL the preview hands that protocol — scope, repo, resolved path and the
 * `as=image` narrowing main enforces.
 */

afterEach(cleanup);

const DOC = [
  '# Guide',
  '',
  '![shot](./screenshots/a.png)',
  '',
  '![up](../img/b.svg)',
  '',
  '![root](/logo.png)',
  '',
  '![escape](../../../outside.png)',
  '',
  '![remote](https://example.com/r.png)',
  '',
  '![plain](http://example.com/p.png)',
].join('\n');

function fixtures() {
  return makeFixtures({
    fsFiles: {
      'repo:docs/guide/README.md': { kind: 'text', content: DOC, size: DOC.length },
    },
  });
}

async function openGuide() {
  renderView(<FilePreview scope={{ scope: 'repo', repoId: 'repo-1' }} relPath="docs/guide/README.md" />, {
    fixtures: fixtures(),
  });
  await screen.findByRole('heading', { name: 'Guide' });
}

describe('markdown preview images', () => {
  it('resolves relative srcs against the markdown file directory, through the jailed media protocol', async () => {
    await openGuide();
    const shot = screen.getByRole('img', { name: 'shot' });
    expect(shot.getAttribute('src')).toBe('mstudio-file://repo/repo-1/docs/guide/screenshots/a.png?as=image');
    expect(shot.getAttribute('loading')).toBe('lazy');
    expect(shot.className).toContain('max-w-full');
    expect(screen.getByRole('img', { name: 'up' }).getAttribute('src')).toBe(
      'mstudio-file://repo/repo-1/docs/img/b.svg?as=image',
    );
  });

  it('resolves a leading-slash src against the repo root', async () => {
    await openGuide();
    expect(screen.getByRole('img', { name: 'root' }).getAttribute('src')).toBe(
      'mstudio-file://repo/repo-1/logo.png?as=image',
    );
  });

  it('shows a placeholder with alt and path for an image that fails to load', async () => {
    await openGuide();
    fireEvent.error(screen.getByRole('img', { name: 'shot' }));
    const chip = screen.getByRole('img', { name: 'shot: shot' });
    expect(chip.tagName).toBe('SPAN');
    expect(chip.textContent).toContain('docs/guide/screenshots/a.png');
  });

  it('never requests a src that climbs out of the root', async () => {
    await openGuide();
    const chip = screen.getByRole('img', { name: 'escape: escape' });
    expect(chip.tagName).toBe('SPAN');
    expect(chip.textContent).toContain('../../../outside.png');
    expect(document.querySelector('img[src*="outside"]')).toBeNull();
  });

  it('loads https images directly (CSP img-src allows https:) without a referrer', async () => {
    await openGuide();
    const remote = screen.getByRole('img', { name: 'remote' });
    expect(remote.getAttribute('src')).toBe('https://example.com/r.png');
    expect(remote.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('shows plain http images as blocked, with the URL, rather than loosening the CSP', async () => {
    await openGuide();
    const chip = screen.getByRole('img', { name: /Remote image blocked.*: plain/ });
    expect(chip.tagName).toBe('SPAN');
    expect(chip.textContent).toContain('http://example.com/p.png');
    expect(document.querySelector('img[src^="http:"]')).toBeNull();
  });
});

describe('MarkdownPreview image scope', () => {
  it('carries a linked worktree into the media URL', () => {
    render(
      <MarkdownPreview
        scope={{ scope: 'repo', repoId: 'r1', worktreePath: '/wt/feature' }}
        currentRelPath="README.md"
        content="![a](docs/a.png)"
      />,
    );
    expect(screen.getByRole('img', { name: 'a' }).getAttribute('src')).toBe(
      'mstudio-file://repo/r1/docs/a.png?wt=%2Fwt%2Ffeature&as=image',
    );
  });

  it('shows a placeholder for a local image when no scope is known', () => {
    render(<MarkdownPreview currentRelPath="README.md" content="![a](docs/a.png)" />);
    expect(screen.getByRole('img', { name: 'a: a' }).tagName).toBe('SPAN');
  });

  it('refuses a non-image extension without making a request', () => {
    render(
      <MarkdownPreview scope={{ scope: 'repo', repoId: 'r1' }} currentRelPath="README.md" content="![k](.env)" />,
    );
    expect(screen.getByRole('img', { name: 'k: k' }).tagName).toBe('SPAN');
    expect(document.querySelector('img')).toBeNull();
  });
});
