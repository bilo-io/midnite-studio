import type { FeatureMainContext, FeatureMainModule } from './feature-main';

/**
 * Mount several modules' main halves in one host — Phase 124 Theme B.
 *
 * A module's main half is a {@link FeatureMainModule} (its `feature` field carries the module id),
 * so it plugs into the same seam features use. A host that mounts more than one must hand each a
 * disjoint set of IPC channels: this checks the declared `channels` up front and throws naming both
 * modules, before anything registers, so a clash is a boot-time error rather than a half-registered host.
 */
export function mountModuleMains(ctx: FeatureMainContext, mounts: readonly { module: FeatureMainModule<never>; services: unknown }[]): void {
  const owner = new Map<string, string>();
  for (const { module } of mounts) {
    for (const channel of module.channels) {
      const prior = owner.get(channel);
      if (prior !== undefined) throw new Error(`IPC channel '${channel}' is declared by both module '${prior}' and module '${module.feature}'`);
      owner.set(channel, module.feature);
    }
  }
  for (const { module, services } of mounts) (module as FeatureMainModule<unknown>).register(ctx, services);
}
