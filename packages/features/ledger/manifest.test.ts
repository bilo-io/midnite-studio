import { describe, expect, it } from 'vitest';

import { CHANNELS, FEATURE_PLACEMENT, placementOwners } from '@midnite/studio-shared';

import { ledgerManifest } from './manifest';

describe('ledger manifest', () => {
  it('names exactly the ledger channel', () => {
    expect(ledgerManifest.ipc).toEqual([CHANNELS.ledger]);
  });

  it('is placed in money', () => {
    expect(FEATURE_PLACEMENT.ledger).toBe('money');
    expect(placementOwners(FEATURE_PLACEMENT[ledgerManifest.feature])[0]).toBe(ledgerManifest.owner);
  });
});
