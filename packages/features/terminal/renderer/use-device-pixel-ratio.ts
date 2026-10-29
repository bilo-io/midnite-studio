import { useEffect, useState } from 'react';

/**
 * The current `devicePixelRatio`, kept live (Phase 51 Theme A).
 *
 * There is no `change` event on `devicePixelRatio` itself — the standard
 * idiom is `matchMedia(`(resolution: ${dpr}dppx)`)`, whose `change` fires
 * once the actual ratio no longer matches the one baked into the query
 * string. That also means the query is single-use: after it fires, it keeps
 * matching the *old* ratio forever, so each change tears the listener down
 * and re-arms a fresh query built from the new ratio, not just re-reads the
 * same one.
 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio);

  useEffect(() => {
    const media = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDpr(window.devicePixelRatio);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [dpr]);

  return dpr;
}
