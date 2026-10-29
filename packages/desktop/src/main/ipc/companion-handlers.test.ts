import { afterEach, describe, expect, it, vi } from 'vitest';

const { getMediaAccessStatus } = vi.hoisted(() => ({
  getMediaAccessStatus: vi.fn((_mediaType: string): string => 'granted'),
}));
vi.mock('electron', () => ({ systemPreferences: { getMediaAccessStatus }, safeStorage: {}, utilityProcess: {} }));
// The feature's handlers are tested in its own package; this file holds only the Electron-bound reading.
vi.mock('@midnite/studio-feature-companion/main', () => ({ companionMain: { register: vi.fn() } }));
vi.mock('../mcp/dispatch', () => ({ dispatchMcpCall: vi.fn() }));
vi.mock('../pty-service', () => ({ livePtyActivityCounts: vi.fn() }));
vi.mock('../terminal-service', () => ({ listAgents: vi.fn() }));

import { readMicrophoneAccess } from './companion-handlers';

afterEach(() => {
  getMediaAccessStatus.mockReset();
  getMediaAccessStatus.mockImplementation(() => 'granted');
});

describe('readMicrophoneAccess', () => {
  it("reports macOS's microphone verdict as-is, and anything it can't read as unknown", () => {
    for (const status of ['granted', 'denied', 'restricted', 'not-determined'] as const) {
      getMediaAccessStatus.mockImplementation(() => status);
      expect(readMicrophoneAccess()).toBe(status);
    }
    getMediaAccessStatus.mockImplementation(() => 'something-new');
    expect(readMicrophoneAccess()).toBe('unknown');
    getMediaAccessStatus.mockImplementation(() => {
      throw new Error('not on this platform');
    });
    expect(readMicrophoneAccess()).toBe('unknown');
  });
});
