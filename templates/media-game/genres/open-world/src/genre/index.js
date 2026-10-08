// @ts-check
/**
 * Open world genre (Phase 107 Theme J), third person or first person, on a
 * Phase 105 terrain pack: traffic and pedestrians routed on the pack's road
 * graph, F's vehicles (the stage, `../scenes/level.js`, handles getting in
 * and out), a day/night cycle, a minimap drawn from the land-cover map, a
 * GPS route to a marked junction, and a wanted level with police pursuit —
 * the same engine-free `wanted.js` the 2D top-down crime starter uses.
 *
 * Routing, traffic, the sky and the minimap maths are engine-free
 * (`kit/core/genre/open-world/`); the wanted reducer is
 * `kit/core/genre/crime/wanted.js` (declared in `genre.json`). This file is
 * the three.js glue.
 */

import * as THREE from 'three';

import { createWanted, pursuit, wantedReducer } from 'kit/core/genre/crime/wanted.js';
import { clockText, hourAt, skyAt } from 'kit/core/genre/open-world/daynight.js';
import { minimapPixels, worldToMinimap } from 'kit/core/genre/open-world/minimap.js';
import { nearestNode, pointAlong, polylineLength, routeOnRoads, routePolyline } from 'kit/core/genre/open-world/route.js';
import { agentPose, indexRoads, TRAFFIC_DEFAULTS, trafficSpawn, trafficStep } from 'kit/core/genre/open-world/traffic.js';
import { decodePng16 } from 'kit/core/png16.js';
import { resolveTerrainPath } from 'kit/core/terrain-manifest.js';
import { createRng } from 'kit/core/rng.js';

/** Seconds in one game day; the world wakes at 09:00. */
const DAY_SECONDS = 240;
const MINIMAP_PX = 168;
const SIGHT = 45;
const POLICE_SPEED = 16;

/**
 * @param {THREE.Scene} scene
 * @param {{
 *   juice: ReturnType<typeof import('kit/three/juice.js').createJuice>,
 *   sfx: ReturnType<typeof import('kit/core/sfx.js').createSfx>,
 *   rig: ReturnType<typeof import('kit/three/cameras.js').createCameraRig>,
 *   hud: ReturnType<typeof import('kit/three/hud.js').createHud>,
 *   input: ReturnType<typeof import('kit/three/input.js').createInput>,
 *   terrain: Awaited<ReturnType<typeof import('kit/three/terrain.js').loadTerrain>>,
 *   terrainUrl: string,
 *   cars: ReturnType<typeof import('kit/three/vehicle.js').createVehicle>[],
 *   lights: { sun: THREE.DirectionalLight, ambient: THREE.HemisphereLight },
 *   driving: () => ReturnType<typeof import('kit/three/vehicle.js').createVehicle> | null,
 *   playerPosition: () => number[],
 *   bust: () => void,
 * }} ctx
 */
export function installGenre(scene, ctx) {
  const { hud, input, terrain, lights, juice, sfx } = ctx;
  const roads = terrain.roads;
  const index = indexRoads(roads);
  const rng = createRng(7);
  const worldSize = terrain.heightfield.worldSize;

  // --- traffic and pedestrians on the road graph --------------------------------------------
  const carGeometry = new THREE.BoxGeometry(1.7, 1.1, 3.8);
  const pedGeometry = new THREE.CapsuleGeometry(0.28, 0.9, 3, 8);
  const palette = [0xe5e7eb, 0x1f2937, 0x991b1b, 0x1d4ed8, 0x15803d, 0xa16207];
  const agents = [
    ...trafficSpawn(roads.edges, TRAFFIC_DEFAULTS.car.perKm, rng, { kind: 'car' }),
    ...trafficSpawn(roads.edges, TRAFFIC_DEFAULTS.pedestrian.perKm, rng, { kind: 'pedestrian' }),
  ].map((agent) => {
    const car = agent.kind === 'car';
    const mesh = new THREE.Mesh(
      car ? carGeometry : pedGeometry,
      new THREE.MeshStandardMaterial({ color: car ? (palette[Math.floor(rng.next() * palette.length)] ?? 0xffffff) : 0xd6a77a }),
    );
    mesh.castShadow = true;
    scene.add(mesh);
    return { agent, mesh, down: 0, p: [0, 0, 0] };
  });

  // --- police --------------------------------------------------------------------------------
  /** @type {{ mesh: THREE.Mesh, p: number[], yaw: number, path: number[][], s: number, replan: number }[]} */
  const police = [];
  const policeCar = () => {
    const group = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 4), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.4), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000 }));
    bar.position.y = 0.65;
    group.add(bar);
    group.castShadow = true;
    scene.add(group);
    return group;
  };
  let wanted = createWanted();
  let crimes = 0;
  let busted = 0;

  const commit = (/** @type {string} */ crime) => {
    const before = wanted.level;
    wanted = wantedReducer(wanted, { type: 'crime', crime });
    crimes += 1;
    if (wanted.level > before) {
      hud.banner(`WANTED ${'★'.repeat(wanted.level)}`);
      sfx.play('hurt', { pitch: 0.7, power: 1.1 });
      juice.screenFlash(0xff3030, 0.16, 0.35);
    }
    setTimeout(() => hud.banner(null), 1200);
  };

  // --- GPS: a route on the roads to a marked dead end --------------------------------------------
  const ends = roads.nodes.filter((n) => (n.degree ?? 0) === 1);
  let target = ends[0] ?? roads.nodes[0] ?? null;
  /** @type {number[][]} */
  let gps = [];
  let gpsLength = 0;
  let deliveries = 0;
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.5, 30, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  );
  scene.add(marker);
  const replanGps = () => {
    const [x = 0, , z = 0] = ctx.playerPosition();
    const from = nearestNode(roads, [x, z]);
    if (!from || !target) return;
    const route = routeOnRoads(roads, from.id, target.id);
    gps = route ? routePolyline(roads, route) : [];
    gpsLength = route ? Math.round(route.lengthM) : 0;
  };

  // --- minimap from the land cover ------------------------------------------------------------------
  const minimap = document.createElement('canvas');
  minimap.width = minimap.height = MINIMAP_PX;
  minimap.style.cssText = `position:absolute;right:14px;bottom:14px;width:${MINIMAP_PX}px;height:${MINIMAP_PX}px;border-radius:50%;border:2px solid #fff8;box-shadow:0 2px 8px #0008;`;
  hud.root.append(minimap);
  const mm = /** @type {CanvasRenderingContext2D} */ (minimap.getContext('2d'));
  /** @type {HTMLCanvasElement | null} */
  let base = null;
  void (async () => {
    const { maps } = terrain.manifest;
    if (!maps.landcover || !maps.landcoverLegend) return;
    try {
      const url = (/** @type {string} */ p) => resolveTerrainPath(ctx.terrainUrl, p);
      const legend = await (await fetch(url(maps.landcoverLegend))).json();
      const png = await decodePng16(await (await fetch(url(maps.landcover))).arrayBuffer());
      const pixels = minimapPixels(png.data, png.width, legend, MINIMAP_PX);
      base = document.createElement('canvas');
      base.width = base.height = MINIMAP_PX;
      /** @type {CanvasRenderingContext2D} */ (base.getContext('2d')).putImageData(new ImageData(pixels, MINIMAP_PX, MINIMAP_PX), 0, 0);
    } catch {
      base = null; // no minimap background; the dots still draw
    }
  })();
  const dot = (/** @type {number[]} */ p, /** @type {string} */ color, r = 2.5) => {
    const [mx, my] = worldToMinimap(p[0] ?? 0, p[2] ?? 0, worldSize, MINIMAP_PX);
    mm.fillStyle = color;
    mm.beginPath();
    mm.arc(mx ?? 0, my ?? 0, r, 0, Math.PI * 2);
    mm.fill();
  };
  const drawMinimap = () => {
    mm.clearRect(0, 0, MINIMAP_PX, MINIMAP_PX);
    if (base) mm.drawImage(base, 0, 0);
    else {
      mm.fillStyle = '#2d3a2a';
      mm.fillRect(0, 0, MINIMAP_PX, MINIMAP_PX);
    }
    if (gps.length > 1) {
      mm.strokeStyle = '#facc15';
      mm.lineWidth = 2;
      mm.beginPath();
      gps.forEach((p, i) => {
        const [mx = 0, my = 0] = worldToMinimap(p[0] ?? 0, p[2] ?? 0, worldSize, MINIMAP_PX);
        if (i === 0) mm.moveTo(mx, my);
        else mm.lineTo(mx, my);
      });
      mm.stroke();
    }
    for (const a of agents) if (a.agent.kind === 'car') dot(a.p, '#e5e7eb', 1.8);
    for (const c of ctx.cars) dot([c.object.position.x, 0, c.object.position.z], '#22d3ee', 2.5);
    for (const p of police) dot(p.p, '#ef4444', 3);
    if (target) dot(target.p, '#facc15', 4);
    dot(ctx.playerPosition(), '#ffffff', 3.5);
  };

  let seconds = 0;
  let replanIn = 0;
  let punch = 0;

  return {
    update(/** @type {number} */ dt, /** @type {number} */ frame) {
      seconds += dt;
      const me = ctx.playerPosition();
      const driving = ctx.driving();

      // --- day and night ------------------------------------------------------------------
      const hour = hourAt(seconds, DAY_SECONDS, 9);
      const sky = skyAt(hour);
      const [sr = 0, sg = 0, sb = 0] = sky.sky;
      /** @type {THREE.Color} */ (scene.background).setRGB(sr / 255, sg / 255, sb / 255, THREE.SRGBColorSpace);
      scene.fog?.color.setRGB(sr / 255, sg / 255, sb / 255, THREE.SRGBColorSpace);
      lights.sun.intensity = sky.sun;
      lights.ambient.intensity = sky.ambient;
      const r = 120;
      lights.sun.position.set((me[0] ?? 0) + Math.sin(sky.azimuth) * Math.cos(sky.elevation) * r, Math.max(5, Math.sin(sky.elevation) * r), (me[2] ?? 0) + Math.cos(sky.azimuth) * r * 0.4);
      lights.sun.target.position.set(me[0] ?? 0, me[1] ?? 0, me[2] ?? 0);

      // --- traffic and pedestrians ------------------------------------------------------------
      for (const a of agents) {
        if (a.down > 0) {
          a.down -= dt;
          if (a.down <= 0) a.mesh.visible = true;
          continue;
        }
        trafficStep(a.agent, roads, dt, rng, index);
        const pose = agentPose(a.agent, index.edges);
        const [x = 0, , z = 0] = pose.p;
        const y = terrain.heightAt(x, z);
        a.p = [x, y, z];
        a.mesh.position.set(x, y + (a.agent.kind === 'car' ? 0.75 : 0.75), z);
        a.mesh.rotation.y = pose.yaw;
        // Run someone over, or punch them, and the police take an interest.
        const d = Math.hypot(x - (me[0] ?? 0), z - (me[2] ?? 0));
        const ped = a.agent.kind === 'pedestrian';
        if (driving && Math.abs(driving.speed) > 5 && d < (ped ? 2.2 : 2.8)) {
          a.down = 8;
          a.mesh.visible = false;
          juice.trigger('hit', { position: [x, y + 1, z], strength: ped ? 0.9 : 1.4 });
          juice.burst('impact', [x, y + 0.8, z], { scale: ped ? 0.8 : 1.3 });
          commit(ped ? 'pedestrian' : 'vehicle');
        } else if (!driving && ped && punch > 0 && d < 1.6) {
          a.down = 8;
          a.mesh.visible = false;
          juice.trigger('hit', { position: [x, y + 1, z], strength: 0.6 });
          commit('pedestrian');
          punch = 0;
        }
      }
      if (!driving && input.justPressed('attack')) {
        punch = 0.25;
        sfx.play('swing', { pitch: 1.1 });
      }
      punch = Math.max(0, punch - dt);

      // --- police: route on the roads, then close in ------------------------------------------
      const want = pursuit(wanted.level).cars;
      while (police.length < want) {
        const far = [...roads.nodes].sort(
          (a, b) => Math.hypot((b.p[0] ?? 0) - (me[0] ?? 0), (b.p[2] ?? 0) - (me[2] ?? 0)) - Math.hypot((a.p[0] ?? 0) - (me[0] ?? 0), (a.p[2] ?? 0) - (me[2] ?? 0)),
        )[police.length % Math.max(1, roads.nodes.length)];
        const p = far ? [...far.p] : [0, 0, 0];
        police.push({ mesh: policeCar(), p, yaw: 0, path: [], s: 0, replan: 0 });
      }
      while (police.length > want) scene.remove(/** @type {{ mesh: THREE.Mesh }} */ (police.pop()).mesh);
      let seen = false;
      for (const cop of police) {
        const dx = (me[0] ?? 0) - (cop.p[0] ?? 0);
        const dz = (me[2] ?? 0) - (cop.p[2] ?? 0);
        const d = Math.hypot(dx, dz);
        if (d < SIGHT) seen = true;
        const speed = POLICE_SPEED + wanted.level * 2;
        if (d < 30) {
          if (d > 3) {
            cop.p[0] = (cop.p[0] ?? 0) + (dx / d) * speed * dt;
            cop.p[2] = (cop.p[2] ?? 0) + (dz / d) * speed * dt;
            cop.yaw = Math.atan2(-dx, -dz);
          }
        } else {
          cop.replan -= dt;
          if (cop.replan <= 0 || cop.path.length < 2) {
            cop.replan = 1;
            const from = nearestNode(roads, [cop.p[0] ?? 0, cop.p[2] ?? 0]);
            const to = nearestNode(roads, [me[0] ?? 0, me[2] ?? 0]);
            const route = from && to ? routeOnRoads(roads, from.id, to.id) : null;
            cop.path = route && route.edges.length > 0 ? [[...cop.p], ...routePolyline(roads, route)] : [[...cop.p], [...me]];
            cop.s = 0;
          }
          cop.s += speed * dt;
          const at = pointAlong(cop.path, Math.min(cop.s, polylineLength(cop.path)));
          cop.p = at.p;
          cop.yaw = at.yaw;
        }
        const ground = terrain.heightAt(cop.p[0] ?? 0, cop.p[2] ?? 0);
        cop.p[1] = ground;
        cop.mesh.position.set(cop.p[0] ?? 0, ground + 0.75, cop.p[2] ?? 0);
        cop.mesh.rotation.y = cop.yaw;
        const bar = /** @type {THREE.Mesh} */ (cop.mesh.children[0]);
        /** @type {THREE.MeshStandardMaterial} */ (bar.material).emissive.setHex(frame % 20 < 10 ? 0xff0000 : 0x0044ff);
        // A two-tone siren from the nearest car that is in earshot.
        if (d < 60 && cop === police[0] && frame % 30 === 0) sfx.play('laser', { pitch: frame % 60 === 0 ? 1.7 : 1.3, power: 0.35, position: [cop.p[0] ?? 0, 1, cop.p[2] ?? 0], volume: 0.5 });
        // Caught on foot: busted.
        if (!driving && d < 2.5) {
          busted += 1;
          wanted = wantedReducer(wanted, { type: 'clear' });
          ctx.bust();
          juice.trigger('death', { position: [me[0] ?? 0, me[1] ?? 0, me[2] ?? 0], strength: 0.6 });
          hud.banner('BUSTED');
          setTimeout(() => hud.banner(null), 1500);
          break;
        }
      }
      wanted = wantedReducer(wanted, { type: 'tick', dt: dt * 1000, seen });

      // --- GPS ---------------------------------------------------------------------------------
      replanIn -= dt;
      if (replanIn <= 0) {
        replanIn = 0.5;
        replanGps();
      }
      if (target) {
        marker.position.set(target.p[0] ?? 0, (target.p[1] ?? 0) + 15, target.p[2] ?? 0);
        if (Math.hypot((target.p[0] ?? 0) - (me[0] ?? 0), (target.p[2] ?? 0) - (me[2] ?? 0)) < 6) {
          deliveries += 1;
          sfx.play('win');
          sfx.play('coin', { pitch: 1.2 });
          juice.text([me[0] ?? 0, (me[1] ?? 0) + 2, me[2] ?? 0], '+ delivered', 'heal');
          juice.burst('spark', [me[0] ?? 0, (me[1] ?? 0) + 1, me[2] ?? 0], { count: 40, colors: [0xfacc15, 0xffffff] });
          const others = ends.filter((n) => n !== target);
          target = others[Math.floor(rng.next() * others.length)] ?? target;
          hud.banner('Delivered! New drop marked.');
          setTimeout(() => hud.banner(null), 1500);
          replanGps();
        }
      }

      drawMinimap();
      hud.set('clock', `${clockText(hour)}${sky.night ? ' ☾' : ''}`, { align: 'right' });
      hud.set('wanted', wanted.level > 0 ? `WANTED ${'★'.repeat(wanted.level)}${'☆'.repeat(5 - wanted.level)}` : null, { align: 'right' });
      hud.set('gps', gpsLength > 0 ? `GPS ${gpsLength} m to the drop` : null);
    },
    state() {
      const hour = hourAt(seconds, DAY_SECONDS, 9);
      return {
        openWorld: {
          terrain: terrain.manifest.name,
          roads: { nodes: roads.nodes.length, edges: roads.edges.length },
          junctions: roads.nodes.filter((n) => (n.degree ?? 0) >= 3).length,
          hour: Number(hour.toFixed(2)),
          night: skyAt(hour).night,
          traffic: agents.filter((a) => a.agent.kind === 'car' && a.down <= 0).length,
          pedestrians: agents.filter((a) => a.agent.kind === 'pedestrian' && a.down <= 0).length,
          wanted: wanted.level,
          police: police.length,
          crimes,
          busted,
          gps: { target: target?.id ?? null, lengthM: gpsLength },
          deliveries,
        },
      };
    },
  };
}
