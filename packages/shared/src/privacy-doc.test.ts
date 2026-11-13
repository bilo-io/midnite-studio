import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EGRESS_ENTRIES } from './egress';
import { renderPrivacyDoc } from './privacy-doc';

/** `docs/PRIVACY.md` is generated from the egress registry. `PRIVACY_DOC_WRITE=1` (via `moon run root:privacy-doc`) rewrites it. */
const DOC = join(__dirname, '..', '..', '..', 'docs', 'PRIVACY.md');

describe('docs/PRIVACY.md', () => {
  it('is what the registry renders (run `moon run root:privacy-doc` after changing it)', () => {
    const rendered = renderPrivacyDoc();
    if (process.env['PRIVACY_DOC_WRITE'] === '1') writeFileSync(DOC, rendered);
    expect(readFileSync(DOC, 'utf8')).toBe(rendered);
  });

  it('lists every registry host and changes when an entry is added', () => {
    const rendered = renderPrivacyDoc();
    for (const e of EGRESS_ENTRIES.filter((x) => x.host !== '*')) expect(rendered).toContain(`\`${e.host}\``);
    const extra = { host: 'new.example.test', owner: 'x', sends: 'a thing', trigger: 'user' as const };
    expect(renderPrivacyDoc([...EGRESS_ENTRIES, extra])).not.toBe(rendered);
    expect(renderPrivacyDoc([...EGRESS_ENTRIES, extra])).toContain('`new.example.test`');
  });
});
