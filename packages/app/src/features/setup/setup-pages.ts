import type { SetupPage } from './setup-page';
import { ForgeConnectPage } from './pages/forge-connect-page';
import { ForgeCliPage } from './pages/forge-cli-page';
import { ForgeSelectPage } from './pages/forge-select-page';
import { GitPage } from './pages/git-page';
import { MidniteCliPage } from './pages/midnite-cli-page';
import { ToolchainPage } from './pages/toolchain-page';

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
 * modal still means the same page. `cli` is Theme G's page, the first of the
 * final set to land.
 */
export const SETUP_PAGES: readonly SetupPage[] = [
  {
    id: 'git',
    title: 'Git',
    titleTyped: 'Get git ready',
    Component: GitPage,
  },
  {
    id: 'forge-select',
    title: 'Forges',
    titleTyped: 'Which forges do you use?',
    Component: ForgeSelectPage,
  },
  {
    id: 'forge-cli',
    title: 'Forge CLIs',
    titleTyped: 'Install your forge tools',
    Component: ForgeCliPage,
  },
  {
    id: 'forges',
    title: 'Connect your forges',
    titleTyped: 'Connect your forges',
    Component: ForgeConnectPage,
  },
  {
    id: 'cli',
    title: 'Midnite CLI',
    titleTyped: 'Install the Midnite CLI',
    Component: MidniteCliPage,
  },
  {
    id: 'toolchain',
    title: 'Toolchain',
    titleTyped: 'Set up your toolchain',
    Component: ToolchainPage,
  },
];
