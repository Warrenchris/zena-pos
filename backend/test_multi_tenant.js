/**
 * Multi-Tenant Isolation Test Script
 * 
 * This script tests the multi-tenant architecture to ensure
 * data isolation between different shops/companies.
 */

const jwt = require('jsonwebtoken');
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

// Test configuration
const TEST_CONFIG = {
  shop1: {
    name: 'Test Shop 1',
    address: '123 Test St',
    phone: '555-0001'
  },
  shop2: {
    name: 'Test Shop 2', 
    address: '456 Test Ave',
    phone: '555-0002'
  },
  users: {
    shop1_admin: {
      name: 'Shop 1 Admin',
      email: 'admin1@testshop1.com',
      password: 'password123',
      role: 'admin'
    },
    shop2_admin: {
      name: 'Shop 2 Admin',
      email: 'admin2@testshop2.com', 
      password: 'password123',
      role: 'admin'
    }
  }
};

class MultiTenantTester {
  constructor() {
    this.tokens = {};
    this.shopIds = {};
    this.testResults = [];
  }

  async runTests() {
    console.log('🧪 Starting Multi-Tenant Isolation Tests...\n');

    try {
      // Setup test shops and users
      await this.setupTestData();
      
      // Test data isolation
      await this.testDataIsolation();
      
      // Test cross-shop access prevention
      await this.testCrossShopAccessPrevention();
      
      // Test shop-scoped operations
      await this.testShopScopedOperations();
      
      // Generate report
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Test execution failed:', error.message);
      process.exit(1);
    }
  }

  async setupTestData() {
    console.log('📋 Setting up test data...');
    
    // Create shops
    const shop1Response = await this.createShop(TEST_CONFIG.shop1);
    const shop2Response = await this.createShop(TEST_CONFIG.shop2);
    
    this.shopIds.shop1 = shop1Response.id;
    this.shopIds.shop2 = shop2Response.id;
    
    console.log(`✅ Shop 1 created with ID: ${this.shopIds.shop1}`);
    console.log(`✅ Shop 2 created with ID: ${this.shopIds.shop2}`);
    
    // Create users for each shop
    const user1Response = await this.createUser({
      ...TEST_CONFIG.users.shop1_admin,
      shop: { name: TEST_CONFIG.shop1.name }
    });
    
    const user2Response = await this.createUser({
      ...TEST_CONFIG.users.shop2_admin,
      shop: { name: TEST_CONFIG.shop2.name }
    });
    
    console.log(`✅ User 1 created for Shop 1`);
    console.log(`✅ User 2 created for Shop 2`);
    
    // Login users to get tokens
    this.tokens.shop1 = await this.loginUser(TEST_CONFIG.users.shop1_admin);
    this.tokens.shop2 = await this.loginUser(TEST_CONFIG.users.shop2_admin);
    
    console.log(`✅ Authentication tokens obtained\n`);
  }

  async testDataIsolation() {
    console.log('🔒 Testing data isolation...');
    
    // Create test data for Shop 1
    const shop1Product = await this.createProduct('Shop 1 Product', this.tokens.shop1);
    const shop1Customer = await this.createCustomer('Shop 1 Customer', this.tokens.shop1);
    
    // Create test data for Shop 2
    const shop2Product = await this.createProduct('Shop 2 Product', this.tokens.shop2);
    const shop2Customer = await this.createCustomer('Shop 2 Customer', this.tokens.shop2);
    
    // Test that Shop 1 can only see its own data
    const shop1Products = await this.getProducts(this.tokens.shop1);
    const shop1Customers = await this.getCustomers(this.tokens.shop1);
    
    // Test that Shop 2 can only see its own data
    const shop2Products = await this.getProducts(this.tokens.shop2);
    const shop2Customers = await this.getCustomers(this.tokens.shop2);
    
    // Verify isolation
    const shop1SeesOwnProduct = shop1Products.some(p => p.id === shop1Product.id);
    const shop1SeesOtherProduct = shop1Products.some(p => p.id === shop2Product.id);
    
    const shop2SeesOwnProduct = shop2Products.some(p => p.id === shop2Product.id);
    const shop2SeesOtherProduct = shop2Products.some(p => p.id === shop1Product.id);
    
    this.addTestResult('Data Isolation - Products', {
      shop1SeesOwn: shop1SeesOwnProduct,
      shop1SeesOther: shop1SeesOtherProduct,
      shop2SeesOwn: shop2SeesOwnProduct,
      shop2SeesOther: shop2SeesOtherProduct,
      passed: shop1SeesOwnProduct && !shop1SeesOtherProduct && shop2SeesOwnProduct && !shop2SeesOtherProduct
    });
    
    console.log(`✅ Data isolation test completed\n`);
  }

  async testCrossShopAccessPrevention() {
    console.log('🚫 Testing cross-shop access prevention...');
    
    // Try to access Shop 1's data using Shop 2's token
    try {
      const shop1Products = await this.getProducts(this.tokens.shop1);
      const shop1ProductId = shop1Products[0]?.id;
      
      if (shop1ProductId) {
        // Try to access Shop 1's product using Shop 2's token
        const response = await this.makeRequest('GET', `/products/${shop1ProductId}`, null, this.tokens.shop2);
        this.addTestResult('Cross-Shop Access Prevention', {
          attemptedAccess: true,
          accessGranted: response !== null,
          passed: response === null // Should be null (access denied)
        });
      }
    } catch (error) {
      this.addTestResult('Cross-Shop Access Prevention', {
        attemptedAccess: true,
        accessGranted: false,
        error: error.response?.status === 404 ? 'Product not found (correct)' : error.message,
        passed: error.response?.status === 404
      });
    }
    
    console.log(`✅ Cross-shop access prevention test completed\n`);
  }

  async testShopScopedOperations() {
    console.log('🏪 Testing shop-scoped operations...');
    
    // Test that new data is automatically associated with correct shop
    const newProductShop1 = await this.createProduct('Auto-Assigned Product', this.tokens.shop1);
    const newProductShop2 = await this.createProduct('Auto-Assigned Product', this.tokens.shop2);
    
    // Verify products are in correct shops
    const shop1Products = await this.getProducts(this.tokens.shop1);
    const shop2Products = await this.getProducts(this.tokens.shop2);
    
    const shop1HasNewProduct = shop1Products.some(p => p.id === newProductShop1.id);
    const shop2HasNewProduct = shop2Products.some(p => p.id === newProductShop2.id);
    const shop1SeesShop2Product = shop1Products.some(p => p.id === newProductShop2.id);
    const shop2SeesShop1Product = shop2Products.some(p => p.id === newProductShop1.id);
    
    this.addTestResult('Shop-Scoped Operations', {
      shop1HasOwnProduct: shop1HasNewProduct,
      shop2HasOwnProduct: shop2HasNewProduct,
      shop1SeesOtherProduct: shop1SeesShop2Product,
      shop2SeesOtherProduct: shop2SeesShop1Product,
      passed: shop1HasNewProduct && shop2HasNewProduct && !shop1SeesShop2Product && !shop2SeesShop1Product
    });
    
    console.log(`✅ Shop-scoped operations test completed\n`);
  }

  // Helper methods
  async createShop(shopData) {
    // This would typically be done through an admin endpoint
    // For testing, we'll simulate the shop creation
    return {
      id: Math.floor(Math.random() * 1000) + 1,
      ...shopData
    };
  }

  async createUser(userData) {
    const response = await this.makeRequest('POST', '/auth/register', userData);
    return response;
  }

  async loginUser(credentials) {
    const response = await this.makeRequest('POST', '/auth/login', credentials);
    return response.token;
  }

  async createProduct(name, token) {
    const productData = {
      name,
      sku: `SKU-${Date.now()}`,
      price: 10.99,
      cost: 5.00,
      stockQuantity: 100,
      reorderPoint: 10,
      CategoryId: 1 // Assuming category exists
    };
    
    const response = await this.makeRequest('POST', '/products', productData, token);
    return response;
  }

  async createCustomer(name, token) {
    const customerData = {
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '')}@test.com`,
      phone: '555-0123'
    };
    
    const response = await this.makeRequest('POST', '/customers', customerData, token);
    return response;
  }

  async getProducts(token) {
    const response = await this.makeRequest('GET', '/products', null, token);
    return response;
  }

  async getCustomers(token) {
    const response = await this.makeRequest('GET', '/customers', null, token);
    return response;
  }

  async makeRequest(method, endpoint, data, token) {
    try {
      const config = {
        method,
        url: `${BASE_URL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };
      
      if (data) {
        config.data = data;
      }
      
      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return null; // Resource not found
      }
      throw error;
    }
  }

  addTestResult(testName, result) {
    this.testResults.push({
      test: testName,
      result,
      timestamp: new Date().toISOString()
    });
  }

  generateReport() {
    console.log('📊 Test Results Report');
    console.log('='.repeat(50));
    
    let passedTests = 0;
    let totalTests = this.testResults.length;
    
    this.testResults.forEach((test, index) => {
      const status = test.result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${index + 1}. ${test.test}: ${status}`);
      
      if (!test.result.passed) {
        console.log(`   Details:`, JSON.stringify(test.result, null, 2));
      }
      
      if (test.result.passed) passedTests++;
    });
    
    console.log('='.repeat(50));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (passedTests === totalTests) {
      console.log('\n🎉 All tests passed! Multi-tenant isolation is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the implementation.');
      process.exit(1);
    }
  }
}

// Run the tests
if (require.main === module) {
  const tester = new MultiTenantTester();
  tester.runTests().catch(console.error);
}

module.exports = MultiTenantTester;
