// @ts-check
/**
 * Midnite game kit — the 3D shooter's arsenal (engine-free).
 *
 * Weapons are data. `kind` is `hitscan` (a ray, resolved at once) or
 * `projectile` (a body that travels). The arsenal owns the magazine, the
 * reserve, the fire-rate cooldown, the reload timer and the accumulated recoil;
 * the scene asks `tryFire` and spawns whatever effect the answer describes.
 * All times are milliseconds and every call is deterministic, so a replay
 * reproduces the same shots.
 */

/**
 * @typedef {{
 *   id: string, kind: 'hitscan' | 'projectile', damage: number, pellets: number,
 *   rpm: number, auto: boolean, magazine: number, reserveMax: number, reloadMs: number,
 *   spreadDeg: number, recoilDeg: number, recoilMaxDeg: number, recoilRecoverDegPerS: number,
 *   range: number, speed?: number, splash?: number,
 * }} ShooterWeapon
 */

/** @type {Readonly<Record<string, ShooterWeapon>>} */
export const SHOOTER_WEAPONS = {
  rifle: {
    id: 'rifle', kind: 'hitscan', damage: 14, pellets: 1, rpm: 600, auto: true, magazine: 30, reserveMax: 180, reloadMs: 1800,
    spreadDeg: 0.8, recoilDeg: 0.5, recoilMaxDeg: 5, recoilRecoverDegPerS: 10, range: 80,
  },
  pistol: {
    id: 'pistol', kind: 'hitscan', damage: 22, pellets: 1, rpm: 300, auto: false, magazine: 12, reserveMax: 72, reloadMs: 1200,
    spreadDeg: 0.5, recoilDeg: 1.2, recoilMaxDeg: 4, recoilRecoverDegPerS: 12, range: 60,
  },
  launcher: {
    id: 'launcher', kind: 'projectile', damage: 70, pellets: 1, rpm: 50, auto: false, magazine: 1, reserveMax: 6, reloadMs: 2200,
    spreadDeg: 0, recoilDeg: 3, recoilMaxDeg: 3, recoilRecoverDegPerS: 6, range: 60, speed: 22, splash: 3,
  },
};

/** Milliseconds between shots at a weapon's fire rate. */
export const cooldownMs = (/** @type {ShooterWeapon} */ weapon) => 60_000 / weapon.rpm;

/**
 * A fresh arsenal: every owned weapon starts with a full magazine and its
 * `reserve` (default: half its maximum).
 * @param {{ owned?: string[], reserve?: Record<string, number>, weapons?: Readonly<Record<string, ShooterWeapon>> }} [start]
 */
export function createArsenal(start = {}) {
  const table = start.weapons ?? SHOOTER_WEAPONS;
  const owned = (start.owned ?? ['rifle', 'pistol']).filter((id) => table[id]);
  /** @type {Record<string, { mag: number, reserve: number }>} */
  const ammo = {};
  for (const id of owned) {
    const w = /** @type {ShooterWeapon} */ (table[id]);
    ammo[id] = { mag: w.magazine, reserve: Math.min(w.reserveMax, start.reserve?.[id] ?? Math.floor(w.reserveMax / 2)) };
  }
  return {
    table,
    owned,
    current: owned[0] ?? 'rifle',
    ammo,
    /** Milliseconds until the trigger works again. */
    cooldown: 0,
    /** Milliseconds left on a reload in progress; 0 when not reloading. */
    reloading: 0,
    /** Accumulated recoil, degrees; it widens the cone and climbs the view. */
    recoil: 0,
  };
}

/** @typedef {ReturnType<typeof createArsenal>} Arsenal */

/** The weapon in hand. */
export const currentWeapon = (/** @type {Arsenal} */ a) => /** @type {ShooterWeapon} */ (a.table[a.current]);

/**
 * Advance timers by `dtMs`: the cooldown runs down, a reload completes (moving
 * rounds from the reserve into the magazine) and recoil recovers.
 * @param {Arsenal} a
 * @param {number} dtMs
 * @returns {{ reloaded: boolean }}
 */
export function tickArsenal(a, dtMs) {
  a.cooldown = Math.max(0, a.cooldown - dtMs);
  const w = currentWeapon(a);
  a.recoil = Math.max(0, a.recoil - (w.recoilRecoverDegPerS * dtMs) / 1000);
  if (a.reloading > 0) {
    a.reloading = Math.max(0, a.reloading - dtMs);
    if (a.reloading === 0) {
      const slot = /** @type {{ mag: number, reserve: number }} */ (a.ammo[a.current]);
      const take = Math.min(w.magazine - slot.mag, slot.reserve);
      slot.mag += take;
      slot.reserve -= take;
      return { reloaded: true };
    }
  }
  return { reloaded: false };
}

/**
 * Start a reload. Refused when already reloading, the magazine is full or the
 * reserve is empty.
 * @param {Arsenal} a
 */
export function startReload(a) {
  const w = currentWeapon(a);
  const slot = a.ammo[a.current];
  if (!slot || a.reloading > 0 || slot.mag >= w.magazine || slot.reserve <= 0) return false;
  a.reloading = w.reloadMs;
  return true;
}

/**
 * Pull the trigger. `held` is true on steps after the first while the button
 * stays down: only automatic weapons fire on a held trigger. An empty magazine
 * starts a reload on its own.
 * @param {Arsenal} a
 * @param {{ held?: boolean }} [trigger]
 * @returns {{ fired: true, weapon: ShooterWeapon, recoil: number } | { fired: false, reason: 'cooldown' | 'reloading' | 'empty' | 'semi-auto' }}
 */
export function tryFire(a, trigger = {}) {
  const w = currentWeapon(a);
  if (a.reloading > 0) return { fired: false, reason: 'reloading' };
  if (trigger.held && !w.auto) return { fired: false, reason: 'semi-auto' };
  if (a.cooldown > 0) return { fired: false, reason: 'cooldown' };
  const slot = a.ammo[a.current];
  if (!slot || slot.mag <= 0) {
    startReload(a);
    return { fired: false, reason: 'empty' };
  }
  slot.mag -= 1;
  a.cooldown = cooldownMs(w);
  a.recoil = Math.min(w.recoilMaxDeg, a.recoil + w.recoilDeg);
  return { fired: true, weapon: w, recoil: a.recoil };
}

/**
 * Switch weapon: a step along the owned list (wraps) or a named one. Cancels a
 * reload in progress and resets recoil, as raising a new weapon does.
 * @param {Arsenal} a
 * @param {number | string} to
 */
export function switchTo(a, to) {
  const n = a.owned.length;
  const next = typeof to === 'string'
    ? (a.owned.includes(to) ? to : a.current)
    : a.owned[(((a.owned.indexOf(a.current) + to) % n) + n) % n] ?? a.current;
  if (next !== a.current) {
    a.current = next;
    a.reloading = 0;
    a.recoil = 0;
    a.cooldown = Math.max(a.cooldown, 250);
  }
  return a.current;
}

/**
 * Pick up ammo for a weapon (capped at its reserve maximum). Returns what was taken.
 * @param {Arsenal} a
 * @param {string} id
 * @param {number} amount
 */
export function addReserve(a, id, amount) {
  const w = a.table[id];
  const slot = a.ammo[id];
  if (!w || !slot) return 0;
  const take = Math.max(0, Math.min(amount, w.reserveMax - slot.reserve));
  slot.reserve += take;
  return take;
}
