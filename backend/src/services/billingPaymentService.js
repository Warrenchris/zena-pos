const axios = require('axios');
const crypto = require('crypto');

/**
 * Format phone number to Safaricom standard format (254XXXXXXXXX)
 */
function formatPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[\s\-\+]/g, '');
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

/**
 * Resolves M-Pesa API credentials from environment variables for SaaS subscription billing
 */
function getMpesaBillingConfig() {
  return {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortcode: process.env.MPESA_SHORTCODE || '174379',
    passkey: process.env.MPESA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
    callbackUrl: process.env.MPESA_BILLING_CALLBACK_URL || process.env.MPESA_CALLBACK_URL || 'https://api.zenapos.com/api/billing/mpesa/callback'
  };
}

/**
 * Fetches OAuth bearer token from Safaricom Daraja API
 */
async function getOAuthToken() {
  const config = getMpesaBillingConfig();

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
    console.error('Error generating Daraja OAuth token for billing:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with Safaricom Daraja API.');
  }
}

/**
 * Initiates an M-Pesa STK Push prompt for subscription renewal
 */
async function initiateMpesaRenewal({ phone, invoice, organizationId }) {
  if (!phone) {
    throw new Error('Phone number is required for M-Pesa STK push.');
  }
  if (!invoice) {
    throw new Error('Invoice is required for M-Pesa renewal.');
  }

  const config = getMpesaBillingConfig();
  const accessToken = await getOAuthToken();

  const { shortcode, passkey, callbackUrl } = config;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(shortcode + passkey + timestamp).toString('base64');
  const formattedPhone = formatPhoneNumber(phone);
  const roundedAmount = Math.round(parseFloat(invoice.amount));

  // Generate single-use cryptographically random verification token
  const callbackToken = crypto.randomBytes(32).toString('hex');
  invoice.metadata = {
    ...(invoice.metadata || {}),
    callbackToken
  };

  let targetCallbackUrl = callbackUrl;
  if (targetCallbackUrl.includes('?')) {
    targetCallbackUrl += `&token=${callbackToken}`;
  } else {
    targetCallbackUrl += `?token=${callbackToken}`;
  }

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
    CallBackURL: targetCallbackUrl,
    AccountReference: invoice.invoiceNumber.substring(0, 12),
    TransactionDesc: `Renewal ${invoice.invoiceNumber}`
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.CheckoutRequestID) {
      const checkoutRequestId = response.data.CheckoutRequestID;
      invoice.paymentChannel = 'mpesa';
      invoice.paymentReference = checkoutRequestId;
      await invoice.save();

      return {
        checkoutRequestId,
        invoiceNumber: invoice.invoiceNumber,
        customerMessage: response.data.CustomerMessage || 'Success. Request accepted for processing'
      };
    } else {
      throw new Error('No CheckoutRequestID returned from Daraja STK Push API.');
    }
  } catch (error) {
    console.error('Daraja STK Push error for subscription renewal:', error.response?.data || error.message);
    throw new Error(error.response?.data?.errorMessage || error.message || 'Failed to initiate M-Pesa STK Push.');
  }
}

/**
 * Queries Safaricom Daraja STK Push Query API to verify status independently of webhook
 */
async function queryMpesaStkPushStatus({ checkoutRequestId }) {
  if (!checkoutRequestId) {
    throw new Error('CheckoutRequestID is required to query STK Push status.');
  }

  const config = getMpesaBillingConfig();
  const accessToken = await getOAuthToken();

  const { shortcode, passkey } = config;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(shortcode + passkey + timestamp).toString('base64');

  const env = process.env.MPESA_ENV === 'production' ? 'api' : 'sandbox';
  const url = `https://${env}.safaricom.co.ke/mpesa/stkpushquery/v1/query`;

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Daraja STK Push Query error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.errorMessage || error.message || 'Failed to query M-Pesa STK Push status.');
  }
}

/**
 * Initiates Flutterwave card payment session for subscription renewal
 */
async function initiateCardRenewal({ invoice, userEmail, userName, redirectUrl }) {
  if (!invoice) {
    throw new Error('Invoice is required for Card renewal.');
  }

  const secretKey = process.env.FLW_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Flutterwave secret key not configured (FLW_SECRET_KEY).');
  }

  const txRef = invoice.invoiceNumber;
  const url = 'https://api.flutterwave.com/v3/payments';
  const payload = {
    tx_ref: txRef,
    amount: parseFloat(invoice.amount),
    currency: invoice.currency || 'KES',
    redirect_url: redirectUrl || process.env.FLW_BILLING_REDIRECT_URL || 'http://localhost:5173/billing/complete',
    customer: {
      email: userEmail || 'merchant@zenapos.com',
      name: userName || 'Organization Owner'
    },
    customizations: {
      title: 'Zena POS Subscription Renewal',
      description: `Payment for Invoice ${invoice.invoiceNumber}`
    }
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.status === 'success') {
      invoice.paymentChannel = 'card';
      invoice.paymentReference = txRef;
      await invoice.save();

      return {
        paymentReference: txRef,
        redirectUrl: response.data.data.link
      };
    } else {
      throw new Error(response.data?.message || 'Failed to initiate card renewal on Flutterwave.');
    }
  } catch (error) {
    console.error('Flutterwave initiation error for subscription renewal:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || error.message || 'Failed to contact card payment gateway.');
  }
}

module.exports = {
  formatPhoneNumber,
  getMpesaBillingConfig,
  getOAuthToken,
  initiateMpesaRenewal,
  initiateCardRenewal,
  queryMpesaStkPushStatus
};
