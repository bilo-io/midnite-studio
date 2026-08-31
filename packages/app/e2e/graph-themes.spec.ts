import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * A history with something to look at.
 *
 * The shipped fixture is one edgeless commit, which renders identically in all
 * every style — the differences between them ARE the edges, so a screenshot of
 * it would prove nothing.
 */
const AUTHORS = [
  { name: 'Ada Lovelace', email: 'ada@example.com' },
  { name: 'Grace Hopper', email: 'grace@example.com' },
  { name: 'Alan Turing', email: 'alan@example.com' },
];

const commit = (i: number, parents: string[], subject: string) => {
  const author = AUTHORS[i % AUTHORS.length]!;
  return {
    sha: `${i}`.padStart(40, 'a'),
    parents,
    authorName: author.name,
    authorEmail: author.email,
    authorDate: 1_787_000_000 - i * 3600,
    committerDate: 1_787_000_000 - i * 3600,
    subject,
    refs: [],
  };
};

const sha = (i: number) => `${i}`.padStart(40, 'a');

/** Straight run, a branch opening, a lane alongside, then a merge closing it. */
const GRAPH_ROWS = [
  {
    row: 0,
    lane: 0,
    colorIdx: 0,
    laneCount: 2,
    edges: [
      { fromLane: 0, toLane: 0, type: 'branch', colorIdx: 0 },
      { fromLane: 0, toLane: 0, type: 'merge', colorIdx: 0 },
      { fromLane: 0, toLane: 1, type: 'merge', colorIdx: 1 },
    ],
    commit: commit(0, [sha(1), sha(2)], 'feat(graph): merge the feature branch'),
  },
  {
    row: 1,
    lane: 1,
    colorIdx: 1,
    laneCount: 2,
    edges: [
      { fromLane: 0, toLane: 0, type: 'straight', colorIdx: 0 },
      { fromLane: 1, toLane: 1, type: 'branch', colorIdx: 1 },
      { fromLane: 1, toLane: 1, type: 'merge', colorIdx: 1 },
    ],
    commit: commit(1, [sha(3)], 'feat(graph): resizable columns'),
  },
  {
    row: 2,
    lane: 0,
    colorIdx: 0,
    laneCount: 2,
    edges: [
      { fromLane: 0, toLane: 0, type: 'branch', colorIdx: 0 },
      { fromLane: 0, toLane: 0, type: 'merge', colorIdx: 0 },
      { fromLane: 1, toLane: 1, type: 'straight', colorIdx: 1 },
    ],
    commit: commit(2, [sha(3)], 'fix(graph): lane recycling off by one'),
  },
  {
    row: 3,
    lane: 0,
    colorIdx: 0,
    laneCount: 2,
    edges: [
      { fromLane: 0, toLane: 0, type: 'branch', colorIdx: 0 },
      { fromLane: 1, toLane: 0, type: 'branch', colorIdx: 1 },
      { fromLane: 0, toLane: 0, type: 'merge', colorIdx: 0 },
    ],
    commit: commit(3, [sha(4)], 'chore: the commit both lanes came from'),
  },
  {
    row: 4,
    lane: 0,
    colorIdx: 0,
    laneCount: 1,
    edges: [{ fromLane: 0, toLane: 0, type: 'branch', colorIdx: 0 }],
    commit: commit(4, [], 'initial commit'),
  },
];

const REFS = [
  {
    name: 'main',
    fullName: 'refs/heads/main',
    kind: 'localBranch',
    sha: sha(0),
    upstream: { name: 'origin/main', ahead: 0, behind: 0, gone: false },
    isHead: true,
    worktreePath: null,
  },
  {
    name: 'feat/graph-themes',
    fullName: 'refs/heads/feat/graph-themes',
    kind: 'localBranch',
    sha: sha(1),
    upstream: null,
    isHead: false,
    worktreePath: null,
  },
  {
    name: 'v0.1.0',
    fullName: 'refs/tags/v0.1.0',
    kind: 'tag',
    sha: sha(4),
    upstream: null,
    isHead: false,
    worktreePath: null,
  },
];

const themedFixtures: MockFixtures = { ...fixtures, graphRows: GRAPH_ROWS, refs: REFS };

/**
 * Gravatar is stubbed, never called for real.
 *
 * A suite that hits the network is a suite that fails on a train and produces a
 * different screenshot every run. Stubbing also lets the 404 path — the one that
 * decides whether a face or initials appear — be exercised deliberately.
 */
async function stubGravatar(page: Page, mode: 'hit' | 'miss'): Promise<void> {
  await page.route('**gravatar.com/**', async (route) => {
    if (mode === 'miss') return route.fulfill({ status: 404, body: '' });
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#5b8def"/><circle cx="32" cy="24" r="11" fill="#fff"/><path d="M8 64c0-14 11-22 24-22s24 8 24 22z" fill="#fff"/></svg>',
    });
  });
}

async function openGraph(page: Page, mode: 'hit' | 'miss' = 'hit'): Promise<void> {
  await stubGravatar(page, mode);
  await installMockBridge(page, themedFixtures);
  await page.goto('/graph');
  const repoButton = page.locator('aside[aria-label="Repositories"]').getByRole('button', { name: 'midnite-studio', exact: true });
  if (await repoButton.isVisible()) {
    await repoButton.click();
  }
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

/**
 * Open the Settings view's Graph page.
 *
 * Two Phase 16 changes this spec was never updated for, and each on its own was
 * enough to hang every test that switches style. Settings became a BUTTON in
 * the rail's footer slot rather than a workspace link; and Settings itself
 * split into pages, so the style picker no longer sits on the page Settings
 * opens on — `settingsPage` defaults to Appearance, and persists, which is why
 * the failures moved around with test order.
 */
async function openGraphSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Graph' })
    .click();
}

/** Switch style via Settings, then come back to the graph. */
async function chooseTheme(page: Page, label: string): Promise<void> {
  await openGraphSettings(page);
  await page.getByRole('region', { name: 'Style' }).getByRole('button', { name: new RegExp(`^${label}`) }).click();
  // Return to Graph view
  await page.goto('/graph');
  const repoButton = page.locator('aside[aria-label="Repositories"]').getByRole('button', { name: 'midnite-studio', exact: true });
  if (await repoButton.isVisible()) {
    await repoButton.click();
  }
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

const THEMES = ['Classic', 'Git Graph', 'Git Extensions', 'Sourcetree', 'GitKraken'] as const;

test.describe('graph themes', () => {
  test('the table has the phase 14 column set', async ({ page }) => {
    await openGraph(page);

    await expect(page.getByRole('columnheader', { name: 'Branch / Tag' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Graph' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Date' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'SHA' })).toBeVisible();

    // The avatar retired it in the styles that HAVE an avatar — which is every
    // style but `classic`, and the default is not `classic`.
    await expect(page.getByRole('columnheader', { name: 'Author' })).toHaveCount(0);
  });

  /**
   * The pre-Phase-14 look, back as a style: dots instead of faces, and the
   * Author column the avatar had replaced.
   */
  test('Classic swaps faces for dots and brings the Author column back', async ({ page }) => {
    await openGraph(page);
    await chooseTheme(page, 'Classic');

    await expect(page.getByRole('columnheader', { name: 'Author' })).toBeVisible();
    await expect(page.getByText('Ada Lovelace').first()).toBeVisible();

    // No avatar of either kind: no Gravatar image, and no initials fallback.
    await expect(page.locator('[role="row"] [data-graph-gutter] image')).toHaveCount(0);
    await expect(page.locator('[role="row"] [data-graph-gutter] text')).toHaveCount(0);
    expect(
      await page.locator('[role="row"] [data-graph-gutter] circle').count(),
    ).toBeGreaterThan(0);

    // And it goes away again, rather than leaving a column the style has no
    // node-level answer for.
    await chooseTheme(page, 'GitKraken');
    await expect(page.getByRole('columnheader', { name: 'Author' })).toHaveCount(0);
  });

  test('initial graph rows reveal with cascading fade-in classes', async ({ page }) => {
    await openGraph(page);
    const rowWrappers = page.locator('[role="grid"] > div > div.absolute');
    await expect(rowWrappers.first()).toHaveClass(/animate-fade-in/);
    await expect(rowWrappers.first()).toHaveClass(/cascade-delay/);
  });

  test('ref chips render in the branch column, not beside the subject', async ({ page }) => {
    await openGraph(page);
    const chip = page.getByText('feat/graph-themes', { exact: true }).first();
    await expect(chip).toBeVisible();
  });

  /**
   * A chip and its node are the same object shown twice, so they share a
   * colour — and the ref you are STANDING on is the one that has to win the
   * column.
   *
   * `main` is HEAD in the fixture and sits on lane 0; `feat/graph-themes` sits
   * on lane 1, so the two also prove the colour tracks the LANE rather than
   * being one accent reused for every chip.
   */
  test('ref chips take their lane colour, and the checked-out one leads', async ({ page }) => {
    await openGraph(page);

    // Scoped to the grid: `main` is also a repository's branch in the sidebar,
    // and the sidebar comes first in the DOM.
    const read = (name: string) =>
      page
        .locator('[role="grid"]')
        .getByText(name, { exact: true })
        .first()
        // The chip is the span wrapping the truncated name.
        .evaluate((node) => {
          const chip = node.parentElement as HTMLElement;
          const style = getComputedStyle(chip);
          return {
            hue: style.getPropertyValue('--lane-h').trim(),
            background: style.backgroundColor,
            weight: style.fontWeight,
            opacity: Number(style.opacity),
          };
        });

    const head = await read('main');
    const other = await read('feat/graph-themes');

    // Coloured at all, and by the lane rather than by a shared accent.
    expect(head.hue).not.toBe('');
    expect(other.hue).not.toBe('');
    expect(head.hue).not.toBe(other.hue);

    // Bolder and more opaque — the two words the brief used.
    expect(Number(head.weight)).toBeGreaterThan(Number(other.weight));
    expect(head.opacity).toBeGreaterThan(other.opacity);

    // Filled solid rather than tinted: the fixture's HEAD chip is opaque, the
    // other is an alpha wash of the same hue.
    expect(head.background).not.toContain('rgba');
    expect(other.background).toContain('rgba');
  });

  /**
   * The leader line joining a chip to its node.
   *
   * Drawn in two halves — an HTML rule to the column's edge, an SVG line across
   * the row's gap — so the assertion that matters is that the SVG half starts
   * to the LEFT of its own viewBox. A connector that begins at x=0 stops at the
   * gutter and never reaches the chip.
   */
  test('a ref chip is joined to its commit', async ({ page }) => {
    await openGraph(page);
    const starts = await page
      .locator('[role="row"] [data-graph-gutter] line[stroke-opacity]')
      .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute('x1'))));

    expect(starts.length).toBeGreaterThan(0);
    for (const x of starts) expect(x).toBeLessThan(0);
  });

  /**
   * The chip and the node it points at have to sit on the same line.
   *
   * They did not: the gutter SVG defaulted to `display: inline`, so it sat on a
   * text baseline with a line box's descender space beneath it. The row's
   * `items-center` split that phantom height evenly and lifted the whole
   * graphic a few pixels, leaving every leader line meeting its node off-centre
   * — subtle enough to survive four styles and a screenshot review.
   *
   * Asserted for every style, because the offset scaled with the row's font
   * metrics rather than with anything a single style could be blamed for.
   */
  for (const label of THEMES) {
    test(`${label} lines the chip up with its node`, async ({ page }) => {
      await openGraph(page);
      await chooseTheme(page, label);

      const row = page
        .locator('[role="grid"] [role="row"]')
        .filter({ hasText: 'feat(graph): merge the feature branch' });
      const chip = await row.getByText('main', { exact: true }).boundingBox();
      const node = await row.locator('[data-graph-gutter] circle').first().boundingBox();

      expect(chip).not.toBeNull();
      expect(node).not.toBeNull();
      const centre = (box: { y: number; height: number }) => box.y + box.height / 2;
      // One pixel of tolerance for a half-pixel row height; the bug was four.
      expect(Math.abs(centre(chip!) - centre(node!))).toBeLessThanOrEqual(1);
    });
  }

  /**
   * The gutter is a column like any other now, and the interesting end of its
   * travel is the tight one: lanes close up, indented commits slide left, and
   * nothing drops off either edge.
   */
  test('the gutter resizes, and every lane survives the squeeze', async ({ page }) => {
    await openGraph(page);

    const header = page.getByRole('columnheader', { name: 'Graph' });
    const handle = page.getByRole('separator', { name: 'Resize graph column' });

    /** Every node's centre, and how far the widest one reaches. */
    const geometry = async () => {
      const gutter = (await header.boundingBox())!;
      const nodes = await page
        .locator('[role="grid"] [role="row"] [data-graph-gutter] circle')
        .evaluateAll((els) =>
          els.map((el) => {
            const box = el.getBoundingClientRect();
            return { centre: box.x + box.width / 2, left: box.x, right: box.right };
          }),
        );
      return { gutter, nodes };
    };

    const wide = await geometry();
    expect(wide.nodes.length).toBeGreaterThan(0);

    // `Home` is the handle's own "as small as you allow" — a keyboard press
    // rather than a synthesised drag, so the test is about the geometry and not
    // about pointer-event plumbing.
    await handle.focus();
    await page.keyboard.press('Home');
    const tight = await geometry();

    expect(tight.gutter.width).toBeLessThan(wide.gutter.width);

    // The indented lane moved left; lane 0 did not move right off its edge.
    const rightmost = (g: typeof wide) => Math.max(...g.nodes.map((n) => n.centre));
    expect(rightmost(tight)).toBeLessThan(rightmost(wide));

    // Still all there, and still inside the column that names them — the floor
    // exists precisely so a squeezed gutter cannot hide a branch.
    expect(tight.nodes).toHaveLength(wide.nodes.length);
    for (const node of tight.nodes) {
      expect(node.left).toBeGreaterThanOrEqual(tight.gutter.x - 1);
      expect(node.right).toBeLessThanOrEqual(tight.gutter.x + tight.gutter.width + 1);
    }

    // And `End` gives the history its natural fit back.
    await page.keyboard.press('End');
    expect((await geometry()).gutter.width).toBeCloseTo(wide.gutter.width, 0);
  });

  /**
   * GitKraken's rail — the bar between the graph and the subject, in the
   * branch's colour.
   */
  test('avatar styles carry a lane rail; Classic does not', async ({ page }) => {
    await openGraph(page);

    const rails = page.locator('[role="grid"] [role="row"] > span[aria-hidden]');
    const rowCount = await page.locator('[role="grid"] [role="row"]').count();
    await expect(rails).toHaveCount(rowCount);

    // Coloured by the lane, not by one shared accent: row 0 sits on lane 0 and
    // row 1 on lane 1, so their rails must differ.
    const colours = await rails.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).backgroundColor),
    );
    expect(new Set(colours).size).toBeGreaterThan(1);

    // `classic` draws its whole lane in that colour a few pixels away, so a
    // rail would be saying it twice.
    await chooseTheme(page, 'Classic');
    await expect(page.locator('[role="grid"] [role="row"] > span[aria-hidden]')).toHaveCount(0);
  });

  test('each style redraws the graph and persists', async ({ page }) => {
    await openGraph(page);

    for (const label of THEMES) {
      await chooseTheme(page, label);
      await expect(page.locator('[role="row"] svg').first()).toBeVisible();
    }

    // A style is a preference, so it has to survive a reload.
    await page.reload();
    const repoButton = page.locator('aside[aria-label="Repositories"]').getByRole('button', { name: 'midnite-studio', exact: true });
    if (await repoButton.isVisible()) {
      await repoButton.click();
    }
    await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
    await expect(page.getByText('GitKraken').first()).toBeVisible();
  });

  test('a Gravatar hit paints an image, actually clipped to the node', async ({ page }) => {
    await openGraph(page, 'hit');
    const image = page.locator('svg image').first();
    await expect(image).toBeVisible();

    // `toBeVisible` is not enough: an element clipped away by an unresolvable
    // clip-path still has a layout box, so the assertion would pass even if the
    // clip silently broke. Check the reference resolves to a live node.
    const clipped = await image.evaluate((node) => {
      const ref = getComputedStyle(node).clipPath.match(/url\("?#([^")]+)"?\)/)?.[1];
      return ref ? document.getElementById(ref) !== null : false;
    });
    expect(clipped).toBe(true);
  });

  test('Git Graph draws arrowheads; the other styles do not', async ({ page }) => {
    await openGraph(page);
    await chooseTheme(page, 'Git Graph');

    /*
      Counted, not `toBeVisible`. An arriving lane is a zero-width vertical
      line, so it has no bounding box for Playwright to call visible — the
      question that matters is whether anything REFERENCES a marker at all,
      which is what was broken.
    */
    expect(await page.locator('[marker-end]').count()).toBeGreaterThan(0);

    await chooseTheme(page, 'Sourcetree');
    expect(await page.locator('[marker-end]').count()).toBe(0);
  });

  test('adjacent lanes do not overlap their avatars', async ({ page }) => {
    await openGraph(page);
    await chooseTheme(page, 'GitKraken');

    // Row 1 sits in lane 1 while lane 0 runs alongside it; the node must not
    // paint over its neighbour's line.
    const boxes = await page
      .locator('[role="row"] [data-graph-gutter] circle')
      .evaluateAll((nodes) =>
      nodes.map((n) => n.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right })),
    );
    expect(boxes.length).toBeGreaterThan(0);
    // Nothing may start left of the gutter's own origin.
    const gutterLeft = await page
      .locator('[role="row"] [data-graph-gutter]')
      .first()
      .evaluate((n) => n.getBoundingClientRect().left);
    for (const box of boxes) expect(box.left).toBeGreaterThanOrEqual(gutterLeft - 1);
  });

  test('offline renders initials and never an empty node', async ({ page }) => {
    await openGraph(page, 'miss');
    // Every author's node still carries a mark — initials, from the local hash.
    await expect(page.locator('svg text').first()).toBeVisible();
    await expect(page.locator('svg image')).toHaveCount(0);
  });

  test('the author filter dims rather than removing', async ({ page }) => {
    await openGraph(page);

    const before = await page.locator('[role="row"]').count();
    await page.getByRole('button', { name: /All authors/ }).click();
    await page.getByRole('option', { name: /Ada Lovelace/ }).click();
    await page.keyboard.press('Escape');

    // The row count is unchanged: filtering removes commits from the log, which
    // would leave the lane engine holding lanes open for parents that never
    // arrive. Dimming keeps the topology honest.
    await expect(page.locator('[role="row"]')).toHaveCount(before);
    await expect(page.locator('.opacity-40').first()).toBeVisible();
  });

  /**
   * Written to `docs/screenshots/phase-14/`, not attached to the report.
   *
   * The phase convention is that visual work lands its screenshots in the repo,
   * where they stay readable long after the test run's artefacts are swept up.
   */
  test('the settings picker previews every style', async ({ page }) => {
    await openGraph(page);
    await openGraphSettings(page);

    for (const label of THEMES) {
      await expect(page.getByRole('button', { name: new RegExp(`^${label}`) })).toBeVisible();
    }

    await page.waitForTimeout(300);
    await page.screenshot({ path: '../../docs/screenshots/phase-14/settings.png' });

    /*
      Motion and Density are the APPEARANCE page, not this one — Phase 16 split
      what used to be one settings screen, and asserting all four in one place
      is now asserting a screen that does not exist.
    */
    await page
      .getByRole('navigation', { name: 'Settings pages' })
      .getByRole('button', { name: 'Appearance' })
      .click();
    // The appearance runtime the shell has always shipped and the app never called.
    await expect(page.getByRole('radiogroup', { name: 'Motion' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Density' })).toBeVisible();
  });

  test('screenshot each style', async ({ page }) => {
    await openGraph(page);

    for (const label of THEMES) {
      await chooseTheme(page, label);
      // Let the fade settle, or the shot catches the graph mid-entrance.
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `../../docs/screenshots/phase-14/${label.toLowerCase().replace(/ /g, '-')}.png`,
      });
    }
  });
});

/**
 * The theme switch lives in the window's top-right corner, which is the worst
 * place to open a menu and the reason the library's own control could not be
 * used: its flyout is anchored to the RIGHT of the trigger, so every option
 * opened past the window edge — visible in the DOM, unreachable by pointer.
 */
test.describe('theme toggle', () => {
  test('opens its menu inside the window', async ({ page }) => {
    await openGraph(page);
    await page.getByRole('button', { name: 'Toggle theme' }).click();

    const menu = page.getByRole('menu', { name: 'Theme' });
    await expect(menu).toBeVisible();

    const box = await menu.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

    // Every option present AND hit-testable — `toBeVisible` alone passes for an
    // element sitting off the right edge, which was the whole bug.
    for (const label of ['Light', 'Dark', 'System', 'Time of day']) {
      await expect(menu.getByRole('menuitemradio', { name: label })).toBeInViewport();
    }
  });

  test('picks a theme and shows which one is picked', async ({ page }) => {
    await openGraph(page);
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await page.getByRole('menuitemradio', { name: 'Light' }).click();

    // The preference reaches the document, which is the only thing the rest of
    // the app reads.
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // Escape closes it, like every other transient surface in the app.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: 'Theme' })).toHaveCount(0);
  });
});
