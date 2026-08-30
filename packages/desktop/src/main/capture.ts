import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { Menu, type BrowserWindow } from 'electron';

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
 * `MSTUDIO_CAPTURE` names a target file.
 *
 *   MSTUDIO_CAPTURE=/tmp/shot.png MSTUDIO_CAPTURE_EXIT=1 moon run desktop:start-built
 *
 * Two knobs exist because they are what the phase checklists actually ask to be
 * verified, and neither state is reachable from outside the app:
 *
 *   MSTUDIO_CAPTURE_THEME=light|dark   force the theme before capturing
 *   MSTUDIO_CAPTURE_FULLSCREEN=1       capture in fullscreen, where macOS hides the
 *                                   traffic lights and the title bar must
 *                                   collapse its left clearance
 *   MSTUDIO_EVAL=<js expression>       evaluate in the renderer and log the JSON
 *                                   result — for checking layout/DOM state that
 *                                   a screenshot can only hint at
 *   MSTUDIO_TYPE=<text>                type real key events into the focused
 *                                   element (`\n` sends Return). Synthetic DOM
 *                                   KeyboardEvents do not drive xterm, so this
 *                                   is the only way to exercise the terminal's
 *                                   true path: OS event → xterm → IPC → pty
 *   MSTUDIO_KEYS=<json>                send chords as real input events, e.g.
 *                                   `[{"keyCode":"`","modifiers":["control"]}]`
 *                                   — the only way to test a shortcut against
 *                                   xterm's own key handling
 *   MSTUDIO_EVAL_AFTER=<js expression> a second eval, run AFTER the typing and the
 *                                   chords. MSTUDIO_EVAL sets the scene; this one
 *                                   asserts what the input did.
 *
 *   MSTUDIO_DUMP_MENU=1                log the native application menu. The menu
 *                                   is OS chrome, invisible to both the DOM and
 *                                   a page screenshot, so this is the only way
 *                                   to check that (say) the Edit roles Cmd+C/V
 *                                   depend on are actually registered.
 *
 * Order: theme/fullscreen → MSTUDIO_EVAL → MSTUDIO_TYPE → MSTUDIO_KEYS → MSTUDIO_EVAL_AFTER
 * → capture.
 */
export function maybeCapture(win: BrowserWindow): void {
  const target = process.env['MSTUDIO_CAPTURE'];
  if (!target) return;

  // Give the renderer a beat past first paint: fonts, the theme class and any
  // entry transition all land after `ready-to-show`, and capturing before they
  // do produces a screenshot of a half-styled app.
  const delayMs = Number.parseInt(process.env['MSTUDIO_CAPTURE_DELAY_MS'] ?? '1500', 10);

  win.once('ready-to-show', () => {
    setTimeout(() => {
      void (async () => {
        try {
          await applyCaptureState(win);
          await runEval(win, 'MSTUDIO_EVAL');
          await runType(win);
          await runKeys(win);
          await runEval(win, 'MSTUDIO_EVAL_AFTER');
          dumpMenu();
          const image = await win.webContents.capturePage();
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, image.toPNG());
          // eslint-disable-next-line no-console -- this IS the tool's output
          console.log(`[capture] wrote ${target}`);
        } catch (error) {
          // eslint-disable-next-line no-console -- ditto
          console.error('[capture] failed', error);
        } finally {
          if (process.env['MSTUDIO_CAPTURE_EXIT'] === '1') {
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
  const theme = process.env['MSTUDIO_CAPTURE_THEME'];
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

  if (process.env['MSTUDIO_CAPTURE_FULLSCREEN'] === '1' && !win.isFullScreen()) {
    const entered = new Promise<void>((resolve) => win.once('enter-full-screen', () => resolve()));
    win.setFullScreen(true);
    await entered;
  }

  // The theme swap and the fullscreen transition both animate.
  await new Promise((resolve) => setTimeout(resolve, 600));

  /**
   * Force a compositor frame before capturing.
   *
   * macOS throttles rendering for an occluded window, so a DOM change made from
   * `executeJavaScript` can be fully applied — `getComputedStyle` agrees — while
   * `capturePage()` still returns the last painted frame. The symptom is a
   * screenshot of the *previous* theme with no error anywhere, which reads as
   * "the theme override is broken" rather than "the window never repainted".
   */
  win.showInactive();
  win.webContents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 400));
}

/** Evaluate an expression from `variable` in the renderer and print the result. */
async function runEval(win: BrowserWindow, variable: string): Promise<void> {
  const expression = process.env[variable];
  if (!expression) return;
  try {
    // The variable holds a JS *expression*; wrap an IIFE around it yourself if
    // you need statements. Serialising here (rather than returning the value)
    // keeps DOM objects like DOMRect legible instead of arriving as `{}`.
    //
    // Wrapped in Promise.resolve so an async expression works: an unwrapped
    // promise stringifies to `{}`, which looks like an empty result rather than
    // a mistake.
    const value: unknown = await win.webContents.executeJavaScript(
      `Promise.resolve(${expression}).then((v) => JSON.stringify(v, null, 2))`,
    );
    // eslint-disable-next-line no-console -- this IS the tool's output
    console.log(`[${variable}] ${String(value)}`);
  } catch (error) {
    // eslint-disable-next-line no-console -- ditto
    console.error(`[${variable}] failed`, error);
  }
}

/**
 * Type `MSTUDIO_TYPE` into the focused element as real input events.
 *
 * `webContents.sendInputEvent` goes in above the DOM, the way a keyboard does,
 * so xterm's own key handling runs. A synthetic `KeyboardEvent` dispatched from
 * page script does not: xterm reads from a hidden textarea driven by the real
 * input pipeline, so a dispatched event changes nothing.
 */
async function runType(win: BrowserWindow): Promise<void> {
  const text = process.env['MSTUDIO_TYPE'];
  if (!text) return;

  for (const char of text.replace(/\\n/g, '\n')) {
    if (char === '\n') {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
      await new Promise((resolve) => setTimeout(resolve, 12));
      continue;
    }

    /**
     * Shift has to be declared for capitals.
     *
     * Without it the event carries the physical key and arrives lowercased:
     * `git add -A` reaches the shell as `git add -a`, which is a different flag
     * — and the failure is invisible unless you read the terminal output. Every
     * other punctuation character survives unshifted, so this is the one case
     * that needs it.
     */
    const shifted = char !== char.toLowerCase() && char === char.toUpperCase();
    const modifiers = (shifted ? ['shift'] : []) as Electron.InputEvent['modifiers'];

    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: char, modifiers });
    win.webContents.sendInputEvent({ type: 'char', keyCode: char, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: char, modifiers });
    await new Promise((resolve) => setTimeout(resolve, 12));
  }

  // Let the shell run and the output stream back.
  await new Promise((resolve) => setTimeout(resolve, Number(process.env['MSTUDIO_TYPE_WAIT_MS'] ?? 2500)));
}

/**
 * Send chords from `MSTUDIO_KEYS` as real input events.
 *
 * Separate from MSTUDIO_TYPE because a shortcut has to be tested *against* xterm's
 * key handling, not through it: the question is whether the chord escapes the
 * terminal to reach the app, and only a genuine modifier-bearing event answers
 * it.
 */
async function runKeys(win: BrowserWindow): Promise<void> {
  const raw = process.env['MSTUDIO_KEYS'];
  if (!raw) return;

  const chords = JSON.parse(raw) as { keyCode: string; modifiers?: string[] }[];
  for (const chord of chords) {
    const modifiers = (chord.modifiers ?? []) as Electron.InputEvent['modifiers'];
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: chord.keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: chord.keyCode, modifiers });
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
}

/** Log the native application menu — invisible to the DOM and to a screenshot. */
function dumpMenu(): void {
  if (process.env['MSTUDIO_DUMP_MENU'] !== '1') return;
  const menu = Menu.getApplicationMenu();
  if (!menu) return;

  const describe = (items: Electron.MenuItem[]): unknown[] =>
    items
      .filter((item) => item.type !== 'separator')
      .map((item) => ({
        label: item.label,
        role: item.role,
        accelerator: item.accelerator ?? undefined,
        ...(item.submenu ? { submenu: describe(item.submenu.items) } : {}),
      }));

  // eslint-disable-next-line no-console -- this IS the tool's output
  console.log(`[menu] ${JSON.stringify(describe(menu.items), null, 2)}`);
}
