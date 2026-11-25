import { useThree } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute } from 'three';

import { overlayColours } from '../level-overlay-draw';
import { extraBoxes, ghostSegments, navSegments, type SceneExtras } from './level-extras';
import { drapedRuns } from './level-relief';
import type { WorldItem } from './level-world';

/** A buffer of line segments, disposed with it. Dashed lines need distances computed. */
function useSegments(points: readonly number[] | Float32Array, dashed = false): BufferGeometry {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(points as number[] | Float32Array, 3));
    if (dashed) g.computeBoundingSphere();
    return g;
  }, [points, dashed]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/**
 * Collider and trigger volumes (30% fill, 1 px edges), the nav-mesh outline, and live ghosts: a translucent capsule
 * per entity with a dashed line back to its authored position (Phase 140 Themes E to G).
 */
/** `heightAt` is the ground's real height when the terrain has one: the nav outline then lies on it. */
export function ExtrasView({ items, extras, ground, heightAt = null }: { items: readonly WorldItem[]; extras: SceneExtras; ground: number; heightAt?: ((x: number, z: number) => number) | null }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [extras, items, invalidate]);
  const colours = overlayColours();
  const colliders = useMemo(() => extraBoxes(items, extras.colliderIds), [items, extras.colliderIds]);
  const triggers = useMemo(() => extraBoxes(items, extras.triggerIds), [items, extras.triggerIds]);
  const spawners = useMemo(() => extraBoxes(items, extras.spawnerIds), [items, extras.spawnerIds]);
  const nav = useSegments(useMemo(() => (heightAt ? drapedRuns(extras.nav.map((poly) => poly.flat()), heightAt, 0.4, 10, true) : navSegments(extras.nav, ground + 0.05)), [extras.nav, ground, heightAt]));
  const links = useSegments(useMemo(() => ghostSegments(items, extras.ghosts), [items, extras.ghosts]));
  const boxes = (list: ReturnType<typeof extraBoxes>, colour: string, opacity = 0.3) =>
    list.map((b) => (
      <mesh key={b.key} position={b.position} rotation={[0, b.yaw, 0]} scale={b.size}>
        <boxGeometry />
        <meshBasicMaterial color={colour} transparent opacity={opacity} depthWrite={false} />
        <Edges color={colour} />
      </mesh>
    ));
  return (
    <>
      {boxes(colliders, colours.collider)}
      {boxes(triggers, colours.trigger)}
      {/* Spawn zones are often kilometres wide: a tint, so the ground under them stays readable. */}
      {boxes(spawners, colours.spawner, 0.06)}
      {extras.nav.length > 0 ? (
        <lineSegments geometry={nav}>
          <lineBasicMaterial color={colours.nav} />
        </lineSegments>
      ) : null}
      {extras.ghosts.map((g) => (
        <mesh key={g.key} position={[g.x, g.y + 0.9, g.z]}>
          <capsuleGeometry args={[0.3, 1.2, 4, 8]} />
          <meshBasicMaterial color={colours.ghost} transparent opacity={g.alive ? 0.45 : 0.15} depthWrite={false} />
        </mesh>
      ))}
      <lineSegments geometry={links}>
        <lineBasicMaterial color={colours.ghost} transparent opacity={0.7} />
      </lineSegments>
    </>
  );
}
