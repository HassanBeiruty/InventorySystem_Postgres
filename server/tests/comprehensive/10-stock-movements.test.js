/**
 * Section 10: Stock Movements Tests
 * Tests: recent stock movements
 */

const request = require('supertest');
const app = require('../../index');
const PerformanceMonitor = require('./helpers/performance');
const TestDataGenerator = require('./helpers/testData');
const ApiClient = require('./helpers/apiClient');

describe('Section 10: Stock Movements', () => {
	let perfMonitor;
	let testData;
	let apiClient;

	beforeAll(async () => {
		perfMonitor = new PerformanceMonitor();
		testData = new TestDataGenerator();
		apiClient = new ApiClient();
		await apiClient.authenticate();
	});

	afterAll(() => {
		perfMonitor.printSummary();
	});

	describe('10.1 Recent Stock Movements', () => {
		test('Should return recent stock movements', async () => {
			const timer = perfMonitor.start('get-recent-stock-movements');
			const response = await request(app)
				.get('/api/stock-movements/recent/20')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);
			expect(response.body.length).toBeLessThanOrEqual(20);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('get-recent-stock-movements', metric.duration, 2000);
		});
	});
});

