// electron-fuses (Phase 117 Theme A): the one fuse flip-and-read-back helper for every binary the
// repo ships — Studio (`packages/desktop/scripts/lib/fuses.mjs`) and the launcher
// (`apps/launcher/scripts/lib/fuses.cjs`, the runtime every app bundle runs on). Each app owns only
// its EXPECTED table; the comparison lives here so a fix to it cannot land in one and not the other.
//
// Pure of `@electron/fuses` on purpose: the root has no node_modules entry for it, each app does, so
// the caller hands its own module in (`fuses`). The one thing worth knowing about that module:
// `getCurrentFuseWire` returns the RAW wire bytes — `FuseState.ENABLE` is 49 (`'1'`), `DISABLE` is
// 48 (`'0'`), `REMOVED` 114, `INHERIT` 144 — not booleans. `FuseState` is not re-exported from the
// barrel, so the two values are spelled here as the characters they are.

export const FUSE_ENABLED = '1'.charCodeAt(0); // 49
export const FUSE_DISABLED = '0'.charCodeAt(0); // 48

/** The `flipFuses` config for a table: the version and the signing note plus the table itself. */
export function fuseConfig(fuses, table) {
  return {
    version: fuses.FuseVersion.V1,
    resetAdHocDarwinSignature: false, // each afterPack signs the whole bundle after the flip
    ...table,
  };
}

/** Pure: every fuse whose wire state disagrees with `table` (`{[FuseV1Options.X]: boolean}`). Empty when it matches. */
export function mismatchesIn(fuses, wire, table) {
  const out = [];
  for (const [fuse, enabled] of Object.entries(table)) {
    const actual = wire[fuse];
    if (actual !== (enabled ? FUSE_ENABLED : FUSE_DISABLED)) {
      out.push(`${fuseName(fuses, Number(fuse))}: expected ${enabled ? 'on' : 'off'}, found ${describe(actual)}`);
    }
  }
  return out;
}

/** Read the wire back from a built binary and compare it with `table`. Empty when it matches. */
export async function fuseMismatches(fuses, exe, table) {
  const wire = await fuses.getCurrentFuseWire(exe);
  if (wire.version !== fuses.FuseVersion.V1) return [`fuse wire version ${String(wire.version)} (expected V1)`];
  return mismatchesIn(fuses, wire, table);
}

function fuseName(fuses, fuse) {
  return Object.keys(fuses.FuseV1Options).find((k) => fuses.FuseV1Options[k] === fuse) ?? `fuse ${fuse}`;
}

function describe(state) {
  if (state === FUSE_ENABLED) return 'on';
  if (state === FUSE_DISABLED) return 'off';
  return state === undefined ? 'absent' : `wire state ${String(state)}`;
}
