import { buildReceiptSettings, resolveLogoUrl } from '../receiptSettings';

describe('resolveLogoUrl', () => {
  it('resolves uploaded logo paths against the API base URL', () => {
    expect(resolveLogoUrl('/uploads/logos/a.png', 'http://localhost:3000')).toBe('http://localhost:3000/uploads/logos/a.png');
    expect(resolveLogoUrl('/uploads/logos/a.png', 'https://api.example.com/')).toBe(
      'https://api.example.com/uploads/logos/a.png'
    );
  });

  it('keeps a server path as-is when there is no API base URL', () => {
    expect(resolveLogoUrl('/uploads/logos/a.png')).toBe('/uploads/logos/a.png');
  });

  it('accepts absolute http(s) URLs and image data URLs', () => {
    expect(resolveLogoUrl('https://cdn.example.com/logo.png')).toBe('https://cdn.example.com/logo.png');
    expect(resolveLogoUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('rejects anything that is not a plain image location', () => {
    ['javascript:alert(1)', 'data:text/html;base64,AAAA', '//evil.example.com/x.png', 'logo.png', '', '   ', null, undefined, 42].forEach(
      (bad) => expect(resolveLogoUrl(bad, 'http://localhost:3000')).toBeNull()
    );
  });
});

describe('buildReceiptSettings', () => {
  it('shows the logo unless it is explicitly turned off', () => {
    expect(buildReceiptSettings({}).showLogo).toBe(true);
    expect(buildReceiptSettings({ showLogoOnReceipt: true }).showLogo).toBe(true);
    expect(buildReceiptSettings({ showLogoOnReceipt: false }).showLogo).toBe(false);
  });

  it('supports branch, tagline, showPoweredBy and qrEnabled (Phase 2)', () => {
    const s = buildReceiptSettings({
      branch: 'CBD Branch',
      tagline: 'Quality always',
      showPoweredBy: false,
      qrEnabled: true
    });
    expect(s.branch).toBe('CBD Branch');
    expect(s.tagline).toBe('Quality always');
    expect(s.showPoweredBy).toBe(false);
    expect(s.qrEnabled).toBe(true);

    const empty = buildReceiptSettings({});
    expect(empty.branch).toBe('');
    expect(empty.tagline).toBe('');
    expect(empty.showPoweredBy).toBe(true);
    expect(empty.qrEnabled).toBe(false);
  });

  it('copies header and footer text and tolerates missing settings', () => {
    expect(buildReceiptSettings({ receiptHeader: 'Hello', receiptFooter: 'Bye' })).toMatchObject({
      header: 'Hello',
      footer: 'Bye',
      logoUrl: null,
    });
    expect(buildReceiptSettings(null)).toEqual({ header: '', footer: '', showLogo: true, logoUrl: null, branch: '', tagline: '', showPoweredBy: true, qrEnabled: false });
    expect(buildReceiptSettings({ receiptHeader: null, receiptFooter: null }).header).toBe('');
  });
});
