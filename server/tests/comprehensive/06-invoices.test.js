/**
 * Section 6: Invoices Tests
 * Tests: create, list, get, update, delete, stats, recent, overdue invoices
 */

const request = require('supertest');
const app = require('../../index');
const PerformanceMonitor = require('./helpers/performance');
const TestDataGenerator = require('./helpers/testData');
const ApiClient = require('./helpers/apiClient');

describe('Section 6: Invoices', () => {
	let perfMonitor;
	let testData;
	let apiClient;
	let createdInvoices = [];
	let createdProducts = [];
	let createdCustomers = [];
	let createdSuppliers = [];
	let createdCategories = [];

	beforeAll(async () => {
		perfMonitor = new PerformanceMonitor();
		testData = new TestDataGenerator();
		apiClient = new ApiClient();
		await apiClient.authenticate();

		// Setup test data
		const categoryData = testData.generateCategory();
		const categoryRes = await apiClient.post('/api/categories', categoryData, 200);
		createdCategories.push(categoryRes.body.id);

		const productData = testData.generateProduct(createdCategories[0]);
		const productRes = await apiClient.post('/api/products', productData, 200);
		createdProducts.push(productRes.body.id);

		const customerData = testData.generateCustomer();
		const customerRes = await apiClient.post('/api/customers', customerData, 200);
		createdCustomers.push(customerRes.body.id);

		const supplierData = testData.generateSupplier();
		const supplierRes = await apiClient.post('/api/suppliers', supplierData, 200);
		createdSuppliers.push(supplierRes.body.id);
	});

	afterAll(() => {
		perfMonitor.printSummary();
	});

	describe('6.1 Create Invoice', () => {
		test('Should create buy invoice successfully', async () => {
			const timer = perfMonitor.start('create-buy-invoice');
			const items = [
				testData.generateInvoiceItem(createdProducts[0], 10, 20.00)
			];
			const invoiceData = testData.generateInvoice('buy', null, createdSuppliers[0], items);

			const response = await apiClient
				.post('/api/invoices', invoiceData, 200);

			expect(response.body).toHaveProperty('id');
			expect(response.body).toHaveProperty('invoice_date');
			createdInvoices.push(response.body.id);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('create-buy-invoice', metric.duration, 3000);
		});

		test('Should create sell invoice successfully', async () => {
			const timer = perfMonitor.start('create-sell-invoice');
			const items = [
				testData.generateInvoiceItem(createdProducts[0], 5, 25.00)
			];
			const invoiceData = testData.generateInvoice('sell', createdCustomers[0], null, items);

			const response = await apiClient
				.post('/api/invoices', invoiceData, 200);

			expect(response.body).toHaveProperty('id');
			createdInvoices.push(response.body.id);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('create-sell-invoice', metric.duration, 3000);
		});

		test('Should validate invoice type', async () => {
			const timer = perfMonitor.start('create-invoice-invalid-type');
			const invoiceData = {
				invoice_type: 'invalid',
				total_amount: 100,
				items: []
			};

			const response = await request(app)
				.post('/api/invoices')
				.set('Authorization', `Bearer ${apiClient.token}`)
				.send(invoiceData)
				.expect(400);

			expect(response.body).toHaveProperty('error');
			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('create-invoice-invalid-type', metric.duration, 500);
		});
	});

	describe('6.2 List Invoices', () => {
		test('Should return list of invoices', async () => {
			const timer = perfMonitor.start('list-invoices');
			const response = await request(app)
				.get('/api/invoices')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);
			if (response.body.length > 0) {
				expect(response.body[0]).toHaveProperty('id');
				expect(response.body[0]).toHaveProperty('invoice_type');
			}

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('list-invoices', metric.duration, 3000);
		});
	});

	describe('6.3 Get Invoice Details', () => {
		test('Should return invoice with items', async () => {
			if (createdInvoices.length === 0) {
				const items = [testData.generateInvoiceItem(createdProducts[0], 5, 20.00)];
				const invoiceData = testData.generateInvoice('buy', null, createdSuppliers[0], items);
				const createRes = await apiClient.post('/api/invoices', invoiceData, 200);
				createdInvoices.push(createRes.body.id);
			}

			const timer = perfMonitor.start('get-invoice-details');
			const invoiceId = createdInvoices[0];
			const response = await request(app)
				.get(`/api/invoices/${invoiceId}`)
				.expect(200);

			expect(response.body).toHaveProperty('id', invoiceId);
			expect(response.body).toHaveProperty('invoice_items');
			expect(Array.isArray(response.body.invoice_items)).toBe(true);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('get-invoice-details', metric.duration, 2000);
		});
	});

	describe('6.4 Invoice Stats', () => {
		test('Should return invoice statistics', async () => {
			const timer = perfMonitor.start('invoice-stats');
			const response = await request(app)
				.get('/api/invoices/stats')
				.expect(200);

			expect(response.body).toHaveProperty('invoicesCount');
			expect(response.body).toHaveProperty('productsCount');
			expect(response.body).toHaveProperty('customersCount');
			expect(response.body).toHaveProperty('suppliersCount');
			expect(response.body).toHaveProperty('revenue');

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('invoice-stats', metric.duration, 2000);
		});
	});

	describe('6.5 Recent Invoices', () => {
		test('Should return recent invoices', async () => {
			const timer = perfMonitor.start('recent-invoices');
			const response = await request(app)
				.get('/api/invoices/recent/10')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);
			expect(response.body.length).toBeLessThanOrEqual(10);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('recent-invoices', metric.duration, 2000);
		});
	});

	describe('6.6 Overdue Invoices', () => {
		test('Should return overdue invoices', async () => {
			const timer = perfMonitor.start('overdue-invoices');
			const response = await request(app)
				.get('/api/invoices/overdue')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('overdue-invoices', metric.duration, 2000);
		});
	});

	describe('6.7 Update Invoice', () => {
		test('Should update invoice successfully', async () => {
			if (createdInvoices.length === 0) {
				const items = [testData.generateInvoiceItem(createdProducts[0], 5, 20.00)];
				const invoiceData = testData.generateInvoice('buy', null, createdSuppliers[0], items);
				const createRes = await apiClient.post('/api/invoices', invoiceData, 200);
				createdInvoices.push(createRes.body.id);
			}

			const timer = perfMonitor.start('update-invoice');
			const invoiceId = createdInvoices[0];
			const updateData = {
				invoice_type: 'buy',
				total_amount: 300.00,
				is_paid: false,
				items: [
					testData.generateInvoiceItem(createdProducts[0], 15, 20.00)
				]
			};

			const response = await apiClient
				.put(`/api/invoices/${invoiceId}`, updateData, 200);

			expect(response.body).toHaveProperty('id');

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('update-invoice', metric.duration, 3000);
		});
	});
});

