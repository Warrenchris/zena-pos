import { formatReceiptDate } from '../layout';
import { formatDateTime } from '../../utils/formatters';

describe('Timezone-pinned date formatting (Fix 6)', () => {
  const originalTZ = process.env.TZ;

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  test('formats date strictly in Africa/Nairobi (UTC+3) regardless of local environment timezone', () => {
    // 2026-08-26T06:52:00.000Z is 09:52 in Africa/Nairobi (UTC+3)
    const testDate = '2026-08-26T06:52:00.000Z';
    const expected = '2026-08-26 09:52';

    // Under UTC
    process.env.TZ = 'UTC';
    const utcResult = formatReceiptDate(testDate);
    expect(utcResult).toBe(expected);
    expect(formatDateTime(testDate)).toBe(expected);

    // Under America/New_York (UTC-4 in summer)
    process.env.TZ = 'America/New_York';
    const nyResult = formatReceiptDate(testDate);
    expect(nyResult).toBe(expected);
    expect(formatDateTime(testDate)).toBe(expected);

    // Under Asia/Tokyo (UTC+9)
    process.env.TZ = 'Asia/Tokyo';
    const tokyoResult = formatReceiptDate(testDate);
    expect(tokyoResult).toBe(expected);

    // Both match exactly
    expect(utcResult).toBe(nyResult);
  });

  test('handles invalid or empty dates gracefully', () => {
    expect(formatReceiptDate('')).toBe('');
    expect(formatReceiptDate(null)).toBe('');
    expect(formatReceiptDate(undefined)).toBe('');
    expect(formatReceiptDate('not-a-date')).toBe('');
  });
});
