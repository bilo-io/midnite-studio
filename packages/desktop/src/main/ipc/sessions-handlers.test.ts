import { CHANNELS } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeHandlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (event: unknown, payload: unknown) => Promise<unknown>) => {
      invokeHandlers.set(channel, fn);
    }),
    on: vi.fn(),
  },
}));

const { mockGetOrLocate } = vi.hoisted(() => ({
  mockGetOrLocate: vi.fn(),
}));

vi.mock('../terminal-service', () => ({
  getOrLocateConversationId: (...args: unknown[]) => mockGetOrLocate(...args),
}));

import {
  configureSessions,
  registerSessionsHandlers,
  resetSessionsHandlersForTest,
} from './sessions-handlers';

describe('sessions-handlers', () => {
  beforeEach(() => {
    invokeHandlers.clear();
    mockGetOrLocate.mockReset();
    resetSessionsHandlersForTest();
    registerSessionsHandlers();
  });

  afterEach(() => {
    resetSessionsHandlersForTest();
  });

  describe('sessionsConversationId', () => {
    it('answers conversationId when resolved', async () => {
      mockGetOrLocate.mockResolvedValueOnce('12345678-1234-1234-1234-123456789abc');
      const handler = invokeHandlers.get(CHANNELS.sessionsConversationId);
      expect(handler).toBeDefined();

      const result = await handler!({}, { sessionId: 'sess-1' });
      expect(result).toEqual({ conversationId: '12345678-1234-1234-1234-123456789abc' });
      expect(mockGetOrLocate).toHaveBeenCalledWith('sess-1');
    });

    it('answers null conversationId when locator finds none', async () => {
      mockGetOrLocate.mockResolvedValueOnce(null);
      const handler = invokeHandlers.get(CHANNELS.sessionsConversationId);
      const result = await handler!({}, { sessionId: 'sess-empty' });
      expect(result).toEqual({ conversationId: null });
    });

    it('gracefully recovers with null on invalid payload', async () => {
      const handler = invokeHandlers.get(CHANNELS.sessionsConversationId);
      const result = await handler!({}, { badField: 123 });
      expect(result).toEqual({ conversationId: null });
    });
  });

  describe('sessionsHistory, sessionsTranscript, sessionsPurge', () => {
    it('wires history from injected store', async () => {
      const dummySession = {
        id: 's1',
        kind: 'shell' as const,
        title: 'midnite',
        cwd: '/repo',
        repoId: 'r1',
        createdAt: 100,
        closedAt: 200,
        exitCode: 0,
        reason: 'closed' as const,
        transcriptBytes: 0,
      };

      configureSessions({
        list: vi.fn().mockResolvedValue([dummySession]),
        append: vi.fn(),
        update: vi.fn(),
        transcript: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
        purge: vi.fn(),
      });

      const historyHandler = invokeHandlers.get(CHANNELS.sessionsHistory);
      expect(await historyHandler!({}, {})).toEqual({ sessions: [dummySession] });

      const transcriptHandler = invokeHandlers.get(CHANNELS.sessionsTranscript);
      expect(await transcriptHandler!({}, { sessionId: 's1' })).toEqual({
        bytes: new Uint8Array([1, 2, 3]),
      });
    });
  });
});
