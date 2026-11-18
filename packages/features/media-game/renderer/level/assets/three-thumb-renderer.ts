/**
 * The real {@link ThumbRenderer} (Phase 139 Theme B): one lazily created `WebGLRenderer`, 128 x 128, transparent,
 * `preserveDrawingBuffer` so `toDataURL` reads what was drawn. Each model is framed by its bounding sphere from a
 * 3/4 camera (yaw 35 deg, pitch 25 deg) under a hemisphere light plus a key light. Not covered by vitest (it needs
 * a GL context); the stub-driven `model-thumbs.test.ts` holds the caching and ordering contract.
 */
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { THUMB_SIZE, type ThumbRenderer } from './model-thumbs';

/** Free a model's GPU resources once its thumbnail is read (the thumbnail is the only thing kept). */
function disposeTree(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Mesh;
    mesh.geometry?.dispose();
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as (Material | undefined)[];
    for (const m of materials) m?.dispose();
  });
}

const YAW = (35 * Math.PI) / 180;
const PITCH = (25 * Math.PI) / 180;
const FOV = 35;

export function createThreeThumbRenderer(): ThumbRenderer {
  const canvas = document.createElement('canvas');
  const gl = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  gl.setPixelRatio(1);
  gl.setSize(THUMB_SIZE, THUMB_SIZE, false);
  gl.setClearColor(0x000000, 0);
  const loader = new GLTFLoader();

  return {
    async render(glb) {
      const gltf = await new Promise<{ scene: Object3D }>((resolve, reject) => loader.parse(glb, '', resolve, reject));
      const scene = new Scene();
      scene.add(new HemisphereLight(0xffffff, 0x555566, 1.4));
      scene.add(new AmbientLight(0xffffff, 0.3));
      const key = new DirectionalLight(0xffffff, 2.2);
      key.position.set(3, 5, 4);
      scene.add(key);
      scene.add(gltf.scene);
      const sphere = new Box3().setFromObject(gltf.scene).getBoundingSphere(new Sphere());
      const radius = Math.max(sphere.radius, 0.001);
      const camera = new PerspectiveCamera(FOV, 1, radius * 0.05, radius * 20);
      const distance = (radius / Math.sin((FOV * Math.PI) / 360)) * 1.05;
      const offset = new Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH)).multiplyScalar(distance);
      camera.position.copy(sphere.center).add(offset);
      camera.lookAt(sphere.center);
      try {
        gl.render(scene, camera);
        return canvas.toDataURL('image/png');
      } finally {
        disposeTree(gltf.scene);
      }
    },
    dispose() {
      gl.dispose();
      gl.forceContextLoss();
    },
  };
}
