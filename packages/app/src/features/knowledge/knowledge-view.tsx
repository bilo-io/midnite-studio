import { SiGrapheneos } from 'react-icons/si';

import { EmptyState } from '../../components/empty-state';

/**
 * The Knowledge view — Phase 87 Theme C.
 *
 * This theme lands only the rail row and the view registration: `'knowledge'`
 * into `VIEW_IDS`, the third pinned row beside Dashboard and Notes, and this
 * lazy view slot. The engine that actually reads `graphify-out/graph.json`
 * (`packages/knowledge`, Theme A) and the IPC contract that carries it to the
 * renderer (Theme B) are separate, parallel themes — this view intentionally
 * renders a placeholder rather than reaching for either, so it never imports
 * something that does not exist yet on `main`. The sigma/graphology canvas
 * (Theme D), the four interactions (Theme E) and the empty/stale states
 * (Theme F) all replace this body without touching the rail wiring here.
 */
export function KnowledgeView() {
  return (
    <EmptyState
      icon={SiGrapheneos}
      title="Knowledge"
      body="A WebGL view of this repo's own graphify graph — communities, call edges, click-to-open. Coming soon."
    />
  );
}
