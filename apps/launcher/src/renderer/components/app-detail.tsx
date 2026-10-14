import { useEffect, useRef } from 'react';
import { LuArrowUpRight, LuX } from 'react-icons/lu';

import { SHELL_PARTS, type LauncherApp } from '../../common/catalog';
import { appNumber } from '../model';
import type { StudioController } from '../use-studio';
import { AppIcon } from './app-icon';
import { PrimaryAction, type ActionHandlers } from './primary-action';
import { StatusPill } from './status-pill';
import { AppWordmark } from './wordmark';

/**
 * The full sheet for one app: the vision, every feature (each one opens Studio
 * straight onto it), and the shared shell it is built on.
 */
export function AppDetail({
  app,
  studio,
  handlers,
  onClose,
}: {
  app: LauncherApp;
  studio: StudioController;
  handlers: ActionHandlers;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const canOpen = studio.state === 'installed' || studio.state === 'update';
  const homeFeature = app.features.find((f) => JSON.stringify(f.target) === JSON.stringify(app.home));

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Midnite ${app.name}`}
        style={{ ['--accent' as string]: app.accent }}
      >
        <header className="sheet-head">
          <span className="chip-number">{appNumber(app)}</span>
          <button ref={closeRef} type="button" className="btn btn-icon" aria-label="Close" onClick={onClose}>
            <LuX size={16} />
          </button>
        </header>

        <div className="sheet-hero">
          <AppIcon app={app} size={72} />
          <div>
            <h2 className="sheet-title">
              <AppWordmark app={app} />
            </h2>
            <p className="tile-tagline">{app.tagline}</p>
            <p className="tile-like">{app.like}</p>
          </div>
        </div>

        <div className="sheet-actions">
          <StatusPill state={studio.state} installing={studio.installing} />
          <PrimaryAction app={app} studio={studio} handlers={handlers} />
        </div>

        <section className="sheet-section">
          <h3 className="eyebrow">Vision</h3>
          <p className="sheet-vision">{app.vision}</p>
        </section>

        <section className="sheet-section">
          <h3 className="eyebrow">Features</h3>
          <ul className="feature-list">
            {app.features.map((f) => (
              <li key={f.id} className="feature-row">
                <span>
                  <span className="feature-label">{f.label}</span>
                  <span className="feature-blurb">{f.blurb}</span>
                </span>
                <button
                  type="button"
                  className="link"
                  disabled={!canOpen}
                  onClick={() => handlers.onOpen(app, f.id)}
                  aria-label={`Open ${f.label}`}
                >
                  Open <LuArrowUpRight size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="sheet-section">
          <h3 className="eyebrow">Built on the Midnite shell</h3>
          <ul className="shell-list">
            {SHELL_PARTS.map((part) => (
              <li key={part.label} title={part.blurb}>
                {part.label}
              </li>
            ))}
          </ul>
        </section>

        {app.id !== 'studio' && (
          <p className="sheet-note">
            Midnite {app.name} runs inside Midnite Studio for now. Open lands on
            {homeFeature ? ` ${homeFeature.label}` : ' its home'} in Studio; once Midnite {app.name} ships on its
            own, this tile installs it directly.
          </p>
        )}
      </aside>
    </div>
  );
}
