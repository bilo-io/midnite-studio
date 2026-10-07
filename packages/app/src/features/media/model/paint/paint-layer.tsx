import { useThree } from '@react-three/fiber';
import type { Mat4, ModelSpec } from '@midnite/studio-shared';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { DoubleSide, Matrix4, Quaternion, Raycaster, Vector2, Vector3, type OrthographicCamera, type PerspectiveCamera } from 'three';

import { pointerPressure, type Point2 } from '../sculpt/lazy';
import { uniformScale, worldPerPixel } from '../sculpt/sculpt-controller';
import type { PaintController, PaintSnapshot } from './paint-controller';

/**
 * Paint mode in the viewport (Phase 104 Theme G): the part drawn with its live flattened PBR textures, the brush
 * ring, and pointer → stroke plumbing. Left-drag paints, Alt-click sets the clone source; orbit is on the right
 * button and pan on the middle one, as in sculpt mode. Raycasts run against the paint kernel's BVH, in mesh
 * space, so three never raycasts the part.
 */
export type PaintLayerProps = {
  controller: PaintController;
  snapshot: PaintSnapshot;
  spec: ModelSpec;
  toWorld: Mat4;
  xray: boolean;
  wireframe: boolean;
};

const fromRowMajor = (a: readonly number[]): Matrix4 => new Matrix4().set(...(a as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]));
type V3 = [number, number, number];

export function PaintLayer({ controller, snapshot, spec, toWorld, xray, wireframe }: PaintLayerProps) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const world = useMemo(() => fromRowMajor(toWorld), [toWorld]);
  const local = useMemo(() => world.clone().invert(), [world]);
  const scale = useMemo(() => uniformScale(toWorld), [toWorld]);

  useEffect(() => invalidate(), [snapshot.epoch, snapshot.hover, snapshot.settings, snapshot.textures, invalidate]);

  const latest = useRef({ snapshot, camera, size, world, local, scale, spec });
  useLayoutEffect(() => {
    latest.current = { snapshot, camera, size, world, local, scale, spec };
  });
  const meshRadius = (at: Vector3 | null): number => {
    const { snapshot: snap, camera: cam, size: sz, world: w, scale: sc } = latest.current;
    const s = snap.settings;
    if (s.radiusUnit === 'world') return s.worldRadius / sc;
    const point = at ?? new Vector3().setFromMatrixPosition(w);
    const ortho = (cam as OrthographicCamera).isOrthographicCamera === true;
    const perPixel = worldPerPixel({ ortho, zoom: cam.zoom, fovDeg: (cam as PerspectiveCamera).fov }, cam.position.distanceTo(point), sz.height);
    return (s.screenRadius * perPixel) / sc;
  };

  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new Raycaster();
    let brush: Point2 | null = null;
    let painting = false;

    const rayAt = (x: number, y: number): { origin: V3; dir: V3 } => {
      const rect = el.getBoundingClientRect();
      const ndc = new Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, latest.current.camera);
      const origin = raycaster.ray.origin.clone().applyMatrix4(latest.current.local);
      const dir = raycaster.ray.direction.clone().transformDirection(latest.current.local);
      return { origin: origin.toArray() as V3, dir: dir.toArray() as V3 };
    };

    const down = (event: PointerEvent) => {
      if (event.button !== 0 || latest.current.snapshot.status !== 'ready' || latest.current.snapshot.busy) return;
      event.preventDefault();
      if (event.altKey) {
        controller.setCloneSource(rayAt(event.clientX, event.clientY));
        return;
      }
      const ray = rayAt(event.clientX, event.clientY);
      const hit = controller.pick(ray);
      const radius = meshRadius(hit ? new Vector3(...hit.point).applyMatrix4(latest.current.world) : null);
      if (!controller.beginStroke(latest.current.spec, { ...ray, pressure: pointerPressure(event) }, { radius })) return;
      el.setPointerCapture?.(event.pointerId);
      painting = true;
      brush = [event.clientX, event.clientY];
    };
    const move = (event: PointerEvent) => {
      controller.pointerX = event.clientX;
      if (painting && brush) {
        brush = [event.clientX, event.clientY];
        controller.moveStroke({ ...rayAt(brush[0], brush[1]), pressure: pointerPressure(event) });
        return;
      }
      controller.hover(rayAt(event.clientX, event.clientY));
    };
    const up = (event: PointerEvent) => {
      if (!painting) return;
      painting = false;
      brush = null;
      el.releasePointerCapture?.(event.pointerId);
      controller.endStroke();
    };
    const leave = () => {
      if (!painting) controller.hover(null);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', leave);
    };
  }, [gl, controller]);

  const hover = snapshot.hover;
  const ring = useMemo(() => {
    if (!hover) return null;
    const normal = new Vector3(...hover.normal).normalize();
    return { quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal), at: new Vector3(...hover.point).addScaledVector(normal, 1e-4) };
  }, [hover]);
  const radius = hover ? meshRadius(new Vector3(...hover.point).applyMatrix4(world)) : 0;
  const clone = snapshot.cloneSource;

  const textures = snapshot.textures;
  if (!snapshot.geometry || !textures) return null;
  return (
    <group matrixAutoUpdate={false} matrix={world} matrixWorldNeedsUpdate>
      <mesh geometry={snapshot.geometry} userData={{ paint: snapshot.partId }}>
        <meshStandardMaterial
          key={`${snapshot.uses.normal}-${snapshot.uses.emissive}`}
          map={textures.baseColor}
          roughnessMap={textures.orm}
          metalnessMap={textures.orm}
          aoMap={textures.orm}
          roughness={1}
          metalness={1}
          {...(snapshot.uses.normal ? { normalMap: textures.normal } : {})}
          {...(snapshot.uses.emissive ? { emissiveMap: textures.emissive, emissive: '#ffffff' } : {})}
          wireframe={wireframe}
          transparent={xray}
          opacity={xray ? 0.35 : 1}
          depthWrite={!xray}
        />
      </mesh>
      {ring && radius > 0 ? (
        <mesh position={ring.at} quaternion={ring.quaternion} renderOrder={10}>
          <ringGeometry args={[radius * 0.94, radius, 64]} />
          <meshBasicMaterial color={snapshot.settings.brush === 'eraser' ? '#f5a524' : snapshot.settings.color} side={DoubleSide} depthTest={false} transparent opacity={0.9} />
        </mesh>
      ) : null}
      {clone && snapshot.settings.brush === 'clone' ? (
        <mesh position={clone} renderOrder={11}>
          <sphereGeometry args={[Math.max(radius * 0.15, 1e-3), 12, 8]} />
          <meshBasicMaterial color="#4f9dff" depthTest={false} />
        </mesh>
      ) : null}
    </group>
  );
}
