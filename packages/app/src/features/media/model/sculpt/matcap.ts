import { DataTexture, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';

/**
 * A procedural clay matcap for sculpt mode (Phase 104 Theme G): a lit sphere baked into a small texture, so
 * forms read the same under every viewport light and no image file ships. Generated once, on first use.
 */
let cached: DataTexture | null = null;

export function clayMatcap(size = 128): DataTexture {
  if (cached) return cached;
  const data = new Uint8Array(size * size * 4);
  const light = [-0.45, 0.55, 0.7];
  const l = Math.hypot(light[0]!, light[1]!, light[2]!);
  const [lx, ly, lz] = light.map((v) => v / l) as [number, number, number];
  const base = [0.78, 0.68, 0.6];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      // Matcap textures put +y at the top of the image; three samples them with flipY.
      const ny = ((y + 0.5) / size) * 2 - 1;
      const r2 = nx * nx + ny * ny;
      const nz = Math.sqrt(Math.max(0, 1 - r2));
      const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
      const rim = Math.pow(1 - nz, 3) * 0.25;
      const hx = lx;
      const hy = ly;
      const hz = lz + 1;
      const hl = Math.hypot(hx, hy, hz);
      const spec = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 40) * 0.25;
      const at = (y * size + x) * 4;
      for (let k = 0; k < 3; k += 1) data[at + k] = Math.round(Math.min(1, base[k]! * (0.28 + 0.8 * diffuse) + rim + spec) * 255);
      data[at + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  cached = texture;
  return texture;
}
