/**
 * A one-shot gate: true the first time `ready` is true, false before and ever after. The panel uses one per
 * renderer launch so a previous-build notice opens the session list once and never re-forces it after the
 * user closes it.
 */
export function createRevealOnce(): (ready: boolean) => boolean {
  let done = false;
  return (ready) => {
    if (!ready || done) return false;
    done = true;
    return true;
  };
}
