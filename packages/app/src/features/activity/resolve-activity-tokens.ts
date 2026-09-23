import {
  ACTIVITY_STATUSES,
  type ActivityPalette,
  type ActivityStatus,
  resolveActivityStatusStyle,
} from '@midnite/studio-shared';

/**
 * The CSS custom properties one {@link ActivityStatus} resolves to —
 * `--activity-<status>-{from,via,to,ramp}` for a gradient,
 * `--activity-<status>` for either shape (a gradient's first stop, so a
 * consumer that only wants "one colour for this status" — a status pill,
 * `note-row.tsx`'s badge — never needs to know which shape it got), plus
 * `--activity-<status>-speed`/`-intensity`.
 *
 * `-via` only appears for an exactly-three-stop gradient — the doc's named
 * token shape (`{from,via,to}`) covers the common case; a longer ramp
 * (Rainbow's seven stops) only carries `-ramp`, the same "precomputed
 * comma-list" shape `--rainbow-ramp` already uses for the identical reason
 * (a `conic-gradient()` needs every stop, not a three-point summary).
 *
 * `null` means "remove this property" — `useActivityPaletteSync` calls
 * `removeProperty` for it, exactly `use-palette-sync.ts`'s own "clear rather
 * than strand a token" rule for a status that no longer resolves to a
 * gradient.
 */
export type ActivityTokenMap = Record<string, string | null>;

/** Every `--activity-*` property name this module ever writes, across all nine statuses. */
export function activityTokenNames(): string[] {
  const names: string[] = [];
  for (const status of ACTIVITY_STATUSES) {
    names.push(
      `--activity-${status}`,
      `--activity-${status}-from`,
      `--activity-${status}-via`,
      `--activity-${status}-to`,
      `--activity-${status}-ramp`,
      `--activity-${status}-speed`,
      `--activity-${status}-intensity`,
    );
  }
  return names;
}

function tokensForStatus(status: ActivityStatus, palette: ActivityPalette): ActivityTokenMap {
  const style = resolveActivityStatusStyle(palette, status);
  const tokens: ActivityTokenMap = {
    [`--activity-${status}-speed`]: `${style.speed}s`,
    [`--activity-${status}-intensity`]: `${style.intensity}`,
  };

  if (style.color.kind === 'solid') {
    tokens[`--activity-${status}`] = style.color.color;
    tokens[`--activity-${status}-from`] = null;
    tokens[`--activity-${status}-via`] = null;
    tokens[`--activity-${status}-to`] = null;
    tokens[`--activity-${status}-ramp`] = null;
    return tokens;
  }

  const { stops } = style.color;
  tokens[`--activity-${status}`] = stops[0] ?? null;
  tokens[`--activity-${status}-from`] = stops[0] ?? null;
  tokens[`--activity-${status}-to`] = stops[stops.length - 1] ?? null;
  tokens[`--activity-${status}-via`] = stops.length === 3 ? (stops[1] ?? null) : null;
  tokens[`--activity-${status}-ramp`] = stops.join(', ');
  return tokens;
}

/** The full `--activity-*` token map for a resolved palette — pure, no DOM. */
export function resolveActivityTokens(palette: ActivityPalette): ActivityTokenMap {
  return ACTIVITY_STATUSES.reduce<ActivityTokenMap>(
    (acc, status) => ({ ...acc, ...tokensForStatus(status, palette) }),
    {},
  );
}
