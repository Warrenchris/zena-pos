import { toPrinterText } from './text';

const ESC = 0x1b;
const GS = 0x1d;

/**
 * Minimal ESC/POS command builder. Covers only what receipts need
 * (init, bold, double size, text, feed, cut, cash-drawer kick), so the app
 * carries no extra dependency and every byte is unit-testable.
 */
export class EscPosBuilder {
  constructor() {
    this.bytes = [];
    this._bold = false;
    this._double = false;
  }

  raw(...values) {
    this.bytes.push(...values);
    return this;
  }

  /** Reset the printer to its defaults (ESC @). */
  init() {
    this._bold = false;
    this._double = false;
    return this.raw(ESC, 0x40);
  }

  /** Bold on/off (ESC E n). Only emits when the state changes. */
  bold(on) {
    if (on === this._bold) return this;
    this._bold = on;
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** Double width + height on/off (GS ! n). Only emits when the state changes. */
  double(on) {
    if (on === this._double) return this;
    this._double = on;
    return this.raw(GS, 0x21, on ? 0x11 : 0x00);
  }

  text(str) {
    const s = toPrinterText(str);
    for (let i = 0; i < s.length; i += 1) this.bytes.push(s.charCodeAt(i));
    return this;
  }

  newline() {
    return this.raw(0x0a);
  }

  line(str = '') {
    return this.text(str).newline();
  }

  /** Print buffer and feed n lines (ESC d n). */
  feed(n) {
    return this.raw(ESC, 0x64, Math.min(255, Math.max(0, n | 0)));
  }

  /** Paper cut (GS V m). 'none' emits nothing, for printers without a cutter. */
  cut(mode = 'partial') {
    if (mode === 'full') return this.raw(GS, 0x56, 0x00);
    if (mode === 'partial') return this.raw(GS, 0x56, 0x01);
    return this;
  }

  /** Pulse cash-drawer pin 2 (ESC p 0 25 250). */
  openDrawer() {
    return this.raw(ESC, 0x70, 0x00, 0x19, 0xfa);
  }

  build() {
    return Uint8Array.from(this.bytes);
  }
}
