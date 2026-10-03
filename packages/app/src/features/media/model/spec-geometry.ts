import type { ModelPart } from '@midnite/studio-shared';
import { BoxGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, LatheGeometry, Shape, SphereGeometry, TorusGeometry, Vector2, type BufferGeometry } from 'three';

/**
 * three.js geometry for one part of a design, in the part's own space (the
 * mesh's position/rotation/scale supply the rest). Mirrors the dimensions of
 * main's mesh builder (`desktop/src/main/media/model/mesh.ts`), which is what
 * `.obj`/`.fbx` are written from: a box is centred, a cylinder is centred on
 * its height, a lathe revolves `[radius, y]` about Y, an extrude rises from
 * y=0 over an `[x, z]` outline.
 */
const RADIAL = 32;

export function createPartGeometry(part: ModelPart): BufferGeometry {
  switch (part.shape) {
    case 'box':
      return new BoxGeometry(part.size[0], part.size[1], part.size[2]);
    case 'sphere':
      return new SphereGeometry(part.radius, RADIAL, 20);
    case 'cylinder':
      return new CylinderGeometry(part.radiusTop, part.radiusBottom, part.height, RADIAL);
    case 'cone':
      return new ConeGeometry(part.radius, part.height, RADIAL);
    case 'torus':
      return new TorusGeometry(part.radius, part.tube, 16, RADIAL).rotateX(Math.PI / 2);
    case 'lathe':
      return new LatheGeometry(
        part.profile.map(([radius, y]) => new Vector2(radius, y)),
        RADIAL,
      );
    case 'extrude': {
      // Shape space is XY; after rotating -90° about X, shape y → world -z and the extrusion (+z) → world +y.
      const shape = new Shape(part.outline.map(([x, z]) => new Vector2(x, -z)));
      return new ExtrudeGeometry(shape, { depth: part.height, bevelEnabled: false }).rotateX(-Math.PI / 2);
    }
  }
}

/** The fields that decide a part's geometry — everything but transform, colour and name. */
export function geometryKey(part: ModelPart): string {
  const { name: _n, position: _p, rotation: _r, scale: _s, color: _c, ...shape } = part;
  return JSON.stringify(shape);
}
