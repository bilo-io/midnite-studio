/**
 * Reusable `vi.mock` factories for the two heavy, un-jsdom-able dependencies
 * this renderer mounts: Monaco (`@monaco-editor/react` + the app's own
 * `lib/monaco/monaco-loader`) and xterm (`@xterm/xterm` + its `addon-fit` /
 * `addon-webgl`). Neither has any business running for real under a unit
 * test — Monaco needs worker threads and a real layout engine jsdom does not
 * provide, and xterm needs a canvas — and the properties worth testing
 * (store wiring, prop plumbing, call discipline) don't depend on either
 * actually rendering. `code-editor.test.tsx` and `transcript-view.test.tsx`
 * already hand-wrote exactly these stubs before this file existed; this
 * generalises them so a new test does not have to re-invent either.
 *
 * **Why every factory here is imported *inside* an async `vi.mock` callback,
 * never passed by reference:** `vi.mock(path, factory)` calls are hoisted by
 * Vitest's transform to above every other statement in the file that calls
 * them — imports included. A factory function imported via an ordinary
 * `import { … } from './module-mocks'` is therefore still in its temporal
 * dead zone at the moment the hoisted `vi.mock` call actually runs, and
 * referencing it throws `ReferenceError: Cannot access '…' before
 * initialization` (verified against this project's own Vite/Vitest
 * transform before writing this file — this is not a documentation
 * assumption). A **dynamic** `import()` inside the factory has no such
 * restriction, because it is a runtime expression rather than a hoisted
 * static binding, so every export below is meant to be used like this:
 *
 * ```ts
 * vi.mock('@xterm/xterm', () =>
 *   import('../../../test-support/module-mocks').then((m) => m.mockXtermModule()),
 * );
 * ```
 *
 * A plain (non-hoisted) `import { fakeXtermInstances, resetXtermMocks } from
 * '../../../test-support/module-mocks'` at the top of the same test file is
 * completely unaffected by this — only the `vi.mock` call itself needs the
 * dynamic form — and resolves to the exact same module instance the mock
 * factory's dynamic import does, so mutations one makes (a constructed
 * terminal pushing itself onto `fakeXtermInstances`) are visible through the
 * other (also verified empirically).
 */

// --- Monaco (@monaco-editor/react + lib/monaco/monaco-loader) --------------

/** The props the fake `<Editor>` below was most recently mounted with. */
export type CapturedMonacoEditorProps = {
  onMount?: (editor: unknown, monaco: unknown) => void;
  onChange?: (value: string | undefined) => void;
};

let capturedMonacoEditorProps: CapturedMonacoEditorProps = {};

/** Read the most recent `<Editor onMount onChange>` call's own handlers. */
export function getCapturedMonacoEditorProps(): CapturedMonacoEditorProps {
  return capturedMonacoEditorProps;
}

/** Call from `beforeEach` — clears what the previous test's `<Editor>` captured. */
export function resetMonacoEditorMock(): void {
  capturedMonacoEditorProps = {};
}

/**
 * `vi.mock('@monaco-editor/react', …)` factory. Renders nothing (Monaco's
 * real `<Editor>` needs a real DOM layout engine and worker threads jsdom
 * does not provide) and records `onMount`/`onChange` so a test can drive them
 * by hand — `getCapturedMonacoEditorProps().onMount?.(fakeEditor, fakeMonaco)`
 * — exactly as `code-editor.test.tsx` already does inline.
 */
export function mockMonacoEditorModule() {
  return {
    default: (props: CapturedMonacoEditorProps) => {
      capturedMonacoEditorProps = props;
      return null;
    },
  };
}

/**
 * `vi.mock('../../../lib/monaco/monaco-loader', …)` factory (path is
 * relative to the calling test file, never to this one — `getMonaco` is
 * resolved by specifier, not by where this factory happens to live).
 *
 * The real `getMonaco()` resolves the statically-bundled `monaco-editor`
 * module (Phase 64 Theme A's curated worker diet); this canned answer is
 * only ever asked for `editor.defineTheme`/`editor.setTheme`, which is all
 * `useStudioMonacoTheme` needs to apply a palette.
 */
export function mockMonacoLoaderModule() {
  return {
    getMonaco: async () => ({
      editor: { defineTheme: () => {}, setTheme: () => {} },
    }),
  };
}

// --- xterm (@xterm/xterm + @xterm/addon-fit + @xterm/addon-webgl) ----------

/** The shape `attachCustomKeyEventHandler`'s callback is invoked with. */
export type FakeTerminalKeyEvent = {
  type: string;
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
};

/**
 * A fake `@xterm/xterm` `Terminal` — every instance constructed while this
 * mock is active pushes itself onto `fakeXtermInstances` below, generalising
 * `transcript-view.test.tsx`'s own `FakeTerminal`. Covers exactly the surface
 * this codebase's terminal components call: `open`/`loadAddon` (no-ops —
 * nothing here needs to actually paint), `write` (recorded, so a test can
 * assert what a session sent), and `attachCustomKeyEventHandler` (captured,
 * so a test can simulate a keystroke and read back whether xterm's own
 * "should I handle this or let the browser?" contract was honoured).
 */
export class FakeXtermTerminal {
  written: unknown[] = [];
  disposed = false;
  keyHandler: ((event: FakeTerminalKeyEvent) => boolean) | null = null;

  constructor(public options: Record<string, unknown> = {}) {
    fakeXtermInstances.push(this);
  }

  open(): void {}

  loadAddon(): void {}

  write(data: unknown): void {
    this.written.push(data);
  }

  attachCustomKeyEventHandler(handler: (event: FakeTerminalKeyEvent) => boolean): void {
    this.keyHandler = handler;
  }

  dispose(): void {
    this.disposed = true;
  }
}

/** Every `FakeXtermTerminal` constructed since the last `resetXtermMocks()`. */
export let fakeXtermInstances: FakeXtermTerminal[] = [];

/** Call from `beforeEach`/`afterEach` — a fresh terminal list per test. */
export function resetXtermMocks(): void {
  fakeXtermInstances = [];
}

/** `vi.mock('@xterm/xterm', …)` factory. */
export function mockXtermModule() {
  return { Terminal: FakeXtermTerminal };
}

/**
 * `vi.mock('@xterm/addon-fit', …)` factory. `fit()` is the only method any
 * component here calls, and always as a no-op — layout is exactly what jsdom
 * cannot provide, so there is nothing for a real fit to compute against.
 */
export function mockXtermAddonFitModule() {
  return {
    FitAddon: class {
      fit(): void {}
    },
  };
}

/**
 * `vi.mock('@xterm/addon-webgl', …)` factory. `terminal-view.tsx`'s own
 * `acquireWebglRef` calls `new WebglAddon()`, `.onContextLoss(handler)` and
 * `.dispose()` — never anything that would need a real GPU context, so a
 * fake that records nothing and never fires `onContextLoss` on its own
 * (a test simulating context loss calls the captured handler directly) is
 * the whole contract.
 */
export function mockXtermAddonWebglModule() {
  return {
    WebglAddon: class {
      onContextLoss(): void {}
      dispose(): void {}
    },
  };
}
