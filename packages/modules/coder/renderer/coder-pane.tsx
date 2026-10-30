import { CoderModule } from './coder-module';
import { CODER_VIEWS, type CoderViewId } from '../manifest';

const isCoderView = (view: string): view is CoderViewId => (CODER_VIEWS as readonly string[]).includes(view);

/** Coder as a pane inside a host's shell (Phase 124 Theme E.3): the rail's row picks the view. */
export function CoderPane({ view }: { view: string; onView?: (view: string) => void }) {
  return <CoderModule embeddedView={isCoderView(view) ? view : 'reviews'} />;
}
