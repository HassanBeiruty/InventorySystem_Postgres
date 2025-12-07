/**
 * Section 3: Suppliers Tests
 * Tests: create, list, update suppliers
 */

const request = require('supertest');
const app = require('../../index');
const PerformanceMonitor = require('./helpers/performance');
const TestDataGenerator = require('./helpers/testData');
const ApiClient = require('./helpers/apiClient');

describe('Section 3: Suppliers', () => {
	let perfMonitor;
	let testData;
	let apiClient;
	let createdSuppliers = [];

	beforeAll(async () => {
		perfMonitor = new PerformanceMonitor();
		testData = new TestDataGenerator();
		apiClient = new ApiClient();
		await apiClient.authenticate();
	});

	afterAll(() => {
		perfMonitor.printSummary();
	});

	describe('3.1 Create Supplier', () => {
		test('Should create supplier successfully', async () => {
			const timer = perfMonitor.start('create-supplier');
			const supplierData = testData.generateSupplier();

			const response = await apiClient
				.post('/api/suppliers', supplierData, 200);

			expect(response.body).toHaveProperty('id');
			expect(typeof response.body.id).toBe('number');
			createdSuppliers.push(response.body.id);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('create-supplier', metric.duration, 1000);
		});

		test('Should require name field', async () => {
			const timer = perfMonitor.start('create-supplier-no-name');
			const response = await request(app)
				.post('/api/suppliers')
				.send({
					phone: '+9611234567',
					address: 'Test Address'
				})
				.expect(400);

			expect(response.body).toHaveProperty('error');
			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('create-supplier-no-name', metric.duration, 500);
		});
	});

	describe('3.2 List Suppliers', () => {
		test('Should return list of suppliers', async () => {
			const timer = perfMonitor.start('list-suppliers');
			const response = await request(app)
				.get('/api/suppliers')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);
			if (response.body.length > 0) {
				expect(response.body[0]).toHaveProperty('id');
				expect(response.body[0]).toHaveProperty('name');
			}

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('list-suppliers', metric.duration, 2000);
		});
	});

	describe('3.3 Update Supplier', () => {
		test('Should update supplier successfully', async () => {
			if (createdSuppliers.length === 0) {
				const supplierData = testData.generateSupplier();
				const createRes = await apiClient.post('/api/suppliers', supplierData, 200);
				createdSuppliers.push(createRes.body.id);
			}

			const timer = perfMonitor.start('update-supplier');
			const supplierId = createdSuppliers[0];
			const updateData = {
				name: `Updated Supplier ${Date.now()}`,
				phone: '+9618888888',
				address: 'Updated Address'
			};

			const response = await apiClient
				.put(`/api/suppliers/${supplierId}`, updateData, 200);

			expect(response.body).toHaveProperty('id', supplierId);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('update-supplier', metric.duration, 1000);
		});
	});
});

