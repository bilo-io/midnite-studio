import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { BrowserWindow } from 'electron';

/**
 * Screenshot the window from inside the app, on demand.
 *
 * Every visual phase in `todo/` is verified with a screenshot, and the obvious
 * route — `screencapture` — needs macOS Screen Recording permission, which a
 * headless/agent context does not have. `webContents.capturePage()` runs inside
 * the renderer's own compositor and needs no permission at all, so it works
 * anywhere the app can boot.
 *
 * Dev tooling, opt-in through the environment; nothing runs unless
 * `MGIT_CAPTURE` names a target file.
 *
 *   MGIT_CAPTURE=/tmp/shot.png MGIT_CAPTURE_EXIT=1 moon run desktop:start-built
 *
 * Two knobs exist because they are what the phase checklists actually ask to be
 * verified, and neither state is reachable from outside the app:
 *
 *   MGIT_CAPTURE_THEME=light|dark   force the theme before capturing
 *   MGIT_CAPTURE_FULLSCREEN=1       capture in fullscreen, where macOS hides the
 *                                   traffic lights and the title bar must
 *                                   collapse its left clearance
 */
export function maybeCapture(win: BrowserWindow): void {
  const target = process.env['MGIT_CAPTURE'];
  if (!target) return;

  // Give the renderer a beat past first paint: fonts, the theme class and any
  // entry transition all land after `ready-to-show`, and capturing before they
  // do produces a screenshot of a half-styled app.
  const delayMs = Number.parseInt(process.env['MGIT_CAPTURE_DELAY_MS'] ?? '1500', 10);

  win.once('ready-to-show', () => {
    setTimeout(() => {
      void (async () => {
        try {
          await applyCaptureState(win);
          const image = await win.webContents.capturePage();
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, image.toPNG());
          // eslint-disable-next-line no-console -- this IS the tool's output
          console.log(`[capture] wrote ${target}`);
        } catch (error) {
          // eslint-disable-next-line no-console -- ditto
          console.error('[capture] failed', error);
        } finally {
          if (process.env['MGIT_CAPTURE_EXIT'] === '1') {
            const { app } = await import('electron');
            app.quit();
          }
        }
      })();
    }, delayMs);
  });
}

/** Put the window into the state being screenshotted, and let it settle. */
async function applyCaptureState(win: BrowserWindow): Promise<void> {
  const theme = process.env['MGIT_CAPTURE_THEME'];
  if (theme === 'light' || theme === 'dark') {
    // Drive it exactly the way the ThemeProvider does — write the stored
    // preference and flip the class — so the screenshot shows the real token
    // set rather than an inline override.
    await win.webContents.executeJavaScript(
      `(() => {
        localStorage.setItem('midnite.theme', ${JSON.stringify(theme)});
        document.documentElement.classList.toggle('dark', ${JSON.stringify(theme === 'dark')});
        document.documentElement.style.colorScheme = ${JSON.stringify(theme)};
      })()`,
    );
  }

  if (process.env['MGIT_CAPTURE_FULLSCREEN'] === '1' && !win.isFullScreen()) {
    const entered = new Promise<void>((resolve) => win.once('enter-full-screen', () => resolve()));
    win.setFullScreen(true);
    await entered;
  }

  // The theme swap and the fullscreen transition both animate.
  await new Promise((resolve) => setTimeout(resolve, 600));
}
