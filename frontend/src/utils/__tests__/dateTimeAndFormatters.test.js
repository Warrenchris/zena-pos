import { SHOP_TIMEZONE, formatDate, formatDateTime } from '../dateTime';
import formattersDefault, {
  formatDate as formattersDate,
  formatDateTime as formattersDateTime,
  formatDateLong,
  formatDateShort,
  SHOP_TIMEZONE as FORMATTERS_TIMEZONE,
} from '../formatters';

describe('dateTime and formatters utils', () => {
  describe('SHOP_TIMEZONE', () => {
    it('is pinned to Africa/Nairobi across both modules', () => {
      expect(SHOP_TIMEZONE).toBe('Africa/Nairobi');
      expect(FORMATTERS_TIMEZONE).toBe('Africa/Nairobi');
    });
  });

  describe('formatDateTime', () => {
    it('formats ISO timestamps to YYYY-MM-DD HH:mm in Africa/Nairobi', () => {
      // 2026-10-24 14:30 UTC = 2026-10-24 17:30 EAT (UTC+3)
      const iso = '2026-10-24T14:30:00.000Z';
      expect(formatDateTime(iso)).toBe('2026-10-24 17:30');
      expect(formattersDateTime(iso)).toBe('2026-10-24 17:30');
    });

    it('handles Date instances and empty/invalid values gracefully', () => {
      const d = new Date('2026-08-26T06:52:00.000Z'); // 09:52 EAT
      expect(formatDateTime(d)).toBe('2026-08-26 09:52');
      expect(formatDateTime('')).toBe('');
      expect(formatDateTime(null)).toBe('');
      expect(formatDateTime(undefined)).toBe('');
      expect(formatDateTime('invalid-date')).toBe('');
    });
  });

  describe('formatDate', () => {
    it('formats dates in short format pinned to Africa/Nairobi', () => {
      const iso = '2026-10-24T14:30:00.000Z';
      const formatted = formatDate(iso);
      expect(formatted).toMatch(/Oct 24/);
      expect(formattersDate(iso)).toBe(formatted);
    });

    it('returns empty string for falsy dates', () => {
      expect(formatDate(null)).toBe('');
      expect(formatDate('')).toBe('');
    });
  });

  describe('formatDateLong and formatDateShort', () => {
    it('formats long date with full month and year in Nairobi timezone', () => {
      const iso = '2026-10-24T14:30:00.000Z';
      expect(formatDateLong(iso)).toMatch(/October 24, 2026/);
      expect(formatDateLong('')).toBe('');
    });

    it('formats short date with abbreviated month in Nairobi timezone', () => {
      const iso = '2026-10-24T14:30:00.000Z';
      expect(formatDateShort(iso)).toMatch(/Oct 24, 2026/);
      expect(formatDateShort('')).toBe('');
    });
  });

  describe('default export backward compatibility', () => {
    it('exports all formatters on the default object', () => {
      expect(typeof formattersDefault.formatCurrency).toBe('function');
      expect(typeof formattersDefault.formatDate).toBe('function');
      expect(typeof formattersDefault.formatDateTime).toBe('function');
      expect(typeof formattersDefault.formatDateLong).toBe('function');
      expect(typeof formattersDefault.formatDateShort).toBe('function');
    });
  });
});
