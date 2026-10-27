import { formatCurrency } from '../../store/slices/settingsSlice';
import { formatCurrencyWithSettings } from '../../utils/currencyUtils';
import { formatAmount } from '../../utils/currencyFormatters';

describe('Consolidated Currency Formatting', () => {
  const defaultSettings = { currencySymbol: 'KSh', currencyPosition: 'before', decimalPlaces: 2 };

  describe('settingsSlice.formatCurrency (source of truth)', () => {
    it('formats 5600 with commas and 2 decimals', () => {
      expect(formatCurrency(5600, defaultSettings)).toBe('KSh 5,600.00');
    });

    it('formats 1234567.5 with millions grouping', () => {
      expect(formatCurrency(1234567.5, defaultSettings)).toBe('KSh 1,234,567.50');
    });

    it('formats 0 properly', () => {
      expect(formatCurrency(0, defaultSettings)).toBe('KSh 0.00');
    });

    it('formats negative values properly', () => {
      expect(formatCurrency(-500, defaultSettings)).toBe('KSh -500.00');
      expect(formatCurrency(-1234.5, defaultSettings)).toBe('KSh -1,234.50');
    });

    it('formats 5999.94 without losing cent precision', () => {
      expect(formatCurrency(5999.94, defaultSettings)).toBe('KSh 5,999.94');
    });

    it('handles non-numeric or missing amount safely', () => {
      expect(formatCurrency(null, defaultSettings)).toBe('KSh 0.00');
      expect(formatCurrency(undefined, defaultSettings)).toBe('KSh 0.00');
      expect(formatCurrency('invalid', defaultSettings)).toBe('KSh 0.00');
    });
  });

  describe('currencyUtils.formatCurrencyWithSettings (delegation)', () => {
    it('delegates 5600 to formatCurrency', () => {
      expect(formatCurrencyWithSettings(5600, defaultSettings)).toBe('KSh 5,600.00');
    });

    it('delegates 1234567.5 to formatCurrency', () => {
      expect(formatCurrencyWithSettings(1234567.5, defaultSettings)).toBe('KSh 1,234,567.50');
    });

    it('delegates 0 to formatCurrency', () => {
      expect(formatCurrencyWithSettings(0, defaultSettings)).toBe('KSh 0.00');
    });

    it('delegates negative numbers to formatCurrency', () => {
      expect(formatCurrencyWithSettings(-250.75, defaultSettings)).toBe('KSh -250.75');
    });

    it('delegates 5999.94 to formatCurrency', () => {
      expect(formatCurrencyWithSettings(5999.94, defaultSettings)).toBe('KSh 5,999.94');
    });
  });

  describe('currencyFormatters.formatAmount (delegation)', () => {
    it('delegates 5600 to formatCurrency', () => {
      expect(formatAmount(5600, 'KES')).toBe('KSh 5,600.00');
    });

    it('delegates 1234567.5 to formatCurrency', () => {
      expect(formatAmount(1234567.5, 'KES')).toBe('KSh 1,234,567.50');
    });

    it('delegates 0 to formatCurrency', () => {
      expect(formatAmount(0, 'KES')).toBe('KSh 0.00');
    });

    it('delegates negative values to formatCurrency', () => {
      expect(formatAmount(-75.5, 'KES')).toBe('KSh -75.50');
    });

    it('delegates 5999.94 to formatCurrency', () => {
      expect(formatAmount(5999.94, 'KES')).toBe('KSh 5,999.94');
    });
  });
});
