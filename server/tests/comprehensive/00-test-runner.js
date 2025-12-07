/**
 * Comprehensive Test Runner
 * Allows running tests in sections to avoid restarting with connection problems
 * Usage: 
 *   node tests/comprehensive/00-test-runner.js [section-name]
 *   node tests/comprehensive/00-test-runner.js all
 */

const { spawn } = require('child_process');
const path = require('path');

const SECTIONS = {
	'auth': '01-auth.test.js',
	'customers': '02-customers.test.js',
	'suppliers': '03-suppliers.test.js',
	'categories': '04-categories.test.js',
	'products': '05-products.test.js',
	'invoices': '06-invoices.test.js',
	'payments': '07-payments.test.js',
	'exchange-rates': '08-exchange-rates.test.js',
	'inventory': '09-inventory.test.js',
	'stock-movements': '10-stock-movements.test.js',
	'product-prices': '11-product-prices.test.js',
	'export': '12-export.test.js',
	'admin': '13-admin.test.js',
	'performance': '14-performance.test.js'
};

const sectionArg = process.argv[2] || 'all';

if (sectionArg === 'all') {
	console.log('Running all test sections...\n');
	runAllSections();
} else if (SECTIONS[sectionArg]) {
	console.log(`Running section: ${sectionArg}\n`);
	runSection(SECTIONS[sectionArg]);
} else {
	console.log('Available sections:');
	console.log('  all - Run all sections');
	Object.keys(SECTIONS).forEach(key => {
		console.log(`  ${key} - ${SECTIONS[key]}`);
	});
	process.exit(1);
}

function runSection(testFile) {
	const testPath = path.join(__dirname, testFile);
	const jest = spawn('npx', ['jest', testPath, '--verbose'], {
		stdio: 'inherit',
		shell: true,
		cwd: path.join(__dirname, '../../')
	});

	jest.on('close', (code) => {
		process.exit(code);
	});
}

function runAllSections() {
	const sections = Object.keys(SECTIONS);
	let currentIndex = 0;

	function runNext() {
		if (currentIndex >= sections.length) {
			console.log('\n✅ All test sections completed!');
			process.exit(0);
		}

		const section = sections[currentIndex];
		const testFile = SECTIONS[section];
		console.log(`\n${'='.repeat(60)}`);
		console.log(`Running Section ${currentIndex + 1}/${sections.length}: ${section}`);
		console.log(`${'='.repeat(60)}\n`);

		const testPath = path.join(__dirname, testFile);
		const jest = spawn('npx', ['jest', testPath, '--verbose'], {
			stdio: 'inherit',
			shell: true,
			cwd: path.join(__dirname, '../../')
		});

		jest.on('close', (code) => {
			if (code === 0) {
				currentIndex++;
				// Small delay between sections to avoid connection issues
				setTimeout(runNext, 1000);
			} else {
				console.error(`\n❌ Section ${section} failed with code ${code}`);
				console.log('You can run this section individually with:');
				console.log(`  node tests/comprehensive/00-test-runner.js ${section}`);
				process.exit(code);
			}
		});
	}

	runNext();
}

