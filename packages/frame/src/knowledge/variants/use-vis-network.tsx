import type { KnowledgeVariantProps } from '../renderer-contract';
import { Engine2DCanvas } from './engine-2d-canvas';
import { VisNetworkRenderer } from './vis-network-renderer';

/** The `vis-network` variant (Phase 89 Theme H) — lazy; see `vis-network-renderer.ts` for why it is bundled from npm and not the CDN Phase 87 rejected. */
export default function VisNetworkCanvas(props: KnowledgeVariantProps) {
  return (
    <Engine2DCanvas
      {...props}
      createRenderer={(env) => new VisNetworkRenderer(env)}
      hint="vis-network · Drag to pan · Scroll to zoom"
    />
  );
}
