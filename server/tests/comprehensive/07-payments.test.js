/**
 * Section 7: Invoice Payments Tests
 * Tests: create payment, list payments
 */

const request = require('supertest');
const app = require('../../index');
const PerformanceMonitor = require('./helpers/performance');
const TestDataGenerator = require('./helpers/testData');
const ApiClient = require('./helpers/apiClient');

describe('Section 7: Invoice Payments', () => {
	let perfMonitor;
	let testData;
	let apiClient;
	let createdInvoices = [];
	let createdProducts = [];
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

		const supplierData = testData.generateSupplier();
		const supplierRes = await apiClient.post('/api/suppliers', supplierData, 200);
		createdSuppliers.push(supplierRes.body.id);

		// Create an invoice for payment testing
		const items = [testData.generateInvoiceItem(createdProducts[0], 10, 20.00)];
		const invoiceData = testData.generateInvoice('buy', null, createdSuppliers[0], items);
		const invoiceRes = await apiClient.post('/api/invoices', invoiceData, 200);
		createdInvoices.push(invoiceRes.body.id);
	});

	afterAll(() => {
		perfMonitor.printSummary();
	});

	describe('7.1 Create Payment', () => {
		test('Should create payment in USD', async () => {
			if (createdInvoices.length === 0) {
				const items = [testData.generateInvoiceItem(createdProducts[0], 10, 20.00)];
				const invoiceData = testData.generateInvoice('buy', null, createdSuppliers[0], items);
				const invoiceRes = await apiClient.post('/api/invoices', invoiceData, 200);
				createdInvoices.push(invoiceRes.body.id);
			}

			const timer = perfMonitor.start('create-payment-usd');
			const invoiceId = createdInvoices[0];
			const paymentData = testData.generatePayment(100.00, 'USD', 1.0);

			const response = await apiClient
				.post(`/api/invoices/${invoiceId}/payments`, paymentData, 200);

			expect(response.body).toHaveProperty('id');
			expect(response.body).toHaveProperty('amount_paid');
			expect(response.body).toHaveProperty('payment_status');

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('create-payment-usd', metric.duration, 2000);
		});

		test('Should create payment in LBP', async () => {
			// Create another invoice
			const items = [testData.generateInvoiceItem(createdProducts[0], 5, 30.00)];
			const invoiceData = testData.generateInvoice('buy', null, createdSuppliers[0], items);
			const invoiceRes = await apiClient.post('/api/invoices', invoiceData, 200);
			const invoiceId = invoiceRes.body.id;

			const timer = perfMonitor.start('create-payment-lbp');
			const paymentData = testData.generatePayment(895000, 'LBP', 89500);

			const response = await apiClient
				.post(`/api/invoices/${invoiceId}/payments`, paymentData, 200);

			expect(response.body).toHaveProperty('id');
			expect(response.body).toHaveProperty('amount_paid');

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('create-payment-lbp', metric.duration, 2000);
		});

		test('Should validate payment amount', async () => {
			if (createdInvoices.length === 0) return;

			const timer = perfMonitor.start('create-payment-invalid-amount');
			const invoiceId = createdInvoices[0];
			const paymentData = {
				paid_amount: -100,
				currency_code: 'USD',
				exchange_rate_on_payment: 1.0
			};

			const response = await apiClient
				.post(`/api/invoices/${invoiceId}/payments`, paymentData, 400);

			expect(response.body).toHaveProperty('error');

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('create-payment-invalid-amount', metric.duration, 500);
		});
	});

	describe('7.2 List Payments', () => {
		test('Should return payments for invoice', async () => {
			if (createdInvoices.length === 0) return;

			const timer = perfMonitor.start('list-payments');
			const invoiceId = createdInvoices[0];
			const response = await request(app)
				.get(`/api/invoices/${invoiceId}/payments`)
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('list-payments', metric.duration, 1000);
		});
	});
});

