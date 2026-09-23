import { bytesToBase64 } from '../base64';

const decode = (b64) => Array.from(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

describe('bytesToBase64', () => {
  it('round-trips every possible byte value (binary-safe)', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(decode(bytesToBase64(all))).toEqual(Array.from(all));
  });

  it('encodes the ESC/POS drawer kick, which contains a byte above 0x7F', () => {
    expect(decode(bytesToBase64(Uint8Array.from([0x1b, 0x70, 0x00, 0x19, 0xfa])))).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });

  it('handles data larger than one internal chunk and plain arrays', () => {
    const big = Uint8Array.from({ length: 100000 }, (_, i) => i % 251);
    expect(decode(bytesToBase64(big))).toEqual(Array.from(big));
    expect(decode(bytesToBase64([1, 2, 3]))).toEqual([1, 2, 3]);
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
  });
});
