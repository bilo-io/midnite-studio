import type { KnowledgeVariantProps } from '../renderer-contract';
import { CytoscapeRenderer } from './cytoscape-renderer';
import { Engine2DCanvas } from './engine-2d-canvas';

/** The `cytoscape` variant (Phase 89 Theme G) — lazy: reached only through its registry entry's `import()`. */
export default function CytoscapeCanvas(props: KnowledgeVariantProps) {
  return (
    <Engine2DCanvas
      {...props}
      createRenderer={(env) => new CytoscapeRenderer(env)}
      hint="cytoscape · Drag to pan · Scroll to zoom"
    />
  );
}
