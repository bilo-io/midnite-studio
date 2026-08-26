import { useSyncExternalStore } from 'react';

import type { AvatarState } from '../../../services/avatars';
import {
  avatarFor,
  gravatarUrl,
  hueFor,
  initialsFor,
  markAvatarMissing,
  subscribeAvatars,
} from '../../../services/avatars';

/**
 * The Phase 14 avatar, as HTML rather than SVG.
 *
 * `CommitAvatar` lives inside the graph row's `<svg>` and takes `cx`/`cy`/a
 * shared `clipPath` id — none of which mean anything in a table cell. Both read
 * the same `services/avatars` cache, so a face fetched for the graph is already
 * warm here and the two can never disagree about whether someone has a picture;
 * only the two dozen lines of geometry differ.
 */
const SERVER_SNAPSHOT: AvatarState = { status: 'pending' };

export function AuthorAvatar({
  email,
  name,
  size,
}: {
  email: string;
  name: string;
  size: number;
}) {
  const state = useSyncExternalStore(
    subscribeAvatars,
    () => avatarFor(email),
    () => SERVER_SNAPSHOT,
  );

  const hue = hueFor(email);
  const style = { width: size, height: size } as const;

  if (state.status === 'ready') {
    return (
      <img
        src={gravatarUrl(state.hash, size)}
        alt=""
        aria-hidden
        style={style}
        className="shrink-0 rounded-full object-cover"
        // `d=404` means Gravatar answers with an error rather than a default
        // image, so "this person has no picture" only ever arrives here.
        onError={() => markAvatarMissing(email)}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{
        ...style,
        backgroundColor: `hsl(${hue} 55% 45%)`,
        fontSize: Math.max(7, Math.round(size * 0.42)),
      }}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold leading-none text-white"
    >
      {initialsFor(name, email)}
    </span>
  );
}
