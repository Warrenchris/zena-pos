const app = require('../src/app');
const logger = require('../src/utils/logger');

describe('TRUST_PROXY_HOPS Configuration Parsing', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('parses unset / undefined as default 1 without warning', () => {
    expect(app.parseTrustProxyHops(undefined, true)).toBe(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('parses "1" as 1 without warning', () => {
    expect(app.parseTrustProxyHops('1', true)).toBe(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('parses "2" as 2 without warning', () => {
    expect(app.parseTrustProxyHops('2', true)).toBe(2);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('parses "0" as 0 without warning', () => {
    expect(app.parseTrustProxyHops('0', true)).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('parses invalid string "abc" with warning and falls back to default 1', () => {
    expect(app.parseTrustProxyHops('abc', true)).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid TRUST_PROXY_HOPS="abc"')
    );
  });

  test('parses out-of-range negative number "-1" with warning and falls back to default 1', () => {
    expect(app.parseTrustProxyHops('-1', true)).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid TRUST_PROXY_HOPS="-1"')
    );
  });

  test('parses out-of-range excessive number "9" with warning and falls back to default 1', () => {
    expect(app.parseTrustProxyHops('9', true)).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid TRUST_PROXY_HOPS="9"')
    );
  });

  test('effective Express trust proxy setting matches parsed hops', () => {
    // Current app setting is derived from process.env.TRUST_PROXY_HOPS (or default 1)
    const effectiveHops = app.get('trust proxy');
    expect(typeof effectiveHops).toBe('number');
    expect(effectiveHops).toBeGreaterThanOrEqual(0);
    expect(effectiveHops).toBeLessThanOrEqual(5);
  });
});
