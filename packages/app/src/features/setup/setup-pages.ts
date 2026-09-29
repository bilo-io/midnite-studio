import type { SetupPage } from './setup-page';
import { ForgeConnectPage } from './pages/forge-connect-page';
import { MachineCheckPage } from './pages/machine-check-page';

/**
 * The setup overlay's pages, top to bottom (Phase 98 Theme A).
 *
 * A flat, ordered array, on purpose — `setup-page.ts`'s own doc comment names
 * the shape. **To add a page:** append a row; `setup-overlay.tsx` never changes
 * for a new page, only for a new frame behaviour.
 *
 * The two rows here are the old wizard's content carried over so that
 * removing `FirstRunModal` and `OnboardingModal` loses nothing. Themes D–I
 * replace them with git, forges, accounts, CLI, toolchain and Ollama pages.
 * `forges` keeps the old wizard's step id, so a skip recorded under the old
 * modal still means the same page.
 */
export const SETUP_PAGES: readonly SetupPage[] = [
  {
    id: 'machine',
    title: 'Check your machine',
    titleTyped: 'Check your machine',
    Component: MachineCheckPage,
  },
  {
    id: 'forges',
    title: 'Connect your forges',
    titleTyped: 'Connect your forges',
    Component: ForgeConnectPage,
  },
];
