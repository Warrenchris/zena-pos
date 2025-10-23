import { renderHook } from '@testing-library/react';
import { useAdvancedCurrency } from '../useAdvancedCurrency';
import { CurrencyProvider } from '../../providers/CurrencyProvider';

// Mock the base currency hook
jest.mock('../../providers/CurrencyProvider', () => ({
  useCurrency: () => ({
    code: 'KES',
    symbol: 'KSh',
    format: (amount) => `KSh ${amount.toFixed(2)}`,
  }),
  CurrencyProvider: ({ children }) => children,
}));

describe('useAdvancedCurrency', () => {
  it('should format currency with locale support', () => {
    const { result } = renderHook(() => useAdvancedCurrency());
    expect(result.current.formatLocale(1234.56)).toBe('KSh 1,234.56');
  });

  it('should format accounting style numbers', () => {
    const { result } = renderHook(() => useAdvancedCurrency());
    expect(result.current.formatAccounting(-1234.56)).toBe('(KSh 1,234.56)');
    expect(result.current.formatAccounting(1234.56)).toBe('KSh 1,234.56');
  });

  it('should format compact numbers', () => {
    const { result } = renderHook(() => useAdvancedCurrency());
    expect(result.current.formatCompact(1234567)).toMatch(/KSh.*1.2M/);
  });

  it('should return currency metadata', () => {
    const { result } = renderHook(() => useAdvancedCurrency());
    const metadata = result.current.getMetadata();
    expect(metadata).toEqual({
      code: 'KES',
      symbol: 'KSh',
      name: 'Kenyan Shilling',
      decimals: 2,
      locale: 'en-KE'
    });
  });

  it('should detect zero or null amounts', () => {
    const { result } = renderHook(() => useAdvancedCurrency());
    expect(result.current.isZeroOrNull(0)).toBe(true);
    expect(result.current.isZeroOrNull(null)).toBe(true);
    expect(result.current.isZeroOrNull(100)).toBe(false);
  });

  it('should calculate percentages', () => {
    const { result } = renderHook(() => useAdvancedCurrency());
    expect(result.current.calculatePercentage(50, 200)).toBe(25);
    expect(result.current.calculatePercentage(null, 200)).toBe(0);
  });

  it('should format ranges', () => {
    const { result } = renderHook(() => useAdvancedCurrency());
    expect(result.current.formatRange(100, 200)).toBe('KSh 100.00 - KSh 200.00');
  });

  it('should round to currency unit', () => {
    const { result } = renderHook(() => useAdvancedCurrency());
    expect(result.current.roundToUnit(123.456)).toBe(123.46);
    expect(result.current.roundToUnit(123.454)).toBe(123.45);
  });
});