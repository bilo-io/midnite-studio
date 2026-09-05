export type UpdateChannel = 'stable' | 'beta';

/**
 * `autoUpdater.channel` is appended to the `generic` feed base URL as
 * `<base>/<channel>-mac.yml` — see [`update-service.ts`](../main/update-service.ts)
 * and the base in [`electron-builder.yml`](../../electron-builder.yml). A naive
 * mapping (`'stable'` → `'stable'`) would request a `stable-mac.yml` that
 * `midnite-apps`' `release-feed.yml` never publishes — only `latest-mac.yml`
 * and, once cut, `beta-mac.yml` — producing electron-updater's
 * `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND`, which the app's fail-soft rule
 * ([Phase 33 Decision 3](../../../../.midnite/tasks/phases/phase-33-installable-app-and-cli-integration.md))
 * then swallows into a silently-inert updater. Mapping `'stable'` → `'latest'`
 * avoids that 404 by construction, and it is why this repo has never hit the
 * sibling app's most expensive updater bug — by accident of naming, not by
 * design that anyone wrote down until now.
 */
export function feedChannelFor(c: UpdateChannel): { channel: string; allowPrerelease: boolean; allowDowngrade: boolean } {
  if (c === 'beta') {
    return { channel: 'beta', allowPrerelease: true, allowDowngrade: true };
  }
  return { channel: 'latest', allowPrerelease: false, allowDowngrade: false };
}
