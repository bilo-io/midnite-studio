import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, type SecurityFinding } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';
import { registerFindingsHandlers } from './findings-handlers';

describe('findings-handlers (Phase 120 Theme A)', () => {
  it('registers securityFindingsList, setStatus, and act channels', async () => {
    const ctx = createRecordingContext();
    const mockFinding: SecurityFinding = {
      id: 'f-1',
      fingerprint: 'fp-1',
      source: 'vanguard',
      severity: 'high',
      category: 'process',
      title: 'Suspicious process',
      detail: 'Details here',
      evidence: [{ kind: 'pid', pid: 100 }],
      remediation: [{ id: 'mute' }],
      firstSeen: 1000,
      lastSeen: 1000,
      count: 1,
      status: 'open',
    };

    const mockLedger = {
      list: vi.fn(async () => [mockFinding]),
      get: vi.fn(async (id: string) => (id === 'f-1' ? mockFinding : null)),
      setStatus: vi.fn(async (id: string, status: any) => ({ ...mockFinding, id, status })),
      record: vi.fn(),
      prune: vi.fn(),
      getSecurityDir: vi.fn(() => '/mock'),
    };

    registerFindingsHandlers(ctx, {
      ledger: () => mockLedger as any,
    });

    expect(ctx.channels).toEqual([
      CHANNELS.securityFindingsList,
      CHANNELS.securityFindingsSetStatus,
      CHANNELS.securityFindingsAct,
    ]);

    // Test securityFindingsList invoke
    const listRes = (await ctx.invoke(CHANNELS.securityFindingsList, {})) as { findings: SecurityFinding[] };
    expect(listRes.findings).toHaveLength(1);
    expect(listRes.findings[0]?.id).toBe('f-1');

    // Test securityFindingsSetStatus invoke
    const setStatusRes = (await ctx.invoke(CHANNELS.securityFindingsSetStatus, {
      id: 'f-1',
      status: 'acknowledged',
    })) as { ok: boolean; value: SecurityFinding };
    expect(setStatusRes.ok).toBe(true);
    expect(setStatusRes.value.status).toBe('acknowledged');

    // Test securityFindingsAct invoke for 'mute'
    const actRes = (await ctx.invoke(CHANNELS.securityFindingsAct, {
      findingId: 'f-1',
      action: { id: 'mute' },
    })) as { ok: boolean; value: { actionId: string } };
    expect(actRes.ok).toBe(true);
    expect(actRes.value.actionId).toBe('mute');
  });
});
