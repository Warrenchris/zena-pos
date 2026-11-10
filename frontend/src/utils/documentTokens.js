/**
 * Zana POS — Unified Document Design System (UDDS)
 * Visual tokens, palettes, typography, and geometry standards for
 * all generated documents (PDF, Excel, Print).
 *
 * NOTE: Thermal receipts (58mm/80mm) use their own separate ESC/POS
 * rendering pipeline in `src/printing/` and are NOT governed by these tokens.
 */

export const DOCUMENT_COLORS = {
  // Brand colors
  primary: '#784421',            // Zana Terracotta
  primaryRgb: [120, 68, 33],
  primaryDark: '#5C3318',
  primaryDarkRgb: [92, 51, 24],
  primaryLight: '#FBF8F5',
  primaryLightRgb: [251, 248, 245],

  // Neutral text & background
  textDark: '#0F172A',           // Slate 900
  textDarkRgb: [15, 23, 42],
  textBody: '#334155',           // Slate 700
  textBodyRgb: [51, 65, 85],
  textMuted: '#64748B',          // Slate 500
  textMutedRgb: [100, 116, 139],
  textLight: '#94A3B8',          // Slate 400
  textLightRgb: [148, 163, 184],

  // Borders & Dividers
  borderSubdued: '#E2E8F0',      // Slate 200
  borderSubduedRgb: [226, 232, 240],
  borderStrong: '#CBD5E1',       // Slate 300
  borderStrongRgb: [203, 213, 225],

  // Table Striping & Cards
  rowStripe: '#F8FAFC',          // Slate 50
  rowStripeRgb: [248, 250, 252],
  cardBg: '#F8FAFC',
  cardBgRgb: [248, 250, 252],
  white: '#FFFFFF',
  whiteRgb: [255, 255, 255],

  // Status Accents
  statusSuccess: '#16A34A',
  statusSuccessRgb: [22, 163, 74],
  statusWarning: '#D97706',
  statusWarningRgb: [217, 119, 6],
  statusDanger: '#DC2626',
  statusDangerRgb: [220, 38, 38],
  statusInfo: '#2563EB',
  statusInfoRgb: [37, 99, 235],
};

export const DOCUMENT_FONTS = {
  family: 'helvetica',
  styles: {
    normal: 'normal',
    bold: 'bold',
    italic: 'italic',
  },
  sizes: {
    title: 16,
    subtitle: 10,
    sectionHeading: 11,
    tableHeader: 8.5,
    tableBody: 8.5,
    metaLabel: 7.5,
    metaValue: 8,
    footer: 7.5,
    badge: 7,
  },
};

export const DOCUMENT_GEOMETRY = {
  a4Portrait: {
    widthMm: 210,
    heightMm: 297,
    marginMm: { top: 12, bottom: 14, left: 12, right: 12 },
  },
  a4Landscape: {
    widthMm: 297,
    heightMm: 210,
    marginMm: { top: 12, bottom: 14, left: 12, right: 12 },
  },
};

export const DOCUMENT_FORMATS = {
  defaultCurrency: 'KES',
  defaultCurrencySymbol: 'KSh',
  currencyNumberFormat: '#,##0.00',
  quantityNumberFormat: '#,##0',
  percentFormat: '0.0%',
  dateTimeFormat: 'yyyy-MM-dd HH:mm',
  dateFormat: 'yyyy-MM-dd',
};
