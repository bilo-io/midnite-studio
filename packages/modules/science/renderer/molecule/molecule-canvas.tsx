import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { elementInfo } from './elements';
import type { Atom, Bond } from './parse';

const BOND_COLOR = '#9ca3af';
const BOND_RADIUS = 0.12;
const SPHERE_SCALE = 0.3;
const COARSE_ABOVE = 5000;

/** Centre and radius of the bounding sphere, so the camera can frame the structure. */
export function frame(atoms: readonly Atom[]): { center: [number, number, number]; radius: number } {
  if (atoms.length === 0) return { center: [0, 0, 0], radius: 1 };
  const c: [number, number, number] = [0, 0, 0];
  for (const a of atoms) {
    c[0] += a.x;
    c[1] += a.y;
    c[2] += a.z;
  }
  c[0] /= atoms.length;
  c[1] /= atoms.length;
  c[2] /= atoms.length;
  let r = 0;
  for (const a of atoms) r = Math.max(r, Math.hypot(a.x - c[0], a.y - c[1], a.z - c[2]));
  return { center: c, radius: Math.max(r, 1) };
}

function Atoms({ atoms }: { atoms: readonly Atom[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const segments = atoms.length > COARSE_ABOVE ? 8 : 16;
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    atoms.forEach((a, i) => {
      const info = elementInfo(a.el);
      const s = SPHERE_SCALE * info.covalent;
      m.compose(new THREE.Vector3(a.x, a.y, a.z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.set(info.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [atoms]);
  return (
    <instancedMesh key={`${atoms.length}-${segments}`} ref={ref} args={[undefined, undefined, atoms.length]}>
      <sphereGeometry args={[1, segments, segments]} />
      <meshStandardMaterial />
    </instancedMesh>
  );
}

function Bonds({ atoms, bonds }: { atoms: readonly Atom[]; bonds: readonly Bond[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    bonds.forEach((b, i) => {
      const a = atoms[b.a]!;
      const c = atoms[b.b]!;
      const from = new THREE.Vector3(a.x, a.y, a.z);
      const to = new THREE.Vector3(c.x, c.y, c.z);
      const dir = to.clone().sub(from);
      const len = dir.length();
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
      m.compose(from.add(to).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [atoms, bonds]);
  return (
    <instancedMesh key={bonds.length} ref={ref} args={[undefined, undefined, bonds.length]}>
      <cylinderGeometry args={[BOND_RADIUS, BOND_RADIUS, 1, 8]} />
      <meshStandardMaterial color={BOND_COLOR} />
    </instancedMesh>
  );
}

/** The 3D view (Phase 126 Theme F.3): instanced spheres and bonds under orbit controls, camera framed on the bounding sphere. */
export default function MoleculeCanvas({ atoms, bonds, resetKey }: { atoms: readonly Atom[]; bonds: readonly Bond[]; resetKey: number }) {
  const { center, radius } = useMemo(() => frame(atoms), [atoms]);
  const position = useMemo<[number, number, number]>(() => [center[0], center[1], center[2] + radius * 3], [center, radius]);
  return (
    <Canvas key={resetKey} style={{ height: 360, width: '100%' }} camera={{ position, fov: 45, near: 0.1, far: radius * 50 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[radius * 2, radius * 3, radius * 4]} intensity={1.2} />
      <Atoms atoms={atoms} />
      <Bonds atoms={atoms} bonds={bonds} />
      <OrbitControls target={center} makeDefault />
    </Canvas>
  );
}
