// vitest/jsdom: a plain render assertion, no store/bridge/canvas involved —
// none of the browser capabilities that would force this into Playwright.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { KnowledgeView } from './knowledge-view';

describe('KnowledgeView', () => {
  afterEach(cleanup);

  it('renders a placeholder naming the view (Theme A/B/D/E/F land the real canvas)', () => {
    render(<KnowledgeView />);
    expect(screen.getByText('Knowledge')).toBeDefined();
  });
});
