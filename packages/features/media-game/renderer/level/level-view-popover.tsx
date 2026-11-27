import { SwitchRow } from '@midnite/studio-frame';
import { LuEye } from 'react-icons/lu';

import { Popover } from '../chrome';
import type { LevelOverlays } from './3d/level-view-store';

const ROWS: ReadonlyArray<{ key: keyof LevelOverlays; label: string; hint: string }> = [
  { key: 'colliders', label: 'Colliders', hint: 'Solid tiles and volumes' },
  { key: 'triggers', label: 'Triggers', hint: 'Triggers, exits, checkpoints and hazards' },
  { key: 'spawners', label: 'Spawners', hint: 'Where traffic and pedestrians spawn' },
  { key: 'nav', label: 'Nav-mesh', hint: 'Where the game can path, from the running game' },
];

/**
 * The toolbar's View menu (Phase 140 Themes F and G): switches for the overlays. All but Spawners (an editor-only zone) drive
 * the running game, so the editor and the game show the same thing.
 */
export function LevelViewPopover({ overlays, onChange, navNeedsGame, hillshade = null }: { overlays: LevelOverlays; onChange: (key: keyof LevelOverlays, on: boolean) => void; navNeedsGame: boolean; hillshade?: { on: boolean; set: (on: boolean) => void } | null }) {
  const any = overlays.colliders || overlays.triggers || overlays.spawners || overlays.nav;
  return (
    <Popover label="View overlays" title="View overlays" side="bottom" align="start" panelClassName="w-56 space-y-2" trigger={<LuEye aria-hidden className={`h-3.5 w-3.5 ${any ? '' : 'opacity-50'}`} />} testId="level-view-trigger">
      {ROWS.map((r) => (
        <SwitchRow key={r.key} id={`overlay-${r.key}`} label={r.label} title={r.hint} on={overlays[r.key]} onToggle={(_, on) => onChange(r.key, on)} />
      ))}
      {hillshade ? <SwitchRow id="overlay-hillshade" label="Hillshade" title="Shade the Floorplan by the terrain's relief" on={hillshade.on} onToggle={(_, on) => hillshade.set(on)} /> : null}
      {navNeedsGame && overlays.nav ? <p className="text-[11px] text-muted-foreground">Run the game to see its nav-mesh.</p> : null}
    </Popover>
  );
}
