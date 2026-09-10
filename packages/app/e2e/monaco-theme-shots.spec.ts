import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';
import { fixtures, REPRODUCIBLE_REMOTE, setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * Proves the ad hoc fix (Monaco's own `theme` prop was silently overriding
 * the `studio-<id>` theme `useStudioMonacoTheme()` installs — see
 * `use-studio-monaco-theme.ts`): the SAME file, rendered under two studio
 * palettes with deliberately distinct editor colours (Monokai's dark
 * orange-on-charcoal vs. GitHub Light's white-on-near-black-text), must
 * produce two visibly different screenshots. Before the fix both palettes
 * rendered identically — Monaco's own bundled `vs`/`vs-dark`, never the
 * palette — regardless of which one was active.
 *
 * `activePaletteId` is seeded directly into `midnite.settings`
 * (`sharedSettingsStorage`'s own shape — `{state, version}`, `version: 2`
 * matching `palette-store.ts`'s current version so zustand's persist
 * middleware takes it as-is rather than routing it through `migrate`)
 * rather than driving the Settings ▸ Appearance picker: that picker's UI is
 * Agent A's surface in this same batch (`appearance-page.tsx`), not this
 * fix's.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays
 * fast, matching every other `*-shots.spec.ts` file's own gate.
 */
const OUT = '../../docs/screenshots/adhoc-monaco-theming';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const editorFixtures: MockFixtures = {
  ...fixtures,
  remotes: [REPRODUCIBLE_REMOTE],
  fsDirs: {
    'repo:': [{ name: 'greeter.ts', kind: 'file', size: 120, isIgnored: false }],
  },
  fsFiles: {
    'repo:greeter.ts': {
      kind: 'text',
      content: [
        "import type { Greeting } from './types';",
        '',
        '/** Says hello, Monaco-highlighted. */',
        'export function greet(name: string): Greeting {',
        '  return { text: `Hello, ${name}!`, at: Date.now() };',
        '}',
        '',
      ].join('\n'),
      size: 180,
      version: { mtimeMs: 1, size: 180 },
    },
  },
};

async function openEditorWithPalette(
  page: Page,
  paletteId: string,
  mode: 'light' | 'dark',
): Promise<void> {
  await page.addInitScript((id) => {
    window.localStorage.setItem(
      'midnite.settings',
      JSON.stringify({ state: { activePaletteId: id }, version: 2 }),
    );
  }, paletteId);
  await installMockBridge(page, editorFixtures);
  await page.goto('/');
  await setTheme(page, mode);
  await setReducedMotion(page);
  await clickRailLink(page, 'Explorer');
  await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible();
  await page.getByRole('treeitem', { name: /^greeter\.ts$/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByTestId('code-editor')).toBeVisible();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('export function greet');
  // Let Monaco finish laying out, tokenizing, AND re-theming before the shot
  // — the whole point is that the studio theme (not Monaco's bundled
  // vs/vs-dark default) is what ends up on screen.
  await page.waitForTimeout(400);
}

const CASES = [
  { paletteId: 'monokai', mode: 'dark' as const },
  { paletteId: 'github-light', mode: 'light' as const },
];

for (const { paletteId, mode } of CASES) {
  test(`the Monaco editor actually retints for the ${paletteId} studio palette`, async ({ page }) => {
    await openEditorWithPalette(page, paletteId, mode);
    await page.screenshot({ path: shotPath(OUT, `code-editor-${paletteId}.png`) });
  });
}
