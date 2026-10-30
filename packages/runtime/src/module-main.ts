import type { FeatureMainContext, FeatureMainModule } from './feature-main';

/** One module a host mounts: its main half, the services it is handed, and the channels it leaves to an earlier mount. */
export type ModuleMount = {
  module: FeatureMainModule<never>;
  services: unknown;
  /**
   * Channels this module declares that an *earlier* mount in the same host already registers (two modules
   * that both list the host's terminals, say). They are registered once, by the first mount: this module's
   * handler for each is dropped. Naming a channel no earlier mount declares, or one this module does not
   * declare, is an error — it is a typo or a stale exemption, not a choice.
   */
  shared?: readonly string[];
};

/**
 * Mount several modules' main halves in one host — Phase 124 Themes B and E.3.
 *
 * A module's main half is a {@link FeatureMainModule} (its `feature` field carries the module id),
 * so it plugs into the same seam features use. A host that mounts more than one must hand each a
 * disjoint set of IPC channels, except the ones a later mount lists in {@link ModuleMount.shared}:
 * this checks the declared `channels` up front and throws naming both modules, before anything
 * registers, so a clash is a boot-time error rather than a half-registered host.
 */
export function mountModuleMains(ctx: FeatureMainContext, mounts: readonly ModuleMount[]): void {
  const owner = new Map<string, string>();
  for (const { module, shared = [] } of mounts) {
    for (const channel of shared) {
      if (!module.channels.includes(channel)) throw new Error(`module '${module.feature}' marks '${channel}' shared but does not declare it`);
      if (!owner.has(channel)) throw new Error(`module '${module.feature}' marks '${channel}' shared but no earlier mount declares it`);
    }
    for (const channel of module.channels) {
      if (shared.includes(channel)) continue;
      const prior = owner.get(channel);
      if (prior !== undefined) throw new Error(`IPC channel '${channel}' is declared by both module '${prior}' and module '${module.feature}'`);
      owner.set(channel, module.feature);
    }
  }
  for (const { module, services, shared = [] } of mounts) {
    (module as FeatureMainModule<unknown>).register(shared.length > 0 ? withoutChannels(ctx, new Set(shared)) : ctx, services);
  }
}

/** `ctx` with registration on `skip` silently dropped: the channel already has its one handler. */
function withoutChannels(ctx: FeatureMainContext, skip: ReadonlySet<string>): FeatureMainContext {
  return {
    ...ctx,
    ipc: {
      handle: (channel, schema, handler, onInvalid) => {
        if (!skip.has(channel)) ctx.ipc.handle(channel, schema, handler, onInvalid);
      },
      handleBare: (channel, handler) => {
        if (!skip.has(channel)) ctx.ipc.handleBare(channel, handler);
      },
      send: (channel, schema, handler, onInvalid) => {
        if (!skip.has(channel)) ctx.ipc.send(channel, schema, handler, onInvalid);
      },
    },
  };
}
