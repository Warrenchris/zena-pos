import {
  resolveBusinessIdentity,
  resolveInvoiceDocumentTitle,
  isValidKraPin,
} from '../businessIdentity';

describe('businessIdentity resolver', () => {
  describe('isValidKraPin', () => {
    it('validates 11-character corporate (P) and individual (A) KRA PINs', () => {
      expect(isValidKraPin('P051234567X')).toBe(true);
      expect(isValidKraPin('A012345678Z')).toBe(true);
      expect(isValidKraPin('p051234567x')).toBe(true); // Case-insensitive
    });

    it('rejects invalid KRA PIN formats', () => {
      expect(isValidKraPin('1234567890')).toBe(false); // No prefix letter
      expect(isValidKraPin('B051234567X')).toBe(false); // Must start with A or P
      expect(isValidKraPin('P051234567')).toBe(false); // Too short (10 chars)
      expect(isValidKraPin('P0512345678X')).toBe(false); // Too long (12 chars)
      expect(isValidKraPin('P05123456XX')).toBe(false); // Letter inside numeric block
      expect(isValidKraPin('')).toBe(false);
      expect(isValidKraPin(null)).toBe(false);
      expect(isValidKraPin(undefined)).toBe(false);
    });
  });
  it('resolves complete business identity from full root state', () => {
    const rootState = {
      auth: {
        user: {
          id: 1,
          name: 'Jane Doe',
          email: 'jane@sokosafi.co.ke',
          organization: { name: 'SokoSafi Enterprises', currency: 'KES' },
        },
        shop: {
          id: 4,
          name: 'CBD Branch',
          address: 'Kenyatta Avenue, Nairobi',
          phone: '+254711223344',
          email: 'cbd@sokosafi.co.ke',
          kraPin: 'P051234567Z',
        },
      },
      settings: {
        systemName: 'SokoSafi POS',
        branch: 'CBD Branch',
        vatRegistered: true,
        taxRate: 16,
        taxInclusive: true,
        defaultCurrency: 'KES',
        currencySymbol: 'KSh',
        businessLogo: 'https://example.com/logo.png',
        showPoweredBy: true,
        tagline: 'Freshness Every Day',
      },
    };

    const identity = resolveBusinessIdentity(rootState);

    expect(identity.organizationName).toBe('SokoSafi Enterprises');
    expect(identity.shopName).toBe('CBD Branch');
    expect(identity.displayName).toBe('SokoSafi Enterprises — CBD Branch');
    expect(identity.address).toBe('Kenyatta Avenue, Nairobi');
    expect(identity.phone).toBe('+254711223344');
    expect(identity.email).toBe('cbd@sokosafi.co.ke');
    expect(identity.kraPin).toBe('P051234567Z');
    expect(identity.vatRegistered).toBe(true);
    expect(identity.taxRate).toBe(16);
    expect(identity.taxInclusive).toBe(true);
    expect(identity.currency).toBe('KES');
    expect(identity.currencySymbol).toBe('KSh');
    expect(identity.logoUrl).toBe('https://example.com/logo.png');
    expect(identity.tagline).toBe('Freshness Every Day');
    expect(identity.printedBy).toBe('Jane Doe');
    expect(identity.hasTaxIdentity).toBe(true);
    expect(identity.showPoweredBy).toBe(true);
  });

  it('accepts authState and settingsState passed as separate parameters', () => {
    const authState = {
      user: { name: 'John Cashier' },
      shop: { name: 'Main Shop', phone: '0700000000' },
    };
    const settingsState = {
      systemName: 'Retail System',
      defaultCurrency: 'USD',
      currencySymbol: '$',
    };

    const identity = resolveBusinessIdentity(authState, settingsState);
    expect(identity.organizationName).toBe('Retail System');
    expect(identity.shopName).toBe('Main Shop');
    expect(identity.currency).toBe('USD');
    expect(identity.currencySymbol).toBe('$');
    expect(identity.printedBy).toBe('John Cashier');
  });

  it('gracefully provides fallbacks when all state is empty or undefined', () => {
    const identity = resolveBusinessIdentity({});

    expect(identity.organizationName).toBe('Zana POS');
    expect(identity.shopName).toBeNull();
    expect(identity.displayName).toBe('Zana POS');
    expect(identity.address).toBeNull();
    expect(identity.phone).toBeNull();
    expect(identity.email).toBeNull();
    expect(identity.kraPin).toBeNull();
    expect(identity.vatRegistered).toBe(false);
    expect(identity.taxRate).toBe(0);
    expect(identity.currency).toBe('KES');
    expect(identity.currencySymbol).toBe('KSh');
    expect(identity.hasTaxIdentity).toBe(false);
    expect(identity.showPoweredBy).toBe(true);
  });

  it('never invents a KRA PIN when neither shop nor settings provide one', () => {
    const identity = resolveBusinessIdentity({
      auth: { user: { name: 'Test' }, shop: { name: 'Shop without PIN' } },
      settings: { vatRegistered: true },
    });

    expect(identity.kraPin).toBeNull();
    expect(identity.hasTaxIdentity).toBe(false);
  });

  it('resolves invoice title: TAX INVOICE when VAT registered and KRA PIN is valid', () => {
    const identityWithTax = {
      vatRegistered: true,
      kraPin: 'P051234567Z',
      isValidPin: true,
      hasTaxIdentity: true,
    };
    expect(resolveInvoiceDocumentTitle(identityWithTax)).toBe('TAX INVOICE');
  });

  it('conservatively falls back to INVOICE when PIN format is structurally invalid despite VAT flag', () => {
    const identityWithInvalidPin = {
      vatRegistered: true,
      kraPin: 'INVALID_PIN',
      isValidPin: false,
    };
    expect(resolveInvoiceDocumentTitle(identityWithInvalidPin)).toBe('INVOICE');
  });

  it('resolves invoice title: INVOICE when not VAT registered or missing KRA PIN', () => {
    expect(resolveInvoiceDocumentTitle({ vatRegistered: false, kraPin: 'P051234567Z', isValidPin: true })).toBe('INVOICE');
    expect(resolveInvoiceDocumentTitle({ vatRegistered: true, kraPin: null })).toBe('INVOICE');
    expect(resolveInvoiceDocumentTitle({})).toBe('INVOICE');
  });

  it('explicitly flags isETimsCertified as false and provides statutory disclaimer', () => {
    const identity = resolveBusinessIdentity({
      settings: { vatRegistered: true },
      auth: { shop: { kraPin: 'P051234567X' } },
    });

    expect(identity.isETimsCertified).toBe(false);
    expect(typeof identity.statutoryNotice).toBe('string');
    expect(identity.statutoryNotice).toContain('KRA eTIMS');
  });

  it('resolves printedBy from firstName and lastName when name is absent', () => {
    const identity = resolveBusinessIdentity({
      auth: { user: { firstName: 'Alice', lastName: 'Wambui' } },
    });
    expect(identity.printedBy).toBe('Alice Wambui');
  });

  it('formats displayName correctly when shopName matches organizationName', () => {
    const identity = resolveBusinessIdentity({
      auth: {
        organization: { name: 'Acme Traders' },
        shop: { name: 'Acme Traders' },
      },
    });
    expect(identity.displayName).toBe('Acme Traders');
  });
});
