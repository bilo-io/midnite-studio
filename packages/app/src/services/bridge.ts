import type { ComponentProps } from 'react';

import type { TitleBar } from '@bilo-io/shell';
import type { MidniteGitBridge, WindowChromeBridge } from '@midnite/studio-shared';

/**
 * Access to the preload bridge — the renderer's only route to the main process.
 *
 * `window.midniteGit` is typed optional because the renderer also runs under
 * jsdom in unit tests, where no preload has executed. Components read it through
 * these helpers rather than touching `window` directly, so a test can render a
 * component without a bridge and assert the degraded state.
 */
export const bridge = (): MidniteGitBridge | undefined => window.midniteGit;

/** True in the Electron renderer, false under vitest/jsdom or a plain browser. */
export const hasBridge = (): boolean => window.midniteGit !== undefined;

/**
 * Compile-time proof that our restated WindowChromeBridge still matches the one
 * `@bilo-io/shell` actually consumes.
 *
 * `packages/shared` can't import the type: it is required by the Electron main
 * process and must not pull a React package into that module graph. So the
 * shape is restated there — and a restatement drifts. These two assignments
 * fail the build the moment the shapes diverge in either direction, which is
 * the whole reason the duplication is acceptable.
 *
 * Taken from `TitleBar`'s prop rather than imported by name: shell exports the
 * type only through its internal `./contracts` module, and the prop is the
 * shape that actually matters — it is what the component consumes.
 */
type ShellWindowChrome = NonNullable<ComponentProps<typeof TitleBar>['windowChrome']>;

const _ourBridgeSatisfiesShell = (ours: WindowChromeBridge): ShellWindowChrome => ours;
const _shellBridgeSatisfiesOurs = (theirs: ShellWindowChrome): WindowChromeBridge => theirs;
void _ourBridgeSatisfiesShell;
void _shellBridgeSatisfiesOurs;
