// @ts-check
/**
 * RPG genre (Phase 107 Theme J), on the third-person base (or first person):
 * a small village with a quest log, dialogue trees, stats and levelling, an
 * inventory with equipment, and NPCs who keep a daily schedule.
 *
 * Everything that is data lives in `src/data/` as JSON — `quests.json`,
 * `dialogue.json` (one tree per speaker) and `npcs.json` (places and
 * schedules) — validated on load by the kit's plain-JS validators
 * (`kit/core/genre/rpg/`). Stats, quests, dialogue and schedules are
 * engine-free; the inventory is the ARPG's (`kit/core/genre/arpg/inventory.js`).
 * This file is the three.js glue.
 *
 * E talks to whoever is close (or rests at nothing), 1-4 pick a reply, E or
 * SPACE continues, J swings at wolves, I lists the bag.
 */

import * as THREE from 'three';

import { createInventory, equip, equippedPower, pickUp } from 'kit/core/genre/arpg/inventory.js';
import { DEFAULT_TABLE } from 'kit/core/genre/arpg/loot.js';
import { advance, availableChoices, startConversation, validateDialogue } from 'kit/core/genre/rpg/dialogue.js';
import { createQuestLog, journal, questEvent, questStatus, startQuest, validateQuests } from 'kit/core/genre/rpg/quests.js';
import { gameHour, scheduleAt, validateSchedule, walkToward } from 'kit/core/genre/rpg/schedule.js';
import { createStats, derived, gainXp, levelProgress } from 'kit/core/genre/rpg/stats.js';
import { valueNoise } from 'kit/core/procedural-textures.js';
import { createRng } from 'kit/core/rng.js';
import { createInput } from 'kit/three/input.js';

import dialogueJson from '../data/dialogue.json' with { type: 'json' };
import npcsJson from '../data/npcs.json' with { type: 'json' };
import questsJson from '../data/quests.json' with { type: 'json' };

const RPG_BINDINGS = {
  'choice-1': { keys: ['1'], gamepad: [] },
  'choice-2': { keys: ['2'], gamepad: [] },
  'choice-3': { keys: ['3'], gamepad: [] },
  'choice-4': { keys: ['4'], gamepad: [] },
  bag: { keys: ['I'], gamepad: [] },
  cast: { keys: ['Q'], gamepad: [] },
};
const CHOICES = /** @type {const} */ (['choice-1', 'choice-2', 'choice-3', 'choice-4']);

/** Seconds in one game day; the village wakes at 09:00. */
const DAY_SECONDS = 300;
const TALK_RANGE = 3;
const SWING = { duration: 0.45, hitAt: 0.18, reach: 2.4, arcDeg: 100 };
const WOLF = { hp: 30, speed: 3.2, aggro: 15, reach: 1.5, bite: 6, cooldown: 1.2, xp: 40 };
const WOLF_DEN = /** @type {const} */ ([[-18, -24], [-14, -28], [-22, -30]]);
const HERBS = /** @type {const} */ ([[-20, -8], [-23, -4]]);
/** Firebolt: a spell on Q. It outranges the sword, costs a cooldown rather than mana, and glows. */
const SPELL = { speed: 15, range: 22, cooldown: 1.1, damageScale: 1.5, hit: 1.1 };
const CRIT_CHANCE = 0.15;
/** Torches that flicker: the square, the forge and the wolf den's ruin. */
const TORCHES = /** @type {const} */ ([[-4, -5], [4, -5], [12, 6], [-16, -21], [-20, -21]]);
/** Sound-effect arpeggios, as `[delaySeconds, preset, pitch]` over the kit's presets. */
const FANFARE = /** @type {const} */ ([[0, 'level-up', 1], [0.55, 'win', 1.3]]);
const STING = /** @type {const} */ ([[0, 'quest-complete', 1]]);

/** Unwrap a validator result, or fail loudly with its message (bad data is the author's bug, shown in the log). */
const must = (/** @type {{ ok: boolean, value?: any, message?: string }} */ r, /** @type {string} */ what) => {
  if (!r.ok) throw new Error(`${what}: ${r.message}`);
  return r.value;
};

const GOLD = 0xffd36b;
const facingOf = (/** @type {number} */ yaw) => [-Math.sin(yaw), -Math.cos(yaw)];

/**
 * @param {THREE.Scene} scene
 * @param {{
 *   physics: import('kit/three/physics.js').Physics,
 *   character: ReturnType<typeof import('kit/three/character.js').createCharacter>,
 *   rig: ReturnType<typeof import('kit/three/cameras.js').createCameraRig>,
 *   hud: ReturnType<typeof import('kit/three/hud.js').createHud>,
 *   input: ReturnType<typeof import('kit/three/input.js').createInput>,
 *   juice: ReturnType<typeof import('kit/three/juice.js').createJuice>,
 *   sfx: ReturnType<typeof import('kit/core/sfx.js').createSfx>,
 *   materials: ReturnType<typeof import('kit/three/materials.js').createMaterials>,
 *   settings: ReturnType<typeof import('kit/core/juice-settings.js').createJuiceSettings>,
 *   avatar: THREE.Object3D,
 * }} ctx
 */
export function installGenre(scene, ctx) {
  const { physics, character, rig, hud, input, juice, sfx, materials, settings, avatar } = ctx;
  const extra = createInput(RPG_BINDINGS);
  // Combat luck has its own stream, so a crit never shifts the world's other randomness.
  const luck = createRng(0xc417);
  hud.hint('WASD move · E talk · 1-4 reply · J attack · Q firebolt · I bag · C camera');

  /** Play a short run of presets (a fanfare, a sting) on the juice tweens, so it follows the loop's dt. */
  const jingle = (/** @type {readonly (readonly [number, string, number])[]} */ notes) => {
    for (const [delay, name, pitch] of notes) {
      if (delay === 0) sfx.play(name, { pitch });
      else juice.tween({ from: 0, to: 1, duration: 0.01, delay, onComplete: () => sfx.play(name, { pitch }) });
    }
  };
  const lift = (/** @type {readonly number[]} */ p, dy = 0) => [p[0] ?? 0, (p[1] ?? 0) + dy, p[2] ?? 0];

  // --- data ---------------------------------------------------------------------
  const quests = createQuestLog(must(validateQuests(questsJson), 'quests.json'));
  /** @type {Record<string, import('kit/core/genre/rpg/dialogue.js').DialogueTree>} */
  const trees = Object.fromEntries(Object.entries(dialogueJson).map(([k, v]) => [k, must(validateDialogue(v), `dialogue.json "${k}"`)]));
  /** @type {Record<string, [number, number]>} */
  const places = /** @type {any} */ (npcsJson.places);

  // --- the player -----------------------------------------------------------------
  const stats = createStats();
  const bag = createInventory(12);
  const player = { hp: derived(stats).maxHp, gold: 10, herbs: 0 };
  /** @type {{ t: number, landed: boolean } | null} */
  let swing = null;

  // --- the village: three houses, a well, the old stones --------------------------------
  const houseAt = (/** @type {readonly number[]} */ at, /** @type {number} */ color) => {
    const [x = 0, z = 0] = at;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), materials.get('brick', { repeat: [2, 1.5], tint: color }));
    walls.position.set(x, 1.5, z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2, 4), materials.get('wood', { repeat: [3, 1], tint: 0x9a5a40 }));
    roof.position.set(x, 4, z);
    roof.rotation.y = Math.PI / 4;
    walls.castShadow = roof.castShadow = walls.receiveShadow = true;
    scene.add(walls, roof);
    physics.addBox([x, 1.5, z], [2, 1.5, 2]);
  };
  // Homes sit a few metres behind each owner's doorstep place.
  houseAt([-15, 10], 0xcbb994);
  houseAt([-15, 14], 0xb9c9a4);
  houseAt([17, 4], 0xc9a48a);
  for (const [x, z] of HERBS) {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 1), materials.get('stone', { repeat: [1, 1], tint: 0x9aa2ad }));
    stone.position.set(x - 1.5, 0.6, z + 1);
    stone.castShadow = true;
    scene.add(stone);
  }
  const forge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 1.4), materials.get('metal', { repeat: [1, 1], tint: 0x555555, roughness: 0.6 }).clone());
  forge.position.set(places.forge?.[0] ?? 10, 0.5, (places.forge?.[1] ?? 8) + 1.6);
  /** @type {THREE.MeshStandardMaterial} */ (forge.material).emissive.setHex(0x802000);
  /** @type {THREE.MeshStandardMaterial} */ (forge.material).emissiveIntensity = 0.8;
  forge.castShadow = true;
  scene.add(forge);

  // --- the wolf den's ruin: a normal-mapped dungeon doorway of old brick ----------------------------------------
  const ruin = (/** @type {number[]} */ size, /** @type {number[]} */ pos) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), materials.get('brick', { repeat: [Math.max(1, (size[0] ?? 1) / 2), Math.max(1, (size[1] ?? 1) / 2)], tint: 0x8f8a86, normalScale: 1.4 }));
    m.position.set(pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    physics.addBox(pos, [(size[0] ?? 1) / 2, (size[1] ?? 1) / 2, (size[2] ?? 1) / 2]);
  };
  ruin([1.6, 4, 1.6], [-14.5, 2, -19]);
  ruin([1.6, 4, 1.6], [-21.5, 2, -19]);
  ruin([9, 1.2, 1.6], [-18, 4.6, -19]);

  // --- torches: a flame, a point light, and a flicker driven by noise on the loop's clock ---------------------------------
  const torches = TORCHES.map(([x, z], i) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.2, 8), materials.get('wood', { repeat: [1, 2], tint: 0x6b4a30 }));
    post.position.set(x, 1.1, z);
    post.castShadow = true;
    const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshStandardMaterial({ color: 0xffb040, emissive: 0xff7a1a, emissiveIntensity: 2.4 }));
    flame.position.set(x, 2.35, z);
    const light = new THREE.PointLight(0xff9a40, 9, 13, 1.6);
    light.position.set(x, 2.5, z);
    scene.add(post, flame, light);
    return { flame, light, seed: 11 + i * 7, base: 9 };
  });
  const flicker = (/** @type {number} */ t) => {
    const r = settings.resolved();
    // Off: steady. Reduced motion: a slow, shallow waver. On: a lively flicker.
    const amount = !r.enabled ? 0 : r.reducedMotion ? 0.08 : 0.3 * Math.min(1.5, r.intensity);
    for (const torch of torches) {
      const n = valueNoise(torch.seed, t * 7, 0.5) * 0.65 + valueNoise(torch.seed + 3, t * 19, 0.5) * 0.35;
      const k = 1 + (n - 0.5) * 2 * amount;
      torch.light.intensity = torch.base * k;
      torch.flame.scale.setScalar(0.9 + (k - 1) * 0.8);
    }
  };

  // --- NPCs ------------------------------------------------------------------------------
  /**
   * @typedef {{ id: string, name: string, dialogue: string, mesh: THREE.Mesh, position: number[],
   *   schedule: import('kit/core/genre/rpg/schedule.js').ScheduleBlock[], at: string }} Npc
   */
  /** @type {Npc[]} */
  const npcs = npcsJson.npcs.map((def) => {
    const schedule = must(validateSchedule(def.schedule), `npcs.json "${def.id}" schedule`);
    const at = scheduleAt(schedule, gameHour(0, DAY_SECONDS, 9), `home-${def.id}`);
    const [x = 0, z = 0] = places[at] ?? [0, 0];
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color(def.color) }));
    mesh.castShadow = true;
    scene.add(mesh);
    return { id: def.id, name: def.name, dialogue: def.dialogue, mesh, position: [x, 0, z], schedule, at };
  });

  // --- wolves and herbs ----------------------------------------------------------------------
  const wolfGeometry = new THREE.BoxGeometry(0.6, 0.6, 1.3);
  const wolves = WOLF_DEN.map(([x, z]) => {
    const mesh = new THREE.Mesh(wolfGeometry, new THREE.MeshStandardMaterial({ color: 0x6f6f78 }));
    mesh.castShadow = true;
    scene.add(mesh);
    return { mesh, hp: WOLF.hp, position: [x, 0, z], bite: 0, flash: 0, awake: false };
  });
  const herbs = HERBS.map(([x, z]) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: 0x9cff9c, emissive: 0x2fbf4f, emissiveIntensity: 1.2 }));
    mesh.position.set(x, 0.4, z);
    scene.add(mesh);
    return { mesh, taken: false, position: [x, 0, z] };
  });

  // --- dialogue panel ---------------------------------------------------------------------------
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;left:50%;bottom:44px;transform:translateX(-50%);width:min(560px,90vw);padding:12px 16px;border-radius:10px;background:#0b0d12e6;font-weight:500;display:none;';
  hud.root.append(panel);
  /** @type {(import('kit/core/genre/rpg/dialogue.js').Conversation & { with: Npc }) | null} */
  let talk = null;
  const dialogueCtx = { questStatus: (/** @type {string} */ q) => questStatus(quests, q) };

  const say = (/** @type {string} */ text) => {
    hud.banner(text);
    setTimeout(() => hud.banner(null), 1800);
  };

  /** Level-up: a gold burst around the hero, a flash, a fanfare and a floating banner. */
  const levelUp = () => {
    say(`Level ${stats.level}!`);
    const p = lift(character.position, 1);
    juice.burst('spark', p, { count: 70, scale: 1.4, colors: [GOLD, 0xfff2c4, 0xffffff] });
    juice.burst('dust', lift(character.position, 0.1), { scale: 1.2 });
    juice.screenFlash(GOLD, 0.28, 0.5);
    juice.text(lift(character.position, 2.2), `LEVEL ${stats.level}`, 'heal');
    jingle(FANFARE);
  };
  const gold = (/** @type {number} */ amount) => {
    if (amount <= 0) return;
    player.gold += amount;
    sfx.play('coin');
    juice.text(lift(character.position, 2), `+${amount}g`, 'heal');
  };
  const reward = (/** @type {import('kit/core/genre/rpg/quests.js').QuestReward} */ r) => {
    if (r.xp && gainXp(stats, r.xp) > 0) levelUp();
    gold(r.gold ?? 0);
    if (r.item) giveItem(r.item);
  };
  const giveItem = (/** @type {string} */ id) => {
    const def = DEFAULT_TABLE.find((d) => d.id === id);
    if (!def) return;
    const item = { ...def, rarity: def.rarity ?? 'common' };
    if (!pickUp(bag, item)) return;
    // Loot sparkle in the item's rarity colour, over the hero's shoulder, with a coin chime.
    juice.burst('spark', lift(character.position, 1.6), { count: 24, colors: [0xfff2c4, 0x9cd1ff, GOLD] });
    sfx.play('coin', { pitch: 1.2 });
    // Wear it straight away when it beats what is in that slot.
    if ((bag.equipped[item.slot]?.power ?? -1) < item.power) equip(bag, bag.bag.length - 1);
  };
  const fire = (/** @type {import('kit/core/genre/rpg/quests.js').QuestEvent} */ event) => {
    for (const moved of questEvent(quests, event)) {
      if (moved.completed) {
        say(`Quest complete: ${quests.quests[moved.quest]?.title ?? moved.quest}`);
        jingle(STING);
        juice.screenFlash(GOLD, 0.16, 0.4);
        juice.burst('spark', lift(character.position, 1.2), { count: 36, colors: [GOLD, 0xffffff] });
        if (moved.reward) reward(moved.reward);
      }
    }
  };
  const apply = (/** @type {import('kit/core/genre/rpg/dialogue.js').DialogueEffect[]} */ effects) => {
    for (const e of /** @type {any[]} */ (effects)) {
      if (e.type === 'start-quest' && startQuest(quests, e.quest)) say(`New quest: ${quests.quests[e.quest]?.title ?? e.quest}`);
      else if (e.type === 'quest-event') fire(e.event);
      else if (e.type === 'give') giveItem(e.item);
      else if (e.type === 'gold') gold(e.amount);
      else if (e.type === 'heal') {
        player.hp = derived(stats, equippedPower(bag)).maxHp;
        juice.burst('spark', lift(character.position, 1), { count: 30, colors: [0x9cff9c, 0xffffff] });
        sfx.play('heal', { power: 0.8 });
      }
      else if (e.type === 'buy' && player.gold >= (e.price ?? 0)) {
        player.gold -= e.price ?? 0;
        sfx.play('coin', { pitch: 0.8 });
        giveItem(e.item);
      }
    }
  };
  const drawPanel = () => {
    if (!talk) {
      if (panel.style.display !== 'none') sfx.play('ui-click', { pitch: 0.75 });
      panel.style.display = 'none';
      return;
    }
    if (panel.style.display === 'none') sfx.play('ui-click', { pitch: 1.25 });
    const choices = availableChoices(talk.node, dialogueCtx);
    const lines = talk.node.choices ? choices.map((c, i) => `${i + 1}. ${c.text}`) : ['[E] continue'];
    panel.innerHTML = '';
    const who = document.createElement('div');
    who.style.cssText = 'color:#f5c26b;margin-bottom:4px;';
    who.textContent = talk.node.speaker;
    const text = document.createElement('div');
    text.textContent = talk.node.text;
    const opts = document.createElement('div');
    opts.style.cssText = 'margin-top:8px;opacity:.85;white-space:pre;';
    opts.textContent = lines.join('\n');
    panel.append(who, text, opts);
    panel.style.display = 'block';
  };

  const nearestNpc = () => {
    const [px, , pz] = character.position;
    let best = /** @type {Npc | null} */ (null);
    let bestD = TALK_RANGE;
    for (const npc of npcs) {
      const d = Math.hypot((npc.position[0] ?? 0) - px, (npc.position[2] ?? 0) - pz);
      if (d < bestD) {
        bestD = d;
        best = npc;
      }
    }
    return best;
  };

  /** Land `base` damage on a wolf: a crit roll, floating number, hit-stop and spark; on a kill, xp and a puff. */
  const hitWolf = (/** @type {typeof wolves[number]} */ w, /** @type {number} */ base, /** @type {number} */ strength) => {
    const crit = luck.next() < CRIT_CHANCE;
    const damage = crit ? Math.round(base * 2) : base;
    w.hp -= damage;
    w.flash = 0.12;
    const p = [w.position[0] ?? 0, 1.2, w.position[2] ?? 0];
    juice.trigger('hit', { object: w.mesh, position: p, strength: (crit ? 1.5 : 0.8) * strength, text: crit ? `${damage}!` : damage, textKind: crit ? 'crit' : 'hit' });
    if (crit) {
      juice.burst('spark', p, { count: 26, colors: [GOLD, 0xffffff] });
      sfx.play('critical', { power: 0.7, position: p });
    }
    if (w.hp <= 0) {
      juice.trigger('death', { position: p, strength: 0.6 });
      scene.remove(w.mesh);
      if (gainXp(stats, WOLF.xp) > 0) levelUp();
      fire({ type: 'defeat', target: 'wolf' });
    }
  };

  // --- firebolt: Q throws a glowing bolt that flies straight and bursts on the first wolf it meets -------------
  /** @type {{ mesh: THREE.Mesh, light: THREE.PointLight, p: number[], v: number[], travelled: number }[]} */
  const bolts = [];
  let castCooldown = 0;
  const cast = () => {
    const f = facingOf(character.yaw);
    const origin = [(character.position[0] ?? 0) + (f[0] ?? 0) * 0.8, (character.position[1] ?? 0) + 1.2, (character.position[2] ?? 0) + (f[1] ?? 0) * 0.8];
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), new THREE.MeshStandardMaterial({ color: 0xffd080, emissive: 0xff6a00, emissiveIntensity: 3 }));
    const light = new THREE.PointLight(0xff7a30, 14, 9, 1.5);
    scene.add(mesh, light);
    bolts.push({ mesh, light, p: origin, v: [(f[0] ?? 0) * SPELL.speed, 0, (f[1] ?? 0) * SPELL.speed], travelled: 0 });
    castCooldown = SPELL.cooldown;
    sfx.play('magic-cast', { power: 1, position: origin });
    juice.burst('muzzle', origin, { dir: [f[0] ?? 0, 0, f[1] ?? 0], colors: [0xff9a40, 0xffe0a0] });
    juice.shake(0.08);
  };
  const stepBolts = (/** @type {number} */ dt) => {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = /** @type {typeof bolts[number]} */ (bolts[i]);
      b.p[0] = (b.p[0] ?? 0) + (b.v[0] ?? 0) * dt;
      b.p[2] = (b.p[2] ?? 0) + (b.v[2] ?? 0) * dt;
      b.travelled += SPELL.speed * dt;
      b.mesh.position.set(b.p[0] ?? 0, b.p[1] ?? 0, b.p[2] ?? 0);
      b.light.position.copy(b.mesh.position);
      // A cheap ember trail: a few sparks left behind every frame.
      juice.burst('spark', b.p, { count: 2, scale: 0.35, colors: [0xff8a2a, 0xffd080] });
      const target = wolves.find((w) => w.hp > 0 && Math.hypot((w.position[0] ?? 0) - (b.p[0] ?? 0), (w.position[2] ?? 0) - (b.p[2] ?? 0)) < SPELL.hit);
      if (target || b.travelled > SPELL.range) {
        if (target) {
          hitWolf(target, Math.round(derived(stats, equippedPower(bag)).damage * SPELL.damageScale), 1.1);
          juice.burst('impact', b.p, { colors: [0xff7a30, 0xffd080] });
        } else juice.burst('dust', b.p, { scale: 0.6 });
        sfx.play('explosion', { power: 0.5, pitch: 1.4, position: b.p });
        scene.remove(b.mesh, b.light);
        b.mesh.geometry.dispose();
        bolts.splice(i, 1);
      }
    }
  };

  const strike = () => {
    const at = character.position;
    const f = facingOf(character.yaw);
    const damage = derived(stats, equippedPower(bag)).damage;
    for (const w of wolves) {
      if (w.hp <= 0) continue;
      const dx = (w.position[0] ?? 0) - (at[0] ?? 0);
      const dz = (w.position[2] ?? 0) - (at[2] ?? 0);
      const d = Math.hypot(dx, dz);
      if (d > SWING.reach) continue;
      if (d > 0.4 && (dx * (f[0] ?? 0) + dz * (f[1] ?? 0)) / d < Math.cos((SWING.arcDeg / 2) * (Math.PI / 180))) continue;
      hitWolf(w, damage, 1);
    }
  };

  let seconds = 0;

  return {
    /** Talking roots the player; the jump button continues dialogue instead of jumping. */
    intent(/** @type {{ direction: readonly number[], run?: boolean, jump?: boolean, face?: boolean }} */ wish) {
      if (talk) return { direction: [0, 0], run: false, jump: false, face: false };
      if (swing) return { ...wish, direction: [0, 0], jump: false };
      return wish;
    },
    update(/** @type {number} */ dt) {
      extra.update();
      seconds += dt;
      const hour = gameHour(seconds, DAY_SECONDS, 9);

      // --- dialogue ----------------------------------------------------------------
      if (talk) {
        const conv = talk;
        if (conv.node.end) {
          if (input.justPressed('interact') || input.justPressed('jump')) {
            advance(conv);
            talk = null;
          }
        } else if (conv.node.choices) {
          const picked = CHOICES.findIndex((c) => extra.justPressed(c));
          if (picked >= 0 && picked < availableChoices(conv.node, dialogueCtx).length) apply(advance(conv, picked, dialogueCtx));
        } else if (input.justPressed('interact') || input.justPressed('jump')) {
          apply(advance(conv, 0, dialogueCtx));
        }
        drawPanel();
      } else if (input.justPressed('interact')) {
        const npc = nearestNpc();
        const tree = npc ? trees[npc.dialogue] : undefined;
        if (npc && tree) {
          talk = { ...startConversation(tree), with: npc };
          apply(talk.effects);
          drawPanel();
        }
      }

      // --- combat -------------------------------------------------------------------
      if (!talk && !swing && input.justPressed('attack')) {
        swing = { t: 0, landed: false };
        sfx.play('swing');
        // A soft lock: the swing turns to the nearest wolf in reach, so it lands in either camera.
        const [px, , pz] = character.position;
        let best = SWING.reach + 0.8;
        for (const w of wolves) {
          const d = w.hp > 0 ? Math.hypot((w.position[0] ?? 0) - px, (w.position[2] ?? 0) - pz) : Infinity;
          if (d < best) {
            best = d;
            character.yaw = Math.atan2(-((w.position[0] ?? 0) - px), -((w.position[2] ?? 0) - pz));
          }
        }
      }
      if (swing) {
        swing.t += dt;
        if (!swing.landed && swing.t >= SWING.hitAt) {
          swing.landed = true;
          strike();
        }
        if (swing.t >= SWING.duration) swing = null;
      }
      const maxHp = derived(stats, equippedPower(bag)).maxHp;
      for (const w of wolves) {
        if (w.hp <= 0) continue;
        const [px, , pz] = character.position;
        const dx = px - (w.position[0] ?? 0);
        const dz = pz - (w.position[2] ?? 0);
        const d = Math.hypot(dx, dz);
        w.bite = Math.max(0, w.bite - dt);
        // A pack: one wolf that notices you wakes any packmate within 12 m.
        if (!w.awake && (d < WOLF.aggro || wolves.some((o) => o.awake && o.hp > 0 && Math.hypot((o.position[0] ?? 0) - (w.position[0] ?? 0), (o.position[2] ?? 0) - (w.position[2] ?? 0)) < 12))) w.awake = true;
        if (!talk && w.awake && d < 40 && d > WOLF.reach) {
          w.position[0] = (w.position[0] ?? 0) + (dx / d) * WOLF.speed * dt;
          w.position[2] = (w.position[2] ?? 0) + (dz / d) * WOLF.speed * dt;
        } else if (!talk && d <= WOLF.reach && w.bite === 0) {
          w.bite = WOLF.cooldown;
          player.hp -= WOLF.bite;
          juice.trigger('hurt', { object: avatar, position: [px, 2, pz], text: -WOLF.bite, textKind: 'crit' });
          if (player.hp <= 0) {
            player.hp = maxHp;
            character.teleport([0, 0.1, 6]);
            say('You wake in the village square.');
          }
        }
        w.mesh.position.set(w.position[0] ?? 0, 0.35, w.position[2] ?? 0);
        w.mesh.rotation.y = Math.atan2(dx, dz);
        w.flash = Math.max(0, w.flash - dt);
        /** @type {THREE.MeshStandardMaterial} */ (w.mesh.material).emissive.setHex(w.flash > 0 ? 0xffffff : 0x000000);
      }
      player.hp = Math.min(player.hp + dt * 0.5, maxHp);

      // --- herbs: only once the healer has asked for them ----------------------------------
      if (questStatus(quests, 'herbs') === 'active') {
        for (const h of herbs) {
          if (h.taken) continue;
          h.mesh.rotation.y += dt * 2;
          if (Math.hypot((h.position[0] ?? 0) - character.position[0], (h.position[2] ?? 0) - character.position[2]) < 1.3) {
            h.taken = true;
            scene.remove(h.mesh);
            player.herbs += 1;
            juice.trigger('pickup', { position: [h.position[0] ?? 0, 0.8, h.position[2] ?? 0] });
            juice.burst('spark', [h.position[0] ?? 0, 0.8, h.position[2] ?? 0], { count: 22, colors: [0x9cff9c, 0xffffff] });
            fire({ type: 'collect', target: 'herb' });
          }
        }
      }

      // --- NPCs walk their schedules (and stop to talk) -------------------------------------------
      for (const npc of npcs) {
        npc.at = scheduleAt(npc.schedule, hour, `home-${npc.id}`);
        const [tx = 0, tz = 0] = places[npc.at] ?? [0, 0];
        if (talk?.with !== npc) walkToward(npc.position, [tx, 0, tz], 1.6, dt);
        npc.mesh.position.set(npc.position[0] ?? 0, 0.9, npc.position[2] ?? 0);
      }
      castCooldown = Math.max(0, castCooldown - dt);
      if (!talk && !swing && castCooldown === 0 && extra.justPressed('cast')) cast();
      stepBolts(dt);
      flicker(seconds);

      // --- HUD ---------------------------------------------------------------------------------
      const near = talk ? null : nearestNpc();
      hud.set('hp', `HP ${Math.ceil(player.hp)}/${maxHp}  ·  Lv ${stats.level} (${Math.round(levelProgress(stats) * 100)}%)  ·  ${player.gold}g`);
      hud.set('clock', `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`, { align: 'right' });
      const log = journal(quests);
      hud.set('quests', log.length > 0 ? log.map((q) => `${q.done ? '✓' : '•'} ${q.title}: ${q.objective}`).join('  |  ') : null, { align: 'right' });
      hud.set('prompt', near ? `[E] Talk to ${near.name}` : null);
      if (extra.justPressed('bag')) {
        sfx.play('ui-hover');
        const worn = Object.entries(bag.equipped).map(([slot, item]) => `${slot}: ${item?.name ?? '—'}`).join(', ');
        say(`Bag ${bag.bag.length}/${bag.capacity} · ${worn}`);
      }
    },
    state() {
      return {
        player: { position: character.position.map((v) => Number(v.toFixed(3))), health: Math.ceil(player.hp) },
        rpg: {
          level: stats.level,
          xp: stats.xp,
          gold: player.gold,
          hour: Number(gameHour(seconds, DAY_SECONDS, 9).toFixed(2)),
          quests: Object.fromEntries(Object.keys(quests.quests).map((id) => [id, questStatus(quests, id)])),
          dialogue: talk ? { with: talk.with.id, node: talk.at } : null,
          equipped: Object.fromEntries(Object.entries(bag.equipped).map(([slot, item]) => [slot, item?.id ?? null])),
          wolves: wolves.filter((w) => w.hp > 0).length,
          bolts: bolts.length,
          npcs: Object.fromEntries(npcs.map((n) => [n.id, n.at])),
        },
      };
    },
  };
}
