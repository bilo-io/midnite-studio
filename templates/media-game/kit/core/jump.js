// @ts-check
/**
 * Midnite game kit — platformer jump feel (engine-free): coyote time, a jump
 * buffer and variable jump height. The Phaser platformer preset feeds it each
 * step and applies the velocity it returns.
 */

/**
 * @param {{ coyoteMs: number, jumpBufferMs: number, jumpVelocity: number, jumpCut: number }} config
 *   `jumpVelocity` is negative (up); `jumpCut` scales upward velocity when the
 *   button is released early (0.5 halves it).
 */
export function createJumpController(config) {
  let sinceGround = Infinity;
  let sincePressed = Infinity;
  let rising = false;

  return {
    /**
     * @param {{ dtMs: number, onGround: boolean, pressed: boolean, held: boolean, vy: number }} input
     *   `pressed` is the step the button went down; `held` is whether it still is.
     * @returns {{ vy: number, jumped: boolean }}
     */
    update({ dtMs, onGround, pressed, held, vy }) {
      sinceGround = onGround ? 0 : sinceGround + dtMs;
      sincePressed = pressed ? 0 : sincePressed + dtMs;

      // Coyote time: a jump still works just after running off a ledge.
      // Jump buffer: a press just before landing still jumps on landing.
      if (sincePressed <= config.jumpBufferMs && sinceGround <= config.coyoteMs) {
        sinceGround = Infinity;
        sincePressed = Infinity;
        rising = true;
        return { vy: config.jumpVelocity, jumped: true };
      }
      // Variable height: letting go while still rising cuts the jump short, once.
      if (rising && !held && vy < 0) {
        rising = false;
        return { vy: vy * config.jumpCut, jumped: false };
      }
      if (vy >= 0) rising = false;
      return { vy, jumped: false };
    },
  };
}
