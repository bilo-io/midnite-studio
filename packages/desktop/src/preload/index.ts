import { contextBridge, ipcRenderer } from 'electron';

import {
  CHANNELS,
  EVENT_CHANNELS,
  WINDOW_FRAMELESS_ARG,
  type DesktopPlatform,
  type MidniteGitBridge,
  type Unsubscribe,
  type WindowChromeBridge,
} from '@midnite-git/shared';

/**
 * The preload: the entire surface the renderer can see.
 *
 * Two rules hold everything else together.
 *
 * 1. **Every subscription returns an unsubscribe.** React StrictMode
 *    double-mounts every effect in development; without a teardown the second
 *    mount adds a duplicate `ipcRenderer.on` listener and every pty byte
 *    arrives twice, every watch event triggers two refetches. The bug then
 *    disappears in production, which is the worst possible failure mode.
 *
 * 2. **The exposed object is typed as `MidniteGitBridge`.** `exposeInMainWorld`
 *    types its API parameter as `any`, so an inline literal is structurally
 *    unchecked: misspell a method and typecheck, the main-process tests and the
 *    renderer's own types all stay green while the call is `undefined` at
 *    runtime. Annotating the const is what makes the contract load-bearing.
 */

/** Typed `invoke` wrapper — one place where the `unknown` from IPC is narrowed. */
const call = <Req, Res>(channel: string, req?: Req): Promise<Res> =>
  ipcRenderer.invoke(channel, req) as Promise<Res>;

/** Subscribe to a main→renderer channel, returning the teardown. */
function subscribe<T>(channel: string, handler: (payload: T) => void): Unsubscribe {
  const listener = (_event: unknown, payload: T): void => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

// Single-sourced from the main process's window options — never re-derived from
// `process.platform` here (see WINDOW_FRAMELESS_ARG).
const framelessArg = process.argv.find((a) => a.startsWith(WINDOW_FRAMELESS_ARG));
const frameless = framelessArg?.slice(WINDOW_FRAMELESS_ARG.length) === '1';

/**
 * The `@bilo-io/shell` WindowChromeBridge implementation backing <TitleBar>.
 *
 * Fullscreen and focus are derived from one `window:state-changed` push rather
 * than three channels: the window emits them together and a single payload
 * keeps them from arriving out of order.
 */
const windowChrome: WindowChromeBridge = {
  platform: process.platform as DesktopPlatform,
  frameless,
  onFullscreenChange: (handler) =>
    subscribe<{ fullScreen: boolean }>(EVENT_CHANNELS.windowStateChanged, (state) =>
      handler(state.fullScreen),
    ),
  onFocusChange: (handler) =>
    subscribe<{ focused: boolean }>(EVENT_CHANNELS.windowStateChanged, (state) =>
      handler(state.focused),
    ),
  setBackgroundColor: (color) => {
    ipcRenderer.send(CHANNELS.windowSetBackground, color);
  },
};

/**
 * The exposed surface, group by group, as each phase's handlers land. Typed as a
 * `Pick` so a group can't be half-wired: naming it here without implementing
 * every method in it is a compile error, rather than an `undefined` the renderer
 * only discovers at the moment of the call.
 */
const bridge: Pick<MidniteGitBridge, 'repos' | 'window' | 'windowChrome' | 'menu'> = {
  repos: {
    open: (req) => call(CHANNELS.repoOpen, req),
    list: () => call(CHANNELS.repoList),
    close: (req) => call(CHANNELS.repoClose, req),
    refs: (req) => call(CHANNELS.repoRefs, req),
    worktrees: (req) => call(CHANNELS.repoWorktrees, req),
    worktreeAdd: (req) => call(CHANNELS.repoWorktreeAdd, req),
    worktreeRemove: (req) => call(CHANNELS.repoWorktreeRemove, req),
    pickDirectory: () => call(CHANNELS.repoPickDirectory),
  },
  window: {
    minimize: () => ipcRenderer.send(CHANNELS.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(CHANNELS.windowMaximizeToggle),
    close: () => ipcRenderer.send(CHANNELS.windowClose),
    getState: () => ipcRenderer.invoke(CHANNELS.windowState),
    onStateChange: (handler) => subscribe(EVENT_CHANNELS.windowStateChanged, handler),
  },
  menu: {
    onCommand: (handler) => subscribe(EVENT_CHANNELS.menuCommand, handler),
  },
  windowChrome,
};

try {
  contextBridge.exposeInMainWorld('midniteGit', bridge);
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
