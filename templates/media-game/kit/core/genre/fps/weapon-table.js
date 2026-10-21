// @ts-check
/**
 * Midnite game kit — the FPS weapon table and trigger logic (engine-free).
 *
 * Every weapon is data: `kind` is `hitscan` (a ray, resolved at once) or
 * `projectile` (a body that travels). `fire` returns what the shot did, so the
 * scene only spawns the effect; cooldown and ammo live here and are replayable.
 */

/**
 * @typedef {{
 *   id: string, kind: 'hitscan' | 'projectile', damage: number, pellets: number,
 *   spreadDeg: number, cooldownMs: number, ammoType: string, ammoPerShot: number,
 *   range: number, speed?: number,
 * }} Weapon
 */

/** @type {Readonly<Record<string, Weapon>>} */
export const WEAPONS = {
  pistol: { id: 'pistol', kind: 'hitscan', damage: 10, pellets: 1, spreadDeg: 0, cooldownMs: 350, ammoType: 'bullets', ammoPerShot: 1, range: 20 },
  shotgun: { id: 'shotgun', kind: 'hitscan', damage: 7, pellets: 6, spreadDeg: 9, cooldownMs: 900, ammoType: 'shells', ammoPerShot: 1, range: 10 },
  rocket: { id: 'rocket', kind: 'projectile', damage: 60, pellets: 1, spreadDeg: 0, cooldownMs: 1100, ammoType: 'rockets', ammoPerShot: 1, range: 30, speed: 7 },
};

/** Ammo capacity per type. */
export const AMMO_CAP = { bullets: 99, shells: 30, rockets: 12 };

/**
 * @param {{ owned?: string[], ammo?: Record<string, number> }} [start]
 */
export function createLoadout(start = {}) {
  return {
    owned: start.owned ?? ['pistol'],
    current: (start.owned ?? ['pistol'])[0] ?? 'pistol',
    ammo: { bullets: 30, shells: 0, rockets: 0, ...start.ammo },
    /** Time (ms) the trigger next works. */
    readyAt: 0,
  };
}

/** @typedef {ReturnType<typeof createLoadout>} Loadout */

/**
 * Switch to the weapon `step` places along the owned list (wraps), or to a named one.
 * @param {Loadout} loadout
 * @param {number | string} to
 */
export function switchWeapon(loadout, to) {
  if (typeof to === 'string') {
    if (loadout.owned.includes(to)) loadout.current = to;
    return loadout.current;
  }
  const i = loadout.owned.indexOf(loadout.current);
  const n = loadout.owned.length;
  loadout.current = loadout.owned[(((i + to) % n) + n) % n] ?? loadout.current;
  return loadout.current;
}

/** Add ammo (capped); returns what was actually taken. */
export function addAmmo(/** @type {Loadout} */ loadout, /** @type {string} */ type, /** @type {number} */ amount) {
  const cap = /** @type {Record<string, number>} */ (AMMO_CAP)[type] ?? 99;
  const before = /** @type {Record<string, number>} */ (loadout.ammo)[type] ?? 0;
  const after = Math.min(cap, before + amount);
  /** @type {Record<string, number>} */ (loadout.ammo)[type] = after;
  return after - before;
}

/** Give a weapon (once). */
export function grantWeapon(/** @type {Loadout} */ loadout, /** @type {string} */ id) {
  if (!(id in WEAPONS) || loadout.owned.includes(id)) return false;
  loadout.owned.push(id);
  return true;
}

/**
 * Pull the trigger at `now` (ms). Returns the shot or `null` (cooling down, or dry).
 * Pellet angles are offsets from the aim, drawn from `rng` so a seed replays them.
 * @param {Loadout} loadout
 * @param {number} now
 * @param {() => number} rng a float in [0, 1)
 * @returns {{ weapon: Weapon, offsetsDeg: number[] } | null}
 */
export function fire(loadout, now, rng) {
  const weapon = WEAPONS[loadout.current];
  if (!weapon || now < loadout.readyAt) return null;
  const ammo = /** @type {Record<string, number>} */ (loadout.ammo);
  if ((ammo[weapon.ammoType] ?? 0) < weapon.ammoPerShot) return null;
  ammo[weapon.ammoType] = (ammo[weapon.ammoType] ?? 0) - weapon.ammoPerShot;
  loadout.readyAt = now + weapon.cooldownMs;
  const offsetsDeg = Array.from({ length: weapon.pellets }, () => (weapon.spreadDeg === 0 ? 0 : (rng() * 2 - 1) * weapon.spreadDeg));
  return { weapon, offsetsDeg };
}
