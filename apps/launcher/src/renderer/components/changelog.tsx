import { useEffect, useState } from 'react';

import type { ChangelogResult, ChangelogSection } from '../../common/bridge';
import { getBridge } from '../bridge';

/** Latest changelog sections, fetched once on mount. `null` while loading. */
export function useChangelog(enabled: boolean): ChangelogResult | null {
  const [result, setResult] = useState<ChangelogResult | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    getBridge()
      .changelog.latest()
      .then((r) => live && setResult(r))
      .catch(() => live && setResult({ sections: [], error: 'Could not load the changelog.' }));
    return () => {
      live = false;
    };
  }, [enabled]);
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
        <p className="sheet-note">{result.error ?? 'No published release notes yet.'}</p>
      ) : (
        result.sections.map((s) => <Section key={s.version} section={s} />)
      )}
      <button type="button" className="link" onClick={onFull}>
        View full changelog ↗
      </button>
    </div>
  );
}
