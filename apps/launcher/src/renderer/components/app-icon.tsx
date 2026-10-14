import type { IconType } from 'react-icons';
import { LuBot, LuCode, LuGamepad2, LuGlobe, LuLayoutGrid, LuPalette, LuSparkles } from 'react-icons/lu';

import type { AppId, LauncherApp } from '../../common/catalog';

const ICONS: Record<AppId, IconType> = {
  agents: LuBot,
  coder: LuCode,
  gamer: LuGamepad2,
  creator: LuPalette,
  browser: LuGlobe,
  cleaner: LuSparkles,
  studio: LuLayoutGrid,
};

/** The app's mark: its glyph on a tile of its own accent. */
export function AppIcon({ app, size = 56 }: { app: LauncherApp; size?: number }) {
  const Icon = ICONS[app.id];
  return (
    <span
      className="app-icon"
      style={{ width: size, height: size, ['--accent' as string]: app.accent }}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}
