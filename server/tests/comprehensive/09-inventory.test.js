/**
 * Section 9: Inventory Tests
 * Tests: low stock, daily inventory, today inventory, daily history
 */

const request = require('supertest');
const app = require('../../index');
const PerformanceMonitor = require('./helpers/performance');
const TestDataGenerator = require('./helpers/testData');
const ApiClient = require('./helpers/apiClient');

describe('Section 9: Inventory', () => {
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

	describe('9.1 Today Inventory', () => {
		test('Should return today inventory', async () => {
			const timer = perfMonitor.start('get-today-inventory');
			const response = await request(app)
				.get('/api/inventory/today')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('get-today-inventory', metric.duration, 3000);
		});
	});

	describe('9.2 Daily Inventory', () => {
		test('Should return daily inventory', async () => {
			const timer = perfMonitor.start('get-daily-inventory');
			const response = await request(app)
				.get('/api/inventory/daily')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('get-daily-inventory', metric.duration, 3000);
		});
	});

	describe('9.3 Daily History', () => {
		test('Should return daily history', async () => {
			const timer = perfMonitor.start('get-daily-history');
			const response = await request(app)
				.get('/api/inventory/daily-history')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('get-daily-history', metric.duration, 3000);
		});
	});

	describe('9.4 Low Stock', () => {
		test('Should return low stock products', async () => {
			const timer = perfMonitor.start('get-low-stock');
			const response = await request(app)
				.get('/api/inventory/low-stock/10')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('get-low-stock', metric.duration, 2000);
		});
	});
});

