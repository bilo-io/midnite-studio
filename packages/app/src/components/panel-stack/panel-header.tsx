import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

import { IconButton } from '../icon-button';
import type { PanelHistory } from './use-panel-history';

/**
 * Back/forward chevrons and a clickable breadcrumb trail for a
 * `PanelHistory` (Phase 42 Theme A/B).
 *
 * A crumb click is `back()` repeated, not a direct index write — the
 * forward tail behaves identically however the current entry was reached,
 * matching `PanelStack`'s own directional model.
 */
export function PanelHeader<T>({
  history,
  label,
  className,
}: {
  history: PanelHistory<T>;
  /** Renders one entry's breadcrumb label. */
  label: (entry: T) => string;
  className?: string;
}) {
  const goToCrumb = (targetIndex: number): void => {
    const steps = history.index - targetIndex;
    for (let i = 0; i < steps; i += 1) history.back();
  };

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <IconButton icon={LuChevronLeft} label="Back" disabled={!history.canGoBack} onClick={() => history.back()} />
      <IconButton
        icon={LuChevronRight}
        label="Forward"
        disabled={!history.canGoForward}
        onClick={() => history.forward()}
      />
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs">
        {history.entries.map((entry, index) => (
          <span key={index} className="flex shrink-0 items-center gap-1">
            {index > 0 ? <span className="text-muted-foreground">/</span> : null}
            {index === history.index ? (
              <span className="truncate font-medium text-foreground">{label(entry)}</span>
            ) : (
              <button
                type="button"
                onClick={() => goToCrumb(index)}
                className="truncate text-muted-foreground hover:text-foreground hover:underline"
              >
                {label(entry)}
              </button>
            )}
          </span>
        ))}
      </nav>
    </div>
  );
}
