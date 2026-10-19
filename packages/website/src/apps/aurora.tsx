export type AuroraProps = { className?: string };

/**
 * An app's spectrum, moving: the layered background every app hero wears.
 *
 * Purely decoration (`aria-hidden`), and it paints nothing on its own: the
 * colours come from the `--app-c1` … `--app-c4` custom properties an ancestor
 * sets through `spectrumVars`, so one component serves every app. The layers
 * and their motion are `.ws-aurora*` in `styles/apps.css`, which also covers
 * reduced motion and hidden tabs.
 */
export const Aurora = ({ className = '' }: AuroraProps) => (
  <div aria-hidden="true" className={`ws-aurora ${className}`}>
    <div className="ws-aurora-sheen" />
    <div className="ws-aurora-blob ws-aurora-blob-1" />
    <div className="ws-aurora-blob ws-aurora-blob-2" />
    <div className="ws-aurora-blob ws-aurora-blob-3" />
    <div className="ws-aurora-blob ws-aurora-blob-4" />
    <div className="ws-aurora-scrim" />
  </div>
);
