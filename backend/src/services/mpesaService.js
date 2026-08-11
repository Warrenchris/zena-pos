const axios = require('axios');

/**
 * Format phone number to Safaricom standard (2547XXXXXXXX or 2541XXXXXXXX)
 */
function formatPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[\s\-\+]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.substring(1);
  }
  if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
    if (cleaned.length === 9) {
      cleaned = '254' + cleaned;
    }
  }
  return cleaned;
}

const { SystemSettings } = require('../models');
const { decrypt } = require('../utils/encryption');

/**
 * Retrieve M-Pesa credentials from DB SystemSettings (decrypted), falling back to process.env
 */
async function getMpesaConfig(shopId) {
  let dbSettings = null;
  if (shopId) {
    dbSettings = await SystemSettings.findOne({ where: { shopId } }).catch(() => null);
  }

  const dbConsumerKey = dbSettings?.consumerKey ? decrypt(dbSettings.consumerKey) : null;
  const dbConsumerSecret = dbSettings?.consumerSecret ? decrypt(dbSettings.consumerSecret) : null;
  const dbPasskey = dbSettings?.passkey ? decrypt(dbSettings.passkey) : null;
  const dbShortcode = dbSettings?.paybillNumber || dbSettings?.tillNumber || null;

  return {
    consumerKey: dbConsumerKey || process.env.MPESA_CONSUMER_KEY,
    consumerSecret: dbConsumerSecret || process.env.MPESA_CONSUMER_SECRET,
    shortcode: dbShortcode || process.env.MPESA_SHORTCODE,
    passkey: dbPasskey || process.env.MPESA_PASSKEY,
    callbackUrl: process.env.MPESA_CALLBACK_URL
  };
}

/**
 * Call Safaricom Daraja OAuth endpoint to get a bearer token
 */
async function getOAuthToken(shopId) {
  const config = await getMpesaConfig(shopId);

  if (!config.consumerKey || !config.consumerSecret) {
    throw new Error('M-Pesa credentials not configured (MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET).');
  }

  const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  const env = process.env.MPESA_ENV === 'production' ? 'api' : 'sandbox';
  const url = `https://${env}.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Basic ${auth}`
      }
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Error generating M-Pesa token:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with Safaricom Daraja API.');
  }
}

/**
 * Initiate Daraja STK Push request
 */
async function initiateStkPush({ phone, amount, orderId, shopId }) {
  const config = await getMpesaConfig(shopId);
  const accessToken = await getOAuthToken(shopId);
  
  const { shortcode, passkey, callbackUrl } = config;

  if (!shortcode || !passkey || !callbackUrl) {
    throw new Error('M-Pesa configuration missing (MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL).');
  }

  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(shortcode + passkey + timestamp).toString('base64');
  const formattedPhone = formatPhoneNumber(phone);
  const roundedAmount = Math.round(parseFloat(amount));

  const env = process.env.MPESA_ENV === 'production' ? 'api' : 'sandbox';
  const url = `https://${env}.safaricom.co.ke/mpesa/stkpush/v1/processrequest`;

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: roundedAmount,
    PartyA: formattedPhone,
    PartyB: shortcode,
    PhoneNumber: formattedPhone,
    CallBackURL: callbackUrl,
    AccountReference: String(orderId).substring(0, 12),
    TransactionDesc: `Order ${orderId}`
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.CheckoutRequestID) {
      return response.data.CheckoutRequestID;
    } else {
      throw new Error('No CheckoutRequestID returned from Daraja STK Push API.');
    }
  } catch (error) {
    console.error('STK Push Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.errorMessage || 'Failed to initiate M-Pesa STK Push.');
  }
}

/**
 * Verify Safaricom callback payload structure and extract details
 */
function verifyCallback(payload) {
  if (!payload || !payload.Body || !payload.Body.stkCallback) {
    throw new Error('Invalid Safaricom callback payload');
  }

  const stkCallback = payload.Body.stkCallback;
  const checkoutRequestId = stkCallback.CheckoutRequestID;
  const resultCode = stkCallback.ResultCode;
  const resultDesc = stkCallback.ResultDesc;

  let amount = 0;
  let mpesaReceiptNumber = '';

  if (resultCode === 0 && stkCallback.CallbackMetadata && stkCallback.CallbackMetadata.Item) {
    const items = stkCallback.CallbackMetadata.Item;
    const amountItem = items.find(item => item.Name === 'Amount');
    const receiptItem = items.find(item => item.Name === 'MpesaReceiptNumber');

    if (amountItem) amount = amountItem.Value;
    if (receiptItem) mpesaReceiptNumber = receiptItem.Value;
  }

  return {
    checkoutRequestId,
    resultCode,
    resultDesc,
    amount,
    mpesaReceiptNumber
  };
}

module.exports = {
  initiateStkPush,
  verifyCallback,
  formatPhoneNumber,
  getOAuthToken
};
