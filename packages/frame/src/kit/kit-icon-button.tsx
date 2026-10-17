import type { IconButtonProps } from '../chrome/types';

/**
 * The token-styled `IconButton` an extracted app wears. `disabledReason` keeps the
 * button hoverable (aria-disabled + swallowed click) so the title can explain
 * itself; `busy` blocks the click and flags `aria-busy`.
 */
export function KitIconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  disabledReason,
  busy,
  children,
  className = '',
  'aria-pressed': ariaPressed,
  'aria-expanded': ariaExpanded,
  'data-testid': testId,
}: IconButtonProps) {
  const isDisabled = Boolean(disabled || disabledReason || busy);
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      title={disabledReason ? `${label} (${disabledReason})` : label}
      aria-disabled={isDisabled}
      aria-busy={busy || undefined}
      disabled={disabled || undefined}
      aria-pressed={ariaPressed}
      aria-expanded={ariaExpanded}
      onClick={isDisabled ? undefined : onClick}
      className={`inline-flex items-center justify-center gap-1 rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${className}`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}
