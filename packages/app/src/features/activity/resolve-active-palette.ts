import {
  ACTIVITY_PRESETS,
  DEFAULT_ACTIVITY_PALETTE_ID,
  METAL_RING,
  type ActivityPalette,
  type ActivityStatus,
  type ActivityStatusStyle,
} from '@midnite/studio-shared';

import type { AgentStyleMode, ShellStyleMode } from './activity-palette-store';

const metallic = (base: ActivityStatusStyle | undefined): ActivityStatusStyle => ({
  color: { kind: 'gradient', stops: METAL_RING },
  speed: base?.speed ?? 4,
  intensity: 0,
});

/**
 * Composes Settings ▸ Activity's whole state (Theme B) into one resolved
 * `ActivityPalette` — the shape `useActivityPaletteSync`/`resolve-activity-
 * tokens.ts` already know how to turn into `--activity-*` custom
 * properties, so this is the only place layering logic lives; the token
 * writer stays exactly as pure as it was for Theme A.
 *
 * Precedence, per status:
 * 1. An explicit `statusOverrides[status]` — the per-status colour/gradient
 *    editor always wins, `agent`/`shell` included.
 * 2. For `agent` with no override: `agentStyle === 'metallic'` swaps in the
 *    fixed silver ring; otherwise the preset's own gradient.
 * 3. For `shell` with no override: `shellStyle` picks between the preset's
 *    own metallic ring (default), the preset's *agent* gradient dressed up
 *    as `gradient` (independent of any agent override — the preset's own
 *    brand ring), or `matchAgent`, which copies whatever `agent` resolved
 *    to one step up (so a metallic-styled agent makes the shell metallic
 *    too, and a per-status agent override flows through as well).
 * 4. Every other status: the preset's own value.
 */
export function resolveActivePalette(
  activePaletteId: string,
  statusOverrides: Partial<Record<ActivityStatus, ActivityStatusStyle>>,
  agentStyle: AgentStyleMode,
  shellStyle: ShellStyleMode,
): ActivityPalette {
  // The Brand fallback is guaranteed present — it's a literal key of the
  // built-in `ACTIVITY_PRESETS` map — so the `!` only stands in for what
  // `Record<string, T>`'s index signature can't express statically.
  const preset =
    ACTIVITY_PRESETS[activePaletteId] ?? ACTIVITY_PRESETS[DEFAULT_ACTIVITY_PALETTE_ID]!;

  const resolvedAgent: ActivityStatusStyle =
    statusOverrides.agent ??
    (agentStyle === 'metallic' ? metallic(preset.statuses.agent) : preset.statuses.agent) ??
    preset.statuses.agent!;

  let resolvedShell: ActivityStatusStyle;
  if (statusOverrides.shell) {
    resolvedShell = statusOverrides.shell;
  } else if (shellStyle === 'matchAgent') {
    resolvedShell = resolvedAgent;
  } else if (shellStyle === 'gradient') {
    resolvedShell = preset.statuses.agent!;
  } else {
    resolvedShell = preset.statuses.shell!;
  }

  return {
    ...preset,
    statuses: {
      ...preset.statuses,
      ...statusOverrides,
      agent: resolvedAgent,
      shell: resolvedShell,
    },
  };
}
