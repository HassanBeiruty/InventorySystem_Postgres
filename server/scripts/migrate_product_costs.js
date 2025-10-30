// Migration script to populate product_costs table from existing buy invoices
const { query } = require('../db');

function generateId() {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowIso() {
	return new Date().toISOString();
}

async function migrateProductCosts() {
	console.log('Starting product_costs migration...\n');
	
	try {
		// Check if product_costs table exists
		const tableCheck = await query(
			`SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'product_costs'`,
			[]
		);
		
		if (tableCheck.recordset.length === 0) {
			console.error('❌ Error: product_costs table does not exist!');
			console.log('Please create the table first using the SQL schema.');
			return;
		}
		
		// Get all buy invoices with their items
		const buyInvoices = await query(
			`SELECT i.id, i.supplier_id, i.invoice_date, 
					ii.id as item_id, ii.product_id, ii.quantity, ii.unit_price
			 FROM invoices i
			 JOIN invoice_items ii ON i.id = ii.invoice_id
			 WHERE i.invoice_type = 'buy'
			 ORDER BY i.invoice_date ASC`,
			[]
		);
		
		if (buyInvoices.recordset.length === 0) {
			console.log('ℹ️  No buy invoice items found to migrate.');
			return;
		}
		
		console.log(`📦 Found ${buyInvoices.recordset.length} buy invoice items to migrate.\n`);
		
		// Check if any records already exist in product_costs
		const existingCosts = await query(
			`SELECT COUNT(*) as count FROM product_costs WHERE invoice_id IS NOT NULL`,
			[]
		);
		
		const existingCount = existingCosts.recordset[0].count;
		if (existingCount > 0) {
			console.log(`⚠️  Warning: ${existingCount} product_costs records already exist with invoice references.`);
			console.log('Skipping migration to avoid duplicates.\n');
			console.log('If you want to re-migrate, please clear the product_costs table first.');
			return;
		}
		
		let successCount = 0;
		let errorCount = 0;
		
		// Migrate each buy invoice item to product_costs
		for (const item of buyInvoices.recordset) {
			try {
				const costId = generateId();
				await query(
					`INSERT INTO product_costs (id, product_id, supplier_id, invoice_id, cost, quantity, purchase_date, created_at)
					 VALUES (@id, @product_id, @supplier_id, @invoice_id, @cost, @quantity, @purchase_date, @created_at)`,
					[
						{ id: costId },
						{ product_id: item.product_id },
						{ supplier_id: item.supplier_id || null },
						{ invoice_id: item.id },
						{ cost: item.unit_price },
						{ quantity: item.quantity },
						{ purchase_date: item.invoice_date },
						{ created_at: nowIso() }
					]
				);
				successCount++;
				
				if (successCount % 10 === 0) {
					process.stdout.write(`\r✅ Migrated ${successCount} items...`);
				}
			} catch (err) {
				errorCount++;
				console.error(`\n❌ Error migrating item ${item.item_id}:`, err.message);
			}
		}
		
		console.log(`\n\n✅ Migration completed successfully!`);
		console.log(`   - Total items processed: ${buyInvoices.recordset.length}`);
		console.log(`   - Successfully migrated: ${successCount}`);
		console.log(`   - Errors: ${errorCount}\n`);
		
		// Show summary statistics
		const stats = await query(
			`SELECT 
				COUNT(*) as total_records,
				COUNT(DISTINCT product_id) as unique_products,
				COUNT(DISTINCT supplier_id) as unique_suppliers,
				SUM(quantity) as total_quantity,
				SUM(cost * quantity) as total_cost
			 FROM product_costs`,
			[]
		);
		
		const summary = stats.recordset[0];
		console.log('📊 Product Costs Table Summary:');
		console.log(`   - Total cost records: ${summary.total_records}`);
		console.log(`   - Unique products: ${summary.unique_products}`);
		console.log(`   - Unique suppliers: ${summary.unique_suppliers}`);
		console.log(`   - Total quantity: ${summary.total_quantity}`);
		console.log(`   - Total cost value: $${parseFloat(summary.total_cost || 0).toFixed(2)}\n`);
		
	} catch (error) {
		console.error('❌ Migration failed:', error);
		throw error;
	}
}

// Run migration
migrateProductCosts()
	.then(() => {
		console.log('🎉 All done!');
		process.exit(0);
	})
	.catch((error) => {
		console.error('💥 Migration failed:', error);
		process.exit(1);
	});

