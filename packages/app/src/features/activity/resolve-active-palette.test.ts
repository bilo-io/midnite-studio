import { ACTIVITY_PRESETS, METAL_RING, type ActivityStatusStyle } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { resolveActivePalette } from './resolve-active-palette';

describe('resolveActivePalette', () => {
  it('with no overrides and defaults, matches the preset exactly for every status', () => {
    const resolved = resolveActivePalette('brand', {}, 'gradient', 'metallic');
    expect(resolved.statuses.agent).toEqual(ACTIVITY_PRESETS.brand?.statuses.agent);
    expect(resolved.statuses.shell).toEqual(ACTIVITY_PRESETS.brand?.statuses.shell);
    expect(resolved.statuses.done).toEqual(ACTIVITY_PRESETS.brand?.statuses.done);
  });

  it('falls back to Brand for an unknown preset id', () => {
    const resolved = resolveActivePalette('nope', {}, 'gradient', 'metallic');
    expect(resolved.statuses.agent).toEqual(ACTIVITY_PRESETS.brand?.statuses.agent);
  });

  it('an explicit per-status override always wins, agent and shell included', () => {
    const override: ActivityStatusStyle = { color: { kind: 'solid', color: '#123456' }, speed: 4, intensity: 0 };
    const resolved = resolveActivePalette(
      'brand',
      { agent: override, shell: override, done: override },
      'metallic',
      'matchAgent',
    );
    expect(resolved.statuses.agent).toEqual(override);
    expect(resolved.statuses.shell).toEqual(override);
    expect(resolved.statuses.done).toEqual(override);
  });

  it('agentStyle "metallic" swaps agent to the metal ring when there is no override', () => {
    const resolved = resolveActivePalette('brand', {}, 'metallic', 'metallic');
    expect(resolved.statuses.agent?.color).toEqual({ kind: 'gradient', stops: METAL_RING });
  });

  it('shellStyle "gradient" uses the preset\'s own agent ring, ignoring an agent-style override', () => {
    const resolved = resolveActivePalette('rainbow', {}, 'metallic', 'gradient');
    // shell reads the PRESET's raw agent ring, not the metallic-overridden one.
    expect(resolved.statuses.shell?.color).toEqual(ACTIVITY_PRESETS.rainbow?.statuses.agent?.color);
    expect(resolved.statuses.agent?.color).toEqual({ kind: 'gradient', stops: METAL_RING });
  });

  it('shellStyle "matchAgent" copies whatever agent resolved to, override included', () => {
    const override: ActivityStatusStyle = { color: { kind: 'solid', color: '#abcdef' }, speed: 2, intensity: 1 };
    const resolved = resolveActivePalette('ocean', { agent: override }, 'gradient', 'matchAgent');
    expect(resolved.statuses.shell).toEqual(override);
  });

  it('shellStyle "metallic" (default) keeps the preset\'s own metal ring', () => {
    const resolved = resolveActivePalette('ember', {}, 'gradient', 'metallic');
    expect(resolved.statuses.shell?.color).toEqual({ kind: 'gradient', stops: METAL_RING });
  });

  it('leaves every other status untouched by the agent/shell style pickers', () => {
    const resolved = resolveActivePalette('mono', {}, 'metallic', 'gradient');
    for (const status of ['thinking', 'waiting', 'running', 'queued', 'done', 'failed', 'idle'] as const) {
      expect(resolved.statuses[status]).toEqual(ACTIVITY_PRESETS.mono?.statuses[status]);
    }
  });
});
