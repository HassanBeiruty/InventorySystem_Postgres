module.exports = {
	testEnvironment: 'node',
	verbose: true,
	collectCoverage: true,
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov', 'html'],
	testMatch: ['**/tests/**/*.test.js'],
	testTimeout: 30000,
	setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
	// Force Jest to exit after tests complete
	forceExit: true,
	// Detect open handles
	detectOpenHandles: true,
	reporters: [
		'default',
		['jest-html-reporters', {
			publicPath: './test-reports',
			filename: 'test-report.html',
			expand: true,
			hideIcon: false,
			pageTitle: 'Inventory System Test Report'
		}]
	]
};
