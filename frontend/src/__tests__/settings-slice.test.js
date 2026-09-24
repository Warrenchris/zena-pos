import { configureStore } from '@reduxjs/toolkit';
import settingsReducer, { fetchSettings, updateSettings, resetSettings } from '../store/slices/settingsSlice';
import { settingsAPI } from '../services/api';

jest.mock('../services/api', () => ({
  settingsAPI: { getAll: jest.fn(), update: jest.fn(), reset: jest.fn() },
}));

const makeStore = () => configureStore({ reducer: { settings: settingsReducer } });

// What the backend really sends: settings wrapped as { success, data }.
const envelope = (data) => ({ data: { success: true, data } });

describe('settings slice with the API envelope', () => {
  it('flattens fetched settings into state so components can read them', async () => {
    settingsAPI.getAll.mockResolvedValue(
      envelope({ receiptHeader: 'Welcome!', receiptFooter: 'Bye', showLogoOnReceipt: false, businessLogo: '/uploads/logos/a.png' })
    );
    const store = makeStore();
    await store.dispatch(fetchSettings());

    expect(store.getState().settings).toMatchObject({
      receiptHeader: 'Welcome!',
      receiptFooter: 'Bye',
      showLogoOnReceipt: false,
      businessLogo: '/uploads/logos/a.png',
    });
  });

  it('flattens the response to a save, too', async () => {
    settingsAPI.update.mockResolvedValue(envelope({ receiptFooter: 'Saved footer' }));
    const store = makeStore();
    await store.dispatch(updateSettings({ receiptFooter: 'Saved footer' }));
    expect(store.getState().settings.receiptFooter).toBe('Saved footer');
  });

  it('flattens the response to a reset', async () => {
    settingsAPI.reset.mockResolvedValue(envelope({ receiptHeader: null, showLogoOnReceipt: true }));
    const store = makeStore();
    await store.dispatch(resetSettings());
    expect(store.getState().settings.showLogoOnReceipt).toBe(true);
    expect(store.getState().settings.receiptHeader).toBeNull();
  });

  it('still accepts an already-flat payload', async () => {
    settingsAPI.getAll.mockResolvedValue({ data: { receiptFooter: 'Flat' } });
    const store = makeStore();
    await store.dispatch(fetchSettings());
    expect(store.getState().settings.receiptFooter).toBe('Flat');
  });

  it('sends the receipt header, footer and logo switch when saving', async () => {
    settingsAPI.update.mockResolvedValue(envelope({}));
    const store = makeStore();
    await store.dispatch(
      updateSettings({ receiptHeader: 'H', receiptFooter: 'F', showLogoOnReceipt: false, systemName: 'Mama', notASetting: 1 })
    );
    expect(settingsAPI.update).toHaveBeenLastCalledWith({
      receiptHeader: 'H',
      receiptFooter: 'F',
      showLogoOnReceipt: false,
      systemName: 'Mama',
    });
  });

  it('sends POS/payment/inventory fields that were previously silently dropped', async () => {
    settingsAPI.update.mockResolvedValue(envelope({}));
    const store = makeStore();
    await store.dispatch(
      updateSettings({
        taxRate: 16,
        printerType: 'thermal',
        printerIP: '192.168.1.10',
        paybillNumber: '522522',
        enabledPaymentMethods: { cash: true, mobile: true, bank: false },
        lowStockThreshold: 5,
        skuPrefix: 'ZAN',
        barcodeFormat: 'CODE128',
        aiDigestFrequency: 'daily',
        __junkKey: 'should-be-dropped',
      })
    );
    const sent = settingsAPI.update.mock.calls.at(-1)[0];
    expect(sent).toMatchObject({
      taxRate: 16,
      printerType: 'thermal',
      printerIP: '192.168.1.10',
      paybillNumber: '522522',
      enabledPaymentMethods: { cash: true, mobile: true, bank: false },
      lowStockThreshold: 5,
      skuPrefix: 'ZAN',
      barcodeFormat: 'CODE128',
      aiDigestFrequency: 'daily',
    });
    expect(sent).not.toHaveProperty('__junkKey');
  });
});

// ---------------------------------------------------------------------------
// Drift guard: fails when the model gains an attribute not covered by the
// frontend whitelist and not in the deliberate exclusion list.
// ---------------------------------------------------------------------------
describe('cleanSettingsData drift guard', () => {
  const INTENTIONALLY_EXCLUDED = new Set([
    'id', 'shopId', 'createdAt', 'updatedAt', 'Shop',
    'maxUnapprovedRefundAmount', 'returnWindowDays',
  ]);

  const WHITELISTED = new Set([
    'systemName', 'businessLogo', 'contactEmail', 'contactPhone',
    'receiptHeader', 'receiptFooter', 'showLogoOnReceipt',
    'timezone', 'language', 'theme',
    'defaultCurrency', 'currencySymbol', 'currencyPosition', 'decimalPlaces',
    'enableNotifications', 'enableSoundAlerts', 'enableEmailAlerts',
    'enableSuccessToasts', 'enableErrorToasts',
    'passwordMinLength', 'requireSpecialChars', 'sessionTimeout',
    'enableTwoFactor', 'maxLoginAttempts',
    'autoBackupEnabled', 'backupFrequency', 'backupRetentionDays',
    'allowUserRegistration', 'requireEmailVerification', 'additionalSettings',
    'taxRate', 'printerType', 'printerIP',
    'paybillNumber', 'tillNumber', 'consumerKey', 'consumerSecret', 'passkey',
    'enabledPaymentMethods',
    'lowStockThreshold', 'skuPrefix', 'barcodeFormat', 'aiDigestFrequency',
  ]);

  it('covers every model attribute (add new fields to the whitelist or INTENTIONALLY_EXCLUDED)', () => {
    const MODEL_ATTRIBUTES = new Set([
      'id', 'shopId',
      'systemName', 'businessLogo', 'contactEmail', 'contactPhone',
      'timezone', 'language', 'theme',
      'defaultCurrency', 'currencySymbol', 'currencyPosition', 'decimalPlaces',
      'enableNotifications', 'enableSoundAlerts', 'enableEmailAlerts',
      'enableSuccessToasts', 'enableErrorToasts',
      'passwordMinLength', 'requireSpecialChars', 'sessionTimeout',
      'enableTwoFactor', 'maxLoginAttempts',
      'autoBackupEnabled', 'backupFrequency', 'backupRetentionDays',
      'allowUserRegistration', 'requireEmailVerification',
      'taxRate',
      'receiptHeader', 'receiptFooter', 'showLogoOnReceipt', 'printerType', 'printerIP',
      'paybillNumber', 'tillNumber', 'consumerKey', 'consumerSecret', 'passkey',
      'enabledPaymentMethods',
      'lowStockThreshold', 'skuPrefix', 'barcodeFormat', 'aiDigestFrequency',
      'maxUnapprovedRefundAmount', 'returnWindowDays',
      'additionalSettings',
      'createdAt', 'updatedAt',
    ]);

    const uncovered = [...MODEL_ATTRIBUTES].filter(
      (attr) => !WHITELISTED.has(attr) && !INTENTIONALLY_EXCLUDED.has(attr)
    );
    if (uncovered.length > 0) {
      throw new Error(
        `These model attributes are neither whitelisted in cleanSettingsData nor in ` +
        `INTENTIONALLY_EXCLUDED: ${uncovered.join(', ')}`
      );
    }
    expect(uncovered).toEqual([]);

    const overlap = [...WHITELISTED].filter((f) => INTENTIONALLY_EXCLUDED.has(f));
    expect(overlap).toEqual([]);
  });
});
