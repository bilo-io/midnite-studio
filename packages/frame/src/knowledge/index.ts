/**
 * `@midnite/studio-frame/knowledge` - the Knowledge view (Phase 113 Theme M).
 *
 * Its own entry, not part of the frame barrel: the view pulls sigma and graphology (~0.5 MB), which
 * must stay out of every app's entry chunk. An app loads it lazily:
 *
 *   const KnowledgeView = lazy(() => import('@midnite/studio-frame/knowledge').then((m) => ({ default: m.KnowledgeView })));
 *
 * The light half - the host port, the query keys, the existence check the rail row asks - is on the
 * barrel (`@midnite/studio-frame`).
 */
export { KnowledgeView } from './knowledge-view';
