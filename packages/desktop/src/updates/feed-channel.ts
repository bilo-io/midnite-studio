export type UpdateChannel = 'stable' | 'beta';

export function feedChannelFor(c: UpdateChannel): { channel: string; allowPrerelease: boolean; allowDowngrade: boolean } {
  if (c === 'beta') {
    return { channel: 'beta', allowPrerelease: true, allowDowngrade: true };
  }
  return { channel: 'latest', allowPrerelease: false, allowDowngrade: false };
}
