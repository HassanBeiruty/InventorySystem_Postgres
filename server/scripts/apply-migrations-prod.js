/**
 * Script to apply database migrations to production
 * Usage: node server/scripts/apply-migrations-prod.js
 * 
 * Make sure DATABASE_URL or PG_* environment variables are set
 */

require('dotenv').config({ path: './server/.env' });
const { runInit } = require('../sql/runInit');

async function applyMigrations() {
	console.log('=== Applying Database Migrations to Production ===\n');
	
	try {
		// Test connection
		const { query } = require('../db');
		await query('SELECT 1 AS test', []);
		console.log('✓ Database connection verified\n');
		
		// Run migrations
		const result = await runInit();
		
		if (result?.ok) {
			console.log(`\n✓ Migrations completed successfully!`);
			console.log(`  - ${result.batches}/${result.total} tables/migrations processed`);
			if (result.errors > 0) {
				console.log(`  - ${result.errors} errors (may be expected if objects already exist)`);
			}
		} else {
			console.error('\n✗ Migrations failed');
			if (result?.errorDetails) {
				result.errorDetails.forEach(err => {
					console.error(`  - ${err.table}: ${err.error}`);
				});
			}
			process.exit(1);
		}
		
		console.log('\n=== Migration Summary ===');
		console.log('New tables/features added:');
		console.log('  - exchange_rates table');
		console.log('  - invoice_payments multi-currency columns');
		console.log('    * paid_amount (renamed from payment_amount)');
		console.log('    * currency_code');
		console.log('    * exchange_rate_on_payment');
		console.log('    * usd_equivalent_amount');
		
		process.exit(0);
	} catch (error) {
		console.error('\n✗ Error applying migrations:', error.message);
		console.error(error.stack);
		process.exit(1);
	}
}

applyMigrations();

