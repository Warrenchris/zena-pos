/**
 * Design-token contrast guard (WCAG 2.1 AA).
 *
 * Parses the CSS custom properties in src/index.css and fails if a token pairing
 * that the UI relies on drops below its required contrast ratio. This exists
 * because light-mode regressions are easy to introduce and hard to spot in review
 * (e.g. --text-muted was once 2.5:1 on white).
 */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');

/** Return the declarations inside the first rule whose selector line matches `selector`. */
const readBlock = (selector) => {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Selector not found in index.css: ${selector}`);
  const end = css.indexOf('\n}', start);
  return css.slice(start, end);
};

const readVars = (block) => {
  const vars = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})\b/g)) vars[m[1]] = m[2];
  return vars;
};

const light = readVars(readBlock(':root'));
const dark = { ...light, ...readVars(readBlock('.dark')) };

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const WHITE = '#FFFFFF';
const TEXT = 4.5; // normal text
const UI = 3.0; // UI component boundaries / graphical objects

const check = (name, vars, fg, bg, min) =>
  test(`${name}: ${fg} on ${bg} >= ${min}:1`, () => {
    const f = fg.startsWith('#') ? fg : vars[fg];
    const b = bg.startsWith('#') ? bg : vars[bg];
    expect(f).toBeDefined();
    expect(b).toBeDefined();
    expect(ratio(f, b)).toBeGreaterThanOrEqual(min);
  });

describe('light theme contrast', () => {
  const surfaces = ['--bg-app', '--bg-surface', '--bg-surface-2'];

  for (const bg of surfaces) {
    check('light', light, '--text-primary', bg, TEXT);
    check('light', light, '--text-secondary', bg, TEXT);
    check('light', light, '--text-muted', bg, TEXT);
    check('light', light, '--color-primary', bg, TEXT);
  }

  check('light', light, WHITE, '--color-primary', TEXT); // primary button label
  check('light', light, WHITE, '--color-success', TEXT); // solid success fill
  check('light', light, WHITE, '--color-danger', TEXT); // solid danger fill
  check('light', light, WHITE, '--color-info', TEXT); // solid info fill

  for (const s of ['success', 'warning', 'danger', 'info']) {
    check('light', light, `--color-${s}-text`, `--color-${s}-muted`, TEXT);
  }

  check('light', light, '--border-input', '--bg-surface', UI); // form control boundary
  check('light', light, '--border-input', '--bg-app', UI);
});

describe('dark theme contrast', () => {
  for (const bg of ['--bg-app', '--bg-surface', '--bg-surface-2']) {
    check('dark', dark, '--text-primary', bg, TEXT);
    check('dark', dark, '--text-secondary', bg, TEXT);
    check('dark', dark, '--text-muted', bg, TEXT);
  }
  for (const s of ['success', 'warning', 'danger', 'info']) {
    check('dark', dark, `--color-${s}-text`, `--color-${s}-muted`, TEXT);
  }
});

describe('token completeness', () => {
  test('every theme-switched token defined in :root is also defined in .dark', () => {
    const darkOnly = readVars(readBlock('.dark'));
    const required = [
      '--color-success', '--color-success-hover', '--color-danger', '--color-danger-hover',
      '--color-info', '--color-info-hover', '--border-input',
    ];
    for (const name of required) {
      expect(light[name]).toBeDefined();
      expect(darkOnly[name]).toBeDefined();
    }
  });
});
