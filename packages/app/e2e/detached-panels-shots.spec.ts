import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 55 Theme F.2 — the renderer-side half of multi-window verification
 * this suite can actually reach: each `DetachedRoot` role rendered standalone
 * (the mocked bridge reports that `windowRole`, exactly as `main.tsx` reads
 * it from `additionalArguments` in the real app), and each `DetachedPlaceholder`
 * in the main layout once its role's flag is set. A real second `BrowserWindow`
 * — two windows staying in sync, a popout surviving a crash — is F.3's human
 * pass; this suite never launches Electron (see the phase doc's own audit).
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/phase-55-multi-window';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const POPOUT_ROLES = ['terminal', 'repos', 'fab', 'browser'] as const;

const PLACEHOLDER: Record<(typeof POPOUT_ROLES)[number], string> = {
  terminal: 'Terminal is open in a detached window',
  repos: 'Git Repos is open in a detached window',
  fab: 'Midnite Loops is open in a detached window',
  browser: 'Browser is open in a detached window',
};

/**
 * `useReveal` (`use-reveal.ts`) keeps a panel entirely unmounted — not just
 * zero-height — until its own `*Open` flag goes true, so the placeholder
 * inside a detached panel needs its section expanded to render at all.
 */
const OPEN_FLAG: Record<(typeof POPOUT_ROLES)[number], string> = {
  terminal: 'terminalOpen',
  repos: 'reposOpen',
  fab: 'fabPanelOpen',
  browser: 'browserOpen',
};

async function gotoDark(page: import('@playwright/test').Page, dark: boolean): Promise<void> {
  if (dark) await page.emulateMedia({ colorScheme: 'dark' });
}

for (const role of POPOUT_ROLES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`DetachedRoot(${role}) — ${theme} theme`, async ({ page }) => {
      await gotoDark(page, theme === 'dark');
      await installMockBridge(page, { ...fixtures, windowRole: role } as MockFixtures);
      await page.goto('/graph');
      if (theme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));

      // Every popout wraps its content in `DetachedWindowFrame`, whose
      // titlebar carries the role's title — the one thing all four share.
      await expect(page.locator('body')).toBeVisible();
      // xterm is a lazy-loaded chunk (Phase 36) — the same wait every other
      // terminal spec (e.g. `terminal-links.spec.ts`) uses before asserting
      // on it, so the popout terminal shot is not just its loading spinner.
      if (role === 'terminal') await expect(page.locator('.xterm-screen')).toHaveCount(1);
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/detached-root-${role}-${theme}.png` });
    });
  }
}

for (const role of POPOUT_ROLES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`DetachedPlaceholder(${role}) in the main layout — ${theme} theme`, async ({ page }) => {
      await gotoDark(page, theme === 'dark');
      // `useWindowSync` reconciles the *Detached flags off `window.list()`,
      // not off anything written straight into localStorage — see that
      // hook's own doc and `openPopoutRoles`'s.
      await installMockBridge(page, { ...fixtures, openPopoutRoles: [role] } as MockFixtures);
      const flag = OPEN_FLAG[role];
      await page.addInitScript((flagName: string) => {
        try {
          const stored = localStorage.getItem('midnite-studio.ui');
          const persisted = stored ? JSON.parse(stored) : { version: 8 };
          persisted.state = { ...persisted.state, [flagName]: true };
          persisted.version = 8;
          localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
        } catch {
          /* Same tolerance as every other spec seeding this key. */
        }
      }, flag);
      await page.goto('/graph');
      if (theme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));

      await expect(page.getByText(PLACEHOLDER[role])).toBeVisible();
      await page.screenshot({ path: `${OUT}/detached-placeholder-${role}-${theme}.png` });
    });
  }
}
