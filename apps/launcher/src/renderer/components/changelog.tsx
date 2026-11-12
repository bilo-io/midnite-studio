import { useEffect, useState } from 'react';

import { CHANGELOG_APP_IDS, type ChangelogAppId } from '@midnite/studio-shared/release';

import type { ChangelogResult, ChangelogSection } from '../../common/bridge';
import { getBridge } from '../bridge';

/** A catalog id as a changelog app id, or `null` for ids with no changelog (retired apps, modules). */
export function changelogAppOf(id: string): ChangelogAppId | null {
  return (CHANGELOG_APP_IDS as readonly string[]).includes(id) ? (id as ChangelogAppId) : null;
}

/**
 * Latest changelog sections for one app, fetched when `app` is set. `null` while loading, and for
 * `app === null` (nothing is fetched); a changed `app` resets to loading and drops a late answer
 * for the previous one.
 */
export function useChangelog(app: ChangelogAppId | null): ChangelogResult | null {
  const [result, setResult] = useState<ChangelogResult | null>(null);
  useEffect(() => {
    setResult(null);
    if (app === null) return;
    let live = true;
    getBridge()
      .changelog.latest(app)
      .then((r) => live && setResult(r))
      .catch(() => live && setResult({ sections: [], error: 'Could not load the changelog.' }));
    return () => {
      live = false;
    };
  }, [app]);
  return result;
}

/** Strips the inline markdown a changelog line carries; the launcher renders structure, not markdown. */
function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1');
}

type Block = { kind: 'heading' | 'item' | 'text'; text: string };

/** Keep-a-Changelog body to flat blocks: `### Added` headings, `- ` items, everything else prose. */
export function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line === '' || /^(```|~~~)/.test(line)) continue;
    const heading = /^#{3,6}\s+(.*)$/.exec(line);
    const item = /^[-*+]\s+(.*)$/.exec(line);
    if (heading) blocks.push({ kind: 'heading', text: plain(heading[1] ?? '') });
    else if (item) blocks.push({ kind: 'item', text: plain(item[1] ?? '') });
    else blocks.push({ kind: 'text', text: plain(line) });
  }
  return blocks;
}

function Section({ section }: { section: ChangelogSection }) {
  const blocks = parseBody(section.body);
  return (
    <article className="changelog-section">
      <h4 className="changelog-version">
        v{section.version}
        {section.date && <span className="changelog-date">{section.date}</span>}
      </h4>
      {blocks.map((b, i) =>
        b.kind === 'heading' ? (
          <h5 key={i} className="changelog-kind">{b.text}</h5>
        ) : b.kind === 'item' ? (
          <p key={i} className="changelog-item">{b.text}</p>
        ) : (
          <p key={i} className="sheet-note">{b.text}</p>
        ),
      )}
    </article>
  );
}

/** The partial changelog: latest sections, a loading line, or a quiet failure. */
export function ChangelogList({ result, onFull }: { result: ChangelogResult | null; onFull: () => void }) {
  return (
    <div className="changelog" data-testid="changelog">
      {result === null ? (
        <p className="sheet-note">Loading…</p>
      ) : result.sections.length === 0 ? (
        <p className="sheet-note">{result.error ?? 'No release notes published yet.'}</p>
      ) : (
        result.sections.map((s) => <Section key={s.version} section={s} />)
      )}
      <button type="button" className="link" onClick={onFull}>
        View full changelog ↗
      </button>
    </div>
  );
}
