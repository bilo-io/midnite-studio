import { useThree } from '@react-three/fiber';
import type { Mat4 } from '@midnite/studio-shared';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { DoubleSide, Matrix4, Quaternion, Raycaster, Vector2, Vector3, type OrthographicCamera, type PerspectiveCamera } from 'three';

import { lazyFollow, pointerPressure, type Point2 } from './lazy';
import { clayMatcap } from './matcap';
import { uniformScale, worldPerPixel, type SculptController, type SculptSnapshot } from './sculpt-controller';
import type { Vec3 } from './sculpt-protocol';

/**
 * Sculpt mode in the viewport (Phase 104 Theme D): the worker's mesh drawn at the part's transform, the
 * brush cursor, and the pointer → stroke plumbing. Left-drag sculpts (Ctrl/Cmd inverts the brush, Shift
 * smooths); orbit moves to the right button and pan to the middle one while sculpt mode is on.
 *
 * Pointer events are read off the canvas element itself rather than through R3F's per-object events:
 * the stroke needs pointer capture and pressure, and the BVH raycast runs in the worker, so three never
 * has to raycast a million triangles on the render thread.
 */
export type SculptLayerProps = {
  controller: SculptController;
  snapshot: SculptSnapshot;
  /** The part's world matrix, row-major. */
  toWorld: Mat4;
  color: string;
  roughness: number;
  metalness: number;
  wireframe: boolean;
  xray: boolean;
};

const fromRowMajor = (a: readonly number[]): Matrix4 => new Matrix4().set(...(a as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]));

export function SculptLayer({ controller, snapshot, toWorld, color, roughness, metalness, wireframe, xray }: SculptLayerProps) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const world = useMemo(() => fromRowMajor(toWorld), [toWorld]);
  const local = useMemo(() => world.clone().invert(), [world]);
  const scale = useMemo(() => uniformScale(toWorld), [toWorld]);

  useEffect(() => invalidate(), [snapshot.editEpoch, snapshot.geometryEpoch, snapshot.hover, snapshot.settings, invalidate]);

  // The radius in mesh units: pixels at the surface's distance, or the world radius, over the part's scale.
  const latest = useRef({ snapshot, camera, size, world, local, scale, toWorld });
  useLayoutEffect(() => {
    latest.current = { snapshot, camera, size, world, local, scale, toWorld };
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
    let stroking = false;
    let hovering = false;

    const rayAt = (x: number, y: number): { origin: Vec3; dir: Vec3 } => {
      const rect = el.getBoundingClientRect();
      const ndc = new Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, latest.current.camera);
      const origin = raycaster.ray.origin.clone().applyMatrix4(latest.current.local);
      const dir = raycaster.ray.direction.clone().transformDirection(latest.current.local);
      return { origin: origin.toArray() as Vec3, dir: dir.toArray() as Vec3 };
    };
    const hoverPoint = (): Vector3 | null => {
      const h = latest.current.snapshot.hover;
      return h ? new Vector3(...h.point).applyMatrix4(latest.current.world) : null;
    };

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (latest.current.snapshot.adjust) {
        controller.endAdjust();
        event.preventDefault();
        return;
      }
      if (latest.current.snapshot.status !== 'ready' || latest.current.snapshot.busy) return;
      event.preventDefault();
      el.setPointerCapture?.(event.pointerId);
      stroking = true;
      brush = [event.clientX, event.clientY];
      controller.beginStroke(
        { ...rayAt(event.clientX, event.clientY), pressure: pointerPressure(event) },
        { radius: meshRadius(hoverPoint()), invert: event.ctrlKey || event.metaKey, smooth: event.shiftKey, toWorld: latest.current.toWorld },
      );
    };
    const move = (event: PointerEvent) => {
      controller.pointerX = event.clientX;
      if (latest.current.snapshot.adjust) {
        controller.updateAdjust(event.clientX);
        return;
      }
      if (stroking && brush) {
        const s = latest.current.snapshot.settings;
        brush = lazyFollow(brush, [event.clientX, event.clientY], s.lazy * s.screenRadius);
        controller.moveStroke({ ...rayAt(brush[0], brush[1]), pressure: pointerPressure(event) });
        return;
      }
      if (hovering) return;
      hovering = true;
      void controller.hover(rayAt(event.clientX, event.clientY)).finally(() => {
        hovering = false;
      });
    };
    const up = (event: PointerEvent) => {
      if (!stroking) return;
      stroking = false;
      brush = null;
      el.releasePointerCapture?.(event.pointerId);
      void controller.endStroke();
    };
    const leave = () => {
      if (!stroking) void controller.hover(null);
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
    const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
    const at = new Vector3(...hover.point).addScaledVector(normal, 1e-4);
    return { quaternion, at };
  }, [hover]);
  const radius = hover ? meshRadius(new Vector3(...hover.point).applyMatrix4(world)) : 0;

  if (!snapshot.geometry) return null;
  return (
    <group matrixAutoUpdate={false} matrix={world} matrixWorldNeedsUpdate>
      <mesh geometry={snapshot.geometry} userData={{ sculpt: snapshot.partId }}>
        {snapshot.settings.matcap ? (
          <meshMatcapMaterial matcap={clayMatcap()} vertexColors wireframe={wireframe} transparent={xray} opacity={xray ? 0.35 : 1} depthWrite={!xray} />
        ) : (
          <meshStandardMaterial
            vertexColors
            color={color}
            roughness={roughness}
            metalness={metalness}
            wireframe={wireframe}
            transparent={xray}
            opacity={xray ? 0.35 : 1}
            depthWrite={!xray}
          />
        )}
      </mesh>
      {ring && radius > 0 ? (
        <mesh position={ring.at} quaternion={ring.quaternion} renderOrder={10}>
          <ringGeometry args={[radius * 0.94, radius, 64]} />
          <meshBasicMaterial color={snapshot.settings.brush === 'mask' ? '#f5a524' : '#ffffff'} side={DoubleSide} depthTest={false} transparent opacity={0.9} />
        </mesh>
      ) : null}
    </group>
  );
}
