/**
 * Money / Change Calculation Utilities using integer cents to prevent floating point inaccuracies.
 */

export function roundToCents(amount) {
  const num = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

export function calculateChange(amountReceived, total) {
  const receivedCents = roundToCents(amountReceived);
  const totalCents = roundToCents(total);
  const changeCents = Math.max(0, receivedCents - totalCents);
  return changeCents / 100;
}

export function roundToTwoDecimals(amount) {
  const num = typeof amount === 'number' ? amount : parseFloat(amount);
  if (isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
}

export function hasSubShillingFraction(amount) {
  const cents = roundToCents(amount);
  return cents > 0 && (cents % 100 !== 0);
}

export function isCashPaymentValid(amountReceived, total) {
  if (amountReceived === '' || amountReceived === null || amountReceived === undefined) return false;
  const num = parseFloat(amountReceived);
  if (isNaN(num)) return false;
  const receivedCents = roundToCents(amountReceived);
  const totalCents = roundToCents(total);
  return receivedCents >= totalCents;
}
