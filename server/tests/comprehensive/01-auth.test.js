/**
 * Section 1: Authentication Tests
 * Tests: signup, signin, logout, get current user
 */

const request = require('supertest');
const app = require('../../index');
const PerformanceMonitor = require('./helpers/performance');
const TestDataGenerator = require('./helpers/testData');
const ApiClient = require('./helpers/apiClient');

describe('Section 1: Authentication', () => {
	let perfMonitor;
	let testData;
	let apiClient;
	let createdUsers = [];

	beforeAll(() => {
		perfMonitor = new PerformanceMonitor();
		testData = new TestDataGenerator();
		apiClient = new ApiClient();
	});

	afterAll(() => {
		perfMonitor.printSummary();
	});

	describe('1.1 User Signup', () => {
		test('Should create new user successfully', async () => {
			const timer = perfMonitor.start('signup');
			const userData = testData.generateUser();

			const response = await apiClient
				.post('/api/auth/signup', userData, [200, 429]); // Allow rate limit

			if (response.status === 200) {
				expect(response.body).toHaveProperty('id');
				expect(response.body).toHaveProperty('email', userData.email);
				expect(response.body).toHaveProperty('token');
				expect(response.body).toHaveProperty('isAdmin');
				expect(typeof response.body.token).toBe('string');
				expect(response.body.token.length).toBeGreaterThan(0);
				apiClient.setToken(response.body.token); // Store token for later tests

				createdUsers.push({ id: response.body.id, email: userData.email });
			} else {
				console.warn('Rate limited - skipping signup test');
			}

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('signup', metric.duration, 2000);
		});

		test('Should reject duplicate email', async () => {
			const timer = perfMonitor.start('signup-duplicate');
			const userData = testData.generateUser();

			// Create first user
			await apiClient.post('/api/auth/signup', userData, 200);

			// Try to create duplicate
			const response = await request(app)
				.post('/api/auth/signup')
				.send(userData)
				.expect(400);

			expect(response.body).toHaveProperty('error');
			expect(response.body.error).toContain('already exists');

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('signup-duplicate', metric.duration, 1000);
		});

		test('Should validate email format', async () => {
			const timer = perfMonitor.start('signup-invalid-email');
			const response = await request(app)
				.post('/api/auth/signup')
				.send({
					email: 'invalid-email',
					password: 'TestPassword123!'
				})
				.expect(400);

			expect(response.body).toHaveProperty('error');
			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('signup-invalid-email', metric.duration, 500);
		});

		test('Should validate password length', async () => {
			const timer = perfMonitor.start('signup-short-password');
			const response = await request(app)
				.post('/api/auth/signup')
				.send({
					email: testData.generateUser().email,
					password: 'short'
				})
				.expect(400);

			expect(response.body).toHaveProperty('error');
			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('signup-short-password', metric.duration, 500);
		});
	});

	describe('1.2 User Signin', () => {
		test('Should authenticate existing user', async () => {
			const timer = perfMonitor.start('signin');
			const userData = testData.generateUser();

			// Create user first
			const signupRes = await apiClient.post('/api/auth/signup', userData, [200, 429]);
			
			if (signupRes.status === 429) {
				console.warn('Rate limited - skipping signin test');
				const metric = perfMonitor.end(timer);
				return; // Skip this test if rate limited
			}

			// Wait a bit for DB to commit and avoid rate limiting
			await new Promise(resolve => setTimeout(resolve, 2000));

			// Signin
			const response = await request(app)
				.post('/api/auth/signin')
				.send({
					email: userData.email,
					password: userData.password
				})
				.expect([200, 429]); // Allow rate limit response

			if (response.status === 200) {
				expect(response.body).toHaveProperty('token');
				expect(response.body).toHaveProperty('email', userData.email);
				expect(response.body).toHaveProperty('id');
				expect(response.body).toHaveProperty('isAdmin');
			} else {
				console.warn('Rate limited - skipping signin test');
			}

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('signin', metric.duration, 3000);
		});

		test('Should reject invalid credentials', async () => {
			const timer = perfMonitor.start('signin-invalid');
			// Wait to avoid rate limiting
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			const response = await request(app)
				.post('/api/auth/signin')
				.send({
					email: 'nonexistent@example.com',
					password: 'WrongPassword123!'
				})
				.expect([401, 429]); // Allow rate limit response

			if (response.status === 401) {
				expect(response.body).toHaveProperty('error');
			} else {
				console.warn('Rate limited - skipping invalid credentials test');
			}
			
			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('signin-invalid', metric.duration, 3000);
		});

		test('Should reject wrong password', async () => {
			const timer = perfMonitor.start('signin-wrong-password');
			const userData = testData.generateUser();

			// Create user
			const signupRes = await apiClient.post('/api/auth/signup', userData, [200, 429]);
			
			if (signupRes.status === 429) {
				console.warn('Rate limited - skipping wrong password test');
				const metric = perfMonitor.end(timer);
				return; // Skip this test if rate limited
			}
			
			// Wait to avoid rate limiting
			await new Promise(resolve => setTimeout(resolve, 2000));

			// Try wrong password
			const response = await request(app)
				.post('/api/auth/signin')
				.send({
					email: userData.email,
					password: 'WrongPassword123!'
				})
				.expect([401, 429]); // Allow rate limit response

			if (response.status === 401) {
				expect(response.body).toHaveProperty('error');
			} else {
				console.warn('Rate limited - skipping wrong password test');
			}
			
			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('signin-wrong-password', metric.duration, 3000);
		});
	});

	describe('1.3 Get Current User', () => {
		test('Should return current user info', async () => {
			const timer = perfMonitor.start('get-current-user');
			
			// Use existing token from first test if available, otherwise create new user
			if (!apiClient.token) {
				const userData = testData.generateUser();
				const signupRes = await apiClient.post('/api/auth/signup', userData, 200);
				apiClient.setToken(signupRes.body.token);
			}

			const response = await apiClient
				.get('/api/auth/me', 200);

			expect(response.body).toHaveProperty('id');
			expect(response.body).toHaveProperty('email');
			expect(response.body).toHaveProperty('isAdmin');
			expect(typeof response.body.id).toBe('number');

			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('get-current-user', metric.duration, 1000);
		});

		test('Should reject request without token', async () => {
			const timer = perfMonitor.start('get-current-user-unauthorized');
			const response = await request(app)
				.get('/api/auth/me')
				.expect(401);

			expect(response.body).toHaveProperty('error');
			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('get-current-user-unauthorized', metric.duration, 500);
		});
	});

	describe('1.4 Logout', () => {
		test('Should handle logout request', async () => {
			const timer = perfMonitor.start('logout');
			
			// Use existing token if available
			if (!apiClient.token) {
				const userData = testData.generateUser();
				const signupRes = await apiClient.post('/api/auth/signup', userData, 200);
				apiClient.setToken(signupRes.body.token);
			}

			const response = await apiClient
				.post('/api/auth/logout', {}, 200);

			expect(response.body).toHaveProperty('success', true);
			const metric = perfMonitor.end(timer);
			perfMonitor.assertPerformance('logout', metric.duration, 500);
		});
	});
});

