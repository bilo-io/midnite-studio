import { useEffect, useRef, useState } from 'react';
import { LuGrid3X3, LuRotateCcw, LuSquareDashed } from 'react-icons/lu';
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

import { IconButton } from '../../../components/icon-button';
import { framingFor } from './model-utils';

/**
 * The interactive 3D viewer (Media ▸ Models). Loaded lazily — three.js is
 * ~700 KB and only this tab needs it — and renders **on demand**: a frame is
 * drawn when the orbit controls move, the pane resizes or a toggle flips, so
 * an idle viewer costs no CPU. `.obj` loads through `OBJLoader` (+ `MTLLoader`
 * for the sibling `.mtl`), `.fbx` through `FBXLoader`.
 */
export type ModelViewerStats = { meshes: number; triangles: number; size: [number, number, number] };

type Props = {
  url: string;
  format: 'obj' | 'fbx';
  /** The `.mtl` beside an `.obj`; a missing file just means grey. */
  mtlUrl?: string | null;
  onStats?: (stats: ModelViewerStats | null) => void;
};

const FOV = 40;

function disposeObject(root: Object3D): void {
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    (mesh.geometry as BufferGeometry).dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials as Material[]) material.dispose();
  });
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read the model (${response.status}).`);
  return response.arrayBuffer();
}

async function loadModel(url: string, format: 'obj' | 'fbx', mtlUrl: string | null | undefined): Promise<Object3D> {
  if (format === 'fbx') return new FBXLoader().parse(await fetchBuffer(url), '');
  const loader = new OBJLoader();
  if (mtlUrl) {
    try {
      const mtl = new TextDecoder().decode(await fetchBuffer(mtlUrl));
      const creator = new MTLLoader().parse(mtl, '');
      creator.preload();
      loader.setMaterials(creator);
    } catch {
      // No materials file: the OBJ falls back to the default grey below.
    }
  }
  return loader.parse(new TextDecoder().decode(await fetchBuffer(url)));
}

export default function ModelViewer({ url, format, mtlUrl, onStats }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ reset: () => void; setWireframe: (on: boolean) => void; setGrid: (on: boolean) => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [grid, setGrid] = useState(true);
  const wireframeRef = useRef(wireframe);
  const gridRef = useRef(grid);
  wireframeRef.current = wireframe;
  gridRef.current = grid;

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError('3D preview needs WebGL, which is unavailable here.');
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.setAttribute('data-testid', 'model-canvas');

    const scene = new Scene();
    scene.add(new HemisphereLight(0xffffff, 0x666677, 1.6));
    scene.add(new AmbientLight(0xffffff, 0.35));
    const sun = new DirectionalLight(0xffffff, 1.7);
    sun.position.set(4, 8, 5);
    scene.add(sun);
    const camera = new PerspectiveCamera(FOV, 1, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;

    let gridHelper: GridHelper | null = null;
    let model: Object3D | null = null;
    let disposed = false;

    const render = () => {
      if (!disposed) renderer.render(scene, camera);
    };
    controls.addEventListener('change', render);

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

    const frame = () => {
      if (!model) return;
      const box = new Box3().setFromObject(model);
      const size = box.getSize(new Vector3());
      const center = box.getCenter(new Vector3());
      const framing = framingFor({
        size: [size.x, size.y, size.z],
        center: [center.x, center.y, center.z],
        fovDeg: FOV,
        aspect: camera.aspect,
      });
      camera.near = framing.near;
      camera.far = framing.far;
      camera.position.set(...framing.position);
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
      render();
    };

    const applyWireframe = (on: boolean) => {
      model?.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as (Material & { wireframe?: boolean })[]) {
          material.wireframe = on;
        }
      });
      render();
    };

    api.current = {
      reset: frame,
      setWireframe: applyWireframe,
      setGrid: (on) => {
        if (gridHelper) gridHelper.visible = on;
        render();
      },
    };

    loadModel(url, format, mtlUrl)
      .then((loaded) => {
        if (disposed) {
          disposeObject(loaded);
          return;
        }
        let meshes = 0;
        let triangles = 0;
        loaded.traverse((child) => {
          const mesh = child as Mesh;
          if (!mesh.isMesh) return;
          meshes += 1;
          const geometry = mesh.geometry as BufferGeometry;
          triangles += (geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0) / 3;
          // A hand-added OBJ with no materials gets a neutral one; imports are shown from both sides.
          const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean) as Material[];
          if (materials.length === 0) mesh.material = new MeshStandardMaterial({ color: new Color('#b0b0b0'), roughness: 0.7 });
          for (const material of materials) material.side = DoubleSide;
        });
        model = loaded;
        scene.add(loaded);
        const box = new Box3().setFromObject(loaded);
        const size = box.getSize(new Vector3());
        gridHelper = new GridHelper(Math.max(size.x, size.z, 1) * 2.5, 20, 0x888888, 0x444444);
        gridHelper.position.y = box.min.y;
        gridHelper.visible = gridRef.current;
        scene.add(gridHelper);
        applyWireframe(wireframeRef.current);
        resize();
        frame();
        setLoading(false);
        onStats?.({ meshes, triangles: Math.round(triangles), size: [size.x, size.y, size.z] });
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        setError(cause instanceof Error ? cause.message : 'Could not load the model.');
        setLoading(false);
        onStats?.(null);
      });

    return () => {
      disposed = true;
      api.current = null;
      observer.disconnect();
      controls.removeEventListener('change', render);
      controls.dispose();
      if (model) disposeObject(model);
      gridHelper?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
    // `onStats` is a stable setter from the parent; the model reloads only when its file does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, format, mtlUrl]);

  const toggleWireframe = () => {
    const next = !wireframe;
    setWireframe(next);
    api.current?.setWireframe(next);
  };
  const toggleGrid = () => {
    const next = !grid;
    setGrid(next);
    api.current?.setGrid(next);
  };

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-gradient-to-b from-muted/40 to-background">
      <div ref={host} className="absolute inset-0" data-testid="model-viewer" />
      <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-border/60 bg-card/80 p-0.5 backdrop-blur">
        <IconButton icon={LuRotateCcw} label="Reset view" size="sm" onClick={() => api.current?.reset()} />
        <IconButton icon={LuSquareDashed} label={wireframe ? 'Show solid' : 'Show wireframe'} size="sm" onClick={toggleWireframe} />
        <IconButton icon={LuGrid3X3} label={grid ? 'Hide grid' : 'Show grid'} size="sm" onClick={toggleGrid} />
      </div>
      {loading && !error ? (
        <p role="status" className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-muted-foreground">
          Loading model…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
