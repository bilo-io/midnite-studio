import { UserAvatar } from '../../../components/user-avatar';

/**
 * HTML avatar for authors, delegating to the universal `UserAvatar`.
 *
 * `CommitAvatar` lives inside the graph row's `<svg>` and takes `cx`/`cy`/a
 * shared `clipPath` id — none of which mean anything in HTML surfaces. Both read
 * the same `services/avatars` cache.
 */
export function AuthorAvatar({
  email,
  name,
  size,
}: {
  email: string;
  name: string;
  size: number;
}) {
  return <UserAvatar email={email} name={name} size={size} />;
}
