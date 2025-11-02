require('dotenv').config();
const { query } = require('../db');

async function verifyColumns() {
	try {
		const result = await query(`
			SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
			FROM INFORMATION_SCHEMA.COLUMNS
			WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'products'
			ORDER BY ORDINAL_POSITION
		`, []);
		
		console.log('\nProducts table columns:');
		result.recordset.forEach(col => {
			console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE}${col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : ''}) ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
		});
		
		// Check for category_id specifically
		const hasCategoryId = result.recordset.some(col => col.COLUMN_NAME === 'category_id');
		const hasDescription = result.recordset.some(col => col.COLUMN_NAME === 'description');
		const hasSku = result.recordset.some(col => col.COLUMN_NAME === 'sku');
		
		console.log('\n✅ Column Status:');
		console.log(`  category_id: ${hasCategoryId ? '✓ EXISTS' : '✗ MISSING'}`);
		console.log(`  description: ${hasDescription ? '✓ EXISTS' : '✗ MISSING'}`);
		console.log(`  sku: ${hasSku ? '✓ EXISTS' : '✗ MISSING'}`);
		
		process.exit(0);
	} catch (error) {
		console.error('Error:', error.message);
		process.exit(1);
	}
}

verifyColumns();

