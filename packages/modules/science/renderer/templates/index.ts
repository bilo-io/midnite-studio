import type { ScienceCell, ScienceDiscipline } from '@midnite/studio-shared';

export type ScienceTemplate = {
  id: string;
  title: string;
  discipline: ScienceDiscipline;
  blurb: string;
  cells: ScienceCell[];
};

const md = (n: number, source: string): ScienceCell => ({ kind: 'markdown', id: `c-tpl${String(n).padStart(5, '0')}`, source });
const calc = (n: number, source: string): ScienceCell => ({ kind: 'compute', id: `c-tpl${String(n).padStart(5, '0')}`, source });
const plot = (n: number, series: { expr: string; label?: string }[], x: { min: number; max: number }): ScienceCell => ({
  kind: 'plot',
  id: `c-tpl${String(n).padStart(5, '0')}`,
  series,
  x,
  y: 'auto',
});

/**
 * The built-in starter notebooks (Phase 126 Theme G.1). Cell ids here are placeholders: "Use template" mints fresh
 * ones. `templates.test.ts` holds that every cell parses and every compute cell evaluates without error.
 */
export const SCIENCE_TEMPLATES: readonly ScienceTemplate[] = [
  {
    id: 'function-explorer',
    title: 'Function explorer',
    discipline: 'maths',
    blurb: 'Plot a few functions together and evaluate one at a point.',
    cells: [
      md(1, '# Function explorer\n\nEdit the series below. A plot can use any variable defined in a calculation cell.'),
      plot(2, [{ expr: 'sin(x)' }, { expr: 'x^2 / 10', label: 'x^2 / 10' }, { expr: 'cos(2 x)' }], { min: -6.28, max: 6.28 }),
      calc(3, 'f(x) = x^2 - 3 x + 2\nf(3)'),
    ],
  },
  {
    id: 'linear-algebra',
    title: 'Linear algebra basics',
    discipline: 'maths',
    blurb: 'Determinant, inverse and a matrix-vector product.',
    cells: [
      md(1, '# Linear algebra\n\nFor $A x = b$, the solution is $x = A^{-1} b$.'),
      calc(2, 'A = [1, 2; 3, 4]\ndet(A)'),
      calc(3, 'inv(A)'),
      calc(4, 'b = [5; 6]\nx = lusolve(A, b)\nA * x'),
    ],
  },
  {
    id: 'kinematics',
    title: 'Kinematics',
    discipline: 'physics',
    blurb: 'Constant acceleration with units: v = u + a t.',
    cells: [
      md(1, '# Kinematics\n\nConstant acceleration: $v = u + a t$ and $s = u t + \\tfrac12 a t^2$.'),
      calc(2, 'u = 5 m/s\na = 2 m/s^2\nt = 4 s'),
      calc(3, 'v = u + a * t'),
      calc(4, 's = u * t + 0.5 * a * t^2'),
    ],
  },
  {
    id: 'projectile-range',
    title: 'Projectile range plot',
    discipline: 'physics',
    blurb: 'Range against launch angle for a fixed speed.',
    cells: [
      md(1, '# Projectile range\n\n$R = \\dfrac{v_0^2 \\sin 2\\theta}{g}$, plotted for launch angles from 0 to 90 degrees.'),
      calc(2, 'v0 = 20\ng = 9.81\nR45 = v0^2 * sin(2 * 45 deg) / g'),
      plot(3, [{ expr: 'v0^2 * sin(2 * x * pi / 180) / g', label: 'range (m)' }], { min: 0, max: 90 }),
    ],
  },
  {
    id: 'ideal-gas',
    title: 'Ideal gas law',
    discipline: 'chemistry',
    blurb: 'P V = n R T in SI units, with the answer in kPa.',
    cells: [
      md(1, '# Ideal gas law\n\n$P V = n R T$.'),
      calc(2, 'R = 8.314 J / (mol K)\nn = 1 mol\nT = 300 K\nV = 0.0248 m^3'),
      calc(3, 'P = n * R * T / V\nP to kPa'),
    ],
  },
  {
    id: 'stoichiometry',
    title: 'Stoichiometry',
    discipline: 'chemistry',
    blurb: 'Moles from mass for 2 H2 + O2 -> 2 H2O.',
    cells: [
      md(1, '# Stoichiometry\n\n$2\\,\\mathrm{H_2} + \\mathrm{O_2} \\to 2\\,\\mathrm{H_2O}$.'),
      calc(2, 'M_water = 18.015 g / mol\nm_water = 36 g\nn_water = m_water / M_water'),
      calc(3, 'n_oxygen = n_water / 2'),
    ],
  },
  {
    id: 'logistic-growth',
    title: 'Logistic population growth',
    discipline: 'biology',
    blurb: 'A population approaching its carrying capacity.',
    cells: [
      md(1, '# Logistic growth\n\n$N(t) = \\dfrac{K}{1 + \\frac{K - N_0}{N_0} e^{-r t}}$.'),
      calc(2, 'K = 100\nN0 = 5\nr = 0.4'),
      plot(3, [{ expr: 'K / (1 + ((K - N0) / N0) * e^(-r * x))', label: 'N(t)' }], { min: 0, max: 30 }),
    ],
  },
];
