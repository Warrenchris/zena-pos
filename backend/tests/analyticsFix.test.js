
const { getCachedAnalytics, setCachedAnalytics } = require('../src/utils/analyticsCache');
const sequelize = require('../src/config/database');

// Mock dependencies
jest.mock('../src/config/database', () => ({
    query: jest.fn(),
    QueryTypes: { SELECT: 'SELECT' }
}));

jest.mock('../src/utils/analyticsCache', () => ({
    getCachedAnalytics: jest.fn(),
    setCachedAnalytics: jest.fn()
}));

// Import controller AFTER mocking
const analyticsController = require('../src/controllers/analyticsController');

describe('Analytics Controller Fix Verification', () => {
    let req, res;

    beforeEach(() => {
        req = {
            query: { period: 'week' },
            user: { shopId: 1 }
        };
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
        };
        jest.clearAllMocks();
    });

    test('getOrderTracking should correctly aggregate revenue', async () => {
        // Mock cache miss
        getCachedAnalytics.mockReturnValue(null);

        // Mock database results with multiple entries for the same date
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

        // Find data for the dates
        const day1 = responseData.orderData.find(d => d.date === '2023-10-26');
        const day2 = responseData.orderData.find(d => d.date === '2023-10-27');

        // Verify aggregations
        expect(day1).toBeDefined();
        expect(day1.orders).toBe(3); // 2 + 1
        expect(day1.revenue).toBe(225.50); // 150.00 + 75.50

        expect(day2).toBeDefined();
        expect(day2.orders).toBe(5);
        expect(day2.revenue).toBe(500.00);
    });
});
