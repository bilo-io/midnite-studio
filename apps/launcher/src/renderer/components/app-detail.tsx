import { useEffect, useRef } from 'react';
import type { IconType } from 'react-icons';
import { LuArrowUpRight, LuX } from 'react-icons/lu';

import { FRAME_PARTS, MODULE_FEATURE_PREFIX, type AppFeature, type LauncherApp, type LegacyBundleAppId } from '../../common/catalog';
import { replacesLine, swapOffer } from '../../common/migration';
import { MODULE_GLYPHS } from '../app-glyphs';
import { appNumber } from '../model';
import type { AppView } from '../use-apps';
import { AppIcon } from './app-icon';
import { PrimaryAction, type ActionHandlers } from './primary-action';
import { StatusPill } from './status-pill';
import { AppWordmark } from './wordmark';

type FeatureGroup = {
  id: string;
  /** The module's name, or `null` for an app with no modules (Startup, Health). */
  heading: string | null;
  moduleId: string | null;
  glyph: IconType | null;
  tagline: string | null;
  vision: string | null;
  soon: boolean;
  features: readonly AppFeature[];
};

/** One group per module — an app with no modules gets a single ungrouped list. */
export function featureGroups(app: LauncherApp): FeatureGroup[] {
  if (app.modules.length === 0) {
    return [{ id: 'features', heading: null, moduleId: null, glyph: null, tagline: null, vision: null, soon: false, features: app.features }];
  }
  return app.modules.map((m) => ({
    id: m.id,
    heading: m.name,
    moduleId: m.id,
    glyph: MODULE_GLYPHS[m.id],
    // A host's own module reads as the app; an absorbed one carries its old tagline and vision.
    tagline: m.vision === undefined ? null : m.tagline,
    vision: m.vision ?? null,
    soon: m.comingSoon === true,
    features: m.features,
  }));
}

/**
 * The full sheet for one app: the vision, its features grouped by module (each feature, and each
 * module, opens Studio straight onto it), and the shared frame it is built on.
 */
export function AppDetail({
  app,
  view,
  handlers,
  onRemoveReplaced,
  onClose,
}: {
  app: LauncherApp;
  view: AppView;
  handlers: ActionHandlers;
  /** Moves a retired app's old bundle to the Trash (offered once this host is installed). */
  onRemoveReplaced?: (id: LegacyBundleAppId) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const groups = featureGroups(app);
  const canOpen = view.state === 'installed' || view.state === 'update';
  const offer = swapOffer(view.replaces, canOpen);
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
          <span className="chip-number" data-brand={app.gradient === 'brand' || undefined}>{appNumber(app)}</span>
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
          <StatusPill state={view.state} installing={view.installing} />
          <PrimaryAction app={app} view={view} handlers={handlers} />
        </div>

        {offer !== null && (
          <section className="sheet-section sheet-swap" aria-label="Replaces an installed app">
            <h3 className="eyebrow">{replacesLine(view.replaces)}</h3>
            <p className="sheet-note">
              {offer === 'install-host'
                ? `Midnite ${app.name} now carries what ${view.replaces.map((r) => r.name).join(' and ')} did. Install it to move over; your old app keeps working until then.`
                : `Midnite ${app.name} has everything ${view.replaces.map((r) => r.name).join(' and ')} had. Your data is already here; the old app can go.`}
            </p>
            {offer === 'remove-old' &&
              view.replaces.map((r) => (
                <button key={r.id} type="button" className="btn" onClick={() => onRemoveReplaced?.(r.id)}>
                  Move Midnite {r.name} to Trash
                </button>
              ))}
          </section>
        )}

        <section className="sheet-section">
          <h3 className="eyebrow">Vision</h3>
          <p className="sheet-vision">{app.vision}</p>
        </section>

        {groups.map((group) => (
          <section key={group.id} className="sheet-section" aria-label={group.heading ? `${group.heading} module` : 'Features'}>
            <div className="module-head">
              <h3 className="eyebrow">
                {group.glyph && <group.glyph size={13} aria-hidden="true" />}
                {group.heading ?? 'Features'}
                {group.soon && <span className="module-soon">Coming soon</span>}
              </h3>
              {group.moduleId && !app.comingSoon && !group.soon && (
                <button
                  type="button"
                  className="link"
                  disabled={!canOpen}
                  onClick={() => handlers.onOpen(app, `${MODULE_FEATURE_PREFIX}${group.moduleId}`)}
                  aria-label={`Open ${group.heading} module`}
                >
                  Open module <LuArrowUpRight size={12} aria-hidden="true" />
                </button>
              )}
            </div>
            {group.tagline && <p className="module-tagline">{group.tagline}</p>}
            {group.vision && <p className="sheet-vision">{group.vision}</p>}
            <ul className="feature-list">
              {group.features.map((f) => (
                <li key={f.id} className="feature-row">
                  <span>
                    <span className="feature-label">{f.label}</span>
                    <span className="feature-blurb">{f.blurb}</span>
                  </span>
                  {!app.comingSoon && !group.soon && (
                    <button
                      type="button"
                      className="link"
                      disabled={!canOpen}
                      onClick={() => handlers.onOpen(app, f.id)}
                      aria-label={`Open ${f.label}`}
                    >
                      Open <LuArrowUpRight size={12} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="sheet-section">
          <h3 className="eyebrow">Built on the Midnite frame</h3>
          <ul className="shell-list">
            {FRAME_PARTS.map((part) => (
              <li key={part.label} title={part.blurb}>
                {part.label}
              </li>
            ))}
          </ul>
        </section>

        {app.id !== 'studio' && view.source === 'studio' && !app.comingSoon && (
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
