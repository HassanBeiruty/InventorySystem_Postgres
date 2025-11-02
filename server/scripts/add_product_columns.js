require('dotenv').config();
const { query } = require('../db');

async function addProductColumns() {
	console.log('Adding product columns (category_id, description, sku)...');
	
	try {
		// Add category_id
		await query(`
			IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'products' AND COLUMN_NAME = 'category_id')
			ALTER TABLE dbo.products ADD category_id INT NULL;
		`, []);
		console.log('✓ category_id column checked/added');
		
		// Add description
		await query(`
			IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'products' AND COLUMN_NAME = 'description')
			ALTER TABLE dbo.products ADD description NVARCHAR(1000) NULL;
		`, []);
		console.log('✓ description column checked/added');
		
		// Add sku
		await query(`
			IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'products' AND COLUMN_NAME = 'sku')
			ALTER TABLE dbo.products ADD sku NVARCHAR(100) NULL;
		`, []);
		console.log('✓ sku column checked/added');
		
		// Add foreign key if categories table exists
		const categoriesCheck = await query(`
			SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'categories'
		`, []);
		
		if (categoriesCheck.recordset[0].cnt > 0) {
			await query(`
				IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('dbo.FK_products_category') AND type = 'F')
				ALTER TABLE dbo.products ADD CONSTRAINT FK_products_category FOREIGN KEY (category_id) REFERENCES dbo.categories(id);
			`, []);
			console.log('✓ Foreign key constraint checked/added');
			
			await query(`
				IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_products_category' AND object_id = OBJECT_ID('dbo.products'))
				CREATE INDEX IX_products_category ON dbo.products(category_id);
			`, []);
			console.log('✓ Index checked/added');
		} else {
			console.log('⚠ Categories table does not exist - foreign key will be added later');
		}
		
		console.log('\n✅ Product columns migration completed successfully!');
		process.exit(0);
	} catch (error) {
		console.error('❌ Error adding product columns:', error.message);
		process.exit(1);
	}
}

addProductColumns();

