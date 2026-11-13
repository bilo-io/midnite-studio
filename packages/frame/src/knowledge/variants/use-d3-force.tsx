import type { KnowledgeVariantProps } from '../renderer-contract';
import { D3ForceRenderer } from './d3-force-renderer';
import { Engine2DCanvas } from './engine-2d-canvas';

/** The live `d3-force` variant (Phase 89 Theme I) — lazy: `renderer-contract.ts` reaches this only through its own `import()`. */
export default function D3ForceCanvas(props: KnowledgeVariantProps) {
  return (
    <Engine2DCanvas
      {...props}
      createRenderer={(env) => new D3ForceRenderer(env)}
      hint="d3-force · live · Drag to pan · Scroll to zoom"
    />
  );
}
