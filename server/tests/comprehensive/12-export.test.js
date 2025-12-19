/**
 * Section 12: CSV Export Tests
 * Tests: export products, invoices, customers, suppliers, inventory
 */

const PerformanceMonitor = require('./helpers/performance');
const ApiClient = require('./helpers/apiClient');

describe('Section 12: CSV Export', () => {
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

	describe('12.1 Export Products', () => {
		test('Should export products as CSV', async () => {
			const timer = perfMonitor.start('export-products');
			const response = await apiClient.get('/api/export/products');

			expect(response.headers['content-type']).toContain('text/csv');
			expect(response.headers['content-disposition']).toContain('products.csv');
			expect(typeof response.text).toBe('string');

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('export-products', metric.duration, 3000);
		});
	});

	describe('12.2 Export Invoices', () => {
		test('Should export invoices as CSV', async () => {
			const timer = perfMonitor.start('export-invoices');
			const response = await apiClient.get('/api/export/invoices');

			expect(response.headers['content-type']).toContain('text/csv');
			expect(response.headers['content-disposition']).toContain('invoices.csv');

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('export-invoices', metric.duration, 3000);
		});
	});

	describe('12.3 Export Customers', () => {
		test('Should export customers as CSV', async () => {
			const timer = perfMonitor.start('export-customers');
			const response = await apiClient.get('/api/export/customers');

			expect(response.headers['content-type']).toContain('text/csv');
			expect(response.headers['content-disposition']).toContain('customers.csv');

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('export-customers', metric.duration, 2000);
		});
	});

	describe('12.4 Export Suppliers', () => {
		test('Should export suppliers as CSV', async () => {
			const timer = perfMonitor.start('export-suppliers');
			const response = await apiClient.get('/api/export/suppliers');

			expect(response.headers['content-type']).toContain('text/csv');
			expect(response.headers['content-disposition']).toContain('suppliers.csv');

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('export-suppliers', metric.duration, 2000);
		});
	});

	describe('12.5 Export Inventory', () => {
		test('Should export inventory as CSV', async () => {
			const timer = perfMonitor.start('export-inventory');
			const response = await apiClient.get('/api/export/inventory');

			expect(response.headers['content-type']).toContain('text/csv');
			expect(response.headers['content-disposition']).toContain('inventory.csv');

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('export-inventory', metric.duration, 3000);
		});
	});
});

