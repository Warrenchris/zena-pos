import {
  DOCUMENT_COLORS,
  DOCUMENT_FONTS,
  DOCUMENT_GEOMETRY,
  DOCUMENT_FORMATS,
} from '../documentTokens';

describe('DOCUMENT_TOKENS', () => {
  it('defines the Zana Terracotta primary palette', () => {
    expect(DOCUMENT_COLORS.primary).toBe('#784421');
    expect(DOCUMENT_COLORS.primaryRgb).toEqual([120, 68, 33]);
    expect(DOCUMENT_COLORS.primaryDark).toBe('#5C3318');
    expect(DOCUMENT_COLORS.primaryDarkRgb).toEqual([92, 51, 24]);
  });

  it('defines neutral text and background colors with matching RGB tuples', () => {
    expect(DOCUMENT_COLORS.textDarkRgb).toEqual([15, 23, 42]);
    expect(DOCUMENT_COLORS.textBodyRgb).toEqual([51, 65, 85]);
    expect(DOCUMENT_COLORS.textMutedRgb).toEqual([100, 116, 139]);
    expect(DOCUMENT_COLORS.rowStripeRgb).toEqual([248, 250, 252]);
    expect(DOCUMENT_COLORS.borderSubduedRgb).toEqual([226, 232, 240]);
  });

  it('defines typography hierarchy with sensible font sizes', () => {
    expect(DOCUMENT_FONTS.sizes.title).toBeGreaterThan(DOCUMENT_FONTS.sizes.sectionHeading);
    expect(DOCUMENT_FONTS.sizes.sectionHeading).toBeGreaterThan(DOCUMENT_FONTS.sizes.tableHeader);
    expect(DOCUMENT_FONTS.sizes.tableHeader).toBe(DOCUMENT_FONTS.sizes.tableBody);
    expect(DOCUMENT_FONTS.sizes.footer).toBeLessThan(DOCUMENT_FONTS.sizes.tableBody);
  });

  it('defines A4 portrait and landscape geometries with 12mm minimum margins', () => {
    expect(DOCUMENT_GEOMETRY.a4Portrait.widthMm).toBe(210);
    expect(DOCUMENT_GEOMETRY.a4Portrait.heightMm).toBe(297);
    expect(DOCUMENT_GEOMETRY.a4Portrait.marginMm.left).toBe(12);
    expect(DOCUMENT_GEOMETRY.a4Portrait.marginMm.right).toBe(12);

    expect(DOCUMENT_GEOMETRY.a4Landscape.widthMm).toBe(297);
    expect(DOCUMENT_GEOMETRY.a4Landscape.heightMm).toBe(210);
  });

  it('defines standard currency and number formatting tokens', () => {
    expect(DOCUMENT_FORMATS.defaultCurrency).toBe('KES');
    expect(DOCUMENT_FORMATS.defaultCurrencySymbol).toBe('KSh');
    expect(DOCUMENT_FORMATS.currencyNumberFormat).toBe('#,##0.00');
  });
});
