import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The vanguard feature (Phase 120): antivirus and agentic self-defense, copying monitor's template
 * (`../monitor/manifest.ts`). One global `vanguard` view — findings, a Sensors tab, a Network tab — and a
 * Settings page; the always-on sensors (themes C-G) live in `main/` behind the sensor host.
 *
 * Global like Monitor: it reads the machine, not one checkout. Chord-free in Studio's rail.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process composer reads this file too.
 */
export const vanguardManifest = defineFeatureManifest({
  feature: 'vanguard',
  owner: 'vanguard',
  views: [
    {
      id: 'vanguard',
      global: true,
      rail: {
        group: 'workspace',
        label: 'Vanguard',
        description: 'Security findings, the sensors that raise them, and what to do about each',
      },
    },
  ],
  settingsPages: ['vanguard'],
  ipc: [
    CHANNELS.securityFindingsList,
    CHANNELS.securityFindingsSetStatus,
    CHANNELS.securityFindingsAct,
    CHANNELS.vanguardSensors,
    CHANNELS.vanguardSensorRun,
    CHANNELS.vanguardSettingsGet,
    CHANNELS.vanguardSettingsSet,
    CHANNELS.vanguardViewOpened,
    CHANNELS.vanguardOpenQuarantine,
    CHANNELS.vanguardMalwareStatus,
    CHANNELS.vanguardMalwareScan,
    CHANNELS.vanguardMalwareScanCancel,
  ],
  events: [EVENT_CHANNELS.securityFindingsChanged, EVENT_CHANNELS.vanguardChanged],
  mcpTools: [],
});

export type VanguardManifest = typeof vanguardManifest;
