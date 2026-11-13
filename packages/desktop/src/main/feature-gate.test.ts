import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SUITE_PREFS_FILE_NAME } from '@midnite/studio-shared';

import {
  applyDisabledFeatures,
  bindFeatureLifecycle,
  channelFeatureOff,
  configureFeatureChannels,
  configureFeatureMcpTools,
  featureOffAnswer,
  isFeatureEnabled,
  loadFeatureGate,
  mcpToolOffMessage,
  resetFeatureGateForTests,
} from './feature-gate';
import { FEATURE_GATE_MCP_TOOLS } from './feature-gate-channels';
import type { Logger } from './log';

const quiet = Object.assign(() => undefined, { info: () => undefined, warn: () => undefined, error: () => undefined }) as Logger;

describe('feature gate (Phase 135 Theme E)', () => {
  let dir: string | null = null;
  afterEach(() => {
    resetFeatureGateForTests();
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('reads the switched-off features from suite-prefs.json at boot, everything on without a file', () => {
    dir = mkdtempSync(join(tmpdir(), 'feature-gate-'));
    expect(loadFeatureGate(dir, quiet)).toEqual([]);
    writeFileSync(join(dir, SUITE_PREFS_FILE_NAME), JSON.stringify({ version: 1, studioFeatures: { disabled: ['chats', 'councils', 'bogus'] } }));
    expect(loadFeatureGate(dir, quiet)).toEqual(['chats', 'councils']);
    expect(isFeatureEnabled('chats')).toBe(false);
    expect(isFeatureEnabled('notes')).toBe(true);
  });

  it('answers a switched-off feature’s channel with the error envelope, and lets it through again once on', () => {
    configureFeatureChannels({ chats: ['chat:list', 'shared:x'], councils: ['council:list'], notes: ['shared:x'] });
    expect(featureOffAnswer('chat:list')).toBeUndefined();
    applyDisabledFeatures(['chats']);
    expect(featureOffAnswer('chat:list')).toEqual({ ok: false, kind: 'error', message: 'Chats is switched off in Settings ▸ Features' });
    expect(channelFeatureOff('council:list')).toBeUndefined();
    // A channel two features claim is never gated.
    expect(channelFeatureOff('shared:x')).toBeUndefined();
    applyDisabledFeatures([]);
    expect(featureOffAnswer('chat:list')).toBeUndefined();
  });

  it('never gates a toggle whose IPC stays open', () => {
    configureFeatureChannels({ vault: ['secrets:has'], sessions: ['terminal:list'] });
    applyDisabledFeatures(['vault', 'sessions']);
    expect(channelFeatureOff('secrets:has')).toBeUndefined();
    expect(channelFeatureOff('terminal:list')).toBeUndefined();
  });

  it('starts work only while on, stops it when switched off and restarts it when back on', () => {
    const start = vi.fn();
    const stop = vi.fn();
    bindFeatureLifecycle('vanguard', 'sensors', start, stop);
    expect(start).toHaveBeenCalledTimes(1);
    applyDisabledFeatures(['vanguard']);
    expect(stop).toHaveBeenCalledTimes(1);
    applyDisabledFeatures(['vanguard', 'notes']);
    expect(stop).toHaveBeenCalledTimes(1);
    applyDisabledFeatures([]);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('never starts work for a feature switched off at boot', () => {
    dir = mkdtempSync(join(tmpdir(), 'feature-gate-'));
    writeFileSync(join(dir, SUITE_PREFS_FILE_NAME), JSON.stringify({ version: 1, studioFeatures: { disabled: ['finance'] } }));
    loadFeatureGate(dir, quiet);
    const start = vi.fn();
    bindFeatureLifecycle('finance', 'rates', start, () => undefined);
    expect(start).not.toHaveBeenCalled();
  });

  it("refuses a switched-off feature's MCP tools and only those", () => {
    configureFeatureMcpTools(FEATURE_GATE_MCP_TOOLS);
    expect(FEATURE_GATE_MCP_TOOLS.media).toContain('model_render_preview');
    expect(mcpToolOffMessage('model_render_preview')).toBeUndefined();
    applyDisabledFeatures(['media']);
    expect(mcpToolOffMessage('model_render_preview')).toMatch(/Media, which is switched off/);
    expect(mcpToolOffMessage('repo.status')).toBeUndefined();
    applyDisabledFeatures([]);
    expect(mcpToolOffMessage('model_render_preview')).toBeUndefined();
  });
});
