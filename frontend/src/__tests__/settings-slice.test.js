import { configureStore } from '@reduxjs/toolkit';
import fs from 'fs';
import path from 'path';
import settingsReducer, {
  fetchSettings,
  updateSettings,
  resetSettings,
  SETTINGS_ALLOWED_FIELDS,
} from '../store/slices/settingsSlice';
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
      envelope({ receiptHeader: 'Welcome!', receiptFooter: 'Bye', showLogoOnReceipt: false, businessLogo: '/uploads/logos/a.png', taxInclusive: true })
    );
    const store = makeStore();
    await store.dispatch(fetchSettings());

    expect(store.getState().settings).toMatchObject({
      receiptHeader: 'Welcome!',
      receiptFooter: 'Bye',
      showLogoOnReceipt: false,
      businessLogo: '/uploads/logos/a.png',
      taxInclusive: true,
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
        taxInclusive: true,
        printerType: 'thermal',
        printerIP: '192.168.1.10',
        paybillNumber: '522522',
        enabledPaymentMethods: { cash: true, mobile: true, bank: false },
        lowStockThreshold: 5,
        skuPrefix: 'ZAN',
        barcodeFormat: 'CODE128',
        aiDigestFrequency: 'daily',
        maxUnapprovedRefundAmount: 2500,
        returnWindowDays: 14,
        __junkKey: 'should-be-dropped',
      })
    );
    const sent = settingsAPI.update.mock.calls.at(-1)[0];
    expect(sent).toMatchObject({
      taxRate: 16,
      taxInclusive: true,
      printerType: 'thermal',
      printerIP: '192.168.1.10',
      paybillNumber: '522522',
      enabledPaymentMethods: { cash: true, mobile: true, bank: false },
      lowStockThreshold: 5,
      skuPrefix: 'ZAN',
      barcodeFormat: 'CODE128',
      aiDigestFrequency: 'daily',
      maxUnapprovedRefundAmount: 2500,
      returnWindowDays: 14,
    });
    expect(sent).not.toHaveProperty('__junkKey');
  });

  it('preserves and round-trips taxInclusive boolean in updateSettings payload and state', async () => {
    settingsAPI.update.mockResolvedValue(envelope({ taxInclusive: true, taxRate: 16 }));
    const store = makeStore();
    await store.dispatch(updateSettings({ taxInclusive: true, taxRate: 16 }));
    const sent = settingsAPI.update.mock.calls.at(-1)[0];
    expect(sent.taxInclusive).toBe(true);
    expect(store.getState().settings.taxInclusive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Drift guard: reads the REAL exported whitelist and parses the REAL model
// file with fs so it cannot pass on a stale hand-typed list.
//
// To prove this guard works: temporarily remove 'taxRate' from
// SETTINGS_ALLOWED_FIELDS in settingsSlice.js — this test will fail with
// a message listing 'taxRate' as uncovered.  Restore it and it passes.
// ---------------------------------------------------------------------------
describe('cleanSettingsData drift guard', () => {
  // Fields the frontend intentionally never sends (protected / no UI control).
  // maxUnapprovedRefundAmount and returnWindowDays have no UI controls yet.
  const INTENTIONALLY_EXCLUDED = new Set([
    'id',
    'shopId',
    'createdAt',
    'updatedAt',
    // No fields intentionally excluded as of this version — all editable fields
    // have UI controls. Add entries here (with a comment) when a new model field
    // should NOT be editable from the Settings page.
  ]);

  /**
   * Parse top-level attribute keys from the sequelize.define(...) call in
   * SystemSettings.js using a regex.  We match every line of the form
   *   <identifier>: {
   * that appears inside the outermost define() argument object, stopping before
   * the closing `}, {` that begins the options object.
   */
  function extractModelAttributes() {
    const modelPath = path.resolve(
      __dirname,
      '../../../backend/src/models/SystemSettings.js'
    );
    const src = fs.readFileSync(modelPath, 'utf8');

    // Isolate the first argument object passed to sequelize.define():
    // everything between the opening `{` after `define('SystemSettings',` and
    // the matching `}` that ends the attributes object.
    const defineStart = src.indexOf("sequelize.define('SystemSettings',");
    if (defineStart === -1) throw new Error('Could not locate sequelize.define in SystemSettings.js');

    // Find the `{` that opens the attributes object
    const attrObjStart = src.indexOf('{', defineStart);

    // Walk to find the matching `}` (depth tracking)
    let depth = 0;
    let attrObjEnd = -1;
    for (let i = attrObjStart; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) { attrObjEnd = i; break; }
      }
    }
    if (attrObjEnd === -1) throw new Error('Could not find end of attributes object in SystemSettings.js');

    const attrBlock = src.slice(attrObjStart, attrObjEnd + 1);

    // Extract top-level keys: lines matching /^  <word>: {/ (two-space indent = depth 1)
    const attrs = [];
    const keyRe = /^  ([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm;
    let m;
    while ((m = keyRe.exec(attrBlock)) !== null) {
      attrs.push(m[1]);
    }
    return attrs;
  }

  it('covers every model attribute (add new fields to the whitelist or INTENTIONALLY_EXCLUDED)', () => {
    const whitelist = new Set(SETTINGS_ALLOWED_FIELDS); // real exported list
    const modelAttrs = extractModelAttributes();         // parsed from source

    const uncovered = modelAttrs.filter(
      (attr) => !whitelist.has(attr) && !INTENTIONALLY_EXCLUDED.has(attr)
    );

    if (uncovered.length > 0) {
      throw new Error(
        `These model attributes are neither whitelisted in SETTINGS_ALLOWED_FIELDS nor in ` +
        `INTENTIONALLY_EXCLUDED: ${uncovered.join(', ')}. ` +
        `Add them to the whitelist (if there is a UI control) or to INTENTIONALLY_EXCLUDED.`
      );
    }
    expect(uncovered).toEqual([]);

    // No field should appear in both sets
    const overlap = [...whitelist].filter((f) => INTENTIONALLY_EXCLUDED.has(f));
    expect(overlap).toEqual([]);
  });
});
