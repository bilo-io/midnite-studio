import {
  PROVIDER_BRAND_COLOR,
  PROVIDER_ICON,
  type SupportedKind,
} from '../settings/settings-pages/accounts-page';

/**
 * A forge's brand mark in its brand colour — the one place the setup wizard
 * draws a forge icon. Reuses Settings ▸ Accounts' `PROVIDER_ICON` /
 * `PROVIDER_BRAND_COLOR` maps (GitHub's near-black flips to its light-on-dark
 * foreground via `.forge-provider-option` in styles.css), so the wizard and
 * Settings can never disagree on a forge's face.
 */
export function ForgeMark({ kind, className = 'h-4 w-4 shrink-0' }: { kind: SupportedKind; className?: string }) {
  const Icon = PROVIDER_ICON[kind];
  const brand = PROVIDER_BRAND_COLOR[kind];
  return (
    <span
      data-testid={`forge-mark-${kind}`}
      data-forge-icon={kind}
      className="forge-provider-option inline-flex shrink-0"
      style={
        {
          '--brand-light': brand.light,
          '--brand-dark': brand.dark,
          color: 'var(--forge-brand)',
        } as React.CSSProperties
      }
    >
      <Icon aria-hidden className={className} />
    </span>
  );
}
