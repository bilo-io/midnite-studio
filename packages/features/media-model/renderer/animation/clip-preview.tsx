import { useEffect, useRef, useState } from 'react';
import {
  AmbientLight,
  AnimationMixer,
  Bone,
  Box3,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  LoopOnce,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SkeletonHelper,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { framingFor } from '../model-utils';
import type { DecodedClip } from './clip-decode';
import { retargetClip } from './retarget-clip';
import type { SkeletonSpec } from './skeleton-spec';

/**
 * The 3D pane of the timeline player (Phase 125 Theme D). Loaded lazily — it pulls in three.js — and drawn on
 * demand: a frame is rendered when the playhead moves or the pane resizes, so an idle player costs no CPU.
 *
 * A target is either the clip's own skeleton (what came in the file) or a skeleton built from a preview model;
 * the clip is retargeted onto the latter by bone name. A target that matches none of the clip's bones falls back
 * to the clip's own skeleton when it has one, and says so.
 */
export type PreviewTarget = { kind: 'own' } | { kind: 'skeleton'; label: string; skeleton: SkeletonSpec };

export type PreviewReport = {
  mode: 'own' | 'retarget' | 'none';
  /** Clip bones driven on the target. */
  matched: number;
  /** Bones the clip animates that the target lacks. */
  unmatched: string[];
  /** The chosen model matched nothing and the clip's own skeleton was shown instead. */
  fellBack: boolean;
};

type Props = { decoded: DecodedClip; target: PreviewTarget; time: number; onReport?: (report: PreviewReport) => void };

const FOV = 40;

function disposeObject(root: Object3D): void {
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    (mesh.geometry as BufferGeometry).dispose();
    for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) material?.dispose();
  });
}

/** Bone objects (and a marker per bone) for a skeleton spec; returns the group holding its roots. */
function buildSkeleton(spec: SkeletonSpec): Group {
  const group = new Group();
  const bones = spec.bones.map((b) => {
    const bone = new Bone();
    bone.name = b.name;
    bone.position.set(...b.position);
    return bone;
  });
  const marker = new SphereGeometry(0.025, 10, 8);
  const material = new MeshStandardMaterial({ color: '#7aa2ff', roughness: 0.5 });
  spec.bones.forEach((b, i) => {
    const bone = bones[i]!;
    bone.add(new Mesh(marker, material));
    const parent = b.parent === null ? null : bones[b.parent];
    (parent ?? group).add(bone);
  });
  return group;
}

export default function ClipPreview({ decoded, target, time, onReport }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const timeRef = useRef(time);
  timeRef.current = time;
  const apply = useRef<((t: number) => void) | null>(null);
  const report = useRef(onReport);
  report.current = onReport;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError('3D preview needs WebGL, which is unavailable here.');
      return;
    }
    setError(null);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.setAttribute('data-testid', 'clip-canvas');

    const scene = new Scene();
    scene.add(new HemisphereLight(0xffffff, 0x666677, 1.6));
    scene.add(new AmbientLight(0xffffff, 0.35));
    const sun = new DirectionalLight(0xffffff, 1.7);
    sun.position.set(4, 8, 5);
    scene.add(sun);
    const camera = new PerspectiveCamera(FOV, 1, 0.01, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;

    let disposed = false;
    const render = () => {
      if (!disposed) renderer.render(scene, camera);
    };
    controls.addEventListener('change', render);

    // Pick what to play on. A model that matches nothing falls back to the clip's own skeleton.
    let playClip = decoded.clip;
    let mixerRoot: Object3D;
    let shown: Object3D;
    let helperOf: Object3D;
    let mode: PreviewReport['mode'] = 'own';
    let matched = 0;
    let unmatched: string[] = [];
    let fellBack = false;

    const showOwn = (): boolean => {
      if (!decoded.root) return false;
      if (decoded.bvh && decoded.skeleton) {
        const helper = new SkeletonHelper(decoded.root);
        (helper as unknown as { skeleton: unknown }).skeleton = decoded.skeleton;
        mixerRoot = helper;
        shown = decoded.root;
        scene.add(helper);
      } else {
        mixerRoot = decoded.root;
        shown = decoded.root;
        helperOf = new SkeletonHelper(decoded.root);
        scene.add(helperOf);
      }
      scene.add(shown);
      playClip = decoded.clip;
      mode = 'own';
      return true;
    };

    if (target.kind === 'skeleton') {
      const result = retargetClip(decoded.clip, target.skeleton);
      matched = result.matched;
      unmatched = result.unmatched;
      if (result.matched === 0 && showOwn()) {
        fellBack = true;
      } else {
        const group = buildSkeleton(target.skeleton);
        mixerRoot = group;
        shown = group;
        scene.add(group, new SkeletonHelper(group));
        playClip = result.clip;
        mode = 'retarget';
      }
    } else if (!showOwn()) {
      mode = 'none';
      mixerRoot = new Group();
      shown = mixerRoot;
    }

    const mixer = new AnimationMixer(mixerRoot!);
    const action = mixer.clipAction(playClip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();

    const frame = () => {
      shown.updateMatrixWorld(true);
      const box = new Box3();
      const at = new Vector3();
      shown.traverse((child) => {
        if ((child as Bone).isBone) box.expandByPoint(child.getWorldPosition(at));
      });
      if (box.isEmpty()) box.setFromObject(shown);
      if (box.isEmpty()) return;
      const size = box.getSize(new Vector3());
      const center = box.getCenter(new Vector3());
      const framing = framingFor({ size: [size.x, size.y, size.z], center: [center.x, center.y, center.z], fovDeg: FOV, aspect: camera.aspect });
      camera.near = framing.near;
      camera.far = framing.far;
      camera.position.set(...framing.position);
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
      const grid = new GridHelper(Math.max(size.x, size.z, 0.5) * 3, 20, 0x888888, 0x444444);
      grid.position.y = box.min.y;
      scene.add(grid);
    };

    const resize = () => {
      const { clientWidth: width, clientHeight: height } = container;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = `${width}px`;
      renderer.domElement.style.height = `${height}px`;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    apply.current = (t) => {
      mixer.setTime(t);
      render();
    };
    mixer.setTime(0);
    resize();
    frame();
    apply.current(timeRef.current);
    report.current?.({ mode, matched, unmatched, fellBack });

    return () => {
      disposed = true;
      apply.current = null;
      observer.disconnect();
      controls.removeEventListener('change', render);
      controls.dispose();
      mixer.stopAllAction();
      if (target.kind === 'own' || fellBack) disposeObject(decoded.root ?? new Group());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [decoded, target]);

  useEffect(() => {
    apply.current?.(time);
  }, [time]);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-gradient-to-b from-muted/40 to-background">
      <div ref={host} className="absolute inset-0" data-testid="clip-viewer" />
      {error ? <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted-foreground">{error}</p> : null}
    </div>
  );
}
