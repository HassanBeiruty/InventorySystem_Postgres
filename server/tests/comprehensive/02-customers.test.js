/**
 * Section 2: Customers Tests
 * Tests: create, list, update customers
 */

const request = require('supertest');
const app = require('../../index');
const PerformanceMonitor = require('./helpers/performance');
const TestDataGenerator = require('./helpers/testData');
const ApiClient = require('./helpers/apiClient');

describe('Section 2: Customers', () => {
	let perfMonitor;
	let testData;
	let apiClient;
	let createdCustomers = [];

	beforeAll(async () => {
		perfMonitor = new PerformanceMonitor();
		testData = new TestDataGenerator();
		apiClient = new ApiClient();
		await apiClient.authenticate();
	});

	afterAll(() => {
		perfMonitor.printSummary();
	});

	describe('2.1 Create Customer', () => {
		test('Should create customer successfully', async () => {
			const timer = perfMonitor.start('create-customer');
			const customerData = testData.generateCustomer();

			const response = await apiClient
				.post('/api/customers', customerData, 200);

			expect(response.body).toHaveProperty('id');
			expect(typeof response.body.id).toBe('number');
			createdCustomers.push(response.body.id);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('create-customer', metric.duration, 1000);
		});

		test('Should require name field', async () => {
			const timer = perfMonitor.start('create-customer-no-name');
			const response = await request(app)
				.post('/api/customers')
				.send({
					phone: '+9611234567',
					address: 'Test Address'
				})
				.expect(400);

			expect(response.body).toHaveProperty('error');
			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('create-customer-no-name', metric.duration, 500);
		});

		test('Should create customer with optional fields', async () => {
			const timer = perfMonitor.start('create-customer-full');
			const customerData = testData.generateCustomer();

			const response = await apiClient
				.post('/api/customers', customerData, 200);

			expect(response.body).toHaveProperty('id');
			createdCustomers.push(response.body.id);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('create-customer-full', metric.duration, 1000);
		});
	});

	describe('2.2 List Customers', () => {
		test('Should return list of customers', async () => {
			const timer = perfMonitor.start('list-customers');
			const response = await request(app)
				.get('/api/customers')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);
			if (response.body.length > 0) {
				expect(response.body[0]).toHaveProperty('id');
				expect(response.body[0]).toHaveProperty('name');
			}

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('list-customers', metric.duration, 2000);
		});
	});

	describe('2.3 Update Customer', () => {
		test('Should update customer successfully', async () => {
			if (createdCustomers.length === 0) {
				// Create a customer first
				const customerData = testData.generateCustomer();
				const createRes = await apiClient.post('/api/customers', customerData, 200);
				createdCustomers.push(createRes.body.id);
			}

			const timer = perfMonitor.start('update-customer');
			const customerId = createdCustomers[0];
			const updateData = {
				name: `Updated Customer ${Date.now()}`,
				phone: '+9619999999',
				credit_limit: 5000
			};

			const response = await apiClient
				.put(`/api/customers/${customerId}`, updateData, 200);

			expect(response.body).toHaveProperty('id', customerId);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('update-customer', metric.duration, 1000);
		});

		test('Should update partial customer data', async () => {
			if (createdCustomers.length === 0) {
				const customerData = testData.generateCustomer();
				const createRes = await apiClient.post('/api/customers', customerData, 200);
				createdCustomers.push(createRes.body.id);
			}

			const timer = perfMonitor.start('update-customer-partial');
			const customerId = createdCustomers[0];
			const updateData = { name: `Partial Update ${Date.now()}` };

			const response = await apiClient
				.put(`/api/customers/${customerId}`, updateData, 200);

			expect(response.body).toHaveProperty('id', customerId);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('update-customer-partial', metric.duration, 1000);
		});

		test('Should reject invalid customer ID', async () => {
			const timer = perfMonitor.start('update-customer-invalid-id');
			const response = await apiClient
				.put('/api/customers/invalid', { name: 'Test' }, 400);

			expect(response.body).toHaveProperty('error');
			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('update-customer-invalid-id', metric.duration, 500);
		});
	});
});

