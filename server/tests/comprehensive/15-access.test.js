/**
 * Section 15: Access Control
 * Tests: business data needs a signed-in user; signing in and the health check stay public
 */

const request = require('supertest');
const app = require('../../index');
const ApiClient = require('./helpers/apiClient');

describe('Section 15: Access Control', () => {
	let apiClient;

	beforeAll(async () => {
		apiClient = new ApiClient();
		await apiClient.authenticate();
	});

	describe('15.1 Without a signed-in user', () => {
		const protectedRoutes = [
			['get', '/api/customers'],
			['get', '/api/suppliers'],
			['get', '/api/products'],
			['get', '/api/invoices'],
			['get', '/api/invoices/stats'],
			['get', '/api/inventory/today'],
			['get', '/api/payments'],
			['get', '/api/export/customers'],
			['get', '/api/reports/net-profit?start_date=2026-01-01&end_date=2026-01-31'],
			['post', '/api/customers'],
			['post', '/api/invoices'],
			['delete', '/api/products/1'],
		];

		test.each(protectedRoutes)('%s %s is rejected', async (method, path) => {
			const response = await request(app)[method](path).send({}).expect(401);
			expect(response.body).toHaveProperty('error');
		});

		test('A malformed token is rejected', async () => {
			await request(app)
				.get('/api/customers')
				.set('Authorization', 'Bearer not-a-real-token')
				.expect(401);
		});

		test('The debug endpoint that listed invoices is gone', async () => {
			await request(app).get('/api/db-test').expect(401);
		});
	});

	describe('15.2 Public routes', () => {
		test('Health check stays open for uptime monitoring', async () => {
			await request(app).get('/api/health').expect(200);
		});

		test('Sign-in is reachable without a token', async () => {
			const response = await request(app)
				.post('/api/auth/signin')
				.send({ email: 'nobody@example.com', password: 'wrong-password' });
			// Wrong credentials, but the route itself answered (not blocked by the sign-in check)
			expect(response.status).toBe(401);
			expect(response.body.error).toBe('Invalid credentials');
		});
	});

	describe('15.3 With a signed-in user', () => {
		test('Business data is returned', async () => {
			const response = await request(app)
				.get('/api/customers')
				.set('Authorization', `Bearer ${apiClient.token}`)
				.expect(200);
			expect(Array.isArray(response.body)).toBe(true);
		});
	});
});
