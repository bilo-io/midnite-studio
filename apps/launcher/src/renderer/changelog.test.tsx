// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChangelogList, parseBody } from './components/changelog';

afterEach(cleanup);

describe('parseBody', () => {
  it('splits headings, items and prose and strips inline markdown', () => {
    expect(parseBody('### Added\n\n- A **bold** `thing` [link](http://x)\nSome prose')).toEqual([
      { kind: 'heading', text: 'Added' },
      { kind: 'item', text: 'A bold thing link' },
      { kind: 'text', text: 'Some prose' },
    ]);
  });
});

describe('ChangelogList', () => {
  const noop = () => undefined;
  it('renders each section with its date', () => {
    render(
      <ChangelogList
        result={{ sections: [{ version: '1.0.0', date: '2026-01-01', body: '- one' }], error: null }}
        onFull={noop}
      />,
    );
    expect(screen.getByText('v1.0.0')).not.toBeNull();
    expect(screen.getByText('one')).not.toBeNull();
    expect(screen.getByText('View full changelog ↗')).not.toBeNull();
  });
  it('shows the failure quietly and keeps the full-changelog link', () => {
    render(<ChangelogList result={{ sections: [], error: 'offline' }} onFull={noop} />);
    expect(screen.getByText('offline')).not.toBeNull();
    expect(screen.getByText('View full changelog ↗')).not.toBeNull();
  });
});
