/**
 * Cleanup Orphaned Records Script
 * Removes orphaned records from product_prices that reference non-existent products
 */

require('dotenv').config();
const { query } = require('../db');

async function cleanupOrphanedRecords() {
	console.log('🧹 Starting cleanup of orphaned records...\n');

	try {
		// Find orphaned product_prices records
		console.log('📋 Checking for orphaned product_prices records...');
		const orphanedCheck = await query(`
			SELECT pp.id, pp.product_id, pp.created_at
			FROM product_prices pp
			LEFT JOIN products p ON pp.product_id = p.id
			WHERE p.id IS NULL
		`, []);

		const orphanedCount = orphanedCheck.recordset.length;
		
		if (orphanedCount === 0) {
			console.log('✅ No orphaned product_prices records found.\n');
		} else {
			console.log(`⚠️  Found ${orphanedCount} orphaned product_prices record(s):`);
			orphanedCheck.recordset.forEach(record => {
				console.log(`   - product_prices.id: ${record.id}, product_id: ${record.product_id}, created_at: ${record.created_at}`);
			});

			// Delete orphaned records
			console.log('\n🗑️  Deleting orphaned records...');
			const deleteResult = await query(`
				DELETE FROM product_prices
				WHERE id IN (
					SELECT pp.id
					FROM product_prices pp
					LEFT JOIN products p ON pp.product_id = p.id
					WHERE p.id IS NULL
				)
			`, []);

			console.log(`✅ Deleted ${orphanedCount} orphaned product_prices record(s).\n`);
		}

		// Check for other potential orphaned records
		console.log('📋 Checking for other orphaned records...');
		
		// Check invoice_items
		const orphanedInvoiceItems = await query(`
			SELECT COUNT(*) as count
			FROM invoice_items ii
			LEFT JOIN products p ON ii.product_id = p.id
			WHERE p.id IS NULL
		`, []);
		const invoiceItemsCount = parseInt(orphanedInvoiceItems.recordset[0]?.count || 0);
		if (invoiceItemsCount > 0) {
			console.log(`⚠️  Found ${invoiceItemsCount} orphaned invoice_items records (these should be handled by invoice deletion).`);
		}

		// Check daily_stock
		const orphanedDailyStock = await query(`
			SELECT COUNT(*) as count
			FROM daily_stock ds
			LEFT JOIN products p ON ds.product_id = p.id
			WHERE p.id IS NULL
		`, []);
		const dailyStockCount = parseInt(orphanedDailyStock.recordset[0]?.count || 0);
		if (dailyStockCount > 0) {
			console.log(`⚠️  Found ${dailyStockCount} orphaned daily_stock records.`);
		}

		// Check stock_movements
		const orphanedStockMovements = await query(`
			SELECT COUNT(*) as count
			FROM stock_movements sm
			LEFT JOIN products p ON sm.product_id = p.id
			WHERE p.id IS NULL
		`, []);
		const stockMovementsCount = parseInt(orphanedStockMovements.recordset[0]?.count || 0);
		if (stockMovementsCount > 0) {
			console.log(`⚠️  Found ${stockMovementsCount} orphaned stock_movements records.`);
		}

		if (invoiceItemsCount === 0 && dailyStockCount === 0 && stockMovementsCount === 0) {
			console.log('✅ No other orphaned records found.\n');
		}

		console.log('✅ Cleanup completed successfully!\n');
		process.exit(0);
	} catch (error) {
		console.error('❌ Error during cleanup:', error.message);
		if (error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	}
}

// Run cleanup
cleanupOrphanedRecords();

