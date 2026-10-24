import {
  calculateChange,
  roundToCents,
  roundToTwoDecimals,
  hasSubShillingFraction,
  isCashPaymentValid
} from '../../utils/changeCalculation';

describe('Change and Money Calculation (Fix 5)', () => {
  test('calculates change in integer cents avoiding IEEE-754 precision bugs: 10.30 - 10.00 === 0.30', () => {
    // In native JS float: (10.30 - 10.00) === 0.3000000000000007, so (10.30 - 10.00 === 0.30) is false
    expect(10.30 - 10.00 === 0.30).toBe(false);

    // Using calculateChange with integer cents:
    const change = calculateChange(10.30, 10.00);
    expect(change).toBe(0.30);
    expect(change === 0.30).toBe(true);
  });

  test('handles exact amount and underpayment', () => {
    expect(calculateChange(10.00, 10.00)).toBe(0);
    expect(calculateChange(5.00, 10.00)).toBe(0);
  });

  test('calculates odd cents precisely: 6000.00 - 5999.94 === 0.06', () => {
    const change = calculateChange(6000.00, 5999.94);
    expect(change).toBe(0.06);
    expect(change === 0.06).toBe(true);
  });

  test('handles string inputs cleanly', () => {
    expect(calculateChange('250.50', '200.00')).toBe(50.50);
  });

  test('detects sub-shilling fractions (cents)', () => {
    expect(hasSubShillingFraction(10.30)).toBe(true);
    expect(hasSubShillingFraction(5999.94)).toBe(true);
    expect(hasSubShillingFraction('0.50')).toBe(true);
    expect(hasSubShillingFraction(10.00)).toBe(false);
    expect(hasSubShillingFraction(5000)).toBe(false);
    expect(hasSubShillingFraction(0)).toBe(false);
  });

  test('validates cash payment against total', () => {
    expect(isCashPaymentValid(10.30, 10.00)).toBe(true);
    expect(isCashPaymentValid(10.00, 10.00)).toBe(true);
    expect(isCashPaymentValid(9.99, 10.00)).toBe(false);
    expect(isCashPaymentValid('', 10.00)).toBe(false);
    expect(isCashPaymentValid('abc', 10.00)).toBe(false);
  });

  test('rounds input to 2 decimal places', () => {
    expect(roundToTwoDecimals(10.345)).toBe(10.35);
    expect(roundToTwoDecimals(10.344)).toBe(10.34);
    expect(roundToTwoDecimals('10.344')).toBe(10.34);
  });
});
