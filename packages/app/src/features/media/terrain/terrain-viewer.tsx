import { MEDIA_ROOT_DIR, mstudioFileUrl, TerrainChunksFileSchema, chunkMesh, chunkWorldSize, type Heightfield, type TerrainChunksFile } from '@midnite/studio-shared';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  ShaderMaterial,
  Sphere,
  TextureLoader,
  Vector3,
  type Material,
} from 'three';

import { Spinner } from '../../../components/skeleton';
import { usePageVisible } from '../../../lib/use-page-visible';
import { useWindowFocused } from '../../../lib/use-window-focus';
import { CHUNK_MESH_BUDGET, lodToRender, nextChunksToMesh } from './chunk-stream';
import type { TerrainViewerProps } from './terrain-viewer-lazy';

/**
 * The terrain viewport (Phase 105 Theme D), a lazy chunk. It reads the build's files rather than an
 * IPC payload (`build/heights.f32` and `build/chunks.json` over `mstudio-file://`) and meshes the
 * chunks itself with the shared kernel, at most {@link CHUNK_MESH_BUDGET} per frame, nearest first.
 * The frame loop runs only while the document is visible and the window is focused.
 */
export const HEIGHT_RAMP = ['#1d3557', '#457b9d', '#a8dadc', '#f1faee', '#e9c46a', '#8d6e63', '#ffffff'] as const;
const SLOPE_RAMP_MAX_DEG = 60;
const AZIMUTH = (135 * Math.PI) / 180;

/** Sun elevation in radians for a time of day in hours: `sin(π (t − 6) / 12)`, never below 2°. */
export const sunElevation = (hours: number): number => Math.max((2 * Math.PI) / 180, Math.asin(Math.max(0, Math.sin((Math.PI * (hours - 6)) / 12))));

const canUseWebGL = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

type Loaded = { field: Heightfield; chunks: TerrainChunksFile; version: string };

async function loadBuild(base: string, version: string): Promise<Loaded> {
  const q = `?v=${encodeURIComponent(version)}`;
  const [chunksRes, heightsRes] = await Promise.all([fetch(`${base}/chunks.json${q}`), fetch(`${base}/heights.f32${q}`)]);
  if (!chunksRes.ok || !heightsRes.ok) throw new Error('Could not read the built terrain.');
  const chunks = TerrainChunksFileSchema.parse(await chunksRes.json());
  const buffer = await heightsRes.arrayBuffer();
  const heights = new Float32Array(buffer);
  if (heights.length !== chunks.resolution * chunks.resolution) throw new Error('The built heightfield is incomplete. Generate again.');
  return { field: { resolution: chunks.resolution, worldSize: chunks.worldSize, heights }, chunks, version };
}

function debugMaterial(mode: 'height' | 'slope', heightRange: readonly [number, number]): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uMode: { value: mode === 'height' ? 0 : 1 },
      uMin: { value: heightRange[0] },
      uMax: { value: heightRange[1] },
      uRamp: { value: HEIGHT_RAMP.map((hex) => new Color(hex)) },
      uSlopeMax: { value: Math.cos((SLOPE_RAMP_MAX_DEG * Math.PI) / 180) },
    },
    vertexShader: `varying float vY; varying vec3 vN;
      void main() { vY = position.y; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform int uMode; uniform float uMin; uniform float uMax; uniform vec3 uRamp[7]; uniform float uSlopeMax;
      varying float vY; varying vec3 vN;
      vec3 ramp(float t) {
        float x = clamp(t, 0.0, 1.0) * 6.0; int i = int(min(floor(x), 5.0)); float f = x - float(i);
        vec3 a = uRamp[0]; vec3 b = uRamp[1];
        if (i == 1) { a = uRamp[1]; b = uRamp[2]; } else if (i == 2) { a = uRamp[2]; b = uRamp[3]; }
        else if (i == 3) { a = uRamp[3]; b = uRamp[4]; } else if (i == 4) { a = uRamp[4]; b = uRamp[5]; }
        else if (i == 5) { a = uRamp[5]; b = uRamp[6]; }
        return mix(a, b, f);
      }
      void main() {
        if (uMode == 0) { gl_FragColor = vec4(ramp((vY - uMin) / max(uMax - uMin, 0.0001)), 1.0); return; }
        float s = clamp((1.0 - normalize(vN).y) / (1.0 - uSlopeMax), 0.0, 1.0);
        gl_FragColor = vec4(mix(mix(vec3(0.18, 0.55, 0.25), vec3(0.95, 0.8, 0.2), clamp(s * 2.0, 0.0, 1.0)), vec3(0.85, 0.15, 0.1), clamp(s * 2.0 - 1.0, 0.0, 1.0)), 1.0);
      }`,
    side: DoubleSide,
  });
}

function mapMaterial(url: string): MeshBasicMaterial {
  const map = new TextureLoader().load(url);
  map.magFilter = NearestFilter;
  return new MeshBasicMaterial({ map, side: DoubleSide });
}

/** Meshes a loaded build into a group of chunk meshes, a few per frame. */
class ChunkStreamer {
  readonly group = new Group();
  private readonly cache = new Map<string, BufferGeometry>();
  private readonly meshes = new Map<number, Mesh>();
  private readonly size: number;
  complete = false;

  constructor(
    private readonly loaded: Loaded,
    private material: Material,
  ) {
    this.size = chunkWorldSize(loaded.field);
  }

  setMaterial(material: Material): void {
    this.material = material;
    for (const mesh of this.meshes.values()) mesh.material = material;
  }

  update(camera: Vector3): void {
    const { chunks, field } = this.loaded;
    const cam = { x: camera.x, y: camera.y, z: camera.z };
    const wanted = nextChunksToMesh(cam, chunks.chunks, this.cache, CHUNK_MESH_BUDGET, this.size, chunks.lodCount);
    for (const request of wanted) {
      const info = chunks.chunks.find((c) => c.cx === request.cx && c.cz === request.cz)!;
      const mesh = chunkMesh(field, request.cx, request.cz, request.lod, chunks.heightRange);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
      geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
      geometry.setIndex(new BufferAttribute(mesh.indices, 1));
      geometry.boundingSphere = new Sphere(new Vector3(...info.centre), info.radius);
      this.cache.set(request.key, geometry);
    }
    chunks.chunks.forEach((info, index) => {
      const lod = lodToRender(cam, info, this.cache, this.size, chunks.lodCount);
      if (lod === null) return;
      const geometry = this.cache.get(`${info.cx},${info.cz},${lod}`)!;
      let mesh = this.meshes.get(index);
      if (!mesh) {
        mesh = new Mesh(geometry, this.material);
        this.meshes.set(index, mesh);
        this.group.add(mesh);
      } else if (mesh.geometry !== geometry) {
        mesh.geometry = geometry;
      }
    });
    this.complete = wanted.length === 0 && chunks.chunks.every((info) => lodToRender(cam, info, this.cache, this.size, chunks.lodCount) !== null);
  }

  dispose(): void {
    for (const geometry of this.cache.values()) geometry.dispose();
    this.cache.clear();
    this.meshes.clear();
    this.group.clear();
  }
}

function Terrain({ loaded, material }: { loaded: Loaded; material: Material }) {
  const { camera } = useThree();
  const root = useRef<Group>(null);
  const live = useRef<ChunkStreamer | null>(null);
  const old = useRef<ChunkStreamer | null>(null);
  const materialRef = useRef(material);
  materialRef.current = material;

  // A new build streams into a hidden group; the old one stays on screen until the new is complete, then they swap in one frame.
  useEffect(() => {
    const next = new ChunkStreamer(loaded, materialRef.current);
    if (live.current) {
      old.current?.dispose();
      old.current = live.current;
      next.group.visible = false;
    }
    live.current = next;
    root.current?.add(next.group);
  }, [loaded]);
  useEffect(
    () => () => {
      live.current?.dispose();
      old.current?.dispose();
      live.current = null;
      old.current = null;
    },
    [],
  );
  useEffect(() => {
    live.current?.setMaterial(material);
    old.current?.setMaterial(material);
  }, [material]);

  useFrame(() => {
    const streamer = live.current;
    if (!streamer) return;
    streamer.update(camera.position);
    if (old.current && streamer.complete) {
      streamer.group.visible = true;
      root.current?.remove(old.current.group);
      old.current.dispose();
      old.current = null;
    }
  });
  return <group ref={root} />;
}

/** F toggles fly mode: WASD, Q/E down/up, Shift ×4, drag to look. Keys are read on the viewport element only. */
function FlyControls({ active, element, speed }: { active: boolean; element: HTMLElement | null; speed: number }) {
  const { camera } = useThree();
  const keys = useRef(new Set<string>());
  const look = useRef({ yaw: 0, pitch: 0 });
  useEffect(() => {
    if (!active || !element) return;
    const euler = new Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    look.current = { yaw: euler.y, pitch: euler.x };
    const down = (e: KeyboardEvent) => keys.current.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const move = (e: PointerEvent) => {
      if (e.buttons === 0) return;
      look.current.yaw -= e.movementX * 0.003;
      look.current.pitch = Math.max(-1.5, Math.min(1.5, look.current.pitch - e.movementY * 0.003));
    };
    element.addEventListener('keydown', down);
    element.addEventListener('keyup', up);
    element.addEventListener('pointermove', move);
    return () => {
      element.removeEventListener('keydown', down);
      element.removeEventListener('keyup', up);
      element.removeEventListener('pointermove', move);
      keys.current.clear();
    };
  }, [active, element, camera]);
  useFrame((_, delta) => {
    if (!active) return;
    camera.quaternion.setFromEuler(new Euler(look.current.pitch, look.current.yaw, 0, 'YXZ'));
    const k = keys.current;
    const step = speed * (k.has('shift') ? 4 : 1) * delta;
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    if (k.has('w')) camera.position.addScaledVector(forward, step);
    if (k.has('s')) camera.position.addScaledVector(forward, -step);
    if (k.has('d')) camera.position.addScaledVector(right, step);
    if (k.has('a')) camera.position.addScaledVector(right, -step);
    if (k.has('e')) camera.position.y += step;
    if (k.has('q')) camera.position.y -= step;
  });
  return null;
}

/** p50 frame time over the last 120 frames, reported every 30 frames. */
function FrameSampler({ onFrameMs }: { onFrameMs: (ms: number) => void }) {
  const samples = useRef<number[]>([]);
  const count = useRef(0);
  useFrame((_, delta) => {
    samples.current.push(delta * 1000);
    if (samples.current.length > 120) samples.current.shift();
    count.current += 1;
    if (count.current % 30 === 0) {
      const sorted = [...samples.current].sort((a, b) => a - b);
      onFrameMs(sorted[Math.floor(sorted.length / 2)] ?? 0);
    }
  });
  return null;
}

export default function TerrainViewer({ repoId, project, terrain, spec, built, shading, timeOfDay, onFrameMs }: TerrainViewerProps) {
  const visible = usePageVisible();
  const focused = useWindowFocused();
  const webgl = useMemo(canUseWebGL, []);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fly, setFly] = useState(false);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const version = spec.lastBuild?.at ?? '0';
  const base = mstudioFileUrl('repo', repoId, `${MEDIA_ROOT_DIR}/terrain/${project}/${terrain}/build`);

  // Keep showing the current build while the next loads; the swap happens once it has arrived.
  useEffect(() => {
    if (!built) return;
    let cancelled = false;
    setError(null);
    loadBuild(base, version).then(
      (next) => !cancelled && setLoaded(next),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not read the built terrain.'),
    );
    return () => {
      cancelled = true;
    };
  }, [base, version, built]);

  const mapUrl = shading === 'landcover' ? 'landcover.png' : shading === 'splat' ? 'splat.png' : shading === 'roads' ? 'roads-mask.png' : null;
  const material = useMemo<Material>(() => {
    const range = loaded?.chunks.heightRange ?? spec.heightRange;
    if (shading === 'height' || shading === 'slope') return debugMaterial(shading, range);
    if (mapUrl) return mapMaterial(`${base}/${mapUrl}?v=${encodeURIComponent(version)}`);
    if (shading === 'wireframe') return new MeshBasicMaterial({ color: '#6f8a5a', wireframe: true, side: DoubleSide });
    return new MeshStandardMaterial({ color: '#6f8a5a', roughness: 0.95, side: DoubleSide });
  }, [shading, mapUrl, base, version, loaded, spec.heightRange]);
  useEffect(() => () => material.dispose(), [material]);

  if (!webgl) return <p className="p-6 text-center text-xs text-muted-foreground">3D view needs WebGL, which is not available here.</p>;
  if (error) {
    return (
      <p role="alert" className="p-6 text-center text-xs text-destructive">
        {error}
      </p>
    );
  }
  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Spinner /> Loading terrain…
      </div>
    );
  }

  const size = loaded.chunks.worldSize;
  const [lo, hi] = loaded.chunks.heightRange;
  const el = sunElevation(timeOfDay);
  const sun: [number, number, number] = [Math.cos(el) * Math.sin(AZIMUTH) * size, Math.sin(el) * size, Math.cos(el) * Math.cos(AZIMUTH) * size];
  const lit = shading === 'shaded';

  return (
    <div
      ref={setElement}
      tabIndex={0}
      aria-label="Terrain viewport. Press F to toggle fly mode."
      data-testid="terrain-viewport"
      className="relative h-full w-full outline-none"
      onKeyDown={(event) => {
        if (event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey) setFly((v) => !v);
      }}
    >
      <Canvas
        frameloop={visible && focused ? 'always' : 'never'}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [size * 0.6, hi + size * 0.35, size * 0.6], fov: 50, near: 1, far: size * 6 }}
      >
        {lit ? (
          <>
            <ambientLight intensity={0.45} />
            <directionalLight position={sun} intensity={2.2} color={new Color('#fff4e0')} />
          </>
        ) : null}
        <Terrain loaded={loaded} material={material} />
        {spec.seaLevel !== undefined ? (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, spec.seaLevel, 0]}>
            <planeGeometry args={[size * 1.2, size * 1.2]} />
            <meshStandardMaterial color="#2a6f97" transparent opacity={0.7} />
          </mesh>
        ) : null}
        <OrbitControls enabled={!fly} target={[0, (lo + hi) / 2, 0]} makeDefault />
        <FlyControls active={fly} element={element} speed={size * 0.1} />
        {onFrameMs ? <FrameSampler onFrameMs={onFrameMs} /> : null}
      </Canvas>
      {fly ? <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground">Fly mode · WASD, Q/E, Shift, drag to look · F to leave</p> : null}
    </div>
  );
}
