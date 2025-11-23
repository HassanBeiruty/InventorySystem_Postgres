/**
 * Comprehensive User Flow Test Suite
 * Simulates a real user interacting with the system
 * Tests all functionality and measures performance
 */

const request = require('supertest');
const TestUtils = require('../helpers/testUtils');

// Import app
const app = require('../../index');

describe('Complete User Flow Test Suite', () => {
	let testUtils;
	let authToken;
	let userId;
	let createdProducts = [];
	let createdCustomers = [];
	let createdSuppliers = [];
	let createdCategories = [];
	let createdInvoices = [];
	let performanceResults = [];

	beforeAll(async () => {
		testUtils = new TestUtils();
		global.testUtils.performance.clear();
	});

	afterAll(async () => {
		// Cleanup all created resources
		if (testUtils) {
			await testUtils.cleanup();
		}
	});

	describe('1. Authentication Flow', () => {
		test('1.1 User Signup - Should create new user', async () => {
			global.testUtils.performance.start('signup');
			
			const userData = testUtils.generateTestData('user');
			const response = await request(app)
				.post('/api/auth/signup')
				.send(userData)
				.expect(200);

			expect(response.body).toHaveProperty('id');
			expect(response.body).toHaveProperty('email', userData.email);
			expect(response.body).toHaveProperty('token');
			expect(response.body).toHaveProperty('isAdmin');

			authToken = response.body.token;
			userId = response.body.id;

			const duration = global.testUtils.performance.end('signup');
			performanceResults.push({ action: 'User Signup', duration, status: 'success' });
		});

		test('1.2 User Signin - Should authenticate existing user', async () => {
			global.testUtils.performance.start('signin');
			
			// Create unique user data - use the same user from test 1.1 if available
			// Otherwise create a new one
			let userData;
			if (authToken && userId) {
				// Use existing user from test 1.1 - but we need the password
				// So create a fresh user for this test
				const timestamp = Date.now();
				userData = {
					email: `testsignin${timestamp}@example.com`,
					password: 'TestPassword123!'
				};
			} else {
				const timestamp = Date.now();
				userData = {
					email: `testsignin${timestamp}@example.com`,
					password: 'TestPassword123!'
				};
			}
			
			// First signup and verify it worked
			const signupResponse = await request(app)
				.post('/api/auth/signup')
				.send(userData);
			
			expect(signupResponse.status).toBe(200);
			expect(signupResponse.body).toHaveProperty('token');
			expect(signupResponse.body).toHaveProperty('id');
			expect(signupResponse.body).toHaveProperty('email');
			
			// Wait longer to ensure database transaction is committed
			await new Promise(resolve => setTimeout(resolve, 500));
			
			// Then signin with the same credentials
			const response = await request(app)
				.post('/api/auth/signin')
				.send({
					email: userData.email,
					password: userData.password
				});

			// Debug if it fails
			if (response.status !== 200) {
				console.error('Signin failed:', {
					status: response.status,
					body: response.body,
					requestEmail: userData.email,
					signupResponse: signupResponse.body
				});
				
				// Try to query the user directly to see what's in the database
				const { query } = require('../../db');
				try {
					const dbCheck = await query('SELECT id, email, passwordHash FROM users WHERE email = $1', [userData.email]);
					console.error('Database check:', {
						found: dbCheck.recordset.length > 0,
						hasPasswordHash: dbCheck.recordset[0]?.passwordHash ? 'yes' : 'no',
						passwordHashLength: dbCheck.recordset[0]?.passwordHash?.length || 0
					});
				} catch (dbErr) {
					console.error('DB check error:', dbErr.message);
				}
			}

			expect(response.status).toBe(200);
			expect(response.body).toHaveProperty('token');
			expect(response.body).toHaveProperty('email');

			const duration = global.testUtils.performance.end('signin');
			performanceResults.push({ action: 'User Signin', duration, status: 'success' });
		});

		test('1.3 Get Current User - Should return user info', async () => {
			global.testUtils.performance.start('get-current-user');
			
			const response = await request(app)
				.get('/api/auth/me')
				.set('Authorization', `Bearer ${authToken}`)
				.expect(200);

			expect(response.body).toHaveProperty('id');
			expect(response.body).toHaveProperty('email');

			const duration = global.testUtils.performance.end('get-current-user');
			performanceResults.push({ action: 'Get Current User', duration, status: 'success' });
		});
	});

	describe('2. Category Management Flow', () => {
		test('2.1 Create Category - Should create new category', async () => {
			global.testUtils.performance.start('create-category');
			
			const categoryData = testUtils.generateTestData('category');
			const response = await request(app)
				.post('/api/categories')
				.set('Authorization', `Bearer ${authToken}`)
				.send(categoryData)
				.expect(200);

			expect(response.body).toHaveProperty('id');
			createdCategories.push(response.body.id);

			const duration = global.testUtils.performance.end('create-category');
			performanceResults.push({ action: 'Create Category', duration, status: 'success' });
		});

		test('2.2 List Categories - Should return all categories', async () => {
			global.testUtils.performance.start('list-categories');
			
			const response = await request(app)
				.get('/api/categories')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);
			expect(response.body.length).toBeGreaterThan(0);

			const duration = global.testUtils.performance.end('list-categories');
			performanceResults.push({ action: 'List Categories', duration, status: 'success' });
		});

		test('2.3 Update Category - Should update category', async () => {
			if (createdCategories.length === 0) return;
			
			global.testUtils.performance.start('update-category');
			
			const categoryId = createdCategories[0];
			// Use unique name to avoid duplicate constraint
			const updateData = { name: `Updated Category ${Date.now()}` };
			const response = await request(app)
				.put(`/api/categories/${categoryId}`)
				.set('Authorization', `Bearer ${authToken}`)
				.send(updateData)
				.expect(200);

			expect(response.body).toHaveProperty('id', categoryId);

			const duration = global.testUtils.performance.end('update-category');
			performanceResults.push({ action: 'Update Category', duration, status: 'success' });
		});
	});

	describe('3. Product Management Flow', () => {
		test('3.1 Create Product - Should create new product', async () => {
			global.testUtils.performance.start('create-product');
			
			const productData = testUtils.generateTestData('product');
			if (createdCategories.length > 0) {
				productData.category_id = createdCategories[0];
			}
			
			const response = await request(app)
				.post('/api/products')
				.set('Authorization', `Bearer ${authToken}`)
				.send(productData)
				.expect(200);

			expect(response.body).toHaveProperty('id');
			createdProducts.push(response.body.id);

			const duration = global.testUtils.performance.end('create-product');
			performanceResults.push({ action: 'Create Product', duration, status: 'success' });
		});

		test('3.2 List Products - Should return all products', async () => {
			global.testUtils.performance.start('list-products');
			
			const response = await request(app)
				.get('/api/products')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const duration = global.testUtils.performance.end('list-products');
			performanceResults.push({ action: 'List Products', duration, status: 'success' });
		});

		test('3.3 Update Product - Should update product', async () => {
			if (createdProducts.length === 0) return;
			
			global.testUtils.performance.start('update-product');
			
			const productId = createdProducts[0];
			const updateData = { name: 'Updated Product Name' };
			const response = await request(app)
				.put(`/api/products/${productId}`)
				.set('Authorization', `Bearer ${authToken}`)
				.send(updateData)
				.expect(200);

			expect(response.body).toHaveProperty('id', productId);

			const duration = global.testUtils.performance.end('update-product');
			performanceResults.push({ action: 'Update Product', duration, status: 'success' });
		});
	});

	describe('4. Customer Management Flow', () => {
		test('4.1 Create Customer - Should create new customer', async () => {
			global.testUtils.performance.start('create-customer');
			
			const customerData = testUtils.generateTestData('customer');
			const response = await request(app)
				.post('/api/customers')
				.send(customerData)
				.expect(200);

			expect(response.body).toHaveProperty('id');
			createdCustomers.push(response.body.id);

			const duration = global.testUtils.performance.end('create-customer');
			performanceResults.push({ action: 'Create Customer', duration, status: 'success' });
		});

		test('4.2 List Customers - Should return all customers', async () => {
			global.testUtils.performance.start('list-customers');
			
			const response = await request(app)
				.get('/api/customers')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const duration = global.testUtils.performance.end('list-customers');
			performanceResults.push({ action: 'List Customers', duration, status: 'success' });
		});
	});

	describe('5. Supplier Management Flow', () => {
		test('5.1 Create Supplier - Should create new supplier', async () => {
			global.testUtils.performance.start('create-supplier');
			
			const supplierData = testUtils.generateTestData('supplier');
			const response = await request(app)
				.post('/api/suppliers')
				.send(supplierData)
				.expect(200);

			expect(response.body).toHaveProperty('id');
			createdSuppliers.push(response.body.id);

			const duration = global.testUtils.performance.end('create-supplier');
			performanceResults.push({ action: 'Create Supplier', duration, status: 'success' });
		});

		test('5.2 List Suppliers - Should return all suppliers', async () => {
			global.testUtils.performance.start('list-suppliers');
			
			const response = await request(app)
				.get('/api/suppliers')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const duration = global.testUtils.performance.end('list-suppliers');
			performanceResults.push({ action: 'List Suppliers', duration, status: 'success' });
		});
	});

	describe('6. Product Prices Flow', () => {
		test('6.1 Create Product Price - Should create price for product', async () => {
			if (createdProducts.length === 0) return;
			
			global.testUtils.performance.start('create-product-price');
			
			const productId = createdProducts[0];
			const priceData = {
				product_id: productId,
				wholesale_price: 50.00,
				retail_price: 75.00,
				effective_date: new Date().toISOString().split('T')[0]
			};
			
			const response = await request(app)
				.post('/api/product-prices')
				.set('Authorization', `Bearer ${authToken}`)
				.send(priceData)
				.expect(200);

			expect(response.body).toHaveProperty('id');

			const duration = global.testUtils.performance.end('create-product-price');
			performanceResults.push({ action: 'Create Product Price', duration, status: 'success' });
		});

		test('6.2 List Product Prices - Should return all prices', async () => {
			global.testUtils.performance.start('list-product-prices');
			
			const response = await request(app)
				.get('/api/product-prices')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const duration = global.testUtils.performance.end('list-product-prices');
			performanceResults.push({ action: 'List Product Prices', duration, status: 'success' });
		});
	});

	describe('7. Invoice Management Flow', () => {
		test('7.1 Create Buy Invoice - Should create buy invoice with items', async () => {
			if (createdProducts.length === 0 || createdSuppliers.length === 0) return;
			
			global.testUtils.performance.start('create-buy-invoice');
			
			const invoiceData = {
				invoice_type: 'buy',
				supplier_id: createdSuppliers[0],
				total_amount: 200.00,
				is_paid: false,
				items: [
					{
						product_id: createdProducts[0],
						quantity: 10,
						unit_price: 20.00,
						total_price: 200.00,
						price_type: 'wholesale',
						is_private_price: false
					}
				]
			};
			
			const response = await request(app)
				.post('/api/invoices')
				.set('Authorization', `Bearer ${authToken}`)
				.send(invoiceData)
				.expect(200);

			expect(response.body).toHaveProperty('id');
			expect(response.body).toHaveProperty('invoice_date');
			createdInvoices.push(response.body.id);

			const duration = global.testUtils.performance.end('create-buy-invoice');
			performanceResults.push({ action: 'Create Buy Invoice', duration, status: 'success' });
		});

		test('7.2 List Invoices - Should return all invoices', async () => {
			global.testUtils.performance.start('list-invoices');
			
			const response = await request(app)
				.get('/api/invoices')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const duration = global.testUtils.performance.end('list-invoices');
			performanceResults.push({ action: 'List Invoices', duration, status: 'success' });
		});

		test('7.3 Get Invoice Details - Should return invoice with items', async () => {
			if (createdInvoices.length === 0) return;
			
			global.testUtils.performance.start('get-invoice-details');
			
			const invoiceId = createdInvoices[0];
			const response = await request(app)
				.get(`/api/invoices/${invoiceId}`)
				.expect(200);

			expect(response.body).toHaveProperty('id', invoiceId);
			expect(response.body).toHaveProperty('invoice_items');
			expect(Array.isArray(response.body.invoice_items)).toBe(true);

			const duration = global.testUtils.performance.end('get-invoice-details');
			performanceResults.push({ action: 'Get Invoice Details', duration, status: 'success' });
		});

		test('7.4 Record Payment - Should record payment for invoice', async () => {
			if (createdInvoices.length === 0) return;
			
			global.testUtils.performance.start('record-payment');
			
			const invoiceId = createdInvoices[0];
			const paymentData = {
				paid_amount: 100.00,
				currency_code: 'USD',
				exchange_rate_on_payment: 1.0,
				payment_method: 'cash',
				notes: 'Test payment'
			};
			
			const response = await request(app)
				.post(`/api/invoices/${invoiceId}/payments`)
				.set('Authorization', `Bearer ${authToken}`)
				.send(paymentData)
				.expect(200);

			expect(response.body).toHaveProperty('id');
			expect(response.body).toHaveProperty('amount_paid');

			const duration = global.testUtils.performance.end('record-payment');
			performanceResults.push({ action: 'Record Payment', duration, status: 'success' });
		});
	});

	describe('8. Inventory Management Flow', () => {
		test('8.1 Get Today Inventory - Should return today stock', async () => {
			global.testUtils.performance.start('get-today-inventory');
			
			const response = await request(app)
				.get('/api/inventory/today')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const duration = global.testUtils.performance.end('get-today-inventory');
			performanceResults.push({ action: 'Get Today Inventory', duration, status: 'success' });
		});

		test('8.2 Get Stock Movements - Should return recent movements', async () => {
			global.testUtils.performance.start('get-stock-movements');
			
			const response = await request(app)
				.get('/api/stock-movements/recent/20')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const duration = global.testUtils.performance.end('get-stock-movements');
			performanceResults.push({ action: 'Get Stock Movements', duration, status: 'success' });
		});

		test('8.3 Get Low Stock - Should return low stock products', async () => {
			global.testUtils.performance.start('get-low-stock');
			
			const response = await request(app)
				.get('/api/inventory/low-stock/10')
				.expect(200);

			expect(Array.isArray(response.body)).toBe(true);

			const duration = global.testUtils.performance.end('get-low-stock');
			performanceResults.push({ action: 'Get Low Stock', duration, status: 'success' });
		});
	});

	describe('9. Performance Summary', () => {
		test('9.1 Generate Performance Report', () => {
			console.log('\n\n═══════════════════════════════════════════════════════');
			console.log('           PERFORMANCE TEST RESULTS');
			console.log('═══════════════════════════════════════════════════════\n');

			performanceResults.forEach(result => {
				const statusIcon = result.status === 'success' ? '✅' : '❌';
				console.log(`${statusIcon} ${result.action.padEnd(30)} ${result.duration}ms`);
			});

			const totalTime = performanceResults.reduce((sum, r) => sum + r.duration, 0);
			const avgTime = totalTime / performanceResults.length;
			const maxTime = Math.max(...performanceResults.map(r => r.duration));
			const minTime = Math.min(...performanceResults.map(r => r.duration));

			console.log('\n═══════════════════════════════════════════════════════');
			console.log(`Total Requests:     ${performanceResults.length}`);
			console.log(`Total Time:         ${totalTime}ms`);
			console.log(`Average Time:       ${avgTime.toFixed(2)}ms`);
			console.log(`Fastest Request:    ${minTime}ms`);
			console.log(`Slowest Request:    ${maxTime}ms`);
			console.log('═══════════════════════════════════════════════════════\n');

			// Performance assertions
			expect(avgTime).toBeLessThan(1000); // Average should be under 1 second
			expect(maxTime).toBeLessThan(5000); // No single request should take more than 5 seconds
		});
	});
});

