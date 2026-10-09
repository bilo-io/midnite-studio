/** Labels, blurbs and glyphs for the new-game wizard's perspective and genre cards. */
import {
  GAME_GENRES_2D,
  GAME_GENRES_3D,
  GAME_PERSPECTIVES_2D,
  GAME_PERSPECTIVES_3D,
  type GameCameraId,
  type GameDimension,
  type GameGenre,
  type GamePerspective,
} from '@midnite/studio-shared';
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

export const BASE_PITCH: Record<GamePerspective, string> = {
  platformer: 'Run and jump: coyote time, jump buffer, one-way ledges.',
  'top-down': 'Eight-direction movement and facing.',
  isometric: 'Diamond tiles, depth sorting, tile picking.',
  raycaster: 'Doom-style walls, doors and billboards.',
  'first-person': 'Mouse-look, head bob and a Rapier arena.',
  'third-person': 'Five spring-arm cameras on a Rapier arena.',
};

export const GLYPH: Record<GamePerspective, IconComponent> = {
  platformer: LuFootprints,
  'top-down': LuMap,
  isometric: LuBox,
  raycaster: LuDoorOpen,
  'first-person': LuEye,
  'third-person': LuUser,
};

export const CAMERA_LABEL: Record<GameCameraId, string> = {
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
