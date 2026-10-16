import { EdgeProgram, type ProgramInfo } from 'sigma/rendering';
import type { EdgeDisplayData, NodeDisplayData, RenderParams } from 'sigma/types';
import { floatColor } from 'sigma/utils';

import { curveControlPoint, sampleQuadraticBezier, CONSTELLATION_SEGMENTS } from './knowledge-curve-math';

/**
 * Constellation's own WebGL edge program (Phase 89 Theme D) — the one custom
 * edge program the theme's Files list calls for. Every other look-specific
 * effect (glow, ambient alpha, label density) is a `nodeReducer`/
 * `edgeReducer`/sigma-setting change in `use-sigma-graph.tsx`; curvature is
 * the one thing neither can do, because sigma's built-in edge programs only
 * ever draw a straight line between two endpoints.
 *
 * Modelled directly on sigma's own `EdgeLineProgram` (the package's
 * simplest, non-instanced edge program: two vertices, `GL_LINES`, one
 * `a_position`/`a_color`/`a_id` triple per vertex) — this is that exact
 * shape repeated `CONSTELLATION_SEGMENTS` times per edge, with the extra
 * vertices tracing a CPU-sampled quadratic Bezier (`knowledge-curve-math.ts`)
 * instead of the straight line between source and target. Because it is
 * non-instanced, sigma's own `Program`/`EdgeProgram` base classes already
 * size the buffer and compute each edge's write offset from `VERTICES`
 * alone (`STRIDE = VERTICES * ATTRIBUTES_ITEMS_COUNT`) — no override of
 * `reallocate`/`process` is needed, only `getDefinition`/`processVisibleItem`
 * /`setUniforms`, same as every other program in the package.
 *
 * Registered ALONGSIDE the default `line` (`EdgeRectangleProgram`) rather
 * than replacing it — `use-sigma-graph.tsx` registers this under the key
 * `curve` and the edge reducer sets `type: 'curve'` only while Constellation
 * is the active look (`EdgeDisplayData.type` is exactly the mechanism sigma
 * uses to dispatch an item to a specific registered program, `sigma.ts`'s
 * `this.edgePrograms[edgeData.type]`). That is what lets a look switch
 * change which program draws an edge WITHOUT reconstructing the `Sigma`
 * instance: Atlas/Orbit/Clusters keep the thickness-respecting default
 * program untouched (this program renders plain `GL_LINES`, so it does not
 * carry `data.size` — a deliberate trade for Constellation's own mood, not a
 * regression on the other three looks, which never route an edge here).
 *
 * Deliberately NOT parameterized over `use-sigma-graph.tsx`'s own
 * `NodeAttrs`/`EdgeAttrs` — `graphology-types` (the source of the `Attributes`
 * bound those generics extend) is sigma's own nested dependency, not this
 * package's direct one, so importing it here would be a phantom import.
 * sigma's own default programs (`EdgeArrowProgram`, `EdgeRectangleProgram`,
 * merged in via `DEFAULT_EDGE_PROGRAM_CLASSES`) are registered the same
 * unparameterized way for exactly this reason.
 */

const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext;
const UNIFORMS = ['u_matrix'] as const;

const VERTEX_SHADER_SOURCE = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;

uniform mat3 u_matrix;

varying vec4 v_color;

const float bias = 255.0 / 254.0;

void main() {
  gl_Position = vec4(
    (u_matrix * vec3(a_position, 1)).xy,
    0,
    1
  );

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;

const FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision mediump float;

varying vec4 v_color;

void main(void) {
  gl_FragColor = v_color;
}
`;

export default class EdgeCurveProgram extends EdgeProgram<(typeof UNIFORMS)[number]> {
  getDefinition() {
    return {
      VERTICES: CONSTELLATION_SEGMENTS * 2,
      VERTEX_SHADER_SOURCE,
      FRAGMENT_SHADER_SOURCE,
      METHOD: WebGLRenderingContext.LINES,
      UNIFORMS,
      ATTRIBUTES: [
        { name: 'a_position', size: 2, type: FLOAT },
        { name: 'a_color', size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: 'a_id', size: 4, type: UNSIGNED_BYTE, normalized: true },
      ],
    };
  }

  processVisibleItem(
    edgeIndex: number,
    startIndex: number,
    sourceData: NodeDisplayData,
    targetData: NodeDisplayData,
    data: EdgeDisplayData,
  ): void {
    const array = this.array;
    const x1 = sourceData.x;
    const y1 = sourceData.y;
    const x2 = targetData.x;
    const y2 = targetData.y;
    const color = floatColor(data.color);
    const control = curveControlPoint(x1, y1, x2, y2);
    const points = sampleQuadraticBezier(x1, y1, control, x2, y2);

    let i = startIndex;
    for (let s = 0; s < points.length - 1; s++) {
      const a = points[s]!;
      const b = points[s + 1]!;
      array[i++] = a.x;
      array[i++] = a.y;
      array[i++] = color;
      array[i++] = edgeIndex;
      array[i++] = b.x;
      array[i++] = b.y;
      array[i++] = color;
      array[i++] = edgeIndex;
    }
  }

  setUniforms(
    params: RenderParams,
    { gl, uniformLocations }: ProgramInfo<(typeof UNIFORMS)[number]>,
  ): void {
    const { u_matrix } = uniformLocations;
    gl.uniformMatrix3fv(u_matrix, false, params.matrix);
  }
}
