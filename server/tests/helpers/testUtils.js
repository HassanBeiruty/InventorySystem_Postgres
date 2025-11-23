const jwt = require('jsonwebtoken');

/**
 * Test utilities for API testing
 */
class TestUtils {
	constructor(app) {
		this.app = app;
		this.baseUrl = process.env.API_URL || 'http://localhost:5050';
		this.testUser = null;
		this.testToken = null;
		this.createdResources = {
			products: [],
			customers: [],
			suppliers: [],
			categories: [],
			invoices: [],
			prices: []
		};
	}

	/**
	 * Generate JWT token for testing
	 */
	generateToken(userId = 1, email = 'test@example.com', isAdmin = true) {
		const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only';
		return jwt.sign({ userId, email, isAdmin }, JWT_SECRET, { expiresIn: '1h' });
	}

	/**
	 * Make authenticated request
	 */
	async authenticatedRequest(method, path, data = null, token = null) {
		const headers = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${token || this.testToken || this.generateToken()}`
		};

		const options = {
			method,
			headers,
		};

		if (data && (method === 'POST' || method === 'PUT')) {
			options.body = JSON.stringify(data);
		}

		return fetch(`${this.baseUrl}${path}`, options);
	}

	/**
	 * Make unauthenticated request
	 */
	async request(method, path, data = null) {
		const headers = {
			'Content-Type': 'application/json'
		};

		const options = {
			method,
			headers,
		};

		if (data && (method === 'POST' || method === 'PUT')) {
			options.body = JSON.stringify(data);
		}

		return fetch(`${this.baseUrl}${path}`, options);
	}

	/**
	 * Parse JSON response
	 */
	async parseResponse(response) {
		const text = await response.text();
		try {
			return JSON.parse(text);
		} catch (e) {
			return { error: 'Invalid JSON', text };
		}
	}

	/**
	 * Clean up created test resources
	 */
	async cleanup() {
		// Clean up in reverse order of creation
		for (const invoiceId of this.createdResources.invoices.reverse()) {
			try {
				await this.authenticatedRequest('DELETE', `/api/invoices/${invoiceId}`);
			} catch (e) {
				// Ignore cleanup errors
			}
		}

		for (const priceId of this.createdResources.prices.reverse()) {
			try {
				await this.authenticatedRequest('DELETE', `/api/product-prices/${priceId}`);
			} catch (e) {
				// Ignore cleanup errors
			}
		}

		for (const productId of this.createdResources.products.reverse()) {
			try {
				await this.authenticatedRequest('DELETE', `/api/products/${productId}`);
			} catch (e) {
				// Ignore cleanup errors
			}
		}

		for (const customerId of this.createdResources.customers.reverse()) {
			try {
				await this.request('DELETE', `/api/customers/${customerId}`);
			} catch (e) {
				// Ignore cleanup errors
			}
		}

		for (const supplierId of this.createdResources.suppliers.reverse()) {
			try {
				await this.request('DELETE', `/api/suppliers/${supplierId}`);
			} catch (e) {
				// Ignore cleanup errors
			}
		}

		for (const categoryId of this.createdResources.categories.reverse()) {
			try {
				await this.authenticatedRequest('DELETE', `/api/categories/${categoryId}`);
			} catch (e) {
				// Ignore cleanup errors
			}
		}
	}

	/**
	 * Generate random test data
	 */
	generateTestData(type) {
		const timestamp = Date.now();
		const random = Math.floor(Math.random() * 10000);

		switch (type) {
			case 'user':
				return {
					email: `test${timestamp}@example.com`,
					password: 'TestPassword123!'
				};
			case 'product':
				return {
					name: `Test Product ${random}`,
					barcode: `BAR${timestamp}`,
					description: `Test product description ${random}`,
					sku: `SKU${timestamp}`,
					shelf: `Shelf-${random % 10}`
				};
			case 'customer':
				return {
					name: `Test Customer ${random}`,
					phone: `+961${random}`,
					address: `Test Address ${random}`,
					credit_limit: 1000
				};
			case 'supplier':
				return {
					name: `Test Supplier ${random}`,
					phone: `+961${random}`,
					address: `Test Address ${random}`
				};
			case 'category':
				return {
					name: `Test Category ${random}`,
					description: `Test category description ${random}`
				};
			case 'invoice':
				return {
					invoice_type: 'buy',
					total_amount: 100.00,
					is_paid: false,
					items: []
				};
			default:
				return {};
		}
	}
}

module.exports = TestUtils;

