// A genre's systems module replaces this file (Themes H-J). The base calls
// `installGenre(scene, ctx)` once its level exists; with no genre it does nothing.
export function installGenre(_scene, _ctx) {
  return { update() {}, state: () => ({}) };
}
