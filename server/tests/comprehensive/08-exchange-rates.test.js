/**
 * Section 8: Exchange Rates Tests
 * Tests: create, list, update, delete, get current rate (admin only)
 */

const request = require('supertest');
const app = require('../../index');
const PerformanceMonitor = require('./helpers/performance');
const TestDataGenerator = require('./helpers/testData');
const ApiClient = require('./helpers/apiClient');

describe('Section 8: Exchange Rates', () => {
	let perfMonitor;
	let testData;
	let apiClient;
	let createdRates = [];

	beforeAll(async () => {
		perfMonitor = new PerformanceMonitor();
		testData = new TestDataGenerator();
		apiClient = new ApiClient();
		await apiClient.authenticate();
	});

	afterAll(() => {
		perfMonitor.printSummary();
	});

	describe('8.1 Get Current Rate', () => {
		test('Should return USD rate (always 1.0)', async () => {
			const timer = perfMonitor.start('get-usd-rate');
			const response = await request(app)
				.get('/api/exchange-rates/USD/rate')
				.expect(200);

			expect(response.body).toHaveProperty('currency_code', 'USD');
			expect(response.body).toHaveProperty('rate_to_usd', 1.0);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('get-usd-rate', metric.duration, 1000);
		});

		test('Should return LBP rate if exists', async () => {
			const timer = perfMonitor.start('get-lbp-rate');
			const response = await request(app)
				.get('/api/exchange-rates/LBP/rate')
				.expect([200, 404]);

			if (response.status === 200) {
				expect(response.body).toHaveProperty('currency_code', 'LBP');
				expect(response.body).toHaveProperty('rate_to_usd');
			}

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('get-lbp-rate', metric.duration, 1000);
		});
	});

	describe('8.2 List Exchange Rates (Admin)', () => {
		test('Should require admin authentication', async () => {
			const timer = perfMonitor.start('list-rates-unauthorized');
			const response = await request(app)
				.get('/api/exchange-rates')
				.expect(401);

			expect(response.body).toHaveProperty('error');
			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('list-rates-unauthorized', metric.duration, 500);
		});
	});

	describe('8.3 Create Exchange Rate (Admin)', () => {
		test('Should require admin authentication', async () => {
			const timer = perfMonitor.start('create-rate-unauthorized');
			const rateData = testData.generateExchangeRate('LBP', 89500);

			// 401 = not authenticated, 403 = authenticated but not admin (both are valid)
			const response = await apiClient
				.post('/api/exchange-rates', rateData, [401, 403]);

			expect(response.body).toHaveProperty('error');
			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('create-rate-unauthorized', metric.duration, 500);
		});
	});
});

