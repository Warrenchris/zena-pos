const { parseDate, isValidDate, assertValidBounds } = require('../src/utils/dateUtils');

describe('dateUtils', () => {
  describe('parseDate', () => {
    it('should return fallback if input is null, undefined, or empty string', () => {
      const fallback = new Date('2026-01-01');
      expect(parseDate(null, fallback)).toEqual(fallback);
      expect(parseDate(undefined, fallback)).toEqual(fallback);
      expect(parseDate('', fallback)).toEqual(fallback);
    });

    it('should throw error if input is invalid and no fallback provided', () => {
      expect(() => parseDate('not-a-date')).toThrow();
      expect(() => parseDate('undefined')).toThrow();
      expect(() => parseDate('null')).toThrow();
    });

    it('should return fallback and print warning if input is invalid and fallback is provided', () => {
      const fallback = new Date('2026-01-01');
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      expect(parseDate('undefined', fallback)).toEqual(fallback);
      expect(parseDate('not-a-date', fallback)).toEqual(fallback);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should parse valid ISO strings', () => {
      const dateStr = '2026-06-29T10:00:00.000Z';
      expect(parseDate(dateStr).toISOString()).toEqual(dateStr);
    });

    it('should return Date instance directly if Date instance is passed', () => {
      const d = new Date();
      expect(parseDate(d)).toBe(d);
    });

    it('should throw if Date instance is Invalid Date', () => {
      const d = new Date('invalid');
      expect(() => parseDate(d)).toThrow();
    });
  });

  describe('isValidDate', () => {
    it('should return true for valid Date instances', () => {
      expect(isValidDate(new Date())).toBe(true);
      expect(isValidDate(new Date('2026-06-29'))).toBe(true);
    });

    it('should return false for invalid Date instances', () => {
      expect(isValidDate(new Date('invalid'))).toBe(false);
    });

    it('should return false for non-Date types', () => {
      expect(isValidDate('2026-06-29')).toBe(false);
      expect(isValidDate(null)).toBe(false);
    });
  });

  describe('assertValidBounds', () => {
    it('should not throw if bounds are valid Dates', () => {
      expect(() => assertValidBounds([new Date(), new Date()])).not.toThrow();
    });

    it('should throw if bounds array does not have length 2', () => {
      expect(() => assertValidBounds([new Date()])).toThrow();
      expect(() => assertValidBounds([new Date(), new Date(), new Date()])).toThrow();
    });

    it('should throw if either bound is invalid', () => {
      expect(() => assertValidBounds([new Date('invalid'), new Date()])).toThrow();
      expect(() => assertValidBounds([new Date(), new Date('invalid')])).toThrow();
    });
  });
});
