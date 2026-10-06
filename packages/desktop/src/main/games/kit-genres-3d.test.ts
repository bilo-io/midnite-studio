import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The engine-free 3D genre systems (Phase 107 Theme I: shooter, fighter,
 * soulslike), imported straight from `templates/media-game/kit/core/`. The
 * scenes that use them need WebGL and are covered by composing + booting each
 * starter in Chromium.
 */

const genreDir = resolve(__dirname, '../../../../../templates/media-game/kit/core/genre');
const coreDir = resolve(genreDir, '..');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const load = async (file: string): Promise<any> => import(pathToFileURL(join(genreDir, file)).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JS module
const loadCore = async (file: string): Promise<any> => import(pathToFileURL(join(coreDir, file)).href);

describe('shooter/weapons.js', () => {
  it('fires on cooldown, empties the magazine, reloads from the reserve', async () => {
    const { createArsenal, tryFire, tickArsenal, cooldownMs, SHOOTER_WEAPONS } = await load('shooter/weapons.js');
    const a = createArsenal({ owned: ['rifle'], reserve: { rifle: 40 } });
    const rifle = SHOOTER_WEAPONS.rifle;
    expect(cooldownMs(rifle)).toBe(100);
    expect(tryFire(a).fired).toBe(true);
    expect(tryFire(a, { held: true })).toEqual({ fired: false, reason: 'cooldown' });
    let shots = 1;
    for (let i = 0; i < 100 && a.ammo.rifle.mag > 0; i += 1) {
      tickArsenal(a, 100);
      if (tryFire(a, { held: true }).fired) shots += 1;
    }
    expect(shots).toBe(30);
    tickArsenal(a, 100);
    expect(tryFire(a, { held: true })).toEqual({ fired: false, reason: 'empty' });
    expect(a.reloading).toBe(rifle.reloadMs);
    expect(tryFire(a)).toEqual({ fired: false, reason: 'reloading' });
    expect(tickArsenal(a, rifle.reloadMs).reloaded).toBe(true);
    expect(a.ammo.rifle).toEqual({ mag: 30, reserve: 10 });
  });

  it('semi-automatic weapons need a fresh trigger pull, and recoil caps and recovers', async () => {
    const { createArsenal, tryFire, tickArsenal, SHOOTER_WEAPONS } = await load('shooter/weapons.js');
    const a = createArsenal({ owned: ['pistol'] });
    expect(tryFire(a).fired).toBe(true);
    tickArsenal(a, 1000);
    expect(tryFire(a, { held: true })).toEqual({ fired: false, reason: 'semi-auto' });
    for (let i = 0; i < 10; i += 1) {
      tickArsenal(a, 200);
      tryFire(a);
    }
    expect(a.recoil).toBeLessThanOrEqual(SHOOTER_WEAPONS.pistol.recoilMaxDeg);
    tickArsenal(a, 10_000);
    expect(a.recoil).toBe(0);
  });

  it('switching cancels a reload; ammo pickups cap at the reserve maximum', async () => {
    const { createArsenal, startReload, switchTo, addReserve, SHOOTER_WEAPONS } = await load('shooter/weapons.js');
    const a = createArsenal();
    a.ammo.rifle.mag = 3;
    expect(startReload(a)).toBe(true);
    expect(switchTo(a, 1)).toBe('pistol');
    expect(a.reloading).toBe(0);
    expect(switchTo(a, 'launcher')).toBe('pistol');
    expect(addReserve(a, 'rifle', 1000)).toBe(SHOOTER_WEAPONS.rifle.reserveMax - 90);
    expect(a.ammo.rifle.reserve).toBe(SHOOTER_WEAPONS.rifle.reserveMax);
  });
});

describe('shooter/spread.js', () => {
  it('spreadCone doubles the base while moving, adds recoil and caps', async () => {
    const { spreadCone, MAX_SPREAD_DEG } = await load('shooter/spread.js');
    expect(spreadCone(1, 0, false)).toBe(1);
    expect(spreadCone(1, 0, true)).toBe(2);
    expect(spreadCone(1, 2.5, true)).toBe(4.5);
    expect(spreadCone(5, 20, true)).toBe(MAX_SPREAD_DEG);
    expect(spreadCone(-1, -1, false)).toBe(0);
  });

  it('every spread direction stays inside the cone and is a unit vector', async () => {
    const { spreadDirection, angleBetweenDeg } = await load('shooter/spread.js');
    const { createRng } = await loadCore('rng.js');
    const rng = createRng(7);
    const forward = [0.2, -0.1, -1];
    let widest = 0;
    for (let i = 0; i < 2000; i += 1) {
      const d = spreadDirection(forward, 4, () => rng.next());
      expect(Math.hypot(...d)).toBeCloseTo(1, 9);
      widest = Math.max(widest, angleBetweenDeg(forward, d));
    }
    expect(widest).toBeLessThanOrEqual(4 + 1e-9);
    expect(widest).toBeGreaterThan(3);
    expect(spreadDirection([0, 0, -2], 0, () => 0.5)).toEqual([0, 0, -1]);
  });
});

describe('shooter/cover.js', () => {
  const crate = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };

  it('a crate between two points blocks the line of sight', async () => {
    const { hasLineOfSight, segmentHitsRect } = await load('shooter/cover.js');
    expect(hasLineOfSight([0, 0, -5], [0, 0, 5], [crate])).toBe(false);
    expect(hasLineOfSight([3, 0, -5], [3, 0, 5], [crate])).toBe(true);
    expect(segmentHitsRect([-5, 5], [5, -5], crate)).toBe(true);
    expect(segmentHitsRect([2, 2], [2, 5], crate)).toBe(false);
  });

  it('pickCover returns the nearest point the player cannot see, or null', async () => {
    const { pickCover, coverPointsAround } = await load('shooter/cover.js');
    const points = coverPointsAround([crate], 0.8);
    expect(points).toHaveLength(4);
    // Player south of the crate: only the north side hides an enemy.
    expect(pickCover([4, 0, -4], [0, 0, 6], points, [crate])).toEqual([0, -1.8]);
    // Nothing between the player and any point: nowhere to hide.
    expect(pickCover([0, 0, 0], [0, 0, 6], [[5, 5], [6, 6]], [crate])).toBeNull();
  });
});

describe('fighter/frame-data.js', () => {
  it('a 10/3/15 move is active exactly on frames 10-12', async () => {
    const { movePhase, moveTotal } = await load('fighter/frame-data.js');
    const move = { name: 't', input: 'n+lp', startup: 10, active: 3, recovery: 15, damage: 5, onHit: 0, onBlock: 0, level: 'mid', reach: 1 };
    const active = Array.from({ length: 40 }, (_, i) => i + 1).filter((f) => movePhase(move, f) === 'active');
    expect(active).toEqual([10, 11, 12]);
    expect(movePhase(move, 9)).toBe('startup');
    expect(movePhase(move, 13)).toBe('recovery');
    expect(moveTotal(move)).toBe(27);
    expect(movePhase(move, 27)).toBe('recovery');
    expect(movePhase(move, 28)).toBe('done');
  });

  it('stun is the attacker\'s remaining frames plus the advantage', async () => {
    const { stunFrames, moveByName, MOVES } = await load('fighter/frame-data.js');
    const jab = moveByName(MOVES, 'jab');
    // Hit on the first active frame (10): 27 − 10 = 17 frames left, +8 on hit.
    expect(stunFrames(jab, 10, false)).toBe(25);
    expect(stunFrames(jab, 10, true)).toBe(18);
    expect(stunFrames(moveByName(MOVES, 'uppercut'), 15, true)).toBeGreaterThanOrEqual(0);
  });

  it('strings chain inside the cancel window only; inputs match by direction', async () => {
    const { inCancelWindow, matchMove, MOVES, scaleDamage } = await load('fighter/frame-data.js');
    const jab = MOVES[0];
    expect(inCancelWindow(jab, 9)).toBe(false);
    expect(inCancelWindow(jab, 10)).toBe(true);
    expect(inCancelWindow(jab, 12 + 7)).toBe(true);
    expect(inCancelWindow(jab, 12 + 8)).toBe(false);
    expect(matchMove(MOVES, 'df', 'rp').name).toBe('uppercut');
    expect(matchMove(MOVES, 'd', 'lk').name).toBe('low-kick');
    expect(matchMove(MOVES, 'b', 'rp').name).toBe('straight');
    expect(matchMove(MOVES, 'n', 'xx')).toBeNull();
    expect([0, 1, 2, 20].map((i) => scaleDamage(10, i))).toEqual([10, 9, 8, 3]);
  });
});

describe('fighter/hitboxes.js', () => {
  it('a move reaches a fighter in front at its reach, not one out of range', async () => {
    const { hitbox, hurtbox, overlaps } = await load('fighter/hitboxes.js');
    const attacker = { position: [0, 0, 0], facing: [1, 0] };
    const jab = { reach: 1.0, level: 'high' as const };
    expect(overlaps(hitbox(attacker, jab), hurtbox({ position: [1.2, 0, 0] }))).toBe(true);
    expect(overlaps(hitbox(attacker, jab), hurtbox({ position: [2.5, 0, 0] }))).toBe(false);
    expect(overlaps(hitbox(attacker, jab), hurtbox({ position: [-1.2, 0, 0] }))).toBe(false);
    // A high passes over a crouching hurtbox; a low still lands.
    expect(overlaps(hitbox(attacker, jab), hurtbox({ position: [1.2, 0, 0], crouching: true }))).toBe(false);
    expect(overlaps(hitbox(attacker, { reach: 1.0, level: 'low' }), hurtbox({ position: [1.2, 0, 0], crouching: true }))).toBe(true);
  });

  it('blocking: stand blocks high and mid, crouch blocks low, nobody blocks airborne', async () => {
    const { resolveHit } = await load('fighter/hitboxes.js');
    expect(resolveHit('high', { guarding: true })).toBe('block');
    expect(resolveHit('mid', { guarding: true })).toBe('block');
    expect(resolveHit('low', { guarding: true })).toBe('hit');
    expect(resolveHit('low', { guarding: true, crouching: true })).toBe('block');
    expect(resolveHit('mid', { guarding: true, crouching: true })).toBe('hit');
    expect(resolveHit('high', { crouching: true })).toBe('whiff');
    expect(resolveHit('mid', { guarding: true, airborne: true })).toBe('hit');
  });
});

describe('fighter/rounds.js', () => {
  it('KO takes the round; first to two wins the match; timeout goes on health', async () => {
    const { createMatch, matchReducer } = await load('fighter/rounds.js');
    let m = createMatch({ roundSeconds: 10 });
    expect(matchReducer(m, { type: 'damage', target: 1, amount: 50 })).toBe(m); // no damage during intro
    m = matchReducer(m, { type: 'tick', dt: 1.5 });
    expect(m.phase).toBe('fight');
    m = matchReducer(m, { type: 'damage', target: 1, amount: 500 });
    expect(m).toMatchObject({ phase: 'ko', winner: 0, wins: [1, 0], hp: [170, 0] });
    m = matchReducer(m, { type: 'tick', dt: 2.5 });
    expect(m).toMatchObject({ phase: 'intro', round: 2, hp: [170, 170], timer: 10 });
    m = matchReducer(matchReducer(m, { type: 'tick', dt: 1.5 }), { type: 'damage', target: 0, amount: 30 });
    m = matchReducer(m, { type: 'tick', dt: 10 });
    expect(m).toMatchObject({ phase: 'timeout', winner: 1, wins: [1, 1] });
    m = matchReducer(m, { type: 'tick', dt: 2.5 });
    m = matchReducer(m, { type: 'tick', dt: 1.5 });
    m = matchReducer(m, { type: 'tick', dt: 10 });
    expect(m).toMatchObject({ phase: 'timeout', winner: 'draw', wins: [1, 1] });
    m = matchReducer(matchReducer(matchReducer(m, { type: 'tick', dt: 2.5 }), { type: 'tick', dt: 1.5 }), { type: 'damage', target: 1, amount: 170 });
    m = matchReducer(m, { type: 'tick', dt: 2.5 });
    expect(m).toMatchObject({ phase: 'over', winner: 0, wins: [2, 1], round: 4 });
  });
});

describe('fighter/cpu.js', () => {
  it('closes distance, guards telegraphed attacks low or high, and punishes a juggle', async () => {
    const { cpuDecide } = await load('fighter/cpu.js');
    const view = { distance: 3, foeAttacking: null, foeAirborne: false, foeStunned: false, selfBusy: false };
    const never = () => 0.99;
    const always = () => 0;
    expect(cpuDecide(view, never).walk).toBe(1);
    expect(cpuDecide({ ...view, distance: 1, foeAttacking: 'low' }, always)).toMatchObject({ guard: true, crouch: true });
    expect(cpuDecide({ ...view, distance: 1, foeAttacking: 'mid' }, always)).toMatchObject({ guard: true, crouch: false });
    expect(cpuDecide({ ...view, distance: 1, foeAirborne: true }, never).attack).toEqual({ direction: 'n', button: 'lp' });
    expect(cpuDecide({ ...view, selfBusy: true }, always)).toMatchObject({ walk: 0, attack: null });
  });

  it('is deterministic for a seed', async () => {
    const { cpuDecide } = await load('fighter/cpu.js');
    const { createRng } = await loadCore('rng.js');
    const run = (): string => {
      const rng = createRng(3);
      const out: string[] = [];
      for (let i = 0; i < 200; i += 1) out.push(JSON.stringify(cpuDecide({ distance: 1.2, foeAttacking: null, foeAirborne: false, foeStunned: false, selfBusy: false }, () => rng.next())));
      return out.join('|');
    };
    expect(run()).toBe(run());
  });
});

describe('soulslike/stamina.js', () => {
  it('never goes negative, and regen waits 0.8 s after spending', async () => {
    const { createStamina, spendStamina, tickStamina, STAMINA } = await load('soulslike/stamina.js');
    const s = createStamina();
    expect(s.value).toBe(100);
    for (let i = 0; i < 10; i += 1) spendStamina(s, 'heavy');
    expect(s.value).toBe(0);
    expect(spendStamina(s, 'roll')).toBe(false);
    expect(s.value).toBe(0);
    for (let i = 0; i < 47; i += 1) tickStamina(s, 1 / 60); // just short of 0.8 s
    expect(s.value).toBe(0);
    tickStamina(s, 1 / 60 + 0.2); // 0.2 s past the delay
    expect(s.value).toBeCloseTo(STAMINA.regenPerS * 0.2, 6);
    tickStamina(s, 10);
    expect(s.value).toBe(100);
  });

  it('costs: roll 20, light 15, heavy 30; a spend mid-regen restarts the delay', async () => {
    const { createStamina, spendStamina, tickStamina } = await load('soulslike/stamina.js');
    const s = createStamina();
    spendStamina(s, 'roll');
    spendStamina(s, 'light');
    spendStamina(s, 'heavy');
    expect(s.value).toBe(35);
    tickStamina(s, 1.0); // 0.2 s of regen
    expect(s.value).toBeCloseTo(40, 6);
    spendStamina(s, 'light');
    tickStamina(s, 0.5);
    expect(s.value).toBeCloseTo(25, 6);
  });

  it('roll i-frames run from 0.1 s to 0.4 s', async () => {
    const { rollInvulnerable } = await load('soulslike/stamina.js');
    expect([0, 0.09, 0.1, 0.25, 0.4, 0.41].map(rollInvulnerable)).toEqual([false, false, true, true, true, false]);
  });
});

describe('soulslike/boss.js', () => {
  it('boss phases flip at 66% and 33%', async () => {
    const { bossPhase } = await load('soulslike/boss.js');
    expect([1, 0.67, 0.66, 0.5, 0.34, 0.33, 0.1, 0].map(bossPhase)).toEqual([1, 1, 2, 2, 2, 3, 3, 3]);
  });

  it('attacks unlock by phase, need reach, and speed up', async () => {
    const { bossChooseAttack, bossAttackPhase, BOSS_ATTACKS } = await load('soulslike/boss.js');
    const { createRng } = await loadCore('rng.js');
    const rng = createRng(5);
    const seen = (phase: 1 | 2 | 3, distance: number): Set<string> => {
      const names = new Set<string>();
      for (let i = 0; i < 500; i += 1) names.add(bossChooseAttack(phase, distance, () => rng.next())?.name ?? 'none');
      return names;
    };
    expect([...seen(1, 2)].sort()).toEqual(['overhead', 'swipe']);
    expect(seen(3, 2).has('nova')).toBe(true);
    expect([...seen(2, 6)]).toEqual(['lunge']);
    expect([...seen(1, 6)]).toEqual(['none']);
    const swipe = BOSS_ATTACKS[0];
    expect(bossAttackPhase(swipe, 0.65, 1)).toBe('windup');
    expect(bossAttackPhase(swipe, 0.65, 3)).toBe('active');
  });
});

describe('cameras.js lock-on (soulslike + fighter)', () => {
  it('chooseLockTarget picks the nearest within the cone', async () => {
    const { chooseLockTarget } = await loadCore('cameras.js');
    const near = { id: 'near', position: [1, 0, -4] };
    const far = { id: 'far', position: [0, 0, -8] };
    const behind = { id: 'behind', position: [0, 0, 2] };
    const wide = { id: 'wide', position: [3, 0, -1] };
    const outOfRange = { id: 'out', position: [0, 0, -30] };
    const forward = [0, 0, -1];
    expect(chooseLockTarget([0, 0, 0], forward, [far, near, behind, wide, outOfRange])?.id).toBe('near');
    expect(chooseLockTarget([0, 0, 0], forward, [behind, wide, outOfRange])).toBeNull();
    expect(chooseLockTarget([0, 0, 0], forward, [far, outOfRange])?.id).toBe('far');
  });
});
