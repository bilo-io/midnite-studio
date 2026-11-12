import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, type Mesh } from 'three';

import type { Body } from '../sims/nbody';
import { TRAIL_LENGTH, type Trails } from '../sims/trails';

/** What the view's frame callback fills and the scene reads each render frame. */
export type NBodyStore = { positions: Float32Array; trails: Trails };
/** The store sits in a ref because a params change replaces it. */
export type StoreRef = { current: NBodyStore };
export type CameraTarget = { x: number; y: number; z: number };

function BodyMesh({ body, index, store, scale }: { body: Body; index: number; store: StoreRef; scale: number }) {
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    const p = store.current.positions;
    if (m === null || p.length < 3 * index + 3) return;
    m.position.set(p[3 * index]!, p[3 * index + 1]!, p[3 * index + 2]!);
  });
  return (
    <mesh ref={ref} scale={Math.max(body.radius * scale, 1e-4)}>
      <sphereGeometry args={[1, 24, 16]} />
      <meshStandardMaterial color={body.color} emissive={body.color} emissiveIntensity={0.35} />
    </mesh>
  );
}

function TrailLine({ body, index, store }: { body: Body; index: number; store: StoreRef }) {
  const line = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(TRAIL_LENGTH * 3), 3));
    return new Line(g, new LineBasicMaterial({ color: body.color, transparent: true, opacity: 0.7 }));
  }, [body.color]);
  useFrame(() => {
    const attr = line.geometry.getAttribute('position') as BufferAttribute;
    const t = store.current.trails;
    const n = t.count > index ? t.write(index, attr.array as Float32Array) : 0;
    attr.needsUpdate = true;
    line.geometry.setDrawRange(0, n);
  });
  return <primitive object={line} />;
}

/** The 3D scene (Phase 127 Theme D.3): z-up, orbit controls, a sphere and an optional trail per body. */
export function NBodyScene(p: { bodies: Body[]; store: StoreRef; bodyScale: number; trails: boolean; distance: number; target: CameraTarget }) {
  return (
    <Canvas camera={{ position: [0, -p.distance, p.distance * 0.6], up: [0, 0, 1], fov: 50, near: p.distance / 1e4, far: p.distance * 1e3 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[1, -1, 2]} intensity={1.2} />
      <OrbitControls
        makeDefault
        onChange={(e) => {
          const t = (e?.target as { target: CameraTarget } | undefined)?.target;
          if (t) Object.assign(p.target, { x: t.x, y: t.y, z: t.z });
        }}
      />
      {p.bodies.map((b, i) => (
        <BodyMesh key={`${i}-${b.name}`} body={b} index={i} store={p.store} scale={p.bodyScale} />
      ))}
      {p.trails && p.bodies.map((b, i) => <TrailLine key={`t${i}-${b.name}`} body={b} index={i} store={p.store} />)}
    </Canvas>
  );
}
