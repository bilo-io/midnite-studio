import { Line } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { MeshPart, PartSkin, Pose } from '@midnite/studio-shared';
import { useEffect, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute } from 'three';

import { boneSegments, weightColors, type RigModel } from './rig-pose';
import type { RigView, UpdateRigView } from './rig-view';
import type { EditorScene } from './spec-geometry';

/**
 * Inside the canvas: the skeleton drawn over the model (always on top, so bones inside a body are
 * visible), each joint pickable, and — in the weight view — the picked bone's skin weights painted
 * over the posed meshes on Blender's blue → red ramp.
 */
export function RigOverlay({ model, scene, pose, view, onView }: { model: RigModel; scene: EditorScene; pose: Pose; view: RigView; onView: UpdateRigView }) {
  const invalidate = useThree((s) => s.invalidate);
  const segments = useMemo(() => boneSegments(model.rig, pose), [model, pose]);
  useEffect(() => invalidate(), [segments, view.bone, view.bones, view.weights, scene, invalidate]);
  const picked = view.bone === null ? -1 : (model.rig.byName.get(view.bone) ?? -1);
  const size = Math.max(0.008, Math.min(0.04, segments.reduce((s, b) => s + Math.hypot(b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]), 0) / Math.max(1, segments.length) / 6));

  return (
    <>
      {view.weights && picked >= 0
        ? model.solids.map((at, k) => <WeightMesh key={at} part={scene.parts[at]!} skin={model.skins[k]!} bone={picked} />)
        : null}
      {view.bones
        ? segments.map((bone, i) => {
            const on = i === picked;
            const colour = on ? '#ffb224' : '#4fd1c5';
            return (
              <group key={bone.name}>
                <Line points={[bone.head, bone.tail]} color={colour} lineWidth={on ? 3 : 2} depthTest={false} renderOrder={10} />
                <mesh
                  position={bone.head}
                  renderOrder={11}
                  userData={{ bone: bone.name }}
                  onClick={(event: ThreeEvent<MouseEvent>) => {
                    event.stopPropagation();
                    onView({ bone: on ? null : bone.name });
                  }}
                >
                  <sphereGeometry args={[on ? size * 1.5 : size, 12, 8]} />
                  <meshBasicMaterial color={colour} depthTest={false} transparent opacity={0.95} />
                </mesh>
              </group>
            );
          })
        : null}
    </>
  );
}

function WeightMesh({ part, skin, bone }: { part: MeshPart; skin: PartSkin; bone: number }) {
  const colors = useMemo(() => weightColors(skin, bone), [skin, bone]);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(part.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(part.normals, 3));
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.setIndex(part.indices);
    g.computeBoundingSphere();
    return g;
  }, [part, colors]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} raycast={() => null} renderOrder={5}>
      {/* Drawn just in front of the part it covers, so the paint wins the depth test without z-fighting. */}
      <meshBasicMaterial vertexColors polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  );
}
