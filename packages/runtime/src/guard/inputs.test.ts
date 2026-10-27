import { describe, expect, it } from 'vitest';

import { resolveGuardInputs } from './inputs';

describe('resolveGuardInputs (Phase 122 Theme A)', () => {
  it('resolves needed inputs and executes resolvers once', async () => {
    let osvCalls = 0;
    const { inputs, skipped } = await resolveGuardInputs(['osv', 'lockfiles'], {
      resolvers: {
        osv: async () => {
          osvCalls += 1;
          return { vulns: ['CVE-2026-1234'] };
        },
        lockfiles: () => ({ packages: ['lodash@4.17.21'] }),
      },
    });

    expect(osvCalls).toBe(1);
    expect(inputs.osv).toEqual({ vulns: ['CVE-2026-1234'] });
    expect(inputs.lockfiles).toEqual({ packages: ['lodash@4.17.21'] });
    expect(skipped).toEqual({});
  });

  it('skips inputs when privacy switches are false and records the switch', async () => {
    const { inputs, skipped } = await resolveGuardInputs(['osv', 'ports'], {
      switches: {
        'privacy.feed.osv': false,
      },
      resolvers: {
        osv: () => ({ vulns: [] }),
        ports: () => ({ open: [80] }),
      },
    });

    expect(inputs.osv).toBeUndefined();
    expect(skipped.osv).toBe('privacy.feed.osv');
    expect(inputs.ports).toEqual({ open: [80] });
  });

  it('records resolver failure details as skipped', async () => {
    const { inputs, skipped } = await resolveGuardInputs(['threatFeed'], {
      resolvers: {
        threatFeed: () => {
          throw new Error('Network timeout');
        },
      },
    });

    expect(inputs.threatFeed).toBeUndefined();
    expect(skipped.threatFeed).toContain('error: Network timeout');
  });
});
