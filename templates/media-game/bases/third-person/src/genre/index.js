// A genre's systems module replaces this file (Themes H-J). The base calls
// `installGenre(scene, ctx)` once its level exists; with no genre it does nothing.
// Optionally the returned object has `intent(wish, dt, frame)`, which may reshape
// the player's movement for the step (rolls, rooted attacks, lock-on facing).
export function installGenre(_scene, _ctx) {
  return { update() {}, state: () => ({}) };
}
