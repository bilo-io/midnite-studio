import { useState, useSyncExternalStore, type ReactNode } from 'react';

import type { AvatarState } from '../services/avatars';
import {
  avatarFor,
  gravatarUrl,
  hueFor,
  initialsFor,
  markAvatarMissing,
  subscribeAvatars,
} from '../services/avatars';
import { Tooltip } from './tooltip';

const SERVER_SNAPSHOT: AvatarState = { status: 'pending' };

export interface UserAvatarProps {
  /** GitHub username/login */
  login?: string | null;
  /** Display name or Git author/committer name */
  name?: string | null;
  /** Email address (used for Gravatar lookup when present) */
  email?: string | null;
  /** Avatar diameter in pixels (default 16) */
  size?: number;
  /** Extra CSS classes for the avatar container/image */
  className?: string;
  /** Whether to wrap in a Tooltip showing the user's details (default true) */
  withTooltip?: boolean;
  /** Tooltip position ('top' | 'bottom' | 'right', default 'top') */
  tooltipSide?: 'top' | 'bottom' | 'right';
  /** Optional custom detail text/element to include in the tooltip (e.g. role or date) */
  detail?: ReactNode;
}

/**
 * Universal user avatar component for Git and forge surfaces.
 *
 * Supports:
 * - GitHub users (by login): fetches `https://github.com/<login>.png`, falling back to initials.
 * - Git identities (by email): uses Gravatar via `services/avatars`, falling back to initials.
 * - Named identities with neither: renders initials using a deterministic hue.
 * - An integrated `Tooltip` presenting the user's name, handle, email, and contextual details.
 */
export function UserAvatar({
  login,
  name,
  email,
  size = 16,
  className = '',
  withTooltip = true,
  tooltipSide = 'top',
  detail,
}: UserAvatarProps) {
  const cleanLogin = login?.trim() || null;
  const cleanEmail = email?.trim() || null;
  const cleanName = name?.trim() || null;

  const [githubImgFailed, setGithubImgFailed] = useState(false);

  // Email-based Gravatar state (only queried when email is available and no login is active)
  const gravatarState = useSyncExternalStore(
    subscribeAvatars,
    () => (cleanEmail ? avatarFor(cleanEmail) : SERVER_SNAPSHOT),
    () => SERVER_SNAPSHOT,
  );

  const style = { width: size, height: size } as const;
  const hueKey = cleanEmail || cleanLogin || cleanName || '?';
  const hue = hueFor(hueKey);
  const initials = initialsFor(cleanName || cleanLogin || '?', cleanEmail || cleanLogin || '');

  let avatarElement: ReactNode;

  if (cleanLogin && !githubImgFailed) {
    avatarElement = (
      <img
        src={`https://github.com/${cleanLogin}.png?size=${Math.round(size * 2)}`}
        alt={cleanName || cleanLogin || ''}
        style={style}
        className={`shrink-0 rounded-full object-cover ${className}`}
        onError={() => setGithubImgFailed(true)}
      />
    );
  } else if (cleanEmail && gravatarState.status === 'ready') {
    avatarElement = (
      <img
        src={gravatarUrl(gravatarState.hash, size)}
        alt={cleanName || cleanEmail || ''}
        style={style}
        className={`shrink-0 rounded-full object-cover ${className}`}
        onError={() => markAvatarMissing(cleanEmail)}
      />
    );
  } else {
    avatarElement = (
      <span
        aria-hidden
        style={{
          ...style,
          backgroundColor: `hsl(${hue} 55% 45%)`,
          fontSize: Math.max(7, Math.round(size * 0.42)),
        }}
        className={`flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none text-white ${className}`}
      >
        {initials}
      </span>
    );
  }

  const hasIdentity = cleanLogin || cleanName || cleanEmail;
  if (!withTooltip || !hasIdentity) {
    return <span className="inline-flex shrink-0 items-center justify-center">{avatarElement}</span>;
  }

  const tooltipLabel = (
    <span className="block max-w-xs text-xs leading-snug">
      {cleanName && cleanLogin ? (
        <>
          <span className="block font-medium">{cleanName}</span>
          <span className="block text-muted-foreground">@{cleanLogin}</span>
        </>
      ) : cleanLogin ? (
        <span className="block font-medium">@{cleanLogin}</span>
      ) : cleanName ? (
        <span className="block font-medium">{cleanName}</span>
      ) : null}
      {cleanEmail && cleanEmail !== cleanName && (
        <span className="block text-muted-foreground">{cleanEmail}</span>
      )}
      {detail ? (
        <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{detail}</span>
      ) : null}
    </span>
  );

  return (
    <Tooltip label={tooltipLabel} side={tooltipSide}>
      <span className="inline-flex shrink-0 items-center justify-center">{avatarElement}</span>
    </Tooltip>
  );
}
