/**
 * What the rig and clip panels, the timeline and the viewport overlay share while the editor is
 * open — view state, never part of the design or its undo history: the bone picked, the overlays
 * shown, and the playhead.
 */
export type RigView = {
  /** The bone picked in the outliner or the viewport. */
  bone: string | null;
  /** Draw the skeleton over the model. */
  bones: boolean;
  /** Tint vertices by the picked bone's weight. */
  weights: boolean;
  /** Pose mode: the picked bone's rotation fields key the current clip at the playhead. */
  pose: boolean;
  /** The clip the timeline plays and poses; `null` shows the rest pose. */
  clip: string | null;
  /** Playhead, seconds into the clip. */
  time: number;
  playing: boolean;
  loop: boolean;
  /** Playback-rate multiplier for the viewport only (the clip's own `speed` is part of the design). */
  speed: number;
};

export const INITIAL_RIG_VIEW: RigView = { bone: null, bones: true, weights: false, pose: false, clip: null, time: 0, playing: false, loop: true, speed: 1 };

export type UpdateRigView = (patch: Partial<RigView>) => void;

export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2] as const;
