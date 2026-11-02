/**
 * Zana POS — Unified Document Design System (UDDS)
 * Authoritative Business Identity Resolver
 *
 * Resolves verified shop, organization, and settings metadata from application state.
 * Never hardcodes or invents missing business profile values.
 */

import { DOCUMENT_FORMATS } from './documentTokens';

/**
 * Resolves authoritative business identity for document headers and footers.
 * Accepts either:
 * - (rootState) where rootState is { auth, settings }
 * - (authState, settingsState) as two separate parameters
 *
 * @param {Object} authOrRootState - Auth slice state or entire Redux store state
 * @param {Object} [maybeSettingsState] - Settings slice state if passed separately
 * @returns {Object} Normalized, verified business identity object
 */
export function resolveBusinessIdentity(authOrRootState = {}, maybeSettingsState = null) {
  // Normalize parameters: detect if root state was passed
  let auth = {};
  let settings = {};

  if (authOrRootState && ('auth' in authOrRootState || 'settings' in authOrRootState)) {
    auth = authOrRootState.auth || {};
    settings = authOrRootState.settings || {};
  } else {
    auth = authOrRootState || {};
    settings = maybeSettingsState || {};
  }

  // 1. Organization & Shop Names
  const user = auth.user || null;
  const activeShop = auth.shop || user?.shop || null;
  const organization = user?.organization || auth.organization || null;

  const organizationName = (
    organization?.name ||
    user?.organizationName ||
    settings.systemName ||
    'Zana POS'
  ).trim();

  const shopName = (
    activeShop?.name ||
    settings.branch ||
    null
  )?.trim() || null;

  // Composite display name
  let displayName = organizationName;
  if (shopName && shopName.toLowerCase() !== organizationName.toLowerCase()) {
    displayName = `${organizationName} — ${shopName}`;
  } else if (!organizationName && shopName) {
    displayName = shopName;
  }

  // 2. Physical Location & Contact Info
  const address = (
    activeShop?.address ||
    settings.address ||
    null
  )?.trim() || null;

  const phone = (
    activeShop?.phone ||
    settings.contactPhone ||
    null
  )?.trim() || null;

  const email = (
    activeShop?.email ||
    settings.contactEmail ||
    user?.email ||
    null
  )?.trim() || null;

  // 3. Tax & Legal Identity
  // KRA PIN: Verified strictly against shop.kraPin or settings.kraPin; never invented
  const kraPin = (
    activeShop?.kraPin ||
    settings.kraPin ||
    null
  )?.trim() || null;

  const registrationNumber = (
    activeShop?.registrationNumber ||
    null
  )?.trim() || null;

  const vatRegistered = Boolean(settings.vatRegistered);
  const taxRate = typeof settings.taxRate === 'number' ? settings.taxRate : Number(settings.taxRate) || 0;
  const taxInclusive = Boolean(settings.taxInclusive);

  // 4. Currency
  const currency = (
    settings.defaultCurrency ||
    organization?.currency ||
    DOCUMENT_FORMATS.defaultCurrency
  ).trim();

  const currencySymbol = (
    settings.currencySymbol ||
    DOCUMENT_FORMATS.defaultCurrencySymbol
  ).trim();

  // 5. Branding & Visual Assets
  const logoUrl = (
    activeShop?.logoUrl ||
    settings.businessLogo ||
    null
  );

  const tagline = (
    settings.tagline ||
    null
  )?.trim() || null;

  const showPoweredBy = settings.showPoweredBy !== false;

  // 6. User / Operator metadata
  const printedBy = (
    user?.name ||
    (user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : null) ||
    user?.email ||
    null
  );

  return {
    organizationName,
    shopName,
    displayName,
    address,
    phone,
    email,
    kraPin,
    registrationNumber,
    vatRegistered,
    taxRate,
    taxInclusive,
    currency,
    currencySymbol,
    logoUrl,
    tagline,
    showPoweredBy,
    printedBy,
    // Convenience flags
    hasTaxIdentity: Boolean(vatRegistered && kraPin),
    hasContactInfo: Boolean(phone || email || address),
  };
}

/**
 * Resolves standard invoice title based on verified tax registration status.
 * Under Kenyan tax practice, only VAT-registered entities with a valid PIN issue a "TAX INVOICE".
 * Unregistered entities or standard commercial billing use "INVOICE".
 *
 * @param {Object} identity - Result from resolveBusinessIdentity
 * @returns {string} 'TAX INVOICE' or 'INVOICE'
 */
export function resolveInvoiceDocumentTitle(identity = {}) {
  return identity.hasTaxIdentity || (identity.vatRegistered && identity.kraPin)
    ? 'TAX INVOICE'
    : 'INVOICE';
}

export default resolveBusinessIdentity;
