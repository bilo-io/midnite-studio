import { describe, expect, it, vi } from 'vitest';

import {
  resolveSuitePrefs,
  type MidniteStudioBridge,
  type SuitePrefsKey,
  type SuitePrefsSetRequest,
  type SuitePrefsSnapshot,
} from '@midnite/studio-shared';

import {
  buildSeedRequests,
  SEED_SETTINGS_KEY,
  SEED_TITLEBAR_STATUS_KEY,
  seedSuitePrefsFromLocalStorage,
} from './suite-prefs-seed';

function storage(entries: Record<string, unknown>) {
  return {
    getItem: (key: string) => (key in entries ? JSON.stringify(entries[key]) : null),
  };
}

/** A bridge over an in-memory file, so the seed's sets can be read back like main would. */
function memoryBridge(initial: Record<string, unknown> = {}) {
  const file: Record<string, unknown> = { ...initial };
  const snapshot = (): SuitePrefsSnapshot => resolveSuitePrefs(file);
  const set = vi.fn(async (req: SuitePrefsSetRequest) => {
    file[req.key] = req.value;
    return { ok: true as const, snapshot: snapshot() };
  });
  const bridge: MidniteStudioBridge['suitePrefs'] = {
    get: async () => snapshot(),
    set,
    onChanged: () => () => undefined,
  };
  return { bridge, set, snapshot };
}

const STUDIO_SETTINGS = {
  state: {
    // appearance-store v2
    accent: 'rose',
    motion: 'reduced',
    density: 'compact',
    uiFont: 'mono',
    background: 'grid',
    bgIntensity: 'bold',
    effects: { pageReveal: false, typewriter: true, glass: false },
    shimmer: 'rtl',
    // palette-store
    activePaletteId: 'tokyo-night',
    terminalPaletteOverride: 'monokai',
    editorPaletteOverride: null,
    userPalettes: [],
    // activity-palette-store
    statusOverrides: {},
    agentStyle: 'metallic',
    shellStyle: 'matchAgent',
  },
  version: 2,
};

const STUDIO_TITLEBAR = {
  state: {
    showDate: false,
    showTime: true,
    showWeather: false,
    weatherUnits: 'f',
    weatherLocation: { lat: 51.5, lon: -0.12, label: 'London' },
    clockMode: 'analogue',
    showSeconds: true,
    worldClocksMode: 'digital',
    worldClockZones: [{ label: 'Cape Town', tz: 'Africa/Johannesburg' }],
    visibleSections: { calendar: true, weather: false, worldClocks: true, time: true },
  },
  version: 1,
};

describe('suite-prefs seed (Studio, first boot)', () => {
  it('seeds every group from midnite.settings and midnite.titlebar-status, one set per group', async () => {
    const { bridge, set, snapshot } = memoryBridge();
    const outcome = await seedSuitePrefsFromLocalStorage(
      bridge,
      storage({ [SEED_SETTINGS_KEY]: STUDIO_SETTINGS, [SEED_TITLEBAR_STATUS_KEY]: STUDIO_TITLEBAR }),
    );

    expect(outcome).toBe('seeded');
    expect(set.mock.calls.map(([req]) => req.key)).toEqual<SuitePrefsKey[]>([
      'appearance',
      'palette',
      'activityPalette',
      'titlebarStatus',
    ]);
    const { prefs, stored } = snapshot();
    expect(stored).toHaveLength(4);
    expect(prefs.appearance).toEqual({
      accent: 'rose',
      motion: 'reduced',
      density: 'compact',
      uiFont: 'mono',
      background: 'grid',
      bgIntensity: 'bold',
      effects: { pageReveal: false, typewriter: true, glass: false },
      shimmer: 'rtl',
    });
    expect(prefs.palette).toMatchObject({ activePaletteId: 'tokyo-night', terminalPaletteOverride: 'monokai' });
    expect(prefs.activityPalette).toMatchObject({ activePaletteId: 'brand', agentStyle: 'metallic', shellStyle: 'matchAgent' });
    expect(prefs.titlebarStatus).toMatchObject({
      showDate: false,
      weatherUnits: 'f',
      clockMode: 'analogue',
      worldClockZones: [{ label: 'Cape Town', tz: 'Africa/Johannesburg' }],
    });
    // Only each group's own fields cross: no palette field lands in appearance.
    expect(Object.keys(prefs.appearance)).not.toContain('activePaletteId');
  });

  it('routes a shared activePaletteId that names an activity preset to the activity palette', () => {
    const requests = buildSeedRequests(
      storage({ [SEED_SETTINGS_KEY]: { state: { ...STUDIO_SETTINGS.state, activePaletteId: 'ocean' }, version: 2 } }),
    );
    const byKey = Object.fromEntries(requests.map((r) => [r.key, r.value])) as Record<string, Record<string, unknown>>;
    expect(byKey.activityPalette?.activePaletteId).toBe('ocean');
    expect(byKey.palette?.activePaletteId).toBe('github-dark');
  });

  it('does nothing when the file already holds a group', async () => {
    const { bridge, set } = memoryBridge({ version: 1, appearance: { accent: 'blue' } });
    const outcome = await seedSuitePrefsFromLocalStorage(bridge, storage({ [SEED_SETTINGS_KEY]: STUDIO_SETTINGS }));
    expect(outcome).toBe('already-present');
    expect(set).not.toHaveBeenCalled();
  });

  it('sends nothing when localStorage holds nothing, and skips a group whose fields are invalid', async () => {
    const empty = memoryBridge();
    expect(await seedSuitePrefsFromLocalStorage(empty.bridge, storage({}))).toBe('nothing-to-seed');
    expect(empty.set).not.toHaveBeenCalled();

    const requests = buildSeedRequests(
      storage({ [SEED_TITLEBAR_STATUS_KEY]: { state: { weatherUnits: 'kelvin' }, version: 1 } }),
    );
    expect(requests).toEqual([]);
  });

  it('reports a partial seed when main refuses a group', async () => {
    const { bridge } = memoryBridge();
    bridge.set = vi.fn(async (req: SuitePrefsSetRequest) =>
      req.key === 'palette' ? { ok: false as const, error: 'nope' } : { ok: true as const, snapshot: resolveSuitePrefs({}) },
    );
    expect(await seedSuitePrefsFromLocalStorage(bridge, storage({ [SEED_SETTINGS_KEY]: STUDIO_SETTINGS }))).toBe('partial');
  });

  it('is unavailable, not thrown, without a bridge or when the bridge fails', async () => {
    expect(await seedSuitePrefsFromLocalStorage(undefined, storage({}))).toBe('unavailable');
    const failing: MidniteStudioBridge['suitePrefs'] = {
      get: () => Promise.reject(new Error('boom')),
      set: vi.fn(),
      onChanged: () => () => undefined,
    };
    expect(await seedSuitePrefsFromLocalStorage(failing, storage({ [SEED_SETTINGS_KEY]: STUDIO_SETTINGS }))).toBe(
      'unavailable',
    );
  });
});
