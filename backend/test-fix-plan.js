const analyticsController = require('./src/controllers/analyticsController');
const sequelize = require('./src/config/database');
const { getCachedAnalytics, setCachedAnalytics } = require('./src/utils/analyticsCache');

// Mock dependencies
jest.mock('./src/config/database', () => ({
    query: jest.fn(),
    QueryTypes: { SELECT: 'SELECT' }
}));

jest.mock('./src/utils/analyticsCache', () => ({
    getCachedAnalytics: jest.fn(),
    setCachedAnalytics: jest.fn()
}));

// Mock Request and Response
const req = {
    query: { period: 'week' },
    user: { shopId: 1 }
};

const res = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis()
};

async function testFix() {
    console.log('Testing analyticsController.getOrderTracking fix...');

    // Mock cache miss
    getCachedAnalytics.mockReturnValue(null);

    // Mock database results
    const mockResults = [
        {
            date: '2023-10-26',
            hour: 10,
            current_count: 2,
            current_revenue: 150.00,
            previous_count: 1,
            previous_revenue: 50.00
        },
        {
            date: '2023-10-26',
            hour: 14,
            current_count: 1,
            current_revenue: 75.50,
            previous_count: 0,
            previous_revenue: 0
        },
        {
            date: '2023-10-27',
            hour: 9,
            current_count: 5,
            current_revenue: 500.00,
            previous_count: 2,
            previous_revenue: 200.00
        }
    ];

    sequelize.query.mockResolvedValue(mockResults);

    await analyticsController.getOrderTracking(req, res);

    const responseData = res.json.mock.calls[0][0];
    console.log('Response Data:', JSON.stringify(responseData, null, 2));

    // Verification
    const day1 = responseData.orderData.find(d => d.date === '2023-10-26');
    const day2 = responseData.orderData.find(d => d.date === '2023-10-27');

    let passed = true;

    if (day1.revenue !== 225.50) {
        console.error(`FAILED: Expected revenue for 2023-10-26 to be 225.50, got ${day1.revenue}`);
        passed = false;
    } else {
        console.log('PASSED: Revenue for 2023-10-26 is correct (225.50)');
    }

    if (day2.revenue !== 500.00) {
        console.error(`FAILED: Expected revenue for 2023-10-27 to be 500.00, got ${day2.revenue}`);
        passed = false;
    } else {
        console.log('PASSED: Revenue for 2023-10-27 is correct (500.00)');
    }

    if (passed) {
        console.log('SUCCESS: The fix is verified!');
    } else {
        console.error('FAILURE: The fix did not work as expected.');
    }
}

// Run the test
// We need to setup the mocks properly. Since we are running this as a standalone script without Jest,
// we need to manually mock the requires or use a different approach.
// A simpler approach for this environment is to modify the controller to accept dependencies or
// just rely on the fact that I replaced the file content and trust the logic.
// BUT, I can create a script that requires the controller and mocks the modules by intercepting require calls
// or by using a library like proxyquire if available.
// Given the environment, I'll try to use a simple approach:
// I will create a temporary test file that defines the mocks BEFORE requiring the controller,
// but `require` caches modules, so I need to be careful.
// Actually, I can just use `jest` if it is installed. Let's check package.json.
