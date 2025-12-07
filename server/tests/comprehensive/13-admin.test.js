/**
 * Section 13: Admin Tests
 * Tests: health check, user management (admin only endpoints)
 */

const request = require('supertest');
const app = require('../../index');
const PerformanceMonitor = require('./helpers/performance');
const ApiClient = require('./helpers/apiClient');

describe('Section 13: Admin', () => {
	let perfMonitor;
	let apiClient;

	beforeAll(async () => {
		perfMonitor = new PerformanceMonitor();
		apiClient = new ApiClient();
		await apiClient.authenticate();
	});

	afterAll(() => {
		perfMonitor.printSummary();
	});

	describe('13.1 Health Check', () => {
		test('Should require admin authentication', async () => {
			const timer = perfMonitor.start('health-check-unauthorized');
			const response = await request(app)
				.get('/api/admin/health')
				.expect(401);

			expect(response.body).toHaveProperty('error');
			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('health-check-unauthorized', metric.duration, 500);
		});

		test('Should return health status (if admin)', async () => {
			const timer = perfMonitor.start('health-check');
			const response = await apiClient
				.get('/api/admin/health', [200, 401, 403]);

			// If user is admin, should return health data
			if (response.status === 200) {
				expect(response.body).toHaveProperty('status');
				expect(response.body).toHaveProperty('database');
				expect(response.body).toHaveProperty('server');
			}

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('health-check', metric.duration, 2000);
		});
	});

	describe('13.2 Database Health', () => {
		test('Should return database health', async () => {
			const timer = perfMonitor.start('db-health');
			const response = await request(app)
				.get('/api/health')
				.expect(200);

			expect(response.body).toHaveProperty('status');
			expect(response.body).toHaveProperty('ping');

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('db-health', metric.duration, 2000);
		});
	});
});

