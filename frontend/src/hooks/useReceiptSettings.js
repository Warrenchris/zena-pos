import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import api from '../services/api';
import { selectSettings } from '../store/slices/settingsSlice';
import { buildReceiptSettings } from '../printing/receiptSettings';
import { PUBLIC_APP_URL } from '../config/config';

/**
 * Shop-wide receipt customisation (header text, footer text, logo) from the
 * app settings, ready to hand to the printing service.
 */
export default function useReceiptSettings() {
  const { receiptHeader, receiptFooter, showLogoOnReceipt, businessLogo, branch, tagline, showPoweredBy, qrEnabled } = useSelector(selectSettings);
  const apiBaseUrl = api?.defaults?.baseURL;

  return useMemo(
    () => buildReceiptSettings({ receiptHeader, receiptFooter, showLogoOnReceipt, businessLogo, branch, tagline, showPoweredBy, qrEnabled, publicAppUrl: PUBLIC_APP_URL }, apiBaseUrl),
    [receiptHeader, receiptFooter, showLogoOnReceipt, businessLogo, branch, tagline, showPoweredBy, qrEnabled, apiBaseUrl]
  );
}
