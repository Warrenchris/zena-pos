// Test script to verify currency settings are working
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testCurrencySettings() {
  try {
    console.log('🧪 Testing Currency Settings Implementation...\n');

    // Test 1: Get current settings
    console.log('1. Fetching current settings...');
    const getResponse = await axios.get(`${API_BASE_URL}/api/settings`, {
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN_HERE' // Replace with actual token
      }
    });
    console.log('✅ Current settings:', getResponse.data);

    // Test 2: Update currency settings
    console.log('\n2. Updating currency settings...');
    const updateData = {
      defaultCurrency: 'USD',
      currencySymbol: '$',
      currencyPosition: 'before',
      decimalPlaces: 2
    };
    
    const updateResponse = await axios.put(`${API_BASE_URL}/api/settings`, updateData, {
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN_HERE' // Replace with actual token
      }
    });
    console.log('✅ Currency settings updated:', updateResponse.data);

    // Test 3: Get currency format specifically
    console.log('\n3. Fetching currency format...');
    const currencyResponse = await axios.get(`${API_BASE_URL}/api/settings/currency`, {
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN_HERE' // Replace with actual token
      }
    });
    console.log('✅ Currency format:', currencyResponse.data);

    // Test 4: Reset to default currency
    console.log('\n4. Resetting to default currency (KES)...');
    const resetData = {
      defaultCurrency: 'KES',
      currencySymbol: 'KSh',
      currencyPosition: 'before',
      decimalPlaces: 2
    };
    
    const resetResponse = await axios.put(`${API_BASE_URL}/api/settings`, resetData, {
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN_HERE' // Replace with actual token
      }
    });
    console.log('✅ Currency settings reset:', resetResponse.data);

    console.log('\n🎉 All currency settings tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Instructions for running the test
console.log(`
📋 Currency Settings Test Instructions:

1. Make sure your backend server is running on port 3000
2. Replace 'YOUR_TOKEN_HERE' with a valid authentication token
3. Run: node test-currency-settings.js

The test will:
- Fetch current settings
- Update currency to USD
- Verify currency format endpoint
- Reset back to KES (default)

Expected behavior:
- Settings should be saved and retrieved correctly
- Currency formatting should update throughout the app
- All currency displays should use the new settings
`);

if (require.main === module) {
  testCurrencySettings();
}

module.exports = { testCurrencySettings };
