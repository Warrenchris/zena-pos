import { toPrinterText, wrapText, twoCol, center } from '../text';

describe('toPrinterText', () => {
  it('keeps plain ASCII unchanged', () => {
    expect(toPrinterText('KSh 1,250.00')).toBe('KSh 1,250.00');
  });

  it('transliterates currency symbols and punctuation used in supported markets', () => {
    expect(toPrinterText('GH₵ 10')).toBe('GHC 10');
    expect(toPrinterText('₦5,000')).toBe('N5,000');
    expect(toPrinterText('Item — big × 2')).toBe('Item - big x 2');
  });

  it('strips accents and replaces unprintable characters', () => {
    expect(toPrinterText('Café')).toBe('Cafe');
    expect(toPrinterText('Tea ☕')).toBe('Tea ?');
  });

  it('never emits newlines or nulls', () => {
    expect(toPrinterText('a\nb\tc')).toBe('a b c');
    expect(toPrinterText(null)).toBe('');
    expect(toPrinterText(undefined)).toBe('');
  });
});

describe('wrapText', () => {
  it('wraps on word boundaries', () => {
    expect(wrapText('the quick brown fox', 10)).toEqual(['the quick', 'brown fox']);
  });

  it('hard-splits words longer than the line', () => {
    expect(wrapText('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('returns no lines for empty input', () => {
    expect(wrapText('', 10)).toEqual([]);
    expect(wrapText('   ', 10)).toEqual([]);
  });

  it('never exceeds the width', () => {
    wrapText('Extra long product name with supercalifragilistic words', 12).forEach((l) => {
      expect(l.length).toBeLessThanOrEqual(12);
    });
  });
});

describe('twoCol', () => {
  it('fills exactly the width', () => {
    const line = twoCol('Total', '100.00', 20);
    expect(line).toHaveLength(20);
    expect(line.startsWith('Total')).toBe(true);
    expect(line.endsWith('100.00')).toBe(true);
  });

  it('truncates the left side, never the amount', () => {
    const line = twoCol('A very long product name', '99.00', 16);
    expect(line).toHaveLength(16);
    expect(line.endsWith('99.00')).toBe(true);
  });
});

describe('center', () => {
  it('pads on the left only', () => {
    expect(center('abc', 9)).toBe('   abc');
  });
});
