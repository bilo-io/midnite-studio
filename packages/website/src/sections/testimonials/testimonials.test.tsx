import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import raw from './testimonials.json';
import {
  parseTestimonials,
  SOURCES,
  TESTIMONIALS_PATH,
  type Testimonial,
} from './testimonial';
import { TESTIMONIALS, Testimonials } from './testimonials';

const FIXTURE: readonly Testimonial[] = [
  {
    quote: 'A fixture, not a testimonial — this string exists only in this test file.',
    name: 'Fixture One',
    role: 'Test fixture',
    source: 'slack',
    screenshot: 'img/testimonials/fixture.png',
  },
  {
    quote: 'A second fixture, so the carousel has something to page through.',
    name: 'Fixture Two',
    role: 'Test fixture',
  },
];

describe('testimonials.json', () => {
  /**
   * The build guard. This is the one assertion in the suite that is about
   * *policy* rather than behaviour: the shipped file must be empty, because a
   * quote nobody said is the failure mode this whole section is shaped around.
   * If a real quote is ever added, this test is what tells whoever adds it to
   * come here and say so deliberately.
   */
  it('ships empty, so the site never carries a quote nobody said', () => {
    expect(raw).toEqual([]);
    expect(TESTIMONIALS).toHaveLength(0);
  });
});

describe('parseTestimonials', () => {
  it('reads a well-formed entry', () => {
    expect(
      parseTestimonials([
        { quote: 'q', name: 'n', role: 'r', source: 'github', screenshot: 'img/a.png' },
      ]),
    ).toEqual([
      { quote: 'q', name: 'n', role: 'r', source: 'github', screenshot: 'img/a.png' },
    ]);
  });

  it('accepts every declared source', () => {
    for (const source of SOURCES) {
      expect(parseTestimonials([{ quote: 'q', name: 'n', role: 'r', source }])[0]?.source).toBe(
        source,
      );
    }
  });

  it('drops an entry missing any of quote, name or role', () => {
    expect(
      parseTestimonials([
        { name: 'n', role: 'r' },
        { quote: 'q', role: 'r' },
        { quote: 'q', name: 'n' },
        { quote: '   ', name: 'n', role: 'r' },
      ]),
    ).toEqual([]);
  });

  it('drops an unknown source rather than the whole entry', () => {
    const [entry] = parseTestimonials([
      { quote: 'q', name: 'n', role: 'r', source: 'carrier-pigeon' },
    ]);
    expect(entry?.quote).toBe('q');
    expect(entry?.source).toBeUndefined();
  });

  it('survives anything that is not an array of objects', () => {
    expect(parseTestimonials(null)).toEqual([]);
    expect(parseTestimonials('nope')).toEqual([]);
    expect(parseTestimonials([null, 7, 'x'])).toEqual([]);
  });

  it('invents nothing — no default name, no sample quote', () => {
    expect(parseTestimonials([{}])).toEqual([]);
  });
});

describe('Testimonials', () => {
  it('renders the empty state when the JSON is empty', () => {
    render(<Testimonials testimonials={[]} />);
    expect(screen.getByTestId('testimonials-empty')).toBeTruthy();
    expect(screen.queryByTestId('testimonials-carousel')).toBeNull();
  });

  it('names the file and the schema in the empty state', () => {
    render(<Testimonials testimonials={[]} />);
    // Whoever has the first quote in hand should not have to find a type
    // definition to add it, so the path and the field names are on the page.
    expect(screen.getAllByText(TESTIMONIALS_PATH).length).toBeGreaterThan(0);
    const empty = screen.getByTestId('testimonials-empty');
    for (const field of ['quote', 'name', 'role', 'avatar', 'source', 'screenshot']) {
      expect(empty.textContent, field).toContain(`"${field}"`);
    }
    expect(screen.getAllByText('Add a testimonial')).toHaveLength(3);
  });

  it('renders the cards when entries are passed', () => {
    render(<Testimonials testimonials={FIXTURE} />);
    expect(screen.getByTestId('testimonials-carousel')).toBeTruthy();
    expect(screen.queryByTestId('testimonials-empty')).toBeNull();
    for (const entry of FIXTURE) {
      expect(screen.getByText(entry.quote)).toBeTruthy();
      expect(screen.getByText(entry.name)).toBeTruthy();
    }
  });

  it('frames a screenshot with its source, and resolves the path through the base', () => {
    render(<Testimonials testimonials={FIXTURE} />);
    const shot = screen.getByAltText('The original message from Fixture One');
    expect(shot.getAttribute('src')).toBe('/img/testimonials/fixture.png');
    // The frame's title bar names the channel, which is what makes the image
    // read as a screenshot rather than as a design element.
    expect(screen.getByText('Slack')).toBeTruthy();
  });

  it('offers the carousel arrows only when there is more than one card', () => {
    render(<Testimonials testimonials={FIXTURE} />);
    expect(screen.getByLabelText('Next testimonial')).toBeTruthy();

    const single = FIXTURE.slice(0, 1);
    render(<Testimonials testimonials={single} />);
    // Two renders are live now; the single-card one is the second, so the count
    // is 1 rather than 0 — a control that cannot do anything is not drawn.
    expect(screen.getAllByLabelText('Next testimonial')).toHaveLength(1);
  });
});
