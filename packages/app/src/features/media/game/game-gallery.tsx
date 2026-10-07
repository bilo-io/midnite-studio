import {
  GAME_CAMERA_IDS,
  GAME_GENRES_2D,
  GAME_GENRES_3D,
  GAME_PERSPECTIVES_2D,
  GAME_PERSPECTIVES_3D,
  GAME_TEMPLATE_MATRIX,
  isStarterAvailable,
  isValidStarter,
  starterId,
  type GameCameraId,
  type GameDimension,
  type GameGenre,
  type GamePerspective,
} from '@midnite/studio-shared';
import { useRef } from 'react';
import { LuBox, LuDoorOpen, LuEye, LuFootprints, LuMap, LuUser } from 'react-icons/lu';

import type { IconComponent } from '../../../components/icon-button';

export const PERSPECTIVE_LABEL: Record<GamePerspective, string> = {
  platformer: 'Platformer',
  'top-down': 'Top-down',
  isometric: 'Isometric',
  raycaster: '2.5D raycaster',
  'first-person': 'First person',
  'third-person': 'Third person',
};

export const GENRE_LABEL: Record<GameGenre, string> = {
  fps: 'FPS',
  rts: 'RTS',
  arpg: 'ARPG',
  crime: 'Top-down crime',
  shooter: 'Shooter',
  fighter: 'Fighter',
  soulslike: 'Soulslike',
  rpg: 'RPG',
  'character-action': 'Character action',
  'open-world': 'Open world',
};

const BASE_PITCH: Record<GamePerspective, string> = {
  platformer: 'Run and jump: coyote time, jump buffer, one-way ledges.',
  'top-down': 'Eight-direction movement and facing.',
  isometric: 'Diamond tiles, depth sorting, tile picking.',
  raycaster: 'Doom-style walls, doors and billboards.',
  'first-person': 'Mouse-look, head bob and a Rapier arena.',
  'third-person': 'Five spring-arm cameras on a Rapier arena.',
};

const GLYPH: Record<GamePerspective, IconComponent> = {
  platformer: LuFootprints,
  'top-down': LuMap,
  isometric: LuBox,
  raycaster: LuDoorOpen,
  'first-person': LuEye,
  'third-person': LuUser,
};

const CAMERA_LABEL: Record<GameCameraId, string> = {
  'over-shoulder-left': 'Over the shoulder, left',
  'over-shoulder-right': 'Over the shoulder, right',
  behind: 'Directly behind',
  'further-behind': 'Further behind',
  'much-further-behind': 'Much further behind',
};

export const perspectivesOf = (dimension: GameDimension): readonly GamePerspective[] =>
  dimension === '2d' ? GAME_PERSPECTIVES_2D : GAME_PERSPECTIVES_3D;
export const genresOf = (dimension: GameDimension): readonly GameGenre[] =>
  dimension === '2d' ? GAME_GENRES_2D : GAME_GENRES_3D;

type Props = {
  dimension: GameDimension;
  onDimension: (dimension: GameDimension) => void;
  value: string;
  onChange: (id: string) => void;
  cameras: readonly GameCameraId[];
  onCameras: (cameras: readonly GameCameraId[]) => void;
};

/**
 * The perspective × genre matrix (Phase 107 Theme K): genres down, perspectives
 * across, a "No genre" row for the bases. A cell the genre does not offer is
 * disabled with the reason; a cell whose genre module has not landed says so.
 * One tab stop, arrow keys move between cells (roving tabindex), Enter picks.
 */
export function GameGallery({ dimension, onDimension, value, onChange, cameras, onCameras }: Props) {
  const perspectives = perspectivesOf(dimension);
  const rows: (GameGenre | null)[] = [null, ...genresOf(dimension)];
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const cellKey = (r: number, c: number) => `${r}:${c}`;

  const move = (r: number, c: number, dr: number, dc: number) => {
    const nr = Math.min(rows.length - 1, Math.max(0, r + dr));
    const nc = Math.min(perspectives.length - 1, Math.max(0, c + dc));
    refs.current.get(cellKey(nr, nc))?.focus();
  };

  const [selectedGenre, selectedPerspective] = value.includes('@') ? value.split('@') : [null, value];
  // A versus genre (the fighter) has its own camera, so the third-person cycle does not apply.
  const versusPicked = selectedGenre != null && GAME_TEMPLATE_MATRIX[selectedGenre as GameGenre]?.versus === true;
  const thirdPersonPicked = selectedPerspective === 'third-person' && !versusPicked;

  return (
    <div className="flex flex-col gap-2" data-testid="game-gallery">
      <div role="radiogroup" aria-label="Dimension" className="inline-flex self-start rounded-md border border-input p-0.5 text-xs">
        {(['2d', '3d'] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={dimension === d}
            onClick={() => onDimension(d)}
            className={`rounded px-3 py-0.5 font-medium ${dimension === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {d.toUpperCase()}
          </button>
        ))}
      </div>

      <div
        role="grid"
        aria-label="Starter templates"
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `5.5rem repeat(${perspectives.length}, minmax(0, 1fr))` }}
      >
        <div role="row" className="contents">
          <span role="columnheader" aria-label="Genre" />
          {perspectives.map((p) => (
            <span key={p} role="columnheader" className="px-1 text-[11px] font-semibold text-muted-foreground">
              {PERSPECTIVE_LABEL[p]}
            </span>
          ))}
        </div>
        {rows.map((genre, r) => (
          <div key={genre ?? 'base'} role="row" className="contents">
            <span role="rowheader" className="self-center text-[11px] font-semibold text-muted-foreground">
              {genre === null ? 'No genre' : GENRE_LABEL[genre]}
            </span>
            {perspectives.map((p, c) => {
              const id = starterId(p, genre);
              const valid = isValidStarter(id);
              const available = isStarterAvailable(id);
              const selected = value === id;
              const focusable = selected || (!value && r === 0 && c === 0);
              const cell = genre === null ? null : GAME_TEMPLATE_MATRIX[genre];
              const pitch = cell ? cell.pitch : BASE_PITCH[p];
              const reason = available.ok ? null : available.reason;
              const Glyph = GLYPH[p];
              return (
                <div key={id} role="gridcell" aria-selected={selected} className="min-w-0">
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) refs.current.set(cellKey(r, c), el);
                      else refs.current.delete(cellKey(r, c));
                    }}
                    aria-label={`${genre === null ? 'No genre' : GENRE_LABEL[genre]}, ${PERSPECTIVE_LABEL[p]}`}
                    aria-disabled={!available.ok}
                    aria-pressed={selected}
                    title={reason ?? pitch}
                    tabIndex={focusable ? 0 : -1}
                    onClick={() => {
                      if (available.ok) onChange(id);
                    }}
                    onKeyDown={(event) => {
                      const step: Record<string, [number, number]> = {
                        ArrowRight: [0, 1],
                        ArrowLeft: [0, -1],
                        ArrowDown: [1, 0],
                        ArrowUp: [-1, 0],
                      };
                      const delta = step[event.key];
                      if (delta) {
                        event.preventDefault();
                        move(r, c, delta[0], delta[1]);
                      }
                    }}
                    className={`flex h-full w-full flex-col gap-1 rounded-md border p-2 text-left text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      selected
                        ? 'border-primary bg-primary/10'
                        : available.ok
                          ? 'border-input hover:bg-muted/60'
                          : valid.ok
                            ? 'cursor-not-allowed border-dashed border-input opacity-60'
                            : 'cursor-not-allowed border-transparent bg-muted/30 opacity-40'
                    }`}
                  >
                    <span className="flex h-8 items-center justify-center rounded bg-muted/60" aria-hidden>
                      <Glyph className="h-4 w-4" />
                    </span>
                    <span className="line-clamp-2 leading-tight text-muted-foreground">{reason ?? pitch}</span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {thirdPersonPicked ? (
        <fieldset className="flex flex-col gap-1 rounded-md border border-input p-2 text-xs">
          <legend className="px-1 font-medium">Cameras</legend>
          {GAME_CAMERA_IDS.map((id) => (
            <label key={id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={cameras.includes(id)}
                onChange={(event) => {
                  const next = event.target.checked ? [...cameras, id] : cameras.filter((x) => x !== id);
                  // At least one camera must stay on.
                  if (next.length > 0) onCameras(GAME_CAMERA_IDS.filter((x) => next.includes(x)));
                }}
              />
              {CAMERA_LABEL[id]}
            </label>
          ))}
        </fieldset>
      ) : null}
      {versusPicked ? (
        <p className="rounded-md border border-input p-2 text-xs text-muted-foreground" data-testid="game-gallery-versus">
          Versus camera: frames both fighters side-on, outside the five third-person cameras.
        </p>
      ) : null}
    </div>
  );
}
