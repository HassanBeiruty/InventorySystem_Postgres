#!/usr/bin/env node

/**
 * Test Runner Script
 * Runs the complete test suite and generates performance reports
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Automated Test Suite...\n');
console.log('═══════════════════════════════════════════════════════');
console.log('  Inventory System - User Flow Test Suite');
console.log('═══════════════════════════════════════════════════════\n');

try {
	// Run tests
	console.log('Running tests...\n');
	execSync('npm test', { 
		stdio: 'inherit',
		cwd: __dirname + '/..'
	});

	console.log('\n✅ All tests completed successfully!');
	console.log('\n📊 Check test-reports/test-report.html for detailed results');
	console.log('📈 Check coverage/ directory for code coverage information');
	
} catch (error) {
	console.error('\n❌ Tests failed!');
	console.error(error.message);
	process.exit(1);
}

