import type { KnowledgeVariantProps } from '../renderer-contract';
import { Engine2DCanvas } from './engine-2d-canvas';
import { ForceGraphRenderer } from './force-graph-renderer';

/** The `force-graph` variant (Phase 89 Theme F) — lazy: `renderer-contract.ts` reaches this only through its own `import()`. */
export default function ForceGraphCanvas(props: KnowledgeVariantProps) {
  return (
    <Engine2DCanvas
      {...props}
      createRenderer={(env) => new ForceGraphRenderer(env)}
      hint="force-graph · Drag to pan · Scroll to zoom"
    />
  );
}
