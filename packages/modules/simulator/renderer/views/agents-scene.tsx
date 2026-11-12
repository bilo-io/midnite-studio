import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, EdgesGeometry, InstancedMesh, Object3D, Quaternion, Vector3 } from 'three';

/** What the view's frame callback fills and the scene reads: `len` floats of `stride`-float agents. */
export type AgentStore = { data: Float32Array; len: number };
export type AgentStoreRef = { current: AgentStore };

const UP = new Vector3(0, 1, 0);

function Agents({ store, stride, max, colors }: { store: AgentStoreRef; stride: number; max: number; colors: [string, string] }) {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const dir = useMemo(() => new Vector3(), []);
  const quat = useMemo(() => new Quaternion(), []);
  const c0 = useMemo(() => new Color(colors[0]), [colors]);
  const c1 = useMemo(() => new Color(colors[1]), [colors]);
  useFrame(() => {
    const m = ref.current;
    if (m === null) return;
    const { data, len } = store.current;
    const n = Math.min(max, Math.floor(len / stride));
    for (let i = 0; i < n; i++) {
      const o = i * stride;
      dummy.position.set(data[o]!, data[o + 1]!, data[o + 2]!);
      dir.set(data[o + 3]!, data[o + 4]!, data[o + 5]!);
      if (dir.lengthSq() > 0) quat.setFromUnitVectors(UP, dir.normalize());
      dummy.quaternion.copy(quat);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      // The 7th float (predator-prey only) is the species; a boid has none and takes the first colour.
      m.setColorAt(i, stride > 6 && data[o + 6] === 1 ? c1 : c0);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, max]} frustumCulled={false}>
      <coneGeometry args={[0.6, 2, 8]} />
      <meshStandardMaterial />
    </instancedMesh>
  );
}

function BoxOutline({ box }: { box: number }) {
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(box, box, box)), [box]);
  useEffect(() => () => edges.dispose(), [edges]);
  return (
    <lineSegments geometry={edges} position={[box / 2, box / 2, box / 2]}>
      <lineBasicMaterial color="#64748b" transparent opacity={0.5} />
    </lineSegments>
  );
}

/** The agents scene (Phase 127 Theme E.4): one instanced cone per agent, oriented by velocity, inside a wire box. */
export function AgentsScene(p: { store: AgentStoreRef; box: number; stride: number; max: number; colors: [string, string] }) {
  const c = p.box / 2;
  return (
    <Canvas camera={{ position: [c + p.box * 1.3, c - p.box * 1.3, c + p.box], up: [0, 0, 1], fov: 50, near: p.box / 1e3, far: p.box * 100 }}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[1, -1, 2]} intensity={1.2} />
      <OrbitControls makeDefault target={[c, c, c]} />
      <BoxOutline box={p.box} />
      <Agents store={p.store} stride={p.stride} max={p.max} colors={p.colors} />
    </Canvas>
  );
}
