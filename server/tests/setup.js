// Test setup file
require('dotenv').config({ path: '.env.test' });

// Set test environment variables if not set
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-testing-only';
process.env.PORT = process.env.PORT || '5051';

// Increase timeout for database operations
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
	// Performance tracking
	performance: {
		startTimes: {},
		results: [],
		
		start(label) {
			this.startTimes[label] = Date.now();
		},
		
		end(label) {
			if (this.startTimes[label]) {
				const duration = Date.now() - this.startTimes[label];
				this.results.push({ label, duration, timestamp: new Date().toISOString() });
				delete this.startTimes[label];
				return duration;
			}
			return 0;
		},
		
		getResults() {
			return this.results;
		},
		
		getAverage(label) {
			const results = this.results.filter(r => r.label === label);
			if (results.length === 0) return 0;
			const sum = results.reduce((acc, r) => acc + r.duration, 0);
			return sum / results.length;
		},
		
		clear() {
			this.startTimes = {};
			this.results = [];
		}
	}
};

// Cleanup after all tests
afterAll(async () => {
	// Close database connections
	try {
		const { getPool } = require('../db');
		const pool = getPool();
		if (pool && typeof pool.end === 'function') {
			await pool.end();
			console.log('✓ Database connections closed');
		}
	} catch (e) {
		// Ignore cleanup errors
	}
	
	// Give Jest time to exit
	await new Promise(resolve => setTimeout(resolve, 500));
}, 10000); // 10 second timeout for cleanup

