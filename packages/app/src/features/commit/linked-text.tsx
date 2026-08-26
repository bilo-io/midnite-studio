import { Fragment } from 'react';

import { ExternalLink } from '../markdown/external-link';
import { segment } from './linkify';

/**
 * Plain text with its references linked — the non-markdown path.
 *
 * A trailer value is not prose: `Co-Authored-By: Someone <s@example.com>` has no
 * markdown in it, and running it through `react-markdown` would misread the
 * angle brackets as an HTML tag and swallow the address entirely. So the same
 * pure matcher is applied directly, without a markdown pass in front of it.
 *
 * Shas are rendered as text here rather than as controls: a trailer that names
 * one is naming provenance ("cherry picked from commit …"), and the destination
 * is already reachable from the message body above.
 */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {segment(text).map((seg, index) => {
        const key = `${index}-${seg.kind}`;
        switch (seg.kind) {
          case 'url':
            return (
              <ExternalLink key={key} href={seg.href}>
                {seg.value}
              </ExternalLink>
            );
          case 'email':
            return (
              <ExternalLink key={key} href={`mailto:${seg.address}`}>
                {seg.value}
              </ExternalLink>
            );
          default:
            return <Fragment key={key}>{seg.value}</Fragment>;
        }
      })}
    </>
  );
}
