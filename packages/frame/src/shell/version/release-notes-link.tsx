import { LuExternalLink, LuFileText } from 'react-icons/lu';

// Its own file so the pill can import it statically while the panel (and `react-markdown`) stays behind `lazy()`.
/** A plain anchor row for the panel's `links` slot — opens in the system browser through `guardAppWindow`. */
export function ReleaseNotesLink({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={href}
      className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
    >
      <LuFileText aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {label}
      <LuExternalLink aria-hidden className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
    </a>
  );
}
