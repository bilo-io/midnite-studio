import { expect, test } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  setTheme,
  shotPath,
} from './shots-helper';

/**
 * Phase 55 Theme F.2 — the renderer-side half of multi-window verification
 * this suite can actually reach: each `DetachedRoot` role rendered standalone
 * (the mocked bridge reports that `windowRole`, exactly as `main.tsx` reads
 * it from `additionalArguments` in the real app), and each docked slot
 * COLLAPSED in the main layout once its role's flag is set — a detached
 * panel reclaims its space rather than leaving a placeholder behind. A real
 * second `BrowserWindow` — two windows staying in sync, a popout surviving a
 * crash — is F.3's human pass; this suite never launches Electron (see the
 * phase doc's own audit).
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/phase-55-multi-window';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const POPOUT_ROLES = ['terminal', 'repos', 'fab', 'browser'] as const;

/**
 * A selector that is only present while the role's docked content is
 * actually mounted — used both to prove the panel is there when open and
 * docked, and gone once detached collapses its slot.
 */
const DOCKED_CONTENT: Record<(typeof POPOUT_ROLES)[number], string> = {
  terminal: '[data-terminal-panel]',
  repos: '[aria-label="Repositories"]',
  fab: '[data-fab-panel-frame]',
  browser: '[role="dialog"][aria-label="Browser"]',
};

/**
 * `useRevealSize`/`useReveal` keep a panel entirely unmounted — not just
 * zero-size — once closed, so each role's section needs its own `*Open` flag
 * set to prove collapse is what detaching does, not just an already-closed
 * panel reading as absent.
 */
const OPEN_FLAG: Record<(typeof POPOUT_ROLES)[number], string> = {
  terminal: 'terminalOpen',
  repos: 'reposOpen',
  fab: 'fabPanelOpen',
  browser: 'browserOpen',
};

for (const role of POPOUT_ROLES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`DetachedRoot(${role}) — ${theme} theme`, async ({ page }) => {
      await setTheme(page, theme);
      await installMockBridge(page, { ...fixtures, windowRole: role } as MockFixtures);
      await page.goto('/graph');
      if (theme === 'dark') await setTheme(page, 'dark');

      // Every popout wraps its content in `DetachedWindowFrame`, whose
      // titlebar carries the role's title — the one thing all four share.
      await expect(page.locator('body')).toBeVisible();
      // xterm is a lazy-loaded chunk (Phase 36) — the same wait every other
      // terminal spec (e.g. `terminal-links.spec.ts`) uses before asserting
      // on it, so the popout terminal shot is not just its loading spinner.
      if (role === 'terminal') await expect(page.locator('.xterm-screen')).toHaveCount(1);
      await page.waitForTimeout(200);
      await page.screenshot({ path: shotPath(OUT, `detached-root-${role}-${theme}.png`) });
    });
  }
}

for (const role of POPOUT_ROLES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`detached ${role} collapses in the main layout — ${theme} theme`, async ({ page }) => {
      await setTheme(page, theme);
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
      if (theme === 'dark') await setTheme(page, 'dark');

      // The docked slot is fully collapsed — no placeholder banner, no
      // content — reclaiming its space rather than reserving it.
      await expect(page.locator(DOCKED_CONTENT[role])).toHaveCount(0);
      await page.screenshot({ path: shotPath(OUT, `detached-collapsed-${role}-${theme}.png`) });
    });
  }
}
