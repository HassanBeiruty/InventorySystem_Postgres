// Migration script to convert existing tables from NVARCHAR(50) IDs to INT IDENTITY(1,1) IDs
// WARNING: This will DROP all existing data and recreate tables with new schema
require('dotenv').config();
const { query } = require('../db');

async function migrate() {
	console.log('🔄 Starting migration from NVARCHAR IDs to INT IDENTITY IDs...\n');
	console.log('⚠️  WARNING: This will DELETE all existing data!\n');
	
	try {
		// Drop all tables in reverse dependency order
		console.log('🗑️  Dropping existing tables...');
		
		const dropOrder = [
			'stock_movements',
			'daily_stock',
			'invoice_items',
			'invoices',
			'product_prices',
			'product_suppliers',
			'product_costs',
			'products',
			'customers',
			'suppliers',
			'users'
		];

		for (const tableName of dropOrder) {
			try {
				await query(`IF OBJECT_ID(N'dbo.${tableName}', N'U') IS NOT NULL DROP TABLE dbo.${tableName}`, []);
				console.log(`  ✓ Dropped table: ${tableName}`);
			} catch (err) {
				console.log(`  ⚠ Table ${tableName} doesn't exist or couldn't be dropped:`, err.message);
			}
		}

		console.log('\n📦 Recreating tables with INT IDENTITY schema...\n');

		// Now run the init script to create tables with new schema
		const { runInit } = require('../sql/runInit');
		const result = await runInit();

		if (result.ok) {
			console.log('\n✅ Migration completed successfully!');
			console.log('✅ All tables now use INT IDENTITY(1,1) for IDs');
			console.log('\n💡 You can now run the seed script:');
			console.log('   node server/scripts/seed_data.js\n');
		} else {
			console.error('\n❌ Migration completed with errors:', result.errorDetails);
			process.exit(1);
		}

	} catch (error) {
		console.error('❌ Migration failed:', error);
		process.exit(1);
	}
}

// Run migration
migrate()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error('💥 Migration failed:', error);
		process.exit(1);
	});

