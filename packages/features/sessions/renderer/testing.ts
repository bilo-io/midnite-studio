/**
 * The view itself, eagerly — for a composer's own tests (Studio's `sessions-view.test.tsx` renders it
 * under its host). Production code goes through `sessionsViews`, which keeps the view in its own chunk.
 */
export { SessionsView } from './sessions-view';
