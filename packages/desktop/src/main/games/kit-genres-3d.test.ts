import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The engine-free 3D genre systems (Phase 107 Theme I: shooter, fighter,
 * soulslike; Theme J: RPG, character action, open world), imported straight
 * from `templates/media-game/kit/core/`. The
 * scenes that use them need WebGL and are covered by composing + booting each
 * starter in Chromium.
 */

const genreDir = resolve(__dirname, '../../../../../templates/media-game/kit/core/genre');
const genresDir = resolve(__dirname, '../../../../../templates/media-game/genres');
const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'));
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

// --- Theme J -----------------------------------------------------------------------------

describe('rpg/quests.js', () => {
  it('a quest advances only on the event its current stage lists', async () => {
    const { validateQuests, createQuestLog, startQuest, questEvent, questStatus, currentStage, journal } = await load('rpg/quests.js');
    const parsed = validateQuests(await readJson(join(genresDir, 'rpg/src/data/quests.json')));
    expect(parsed.ok).toBe(true);
    const log = createQuestLog(parsed.value);

    // Not started: events do nothing.
    expect(questEvent(log, { type: 'defeat', target: 'wolf' })).toEqual([]);
    expect(questStatus(log, 'wolves')).toBe('inactive');

    expect(startQuest(log, 'wolves')).toBe(true);
    expect(startQuest(log, 'wolves')).toBe(false);
    // The report stage's event, too early: ignored. A different target: ignored.
    expect(questEvent(log, { type: 'talk', target: 'elder' })).toEqual([]);
    expect(questEvent(log, { type: 'defeat', target: 'sheep' })).toEqual([]);
    expect(currentStage(log, 'wolves').id).toBe('hunt');
    questEvent(log, { type: 'defeat', target: 'wolf' });
    questEvent(log, { type: 'defeat', target: 'wolf' });
    expect(journal(log)[0]).toMatchObject({ id: 'wolves', objective: 'Defeat the wolves past the fields (2/3)', done: false });
    expect(questEvent(log, { type: 'defeat', target: 'wolf' })).toEqual([{ quest: 'wolves', stage: 'hunt', completed: false, reward: null }]);
    expect(currentStage(log, 'wolves').id).toBe('report');
    expect(questEvent(log, { type: 'defeat', target: 'wolf' })).toEqual([]);
    const done = questEvent(log, { type: 'talk', target: 'elder' });
    expect(done).toEqual([{ quest: 'wolves', stage: 'report', completed: true, reward: { xp: 160, gold: 50, item: 'iron-sword' } }]);
    expect(questStatus(log, 'wolves')).toBe('done');
    expect(questEvent(log, { type: 'talk', target: 'elder' })).toEqual([]);
  });

  it('refuses malformed quest data with a readable message', async () => {
    const { validateQuests } = await load('rpg/quests.js');
    expect(validateQuests({})).toEqual({ ok: false, message: 'quests.json needs a "quests" array.' });
    expect(validateQuests({ quests: [{ id: 'a', title: 'A', stages: [] }] }).message).toBe('Quest "a" needs at least one stage.');
    expect(
      validateQuests({ quests: [{ id: 'a', title: 'A', stages: [{ id: 's', text: 't', on: { type: 'dance', target: 'x' } }] }] }).message,
    ).toBe('Quest "a" stage "s" waits for an unknown event "dance".');
    const twice = { id: 'a', title: 'A', stages: [{ id: 's', text: 't', on: { type: 'talk', target: 'x' } }] };
    expect(validateQuests({ quests: [twice, twice] }).message).toBe('Quest "a" is listed twice.');
  });
});

describe('rpg/dialogue.js', () => {
  it('every shipped tree validates and reaches every end node from the root', async () => {
    const { validateDialogue, reachableEnds, everyNodeCanEnd } = await load('rpg/dialogue.js');
    const trees = (await readJson(join(genresDir, 'rpg/src/data/dialogue.json'))) as Record<string, unknown>;
    expect(Object.keys(trees).sort()).toEqual(['elder', 'healer', 'smith']);
    for (const [name, json] of Object.entries(trees)) {
      const parsed = validateDialogue(json);
      expect(parsed.ok, name).toBe(true);
      const { reached, unreachable } = reachableEnds(parsed.value);
      const ends = Object.entries(parsed.value.nodes as Record<string, { end?: boolean }>).filter(([, n]) => n.end).map(([id]) => id);
      expect(reached.sort(), name).toEqual(ends.sort());
      expect(unreachable, name).toEqual([]);
      expect(everyNodeCanEnd(parsed.value), name).toBe(true);
    }
  });

  it('walks a conversation: gated choices, effects, and the end', async () => {
    const { validateDialogue, startConversation, availableChoices, advance } = await load('rpg/dialogue.js');
    const elder = validateDialogue(((await readJson(join(genresDir, 'rpg/src/data/dialogue.json'))) as Record<string, unknown>).elder).value;
    let status = 'inactive';
    const ctx = { questStatus: () => status };
    const conv = startConversation(elder);
    expect(availableChoices(conv.node, ctx).map((c: { text: string }) => c.text)).toEqual(["I'll deal with the wolves.", 'Goodbye.']);
    expect(advance(conv, 0, ctx)).toEqual([{ type: 'start-quest', quest: 'wolves' }]);
    expect(conv.at).toBe('accept');
    expect(advance(conv, 0, ctx)).toEqual([]);
    expect(conv.at).toBe('bye');
    advance(conv, 0, ctx);
    expect(conv.done).toBe(true);

    status = 'active';
    const again = startConversation(elder);
    expect(availableChoices(again.node, ctx).map((c: { text: string }) => c.text)).toEqual(['About the wolves...', 'Goodbye.']);
    expect(advance(again, 0, ctx)).toEqual([{ type: 'quest-event', event: { type: 'talk', target: 'elder' } }]);
  });

  it('refuses dangling links, nodes with no way on, and a cycle is detected as unable to end', async () => {
    const { validateDialogue, everyNodeCanEnd } = await load('rpg/dialogue.js');
    expect(validateDialogue({ id: 'x', root: 'a', nodes: { a: { speaker: 'A', text: 'hi', next: 'b' } } }).message).toBe(
      'Dialogue "x" node "a" leads to a missing node "b".',
    );
    expect(validateDialogue({ id: 'x', root: 'a', nodes: { a: { speaker: 'A', text: 'hi' } } }).message).toBe(
      'Dialogue "x" node "a" needs exactly one of "choices", "next" or "end".',
    );
    const loop = validateDialogue({
      id: 'x',
      root: 'a',
      nodes: {
        a: { speaker: 'A', text: 'hi', choices: [{ text: 'loop', next: 'b' }, { text: 'bye', next: 'c' }] },
        b: { speaker: 'A', text: 'again', next: 'b2' },
        b2: { speaker: 'A', text: 'and again', next: 'b' },
        c: { speaker: 'A', text: 'bye', end: true },
      },
    });
    expect(loop.ok).toBe(true);
    expect(everyNodeCanEnd(loop.value)).toBe(false);
  });
});

describe('rpg/stats.js and rpg/schedule.js', () => {
  it('levels on the curve, several at once, and grants points', async () => {
    const { createStats, gainXp, xpForLevel, spendPoint, derived, levelProgress, POINTS_PER_LEVEL } = await load('rpg/stats.js');
    expect([1, 2, 3, 4].map(xpForLevel)).toEqual([0, 100, 283, 520]);
    const s = createStats();
    expect(gainXp(s, 99)).toBe(0);
    expect(gainXp(s, 1)).toBe(1);
    expect(s).toMatchObject({ level: 2, points: POINTS_PER_LEVEL });
    expect(gainXp(s, 500)).toBe(2);
    expect(s.level).toBe(4);
    const before = derived(s).maxHp;
    expect(spendPoint(s, 'vit')).toBe(true);
    expect(derived(s).maxHp).toBe(before + 8);
    expect(derived(s, 7).damage).toBeGreaterThan(derived(s, 0).damage);
    expect(levelProgress(s)).toBeGreaterThanOrEqual(0);
    expect(levelProgress(s)).toBeLessThan(1);
  });

  it('places NPCs by their schedule, wrapping midnight, and validates the shipped ones', async () => {
    const { scheduleAt, inBlock, gameHour, validateSchedule, walkToward } = await load('rpg/schedule.js');
    const npcs = (await readJson(join(genresDir, 'rpg/src/data/npcs.json'))) as {
      places: Record<string, number[]>;
      npcs: { id: string; schedule: { at: string }[] }[];
    };
    for (const npc of npcs.npcs) {
      expect(validateSchedule(npc.schedule).ok, npc.id).toBe(true);
      for (const block of npc.schedule) expect(npcs.places[block.at], `${npc.id} → ${block.at}`).toBeDefined();
      expect(npcs.places[`home-${npc.id}`], `home-${npc.id}`).toBeDefined();
    }
    const elder = npcs.npcs.find((n) => n.id === 'elder')!.schedule;
    expect(scheduleAt(elder, 9)).toBe('square');
    expect(scheduleAt(elder, 23)).toBe('home-elder');
    expect(scheduleAt(elder, 3)).toBe('home-elder');
    expect(inBlock({ from: 22, to: 6, at: 'x' }, 6)).toBe(false);
    expect(scheduleAt([{ from: 7, to: 19, at: 'forge' }], 2, 'home-smith')).toBe('home-smith');
    expect(gameHour(0, 300, 9)).toBe(9);
    expect(gameHour(150, 300, 9)).toBe(21);
    expect(gameHour(300, 300, 9)).toBe(9);
    expect(validateSchedule([{ from: 5, to: 5, at: 'x' }]).ok).toBe(false);
    const p = [0, 0, 0];
    expect(walkToward(p, [3, 0, 4], 1, 1)).toBe(false);
    expect(p[0]).toBeCloseTo(0.6);
    expect(walkToward(p, [3, 0, 4], 10, 1)).toBe(true);
    expect(p).toEqual([3, 0, 4]);
  });
});

describe('character-action/combos.js', () => {
  it('an attack inside the cancel window chains; outside it does not', async () => {
    const { comboStep, createComboState, comboMove, COMBO_MOVES } = await load('character-action/combos.js');
    const slash = comboMove(COMBO_MOVES, 'slash-1');
    expect(slash.cancel).toEqual([9, 20]);

    // Start at frame 100; frame n of the move is 100 + n - 1.
    const start = comboStep(createComboState(), 'light', 100);
    expect(start.started?.name).toBe('slash-1');
    // n = 9 (first frame of the window): chains.
    expect(comboStep(start.state, 'light', 108)).toMatchObject({ chained: true, started: { name: 'slash-2' } });
    // n = 20 (last frame): chains.
    expect(comboStep(start.state, 'light', 119)).toMatchObject({ chained: true });
    expect(comboStep(start.state, 'light', 119).state.chain).toBe(2);
    // n = 8 (just before): dropped, the move carries on.
    const early = comboStep(start.state, 'light', 107);
    expect(early).toMatchObject({ chained: false, dropped: true, started: null });
    expect(early.state.move).toBe('slash-1');
    // n = 21 (just after, still in recovery): dropped.
    expect(comboStep(start.state, 'light', 120)).toMatchObject({ chained: false, dropped: true });
    // A button with no `next` from this move: dropped even in the window.
    const finisher = comboStep({ move: 'finisher', startedAt: 0, chain: 4, air: false }, 'light', 5);
    expect(finisher.dropped).toBe(true);
    // Once the move has fully ended, a press starts a fresh opener (chain resets).
    const total = slash.startup - 1 + slash.active + slash.recovery;
    expect(comboStep(start.state, 'light', 100 + total)).toMatchObject({ chained: false, started: { name: 'slash-1' } });
    expect(comboStep(start.state, 'light', 100 + total).state.chain).toBe(1);
  });

  it('the launcher opens the air string, and air openers differ from ground ones', async () => {
    const { comboStep, createComboState } = await load('character-action/combos.js');
    const launch = comboStep(createComboState(), 'launch', 0);
    expect(launch.started).toMatchObject({ name: 'launcher', launcher: true, rise: true });
    const air = comboStep(launch.state, 'light', 15, { air: true });
    expect(air).toMatchObject({ chained: true, started: { name: 'air-1', air: true } });
    expect(comboStep(createComboState(), 'light', 0, { air: true }).started?.name).toBe('air-1');
    expect(comboStep(createComboState(), 'launch', 0, { air: true }).dropped).toBe(true);
  });
});

describe('character-action/style.js and waves.js', () => {
  it('ranks D to SSS, rewards variety, drains, and drops a rank on damage', async () => {
    const { createStyle, styleHit, styleTick, styleDamaged, styleRank, STYLE_THRESHOLDS } = await load('character-action/style.js');
    expect(STYLE_THRESHOLDS.map(styleRank)).toEqual(['D', 'C', 'B', 'A', 'S', 'SS', 'SSS']);
    const s = createStyle();
    const first = styleHit(s, { move: 'slash-1', damage: 10 });
    const second = styleHit(s, { move: 'slash-1', damage: 10 });
    const fresh = styleHit(s, { move: 'cleave', damage: 10 });
    expect(second).toBeLessThan(first);
    expect(fresh).toBe(first);
    expect(styleHit(s, { move: 'air-1', damage: 10, air: true, chain: 3 })).toBeGreaterThan(first);
    s.score = 750;
    expect(styleRank(s.score)).toBe('SS');
    styleDamaged(s);
    expect(styleRank(s.score)).toBe('S');
    styleTick(s, 1000);
    expect(s.score).toBe(0);
  });

  it('seals the arena, sends each wave after the last is cleared, then opens', async () => {
    const { createArena, arenaReducer, arenaSealed, WAVE_BEAT, ringSpawns } = await load('character-action/waves.js');
    const waves = [{ groups: [{ kind: 'grunt', count: 2 }] }, { groups: [{ kind: 'brute', count: 1 }] }];
    let r = arenaReducer(createArena(), waves, { type: 'enter' });
    expect(r.spawn).toBe(waves[0]);
    expect(arenaSealed(r.state)).toBe(true);
    r = arenaReducer(r.state, waves, { type: 'tick', dt: 0.1, alive: 1 });
    expect(r).toMatchObject({ spawn: null, state: { status: 'fighting', wave: 0 } });
    r = arenaReducer(r.state, waves, { type: 'tick', dt: 0.1, alive: 0 });
    expect(r.state.status).toBe('between');
    r = arenaReducer(r.state, waves, { type: 'tick', dt: WAVE_BEAT / 2, alive: 0 });
    expect(r.spawn).toBeNull();
    r = arenaReducer(r.state, waves, { type: 'tick', dt: WAVE_BEAT / 2, alive: 0 });
    expect(r.spawn).toBe(waves[1]);
    r = arenaReducer(r.state, waves, { type: 'tick', dt: 0.1, alive: 0 });
    expect(r.state.status).toBe('cleared');
    expect(arenaSealed(r.state)).toBe(false);
    expect(arenaReducer(r.state, waves, { type: 'enter' }).spawn).toBeNull();
    const spots = ringSpawns(4, [0, 0], 5);
    expect(spots).toHaveLength(4);
    for (const [x, z] of spots) expect(Math.hypot(x, z)).toBeCloseTo(5);
  });
});

describe('open-world/route.js and traffic.js', () => {
  const packRoads = async (): Promise<{ nodes: { id: number; p: number[]; degree: number }[]; edges: { id: number; a: number; b: number; points: number[][]; lengthM: number; widthM: number }[] }> =>
    (await readJson(join(genresDir, 'open-world/assets/terrain/fixture.terrain/roads.json'))) as never;

  it('routeOnRoads on the plus fixture goes through the 4-way node', async () => {
    const { routeOnRoads, routePolyline, nearestNode } = await load('open-world/route.js');
    const roads = await packRoads();
    const hub = roads.nodes.find((n) => n.degree === 4)!;
    const ends = roads.nodes.filter((n) => n.degree === 1);
    expect(ends).toHaveLength(4);
    const north = nearestNode(roads, [0, -1000]);
    const south = nearestNode(roads, [0, 1000]);
    const route = routeOnRoads(roads, north.id, south.id);
    expect(route.nodes).toEqual([north.id, hub.id, south.id]);
    expect(route.edges).toHaveLength(2);
    const lengths = route.edges.map((id: number) => roads.edges.find((e) => e.id === id)!.lengthM);
    expect(route.lengthM).toBeCloseTo(lengths[0] + lengths[1]);
    // Travel order: from the north end, through the hub, to the south end, with the hub point once.
    const line = routePolyline(roads, route);
    expect(line[0]).toEqual(north.p);
    expect(line.at(-1)).toEqual(south.p);
    expect(line.filter((p: number[]) => p[0] === hub.p[0] && p[2] === hub.p[2])).toHaveLength(1);
    expect(routeOnRoads(roads, north.id, north.id)).toEqual({ nodes: [north.id], edges: [], lengthM: 0 });
  });

  it('Dijkstra picks the shorter of two ways round, and refuses unconnected or unknown nodes', async () => {
    const { routeOnRoads } = await load('open-world/route.js');
    const p = (x: number, z: number): number[] => [x, 0, z];
    const roads = {
      nodes: [0, 1, 2, 3, 4].map((id) => ({ id, p: p(id, 0) })),
      edges: [
        { id: 0, a: 0, b: 1, points: [p(0, 0), p(1, 0)], lengthM: 10 },
        { id: 1, a: 1, b: 2, points: [p(1, 0), p(2, 0)], lengthM: 10 },
        { id: 2, a: 0, b: 2, points: [p(0, 0), p(2, 0)], lengthM: 25 },
        { id: 3, a: 2, b: 3, points: [p(2, 0), p(3, 0)], lengthM: 5 },
      ],
    };
    expect(routeOnRoads(roads, 0, 3)).toEqual({ nodes: [0, 1, 2, 3], edges: [0, 1, 3], lengthM: 25 });
    expect(routeOnRoads(roads, 3, 0)).toEqual({ nodes: [3, 2, 1, 0], edges: [3, 1, 0], lengthM: 25 });
    expect(routeOnRoads(roads, 0, 4)).toBeNull();
    expect(routeOnRoads(roads, 0, 99)).toBeNull();
  });

  it('spawns traffic by density, keeps it on the graph, and turns at the junction', async () => {
    const { trafficSpawn, trafficStep, indexRoads, agentPose } = await load('open-world/traffic.js');
    const { createRng } = await loadCore('rng.js');
    const roads = await packRoads();
    const km = roads.edges.reduce((n, e) => n + e.lengthM, 0) / 1000;
    const cars = trafficSpawn(roads.edges, 20, createRng(1));
    expect(cars.length).toBeGreaterThanOrEqual(Math.floor(km * 20) - roads.edges.length);
    expect(cars.length).toBeLessThanOrEqual(Math.ceil(km * 20) + roads.edges.length);
    expect(trafficSpawn(roads.edges, 0, createRng(1))).toEqual([]);
    // Same seed, same traffic.
    expect(trafficSpawn(roads.edges, 20, createRng(9))).toEqual(trafficSpawn(roads.edges, 20, createRng(9)));

    const index = indexRoads(roads);
    const hub = roads.nodes.find((n) => n.degree === 4)!;
    const intoHub = roads.edges.find((e) => e.b === hub.id)!;
    const car = { kind: 'car', edge: intoHub.id, dir: 1, s: intoHub.lengthM - 1, speed: 10 };
    const rng = createRng(3);
    trafficStep(car, roads, 0.5, rng, index);
    expect(car.edge).not.toBe(intoHub.id);
    const next = roads.edges.find((e) => e.id === car.edge)!;
    expect([next.a, next.b]).toContain(hub.id);
    expect(car.dir).toBe(next.a === hub.id ? 1 : -1);
    // A dead end U-turns onto the same edge.
    const deadEnd = roads.nodes.find((n) => n.degree === 1)!;
    const spur = roads.edges.find((e) => e.a === deadEnd.id || e.b === deadEnd.id)!;
    const towardEnd = { kind: 'car', edge: spur.id, dir: spur.b === deadEnd.id ? 1 : -1, s: spur.lengthM - 0.5, speed: 10 };
    trafficStep(towardEnd, roads, 0.2, rng, index);
    expect(towardEnd.edge).toBe(spur.id);
    expect(towardEnd.dir).toBe(-(spur.b === deadEnd.id ? 1 : -1));
    // Cars sit right of the centre line, pedestrians further out on the verge.
    const pose = agentPose({ kind: 'car', edge: spur.id, dir: 1, s: 10, speed: 0 }, index.edges);
    const walker = agentPose({ kind: 'pedestrian', edge: spur.id, dir: 1, s: 10, speed: 0 }, index.edges);
    const centre = spur.points[0]!;
    const off = (q: number[]): number => Math.hypot(q[0]! - centre[0]!, q[2]! - centre[2]!);
    expect(off(walker.p)).toBeGreaterThan(off(pose.p));
  });
});

describe('open-world/daynight.js and minimap.js', () => {
  it('runs a day: noon is bright, midnight is dark, the clock reads HH:MM', async () => {
    const { hourAt, skyAt, isNight, clockText } = await load('open-world/daynight.js');
    expect(hourAt(0, 240, 9)).toBe(9);
    expect(hourAt(120, 240, 9)).toBe(21);
    expect(skyAt(12.5).sun).toBeGreaterThan(skyAt(7).sun);
    expect(skyAt(0)).toMatchObject({ sun: 0, night: true });
    expect(isNight(5.9)).toBe(true);
    expect(isNight(12)).toBe(false);
    expect(clockText(9.5)).toBe('09:30');
  });

  it('colours the minimap from the land cover legend and places world points on it', async () => {
    const { minimapPixels, worldToMinimap } = await load('open-world/minimap.js');
    const legend = (await readJson(join(genresDir, 'open-world/assets/terrain/fixture.terrain/maps/landcover.json'))) as {
      classes: string[];
      colours: Record<string, string>;
    };
    const water = legend.classes.indexOf('water');
    const grass = legend.classes.indexOf('grass');
    const px = minimapPixels([water, grass, grass, water], 2, legend, 2);
    expect([...px.slice(0, 4)]).toEqual([0x3a, 0x7b, 0xd5, 255]);
    expect([...px.slice(4, 8)]).toEqual([0x95, 0xd5, 0xb2, 255]);
    expect(worldToMinimap(0, 0, 512, 168)).toEqual([84, 84]);
    expect(worldToMinimap(-256, -256, 512, 168)).toEqual([0, 0]);
  });
});
