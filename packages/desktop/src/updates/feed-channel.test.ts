import { describe, expect, it } from 'vitest';
import { feedChannelFor } from './feed-channel';

describe('feedChannelFor', () => {
  it('maps stable to latest channel', () => {
    expect(feedChannelFor('stable')).toEqual({
      channel: 'latest',
      allowPrerelease: false,
      allowDowngrade: false,
    });
  });

  it('never allows a downgrade on either channel', () => {
    expect(feedChannelFor('stable').allowDowngrade).toBe(false);
    expect(feedChannelFor('beta').allowDowngrade).toBe(false);
  });

  it('maps beta channel appropriately', () => {
    expect(feedChannelFor('beta')).toEqual({
      channel: 'beta',
      allowPrerelease: true,
      allowDowngrade: false,
    });
  });
});
