import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import api from '../services/api';
import { selectSettings } from '../store/slices/settingsSlice';
import { buildReceiptSettings } from '../printing/receiptSettings';

/**
 * Shop-wide receipt customisation (header text, footer text, logo) from the
 * app settings, ready to hand to the printing service.
 */
export default function useReceiptSettings() {
  const { receiptHeader, receiptFooter, showLogoOnReceipt, businessLogo } = useSelector(selectSettings);
  const apiBaseUrl = api?.defaults?.baseURL;

  return useMemo(
    () => buildReceiptSettings({ receiptHeader, receiptFooter, showLogoOnReceipt, businessLogo }, apiBaseUrl),
    [receiptHeader, receiptFooter, showLogoOnReceipt, businessLogo, apiBaseUrl]
  );
}
