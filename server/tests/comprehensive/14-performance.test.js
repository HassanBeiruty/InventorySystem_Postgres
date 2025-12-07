/**
 * Section 14: Performance Tests
 * Tests overall system performance and response times
 */

const request = require('supertest');
const app = require('../../index');
const PerformanceMonitor = require('./helpers/performance');
const TestDataGenerator = require('./helpers/testData');
const ApiClient = require('./helpers/apiClient');

describe('Section 14: Performance Tests', () => {
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

	describe('14.1 Response Time Benchmarks', () => {
		test('GET endpoints should respond quickly', async () => {
			const endpoints = [
				{ path: '/api/customers', name: 'List Customers' },
				{ path: '/api/suppliers', name: 'List Suppliers' },
				{ path: '/api/categories', name: 'List Categories' },
				{ path: '/api/products', name: 'List Products' },
				{ path: '/api/invoices/stats', name: 'Invoice Stats' }
			];

			for (const endpoint of endpoints) {
				const timer = perfMonitor.start(endpoint.name);
				const response = await request(app)
					.get(endpoint.path)
					.expect([200, 401, 403]);

				const metric = perfMonitor.end(timer);
				// Most GET endpoints should be under 2 seconds
				perfMonitor.assertPerformance(endpoint.name, metric.duration, 2000);
			}
		});

		test('POST endpoints should respond within acceptable time', async () => {
			const customerData = testData.generateCustomer();
			const timer = perfMonitor.start('POST Customer');
			const response = await apiClient
				.post('/api/customers', customerData, 200);

			const metric = perfMonitor.end(timer);
			// POST operations should be under 1.5 seconds
			perfMonitor.assertPerformance('POST Customer', metric.duration, 1500);
		});
	});

	describe('14.2 Concurrent Request Performance', () => {
		test('Should handle multiple concurrent requests', async () => {
			const timer = perfMonitor.start('concurrent-requests');
			const requests = [
				request(app).get('/api/customers'),
				request(app).get('/api/suppliers'),
				request(app).get('/api/categories'),
				request(app).get('/api/products')
			];

			const responses = await Promise.all(requests);
			responses.forEach(res => {
				expect([200, 401, 403]).toContain(res.status);
			});

			const metric = perfMonitor.end(timer);
			// Concurrent requests should complete within reasonable time
			perfMonitor.assertPerformance('concurrent-requests', metric.duration, 5000);
		});
	});

	describe('14.3 Performance Summary', () => {
		test('Should generate performance report', () => {
			const summary = perfMonitor.getSummary();
			
			console.log('\n' + '='.repeat(60));
			console.log('FINAL PERFORMANCE SUMMARY');
			console.log('='.repeat(60));
			console.log(`Total Test Requests: ${summary.count}`);
			console.log(`Total Time: ${summary.total}ms`);
			console.log(`Average Response Time: ${summary.average}ms`);
			console.log(`Fastest Request: ${summary.min}ms`);
			console.log(`Slowest Request: ${summary.max}ms`);
			console.log('\nPerformance by Status:');
			Object.entries(summary.byStatus).forEach(([status, count]) => {
				console.log(`  ${status}: ${count} requests`);
			});
			console.log('='.repeat(60) + '\n');

			// Assertions
			expect(summary.count).toBeGreaterThan(0);
			expect(summary.average).toBeLessThan(2000); // Average should be under 2 seconds
			expect(summary.max).toBeLessThan(10000); // No request should take more than 10 seconds
		});
	});
});

