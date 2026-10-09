import { LuRotateCw } from 'react-icons/lu';
import { Tooltip } from '../../components/tooltip';
import { UserAvatar } from '../../components/user-avatar';
import { Spinner } from '../../components/skeleton';
import { REVIEWER_CONFIG, type AssignedReviewer } from './reviewer-status';

export function ReviewerAvatars({
  reviewers,
  onReRequest,
  reRequestingLogin,
  busy,
  enabled,
}: {
  reviewers: AssignedReviewer[];
  onReRequest: (login: string) => void;
  reRequestingLogin: string | null;
  busy: boolean;
  enabled: boolean;
}) {
  if (reviewers.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Assigned reviewers"
    >
      {reviewers.map((reviewer) => {
        const config = REVIEWER_CONFIG[reviewer.state];
        const BadgeIcon = config.BadgeIcon;
        const isPending = busy && reRequestingLogin === reviewer.login;

        return (
          <div
            key={reviewer.login}
            data-testid={`reviewer-${reviewer.login}`}
            className="group/reviewer flex items-center gap-1"
          >
            <Tooltip label={`${reviewer.login} (${reviewer.stateLabel})`}>
              <div
                tabIndex={0}
                data-testid={`reviewer-avatar-${reviewer.login}`}
                aria-label={`${reviewer.login} — ${reviewer.stateLabel}`}
                className="relative inline-flex shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <UserAvatar
                  login={reviewer.login}
                  size={22}
                  withTooltip={false}
                  className={`border-2 ${config.borderColor}`}
                />
                <span
                  aria-hidden
                  className={`absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background ring-1 ring-background border ${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`}
                >
                  <BadgeIcon className="h-2 w-2" />
                </span>
              </div>
            </Tooltip>

            <Tooltip label={`Re-request a review from ${reviewer.login}`}>
              <button
                type="button"
                aria-label={`Re-request a review from ${reviewer.login}`}
                title={`Re-request a review from ${reviewer.login}`}
                disabled={!enabled || busy}
                onClick={() => onReRequest(reviewer.login)}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? (
                  <Spinner className="h-2.5 w-2.5 border-primary-foreground/30 border-r-primary border-t-primary" />
                ) : (
                  <LuRotateCw className="h-3 w-3 transition-transform group-hover/reviewer:rotate-45" />
                )}
              </button>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
