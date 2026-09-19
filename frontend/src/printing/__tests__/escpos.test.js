import { EscPosBuilder } from '../escpos';

const bytes = (b) => Array.from(b.build());

describe('EscPosBuilder', () => {
  it('emits ESC @ on init', () => {
    expect(bytes(new EscPosBuilder().init())).toEqual([0x1b, 0x40]);
  });

  it('encodes text as ASCII bytes and lines end with LF', () => {
    expect(bytes(new EscPosBuilder().line('Hi'))).toEqual([0x48, 0x69, 0x0a]);
  });

  it('only emits bold/double commands when the state changes', () => {
    const b = new EscPosBuilder().init().bold(false).bold(true).bold(true).bold(false);
    expect(bytes(b)).toEqual([0x1b, 0x40, 0x1b, 0x45, 1, 0x1b, 0x45, 0]);

    const d = new EscPosBuilder().double(true).double(true).double(false);
    expect(bytes(d)).toEqual([0x1d, 0x21, 0x11, 0x1d, 0x21, 0x00]);
  });

  it('supports partial, full and no cut', () => {
    expect(bytes(new EscPosBuilder().cut('partial'))).toEqual([0x1d, 0x56, 0x01]);
    expect(bytes(new EscPosBuilder().cut('full'))).toEqual([0x1d, 0x56, 0x00]);
    expect(bytes(new EscPosBuilder().cut('none'))).toEqual([]);
  });

  it('feeds lines and kicks the cash drawer', () => {
    expect(bytes(new EscPosBuilder().feed(3))).toEqual([0x1b, 0x64, 3]);
    expect(bytes(new EscPosBuilder().openDrawer())).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });

  it('converts non-ASCII text before encoding', () => {
    expect(bytes(new EscPosBuilder().text('Café'))).toEqual([0x43, 0x61, 0x66, 0x65]);
  });
});
