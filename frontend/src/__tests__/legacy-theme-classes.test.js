/**
 * Guards files that have been migrated to semantic design tokens against
 * regressing to the legacy dark-theme palette.
 *
 * Background: `brand-black` resolves to --bg-surface (white in light mode), so
 * classes like `bg-brand-black text-gray-100` render near-white on white.
 *
 * When you migrate another file, add it to MIGRATED below.
 * Modal backdrops (bg-black at 50–80% opacity) are intentionally allowed.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');

const MIGRATED = [
  'pages/CreateProduct.jsx',
  'pages/Categories.jsx',
  'pages/Expenses.jsx',
  'components/EmployeeDetailsCard.jsx',
  'components/CustomerDetailsCard.jsx',
  'components/DateRangePicker.jsx',
  'components/expenses/DeleteConfirmModal.jsx',
  'components/expenses/ExpenseAnalytics.jsx',
  'components/expenses/ExpenseFilters.jsx',
  'components/expenses/ExpenseFormModal.jsx',
  'components/expenses/ExpenseTable.jsx',
  'components/expenses/ExportButtons.jsx',
];

const LEGACY = [
  [/\b(?:bg|text|border|ring|from|to|via|divide|placeholder)-brand-[A-Za-z]+/, 'legacy brand-* alias'],
  [/\b(?:text|bg|border|divide)-(?:gray|neutral|slate|zinc)-\d{2,3}\b/, 'hardcoded gray scale'],
  [/\b(?:text|bg|border|divide|ring)-yellow-\d{2,3}\b/, 'hardcoded yellow scale'],
  [/\b(?:bg|border|divide|text|placeholder)-white\/\d+/, 'translucent white (dark-theme only)'],
  [/\bbg-black(?!\/(?:50|60|70|75|80)\b)/, 'bg-black that is not a modal backdrop'],
  [/\btext-black\b/, 'text-black'],
];

describe.each(MIGRATED)('%s', (file) => {
  const source = fs.readFileSync(path.join(SRC, file), 'utf8');

  test.each(LEGACY)('has no %s', (pattern, label) => {
    const hits = source
      .split(/\r?\n/)
      .map((line, i) => ({ line: i + 1, text: line }))
      .filter(({ text }) => pattern.test(text))
      .map(({ line, text }) => `${file}:${line}  ${text.trim().slice(0, 120)}`);
    expect({ label, hits }).toEqual({ label, hits: [] });
  });
});
