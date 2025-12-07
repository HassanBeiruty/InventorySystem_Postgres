/**
 * API Client helper for making authenticated requests
 */

const request = require('supertest');
const app = require('../../../index');

class ApiClient {
	constructor() {
		this.token = null;
		this.userId = null;
		this.isAdmin = false;
	}

	async authenticate(email = null, password = null) {
		if (!email) {
			// Create a new user for testing
			const timestamp = Date.now();
			email = `testuser${timestamp}@example.com`;
			password = 'TestPassword123!';

			// Signup
			const signupRes = await request(app)
				.post('/api/auth/signup')
				.send({ email, password });

			if (signupRes.status === 200) {
				this.token = signupRes.body.token;
				this.userId = signupRes.body.id;
				this.isAdmin = signupRes.body.isAdmin || false;
				return signupRes.body;
			}
		}

		// Signin
		const signinRes = await request(app)
			.post('/api/auth/signin')
			.send({ email, password });

		if (signinRes.status === 200) {
			this.token = signinRes.body.token;
			this.userId = signinRes.body.id;
			this.isAdmin = signinRes.body.isAdmin || false;
			return signinRes.body;
		}

		throw new Error('Authentication failed');
	}

	setToken(token) {
		this.token = token;
	}

	get(path, expectStatus = 200) {
		const req = request(app).get(path);
		if (this.token) {
			req.set('Authorization', `Bearer ${this.token}`);
		}
		if (Array.isArray(expectStatus)) {
			return req.expect((res) => {
				if (!expectStatus.includes(res.status)) {
					throw new Error(`Expected status ${expectStatus.join(' or ')}, got ${res.status}`);
				}
			});
		}
		return req.expect(expectStatus);
	}

	post(path, data = {}, expectStatus = 200) {
		const req = request(app).post(path).send(data);
		if (this.token) {
			req.set('Authorization', `Bearer ${this.token}`);
		}
		if (Array.isArray(expectStatus)) {
			return req.expect((res) => {
				if (!expectStatus.includes(res.status)) {
					throw new Error(`Expected status ${expectStatus.join(' or ')}, got ${res.status}`);
				}
			});
		}
		return req.expect(expectStatus);
	}

	put(path, data = {}, expectStatus = 200) {
		const req = request(app).put(path).send(data);
		if (this.token) {
			req.set('Authorization', `Bearer ${this.token}`);
		}
		if (Array.isArray(expectStatus)) {
			return req.expect((res) => {
				if (!expectStatus.includes(res.status)) {
					throw new Error(`Expected status ${expectStatus.join(' or ')}, got ${res.status}`);
				}
			});
		}
		return req.expect(expectStatus);
	}

	delete(path, expectStatus = 200) {
		const req = request(app).delete(path);
		if (this.token) {
			req.set('Authorization', `Bearer ${this.token}`);
		}
		// Handle array of expected statuses
		if (Array.isArray(expectStatus)) {
			return req.expect((res) => {
				if (!expectStatus.includes(res.status)) {
					throw new Error(`Expected status ${expectStatus.join(' or ')}, got ${res.status}`);
				}
			});
		}
		return req.expect(expectStatus);
	}
}

module.exports = ApiClient;

