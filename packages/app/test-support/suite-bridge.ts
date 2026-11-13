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
  /** `appVersion`, which with `suiteReleaseNotes` makes the rail's version pill draw. Absent, the pill is hidden (`0.0.0`). */
  appVersion?: string;
  /** What `suiteReleaseNotes.get` answers. */
  releaseNotes?: unknown;
};

declare global {
  interface Window {
    __shellCalls?: { toggleMaximize: number };
  }
}

export async function installSuiteBridge(page: Page, options: SuiteBridgeOptions = {}): Promise<void> {
  await page.addInitScript((opts: { frameless: boolean; answers: Record<string, unknown>; appVersion: string; releaseNotes: unknown }) => {
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
      appVersion: opts.appVersion,
      suiteReleaseNotes: { get: async () => opts.releaseNotes },
      suitePrefs: { get: async () => ({}), set: async () => ({ ok: true }), onChanged: () => unsubscribe },
      metrics: { start: () => undefined, stop: () => undefined, onSample: () => unsubscribe },
    };
    (window as unknown as { midniteStudio: unknown }).midniteStudio = new Proxy(real, {
      get: (target, key) => (key in target ? target[key as string] : key === 'then' || typeof key === 'symbol' ? undefined : make(String(key))),
      has: () => true,
    });
  }, {
    frameless: options.frameless ?? true,
    answers: options.answers ?? {},
    appVersion: options.appVersion ?? '0.0.0',
    releaseNotes: options.releaseNotes ?? { version: options.appVersion ?? '0.0.0', notes: null, error: null },
  });
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

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const isoDay = (monthsAhead: number): string => {
  const d = new Date();
  d.setUTCDate(15);
  d.setUTCMonth(d.getUTCMonth() + monthsAhead);
  return d.toISOString().slice(0, 10);
};
const startupSnapshot = (workspace: object) => ({ ok: true, value: { workspace, revision: 1, readOnly: false } });
const STARTUP_BASE = {
  version: 1,
  milestones: [],
  lines: [],
  scenarios: [],
  customers: [],
  invoices: [],
  vendors: [],
  contracts: [],
  invoiceCounter: 0,
  ledger: null,
};
const STARTUP_COMPANY = {
  name: 'Acme Ltd',
  currency: 'GBP',
  address: '',
  invoicePrefix: 'INV-',
  paymentTermsDays: 30,
  openingCash: { minor: 25_000_000, asOf: isoDay(0) },
};
const NO_BOOK = { ok: false, kind: 'no-book', message: 'No book is linked.' };

/** Startup with nothing set up: the first-run "Set up your company" form. */
export const STARTUP_EMPTY_ANSWERS: Record<string, unknown> = {
  'startup.get': startupSnapshot({ ...STARTUP_BASE, company: null }),
  'startup.ledgerSummary': NO_BOOK,
};

/** Startup with a company, three milestones (two dependency edges), two runway scenarios and a draft invoice. */
export const STARTUP_SEEDED_ANSWERS: Record<string, unknown> = {
  'startup.get': startupSnapshot({
    ...STARTUP_BASE,
    company: STARTUP_COMPANY,
    milestones: [
      { id: uid(1), title: 'Prototype', description: '', status: 'done', start: isoDay(-1), due: isoDay(1), dependsOn: [], tags: [] },
      { id: uid(2), title: 'Private beta', description: '', status: 'in-progress', start: isoDay(2), due: isoDay(4), dependsOn: [uid(1)], tags: [] },
      { id: uid(3), title: 'Launch', description: '', status: 'planned', start: isoDay(5), due: isoDay(7), dependsOn: [uid(1), uid(2)], tags: [] },
    ],
    lines: [
      { id: uid(5), kind: 'cost', name: 'Salaries', category: 'people', minor: 1_200_000, cadence: 'monthly', start: isoDay(0).slice(0, 7), growthBpPerMonth: 0 },
      { id: uid(6), kind: 'revenue', name: 'Subscriptions', category: 'revenue', minor: 400_000, cadence: 'monthly', start: isoDay(0).slice(0, 7), growthBpPerMonth: 300 },
    ],
    scenarios: [
      { id: '00000000-0000-4000-8000-000000000001', name: 'Base', costMultiplierBp: 10000, revenueMultiplierBp: 10000, extraLines: [] },
      { id: uid(9), name: 'Lean', costMultiplierBp: 8000, revenueMultiplierBp: 10000, extraLines: [] },
    ],
    customers: [{ id: uid(20), name: 'Globex', address: '' }],
    invoices: [
      {
        id: uid(30),
        number: null,
        customerId: uid(20),
        issueDate: null,
        dueDate: null,
        lines: [{ description: 'Consulting', quantityMilli: 1500, unitMinor: 8000, taxRateBp: 2000 }],
        notes: '',
        status: 'draft',
        entries: {},
      },
    ],
    invoiceCounter: 0,
  }),
  'startup.projection': {
    ok: true,
    value: {
      months: Array.from({ length: 12 }, (_, i) => ({
        month: isoDay(i).slice(0, 7),
        revenueMinor: 400_000 + i * 12_000,
        costMinor: 1_200_000,
        netMinor: -800_000 + i * 12_000,
        cashMinor: 25_000_000 - 800_000 * (i + 1) + 6_000 * i * (i + 1),
      })),
      burnMinor: -800_000,
      runwayMonths: 30,
      zeroCashMonth: null,
      defaultAlive: false,
    },
  },
  'startup.ledgerSummary': NO_BOOK,
};

/** Where each suite app's Vite server listens under `playwright.config.ts`. */
export const SUITE_APP_URLS = {
  vanguard: `http://localhost:${process.env.MSTUDIO_E2E_VANGUARD_PORT ?? 5292}/`,
  agents: `http://localhost:${process.env.MSTUDIO_E2E_AGENTS_PORT ?? 5290}/`,
  startup: `http://localhost:${process.env.MSTUDIO_E2E_STARTUP_PORT ?? 5298}/`,
} as const;
