import { apiClientMain } from '@midnite/studio-feature-api-client/main';
import { browserMain } from '@midnite/studio-feature-browser/main';
import { captureMain } from '@midnite/studio-feature-capture/main';
import { chatsMain } from '@midnite/studio-feature-chats/main';
import { companionMain } from '@midnite/studio-feature-companion/main';
import { councilsMain } from '@midnite/studio-feature-councils/main';
import { databaseMain } from '@midnite/studio-feature-database/main';
import { financeMain } from '@midnite/studio-feature-finance/main';
import { ledgerMain } from '@midnite/studio-feature-ledger/main';
import { mediaAudioMain } from '@midnite/studio-feature-media-audio/main';
import { mediaCoreMain } from '@midnite/studio-feature-media-core/main';
import { mediaDocsMain } from '@midnite/studio-feature-media-docs/main';
import { mediaGameMain } from '@midnite/studio-feature-media-game/main';
import { mediaImagesMain } from '@midnite/studio-feature-media-images/main';
import { mediaLibraryMain } from '@midnite/studio-feature-media-library/main';
import { mediaMapMain } from '@midnite/studio-feature-media-map/main';
import { mediaModelMain } from '@midnite/studio-feature-media-model/main';
import { mediaSpriteMain } from '@midnite/studio-feature-media-sprite/main';
import { mediaTerrainMain } from '@midnite/studio-feature-media-terrain/main';
import { mediaVideoMain } from '@midnite/studio-feature-media-video/main';
import { modelsMain } from '@midnite/studio-feature-models/main';
import { monitorMain } from '@midnite/studio-feature-monitor/main';
import { notesMain } from '@midnite/studio-feature-notes/main';
import { optimizerMain } from '@midnite/studio-feature-optimizer/main';
import { reportMain } from '@midnite/studio-feature-report/main';
import { testsMain } from '@midnite/studio-feature-tests/main';
import { vanguardMain } from '@midnite/studio-feature-vanguard/main';
import { workflowsMain } from '@midnite/studio-feature-workflows/main';
import { CHANNELS, MCP_TOOL_IDS, type FeatureToggleId } from '@midnite/studio-shared';

import { MCP_TOOL_MANIFESTS } from './mcp/tool-manifests';

/**
 * The channels each toggle's main half registers (Phase 135 Theme E): the gate's input, read from each feature
 * main's own `channels` so it cannot drift from what is actually bound. Toggles with no main half (Tasks,
 * Slides) and toggles whose IPC stays open (`ipcOpen`: Vault, Pull requests, Sessions) are absent or skipped.
 *
 * Settings ▸ System Health is the frame's, so the monitor's two health channels stay open.
 */
const FRAME_CHANNELS = new Set<string>([CHANNELS.systemHealth, CHANNELS.systemHealthStartSshAgent]);

const open = (channels: readonly string[]) => channels.filter((c) => !FRAME_CHANNELS.has(c));

export const FEATURE_GATE_CHANNELS: Partial<Record<FeatureToggleId, readonly string[]>> = {
  books: ledgerMain.channels,
  notes: notesMain.channels,
  chats: chatsMain.channels,
  optimizer: optimizerMain.channels,
  monitor: open(monitorMain.channels),
  capture: captureMain.channels,
  vanguard: vanguardMain.channels,
  tests: testsMain.channels,
  database: databaseMain.channels,
  'api-client': apiClientMain.channels,
  councils: councilsMain.channels,
  workflows: workflowsMain.channels,
  media: [
    mediaCoreMain,
    mediaDocsMain,
    mediaImagesMain,
    mediaLibraryMain,
    mediaAudioMain,
    mediaVideoMain,
    mediaMapMain,
    mediaTerrainMain,
    mediaSpriteMain,
    mediaModelMain,
    mediaGameMain,
  ].flatMap((m) => m.channels),
  models: modelsMain.channels,
  browser: browserMain.channels,
  companion: companionMain.channels,
  loops: [CHANNELS.loopRunsList, CHANNELS.loopRunsStart, CHANNELS.loopRunsStop],
  finance: financeMain.channels,
  report: reportMain.channels,
};

/**
 * The `midnite` MCP tools each toggle owns: a call to one answers `refused` while its feature is off. Media's come from
 * its manifests' `mcpTools`; Workflows' and the Companion's from their id prefixes (`defaultMcpToolOwner`'s table).
 */
export const FEATURE_GATE_MCP_TOOLS: Partial<Record<FeatureToggleId, readonly string[]>> = {
  media: MCP_TOOL_MANIFESTS.flatMap((m) => m.mcpTools),
  workflows: MCP_TOOL_IDS.filter((id) => id.startsWith('workflow_')),
  companion: MCP_TOOL_IDS.filter((id) => id.startsWith('companion_')),
};
