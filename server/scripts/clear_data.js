// Clear data scripts - remove transactions only or remove everything
require('dotenv').config();
const { query } = require('../db');

// Helper to get current time in Lebanon timezone for logging
function lebanonTimeForLog() {
	const now = new Date();
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Beirut',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
	return formatter.format(now);
}

/**
 * Clear transactions only - Remove everything except entities
 * Keeps: categories, products, customers, suppliers
 * Removes: invoices, invoice_items, invoice_payments, stock_movements, daily_stock, product_prices
 */
async function clearTransactionsOnly() {
	console.log('🗑️  Clearing transactions and related data (keeping entities)...\n');
	
	try {
		// Clear transactions and related data (in reverse order of dependencies)
		console.log('   Deleting stock movements...');
		await query('DELETE FROM stock_movements', []);
		
		console.log('   Deleting daily stock...');
		await query('DELETE FROM daily_stock', []);
		
		console.log('   Deleting invoice payments...');
		await query('DELETE FROM invoice_payments', []);
		
		console.log('   Deleting invoice items...');
		await query('DELETE FROM invoice_items', []);
		
		console.log('   Deleting invoices...');
		await query('DELETE FROM invoices', []);
		
		console.log('   Deleting product prices...');
		await query('DELETE FROM product_prices', []);
		
		console.log('✅ Transactions cleared. Entities (categories, products, customers, suppliers) preserved.\n');
		
		return {
			success: true,
			message: 'Transactions cleared successfully. Entities preserved.'
		};
	} catch (err) {
		console.error('❌ Error clearing transactions:', err);
		throw err;
	}
}

/**
 * Clear invoices and positions only - Keep all main entities
 * Truncates: invoice_payments, stock_movements, invoice_items, invoices, daily_stock
 * Does NOT touch: users, categories, products, customers, suppliers, product_prices, exchange_rates
 * Uses TRUNCATE RESTART IDENTITY so id sequences start from 1
 */
async function clearInvoicesAndPositionsOnly() {
	console.log('🗑️  Truncating invoices and positions (keeping main entities)...\n');

	try {
		// Truncate all invoice-related tables; list all so RESTART IDENTITY applies to each sequence.
		// Order: child tables first (reference invoices), then invoices. No CASCADE needed when all are listed.
		console.log('   Truncating invoice_payments, stock_movements, invoice_items, invoices...');
		await query(`
			TRUNCATE TABLE
				invoice_payments,
				stock_movements,
				invoice_items,
				invoices
			RESTART IDENTITY
		`, []);

		console.log('   Truncating daily_stock...');
		await query(`
			TRUNCATE TABLE daily_stock RESTART IDENTITY
		`, []);

		// Explicitly reset sequences to 1 so next id is always 1 (covers any PG version/schema quirks)
		const sequences = [
			'invoices_id_seq',
			'invoice_items_id_seq',
			'invoice_payments_id_seq',
			'stock_movements_id_seq',
			'daily_stock_id_seq',
		];
		for (const seq of sequences) {
			await query(`ALTER SEQUENCE IF EXISTS ${seq} RESTART WITH 1`, []);
		}
		console.log('   Reset sequences to start from 1.');

		console.log('✅ Invoices and positions cleared. IDs will start from 1.\n');
		return {
			success: true,
			message: 'Invoices and positions truncated. Main entities preserved. Identity IDs reset.',
		};
	} catch (err) {
		console.error('❌ Error clearing invoices/positions:', err);
		throw err;
	}
}

/**
 * Clear everything - Fresh start
 * Removes: All data including entities
 * Uses TRUNCATE to reset auto-increment IDs to start from 1
 */
async function clearEverything() {
	console.log('🗑️  Clearing ALL data (fresh start with ID reset)...\n');
	
	try {
		// Use TRUNCATE CASCADE RESTART IDENTITY to clear all data and reset sequences
		// CASCADE automatically truncates all tables with foreign key references
		// RESTART IDENTITY resets all auto-increment sequences to start from 1
		
		console.log('   Truncating all tables and resetting IDs...');
		
		// Truncate in order: child tables first, then parent tables
		// Using CASCADE ensures all related tables are truncated
		// RESTART IDENTITY resets all sequences
		
		await query(`
			TRUNCATE TABLE 
				stock_movements,
				daily_stock,
				invoice_payments,
				invoice_items,
				invoices,
				product_prices,
				products,
				categories,
				exchange_rates,
				customers,
				suppliers
			RESTART IDENTITY CASCADE
		`, []);
		
		console.log('✅ All data cleared and IDs reset. Fresh start ready.\n');
		
		return {
			success: true,
			message: 'All data cleared successfully. All IDs reset to start from 1. Fresh start ready.'
		};
	} catch (err) {
		console.error('❌ Error clearing data:', err);
		throw err;
	}
}

module.exports = { clearTransactionsOnly, clearEverything, clearInvoicesAndPositionsOnly };

// If run directly (not imported), show usage
if (require.main === module) {
	console.log('Usage: Import and call clearTransactionsOnly(), clearEverything(), or clearInvoicesAndPositionsOnly()');
	console.log('Example: const { clearInvoicesAndPositionsOnly } = require("./clear_data");');
	console.log('        await clearInvoicesAndPositionsOnly();');
}
