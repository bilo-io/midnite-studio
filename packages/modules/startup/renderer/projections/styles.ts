// Shared class strings for the Projections view. Panes use frame tokens so light and dark both work; the
// indigo -> purple -> pink gradient is only an accent (primary button, selected-row bar, Net-margin border, chart).
export const PANE = 'bg-card/60 backdrop-blur-md border border-border rounded-xl';
export const LABEL = 'text-xs text-muted-foreground';
export const GRADIENT = 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white';
export const GRADIENT_BORDER = 'border-2 border-transparent [background:linear-gradient(hsl(var(--card)),hsl(var(--card)))_padding-box,linear-gradient(135deg,#6366f1,#a855f7,#ec4899)_border-box]';
export const FIELD = 'rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground disabled:opacity-50';
export const BUTTON = 'rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50';
export const BUTTON_PRIMARY = `rounded-md px-2.5 py-1 text-xs font-medium ${GRADIENT} hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`;
export const ALERT = 'text-xs text-red-500';
