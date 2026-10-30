import type { Page } from '@playwright/test';

/**
 * A mock `window.midniteStudio` for a suite app's renderer (Phase 123 Theme I). The suite apps are served
 * by their own Vite servers, not Studio's, and each preload exposes a different set of namespaces, so one
 * hand-written bridge per app would be 7k lines of fixtures. This is a deep proxy instead: any namespace
 * is a function-and-object that answers every call with a resolved `{ ok: true, value: null }` and every
 * `on*` with an unsubscribe, and the few slices the shell itself reads are real.
 *
 * `windowChrome` is the one the specs assert on: `toggleMaximize` calls are counted on
 * `window.__shellCalls.toggleMaximize`.
 */
export type SuiteBridgeOptions = {
  /** What a call answers, by dotted path (`'vanguard.findings.list'`); anything unlisted answers `{ ok: true, value: null }`. */
  answers?: Record<string, unknown>;
  /** `windowChrome.frameless`; the shell draws its own title bar only when true. Default true. */
  frameless?: boolean;
};

declare global {
  interface Window {
    __shellCalls?: { toggleMaximize: number };
  }
}

export async function installSuiteBridge(page: Page, options: SuiteBridgeOptions = {}): Promise<void> {
  await page.addInitScript((opts: { frameless: boolean; answers: Record<string, unknown> }) => {
    const calls = { toggleMaximize: 0 };
    (window as unknown as { __shellCalls: typeof calls }).__shellCalls = calls;
    const unsubscribe = () => undefined;
    const make = (name: string): unknown =>
      new Proxy(function () {}, {
        get: (_t, key) => (key === 'then' || typeof key === 'symbol' ? undefined : make(`${name}.${String(key)}`)),
        apply: () => {
          if (/(^|\.)on[A-Z][^.]*$/.test(name)) return unsubscribe;
          return Promise.resolve(name in opts.answers ? opts.answers[name] : { ok: true, value: null });
        },
      });
    const real: Record<string, unknown> = {
      windowChrome: {
        platform: 'darwin',
        frameless: opts.frameless,
        onFullscreenChange: () => unsubscribe,
        onFocusChange: () => unsubscribe,
        setBackgroundColor: () => undefined,
        toggleMaximize: () => {
          calls.toggleMaximize += 1;
        },
      },
      suitePrefs: { get: async () => ({}), set: async () => ({ ok: true }), onChanged: () => unsubscribe },
      metrics: { start: () => undefined, stop: () => undefined, onSample: () => unsubscribe },
    };
    (window as unknown as { midniteStudio: unknown }).midniteStudio = new Proxy(real, {
      get: (target, key) => (key in target ? target[key as string] : key === 'then' || typeof key === 'symbol' ? undefined : make(String(key))),
      has: () => true,
    });
  }, { frameless: options.frameless ?? true, answers: options.answers ?? {} });
}

/** What Vanguard's panes read on mount: nothing found, no sensors, no connections. */
export const VANGUARD_EMPTY_ANSWERS: Record<string, unknown> = {
  'vanguard.findings.list': { findings: [] },
  'vanguard.sensors': { sensors: [], active: false },
  'vanguard.connections': { at: null, active: false, connections: [] },
  'vanguard.settings': {
    version: 1,
    sensors: {},
    cadenceSeconds: 30,
    quarantineRetentionDays: 30,
    viewOpened: true,
    autoPauseSeverities: ['critical'],
    scanLoginItems: false,
  },
  'vanguard.responseState': { quarantineDir: '', quarantine: [], unavailable: {} },
  'vanguard.malware.status': null,
};

/** What Agents' first pane reads on mount: no chats yet. */
export const AGENTS_EMPTY_ANSWERS: Record<string, unknown> = {
  'chats.list': { chats: [] },
};

/** Where each suite app's Vite server listens under `playwright.config.ts`. */
export const SUITE_APP_URLS = {
  vanguard: `http://localhost:${process.env.MSTUDIO_E2E_VANGUARD_PORT ?? 5292}/`,
  agents: `http://localhost:${process.env.MSTUDIO_E2E_AGENTS_PORT ?? 5290}/`,
} as const;
