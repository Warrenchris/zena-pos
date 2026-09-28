import React from 'react';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useAdvancedCurrency } from '../useAdvancedCurrency';
import { CurrencyProvider } from '../../providers/CurrencyProvider';
import settingsReducer from '../../store/slices/settingsSlice';

const createWrapper = (settingsOverrides = {}) => {
  const defaultSettingsState = settingsReducer(undefined, { type: '@@INIT' });
  const store = configureStore({
    reducer: {
      settings: settingsReducer,
    },
    preloadedState: {
      settings: {
        ...defaultSettingsState,
        ...settingsOverrides,
      },
    },
  });

  return ({ children }) => (
    <Provider store={store}>
      <CurrencyProvider>{children}</CurrencyProvider>
    </Provider>
  );
};

describe('useAdvancedCurrency (Real Provider & Formatter)', () => {
  it('should format currency with locale support using real Intl formatter', () => {
    const { result } = renderHook(() => useAdvancedCurrency(), { wrapper: createWrapper() });
    const formatted = result.current.formatLocale(1234.56).replace(/\u00a0/g, ' ');
    expect(formatted).toMatch(/^KSh?\s1,234\.56$/i);
  });

  it('should format accounting style numbers with thousands separator', () => {
    const { result } = renderHook(() => useAdvancedCurrency(), { wrapper: createWrapper() });
    // Verify thousands separator and accounting parentheses for negative numbers
    expect(result.current.formatAccounting(-1234.56)).toBe('(KSh 1,234.56)');
    expect(result.current.formatAccounting(1234.56)).toBe('KSh 1,234.56');
  });

  it('should format compact numbers using real Intl formatter', () => {
    const { result } = renderHook(() => useAdvancedCurrency(), { wrapper: createWrapper() });
    expect(result.current.formatCompact(1234567)).toMatch(/KSh?.*1\.2M/i);
  });

  it('should return currency metadata from real catalog', () => {
    const { result } = renderHook(() => useAdvancedCurrency(), { wrapper: createWrapper() });
    const metadata = result.current.getMetadata();
    expect(metadata).toEqual({
      code: 'KES',
      symbol: 'KSh',
      name: 'Kenyan Shilling',
      decimals: 2,
      locale: 'en-KE',
    });
  });

  it('should detect zero or null amounts', () => {
    const { result } = renderHook(() => useAdvancedCurrency(), { wrapper: createWrapper() });
    expect(result.current.isZeroOrNull(0)).toBe(true);
    expect(result.current.isZeroOrNull(null)).toBe(true);
    expect(result.current.isZeroOrNull(100)).toBe(false);
  });

  it('should calculate percentages', () => {
    const { result } = renderHook(() => useAdvancedCurrency(), { wrapper: createWrapper() });
    expect(result.current.calculatePercentage(50, 200)).toBe(25);
    expect(result.current.calculatePercentage(null, 200)).toBe(0);
  });

  it('should format ranges using real currency format', () => {
    const { result } = renderHook(() => useAdvancedCurrency(), { wrapper: createWrapper() });
    expect(result.current.formatRange(100, 200)).toBe('KSh 100.00 - KSh 200.00');
  });

  it('should round to currency unit', () => {
    const { result } = renderHook(() => useAdvancedCurrency(), { wrapper: createWrapper() });
    expect(result.current.roundToUnit(123.456)).toBe(123.46);
    expect(result.current.roundToUnit(123.454)).toBe(123.45);
  });
});