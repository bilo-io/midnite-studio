import { SwitchTrack } from './toggle-rows';

/**
 * A full-width settings row: a label (plus an optional description and
 * leading icon) on the left, a switch on the right, and the *entire row* as
 * the one clickable, focusable control — not a checkbox with a label beside
 * it.
 *
 * Built on the same shape as `SwitchRow` (`toggle-rows.tsx`, Phase 41 Theme
 * G — a real `<input type="checkbox" role="switch">`, transparent and
 * stretched over the row, so a click anywhere lands on the one input rather
 * than racing a second handler) and shares its painted track, `SwitchTrack`,
 * so the two rows read as one control family. What this adds over the plain
 * `SwitchRow` is what every settings page actually needs and the sidenav's
 * rail-destination list did not: an optional description line, a leading
 * icon slot (an app's own icon, a metric's colour dot), and a real
 * `disabled` state — dimmed, `cursor-not-allowed`, not clickable, its reason
 * carried as `title` rather than invented on the fly per call site.
 *
 * `aria-label` is set explicitly to `label` rather than left to fall out of
 * the wrapping `<label>`'s text content, because the description sits inside
 * that same `<label>` (so a click anywhere on it still toggles the switch)
 * and would otherwise run into the accessible name — the row's name is the
 * label alone, the way #552's plain `SwitchRow` rows already read.
 *
 * A native checkbox toggles on Space but not on Enter (Enter submits a
 * form); the explicit `onKeyDown` below is what makes Enter work too, since
 * this row is meant to behave like any other row-as-button control in the
 * app, not like a lone form checkbox.
 */
export function SettingsSwitchRow({
  id,
  label,
  description,
  icon,
  on,
  onToggle,
  disabled,
  title,
  className,
  testId,
}: {
  id: string;
  label: string;
  description?: string;
  /** A small leading mark — an app's own icon, a metric's colour dot. Decorative; the accessible name stays `label`. */
  icon?: React.ReactNode;
  on: boolean;
  onToggle: (id: string, on: boolean) => void;
  /** Locked, non-interactive, dimmed, `cursor-not-allowed` — pair with `title` to say why. */
  disabled?: boolean;
  /** Tooltip text. The disabled reason when `disabled` is set; an informational aside (e.g. a loop modifier's prompt fragment) otherwise. */
  title?: string;
  /** Extra classes on the row itself, appended after the defaults so a caller can override sizing/spacing (as `sidebar-page.tsx` does). */
  className?: string;
  /** `data-testid` on the real input, for the handful of call sites a pre-existing test already keyed off one rather than role/name. */
  testId?: string;
}) {
  return (
    <label
      title={title}
      className={`relative flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1.5 text-xs transition-colors ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-accent/40'
      } ${className ?? ''}`}
    >
      <span
        className={`flex min-w-0 items-center gap-2 ${
          on && !disabled ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        {icon}
        <span className="min-w-0">
          <span className="block truncate">{label}</span>
          {description ? (
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        data-testid={testId}
        checked={on}
        disabled={disabled}
        onChange={(event) => {
          // Belt-and-braces beside the native `disabled` attribute: some
          // environments (jsdom's synthetic `fireEvent.click`, notably)
          // don't honour it the way a real browser refuses to fire `click`
          // on a disabled form control at all.
          if (disabled) return;
          onToggle(id, event.target.checked);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key !== 'Enter') return;
          event.preventDefault();
          onToggle(id, !on);
        }}
        className={`peer absolute inset-0 h-full w-full opacity-0 ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
      />
      <SwitchTrack />
    </label>
  );
}
