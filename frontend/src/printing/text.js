/**
 * Text helpers for fixed-width (thermal printer) output.
 *
 * Thermal printers use a small single-byte code page. We only emit printable
 * ASCII so receipts look the same on every printer, whatever its code page.
 */

const REPLACEMENTS = {
  '\u20A6': 'N', // ₦
  '\u20B5': 'C', // ₵
  '\u20AC': 'EUR',
  '\u00A3': 'GBP',
  '\u2013': '-',
  '\u2014': '-',
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u2026': '...',
  '\u00D7': 'x',
};

/** Convert any value to single-line printable ASCII. */
export function toPrinterText(input) {
  const str = String(input ?? '');
  let out = '';
  for (const ch of str.normalize('NFKD')) {
    if (Object.prototype.hasOwnProperty.call(REPLACEMENTS, ch)) {
      out += REPLACEMENTS[ch];
      continue;
    }
    const code = ch.codePointAt(0);
    if (code >= 0x20 && code <= 0x7e) {
      out += ch;
    } else if (code >= 0x300 && code <= 0x36f) {
      // combining accent left over from NFKD: drop it (é -> e)
    } else if (ch === '\n' || ch === '\r' || ch === '\t') {
      out += ' ';
    } else {
      out += '?';
    }
  }
  return out;
}

/** Word-wrap text to `width` columns, hard-splitting words that are too long. */
export function wrapText(text, width) {
  const w = Math.max(1, Math.floor(width));
  const clean = toPrinterText(text).trim();
  if (!clean) return [];

  const lines = [];
  let current = '';
  for (let word of clean.split(/\s+/)) {
    while (word.length > w) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(word.slice(0, w));
      word = word.slice(w);
    }
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= w) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** `left` flush left, `right` flush right, exactly `width` columns. */
export function twoCol(left, right, width) {
  const l = toPrinterText(left);
  const r = toPrinterText(right);
  if (r.length >= width) return r.slice(0, width);
  const room = width - r.length - 1;
  const leftText = l.slice(0, Math.max(0, room));
  return leftText + ' '.repeat(width - leftText.length - r.length) + r;
}

/** Center text within `width` columns (leading pad only, no trailing spaces). */
export function center(text, width) {
  const t = toPrinterText(text).slice(0, width);
  return ' '.repeat(Math.floor((width - t.length) / 2)) + t;
}

export const rule = (width, ch = '-') => ch.repeat(width);

/**
 * Wrap multi-line text (e.g. a receipt header typed into a textarea) to `width`
 * columns. Line breaks are kept, including blank lines; each paragraph is wrapped.
 */
export function wrapParagraphs(text, width) {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!raw) return [];
  return raw.split('\n').flatMap((paragraph) => {
    const wrapped = wrapText(paragraph, width);
    return wrapped.length ? wrapped : [''];
  });
}
