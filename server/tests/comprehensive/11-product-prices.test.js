/**
 * Section 11: Product Prices Tests
 * Tests: create, list, update, delete, get latest prices
 */

const request = require('supertest');
const app = require('../../index');
const PerformanceMonitor = require('./helpers/performance');
const TestDataGenerator = require('./helpers/testData');
const ApiClient = require('./helpers/apiClient');

describe('Section 11: Product Prices', () => {
	let perfMonitor;
	let testData;
	let apiClient;
	let createdPrices = [];
	let createdProducts = [];
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
	});

	afterAll(() => {
		perfMonitor.printSummary();
	});

	describe('11.1 Create Product Price', () => {
		test('Should create product price successfully', async () => {
			const timer = perfMonitor.start('create-product-price');
			const priceData = testData.generateProductPrice(createdProducts[0], 50.00, 75.00);

			const response = await apiClient
				.post('/api/product-prices', priceData, 200);

			expect(response.body).toHaveProperty('id');
			createdPrices.push(response.body.id);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('create-product-price', metric.duration, 1000);
		});
	});

	describe('11.2 List Product Prices', () => {
		test('Should return list of product prices', async () => {
			const timer = perfMonitor.start('list-product-prices');
			const response = await request(app)
				.get('/api/product-prices')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('list-product-prices', metric.duration, 2000);
		});

		test('Should filter by product_id', async () => {
			const timer = perfMonitor.start('list-product-prices-filtered');
			const response = await request(app)
				.get(`/api/product-prices?product_id=${createdProducts[0]}`)
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('list-product-prices-filtered', metric.duration, 1000);
		});
	});

	describe('11.3 Get Product Prices', () => {
		test('Should return prices for specific product', async () => {
			const timer = perfMonitor.start('get-product-prices');
			const response = await request(app)
				.get(`/api/products/${createdProducts[0]}/prices`)
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('get-product-prices', metric.duration, 1000);
		});

		test('Should return latest price for product', async () => {
			const timer = perfMonitor.start('get-latest-product-price');
			const response = await request(app)
				.get(`/api/products/${createdProducts[0]}/price-latest`)
				.expect(200);

			// Can be null if no prices exist
			if (response.body) {
				expect(response.body).toHaveProperty('product_id');
			}

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('get-latest-product-price', metric.duration, 1000);
		});
	});

	describe('11.4 Get Latest Prices', () => {
		test('Should return latest prices for all products', async () => {
			const timer = perfMonitor.start('get-latest-prices');
			const response = await request(app)
				.get('/api/product-prices/latest')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('get-latest-prices', metric.duration, 2000);
		});
	});

	describe('11.5 Update Product Price', () => {
		test('Should update product price successfully', async () => {
			if (createdPrices.length === 0) {
				const priceData = testData.generateProductPrice(createdProducts[0], 50.00, 75.00);
				const createRes = await apiClient.post('/api/product-prices', priceData, 200);
				createdPrices.push(createRes.body.id);
			}

			const timer = perfMonitor.start('update-product-price');
			const priceId = createdPrices[0];
			const updateData = {
				wholesale_price: 60.00,
				retail_price: 85.00
			};

			const response = await apiClient
				.put(`/api/product-prices/${priceId}`, updateData, 200);

			expect(response.body).toHaveProperty('id', priceId);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('update-product-price', metric.duration, 1000);
		});
	});

	describe('11.6 Delete Product Price', () => {
		test('Should delete product price successfully', async () => {
			// Create a price specifically for deletion
			const priceData = testData.generateProductPrice(createdProducts[0], 40.00, 60.00);
			const createRes = await apiClient.post('/api/product-prices', priceData, 200);
			const priceId = createRes.body.id;

			const timer = perfMonitor.start('delete-product-price');
			const response = await apiClient
				.delete(`/api/product-prices/${priceId}`, 200);

			expect(response.body).toHaveProperty('success', true);

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('delete-product-price', metric.duration, 1000);
		});
	});
});

