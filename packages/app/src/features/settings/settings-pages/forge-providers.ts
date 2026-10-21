import { SiBitbucket, SiGithub, SiGitlab } from 'react-icons/si';
import { VscAzureDevops } from 'react-icons/vsc';

import type { ForgeKind } from '@midnite/studio-shared';
import type { VaultForgeProvider } from '@midnite/studio-feature-vault/renderer';

import type { IconComponent } from '../../../components/icon-button';

/**
 * The four supported forges, as every Studio forge surface draws them (Phase 113 Theme J slice 3 moved
 * this out of `accounts-page.tsx` unchanged): the add-account form, the account switcher, the setup
 * wizard, the dashboard tiles, the rail's category icons and the clone dialog all read these maps. They
 * are forge metadata, not credentials — the credential half of Settings ▸ Accounts is the vault
 * feature's now, and reads this list through Studio's vault host (`compose/vault-host.tsx`,
 * {@link FORGE_PROVIDERS}).
 */

/**
 * Exported for `onboarding/steps/forge-connect-step.tsx` (Phase 90 Theme I):
 * the wizard's "Connect your forges" step is the same add-account action as
 * this page's own form, so it reads the identical host/label/scope text
 * rather than keeping a second copy that can drift from this one.
 */
export type SupportedKind = Exclude<ForgeKind, 'unknown'>;

/**
 * No self-hosted host picker — Theme B's own scope guardrail (matching
 * `CLAUDE.md`'s "no self-hosted GitLab/Bitbucket Server/Azure DevOps Server"
 * line). Each of these three hosts is the one real one for its kind; a
 * self-hosted instance is recognised by the URL parser (Theme A) and
 * declared `unsupported` by the capability matrix rather than offered here.
 */
export const PROVIDER_HOST: Record<SupportedKind, string> = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
  azure: 'dev.azure.com',
};

export const PROVIDER_LABEL: Record<SupportedKind, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  azure: 'Azure DevOps',
};

/** Each provider's own logo, not a generic forge glyph — the same reasoning
 *  `CLAUDE.md`'s icon convention gives for `react-icons` fronting ~30 sets:
 *  the brand mark reads as "GitHub" at a glance in a way a shared git-forge
 *  icon can't. Simple Icons (`si`) carries GitHub/GitLab/Bitbucket; Simple
 *  Icons has no Azure DevOps mark, so that one comes from VS Code's icon set
 *  (`vsc`) instead — still a per-set `react-icons` import, just a different
 *  set for the one brand the other doesn't have. */
export const PROVIDER_ICON: Record<SupportedKind, IconComponent> = {
  github: SiGithub,
  gitlab: SiGitlab,
  bitbucket: SiBitbucket,
  azure: VscAzureDevops,
};

/**
 * Each provider's brand colour, one place, beside the rest of the provider
 * definitions above. `light`/`dark` are almost always the same value —
 * GitLab's orange, Bitbucket's and Azure DevOps' blues are saturated enough
 * to read against both the app's light and dark surfaces unchanged. GitHub
 * is the one exception: its brand colour is a near-black (#181717), which
 * all but disappears against this app's dark theme, so `dark` swaps it for
 * GitHub's own light-on-dark foreground (`#f0f6fc`, the colour GitHub's own
 * dark theme uses for text against black) instead of inventing a new one.
 * Consumed via the `--brand-light`/`--brand-dark` custom properties and the
 * `.forge-provider-option` rule in `styles.css`, which is what lets the
 * button pick the right one per theme without this file knowing which theme
 * is active.
 */
export interface ForgeBrandColor {
  light: string;
  dark: string;
}

export const PROVIDER_BRAND_COLOR: Record<SupportedKind, ForgeBrandColor> = {
  github: { light: '#181717', dark: '#f0f6fc' },
  gitlab: { light: '#FC6D26', dark: '#FC6D26' },
  bitbucket: { light: '#0052CC', dark: '#0052CC' },
  azure: { light: '#0078D7', dark: '#0078D7' },
};

/** The exact scopes each provider needs, spelled out — `projects-page.tsx`'s
 *  own style for `gh auth refresh -s project`. */
export const PROVIDER_TOKEN_HINT: Record<SupportedKind, string> = {
  github:
    'Leave this blank to use the GitHub CLI (`gh auth login`) — the same credential every other GitHub read in this app already uses. Paste a personal access token only to add a second GitHub identity.',
  gitlab: 'A personal access token with the `read_api` scope (Settings ▸ Access Tokens on gitlab.com).',
  bitbucket:
    'A workspace API token, or an App Password, with repository read access (Personal settings ▸ App passwords).',
  azure:
    'A personal access token with Code (Read), Work Items (Read & Write) and Build (Read) scopes (User settings ▸ Personal access tokens).',
};

const PROVIDER_KINDS: readonly SupportedKind[] = ['github', 'gitlab', 'bitbucket', 'azure'];

/** The picker's rows, in display order — what Studio's vault host hands the vault's add-account form. */
export const FORGE_PROVIDERS: readonly VaultForgeProvider[] = PROVIDER_KINDS.map((kind) => ({
  kind,
  label: PROVIDER_LABEL[kind],
  host: PROVIDER_HOST[kind],
  tokenHint: PROVIDER_TOKEN_HINT[kind],
  Icon: PROVIDER_ICON[kind],
  brand: PROVIDER_BRAND_COLOR[kind],
}));
