const axios = require('axios');

/**
 * Initiate Card payment via Flutterwave API
 */
async function initiateCardPayment({ amount, currency, customerEmail, customerName, orderId, shopId }) {
  const secretKey = process.env.FLW_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Flutterwave secret key not configured (FLW_SECRET_KEY).');
  }

  const url = 'https://api.flutterwave.com/v3/payments';
  const payload = {
    tx_ref: orderId || `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    amount: parseFloat(amount),
    currency: currency || 'KES',
    redirect_url: process.env.FLW_REDIRECT_URL || 'http://localhost:5173/card-redirect',
    customer: {
      email: customerEmail || 'customer@example.com',
      name: customerName || 'Walk-in Customer'
    },
    customizations: {
      title: 'Zena POS Card Payment',
      description: `Payment for Order ${orderId}`
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
      return {
        paymentReference: payload.tx_ref,
        redirectUrl: response.data.data.link
      };
    } else {
      throw new Error(response.data?.message || 'Failed to initiate card payment on Flutterwave.');
    }
  } catch (error) {
    console.error('Flutterwave initiation error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Failed to contact card payment gateway.');
  }
}

/**
 * Verify Card payment via Flutterwave API
 */
async function verifyPayment(reference) {
  const secretKey = process.env.FLW_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Flutterwave secret key not configured (FLW_SECRET_KEY).');
  }

  const url = `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${secretKey}`
      }
    });

    if (response.data && response.data.status === 'success' && response.data.data.status === 'successful') {
      return {
        verified: true,
        amount: response.data.data.amount,
        currency: response.data.data.currency,
        gatewayRef: String(response.data.data.id)
      };
    } else {
      return {
        verified: false,
        amount: 0,
        currency: 'KES',
        gatewayRef: ''
      };
    }
  } catch (error) {
    console.error('Flutterwave verification error:', error.response?.data || error.message);
    return {
      verified: false,
      amount: 0,
      currency: 'KES',
      gatewayRef: ''
    };
  }
}

module.exports = {
  initiateCardPayment,
  verifyPayment
};
