import { LuMoon, LuSun, LuSunMoon } from 'react-icons/lu';

import { cycleTheme, nextTheme, useTheme, type Theme } from '../theme';

const ICON: Record<Theme, typeof LuSunMoon> = {
  system: LuSunMoon,
  light: LuSun,
  dark: LuMoon,
};

/**
 * One button, three states: `system → light → dark → system`.
 *
 * A cycling button rather than a 3-option menu — the toggle changes nothing
 * about layout or reading order, so a menu's extra tap (open, then choose)
 * buys nothing a single click doesn't already give, and the `title`/hover
 * label already names both the current state and where the next click goes.
 *
 * The icon names the *current* state (`LuSunMoon` for "following the OS"),
 * and the `aria-label` spells out the transition — "Theme: system — switch to
 * light" — so a screen-reader user gets the same information a sighted one
 * gets from watching the icon change.
 */
export const ThemeToggle = () => {
  const theme = useTheme();
  const next = nextTheme(theme);
  const Icon = ICON[theme];
  const label = `Theme: ${theme} — switch to ${next}`;

  return (
    <button
      type="button"
      onClick={() => cycleTheme()}
      title={label}
      aria-label={label}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-muted transition duration-fast hover:text-fg"
    >
      <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
    </button>
  );
};
