import type { ReactNode } from 'react';

const TONE: Record<'warning' | 'info', string> = {
  warning: 'border-amber-500/20 bg-amber-500/5 text-amber-200',
  info: 'border-border/40 bg-muted/20 text-muted-foreground',
};

/** The one shell every docked terminal-panel notice shares, so stacked notices match in size. */
export function PanelNotice(props: {
  tone: 'warning' | 'info';
  role: 'alert' | 'status';
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  const { tone, role, testId, className, children } = props;
  return (
    <div
      role={role}
      data-testid={testId}
      data-panel-notice
      className={`shrink-0 border-t px-2 py-2 text-xs ${TONE[tone]}${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  );
}
