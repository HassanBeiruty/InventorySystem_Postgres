require('dotenv').config();
const { query } = require('../db');

// Creates the product_package_items table used by the "Packages" feature.
// A package is any product that has one or more rows here. Each row links the
// package product to a component product. Run with: node scripts/add_package_items_table.js
async function addPackageItemsTable() {
	console.log('Creating product_package_items table...');

	try {
		await query(`
			CREATE TABLE IF NOT EXISTS product_package_items (
				id SERIAL PRIMARY KEY,
				package_product_id INT NOT NULL,
				component_product_id INT NOT NULL,
				created_at TIMESTAMP NOT NULL DEFAULT now(),
				CONSTRAINT FK_ppi_package FOREIGN KEY (package_product_id) REFERENCES products(id) ON DELETE CASCADE,
				CONSTRAINT FK_ppi_component FOREIGN KEY (component_product_id) REFERENCES products(id) ON DELETE CASCADE,
				CONSTRAINT UQ_ppi_package_component UNIQUE (package_product_id, component_product_id),
				CONSTRAINT CK_ppi_not_self CHECK (package_product_id <> component_product_id)
			);
		`, []);
		console.log('✓ product_package_items table created/verified');

		await query(`CREATE INDEX IF NOT EXISTS IX_ppi_package ON product_package_items(package_product_id);`, []);
		await query(`CREATE INDEX IF NOT EXISTS IX_ppi_component ON product_package_items(component_product_id);`, []);
		console.log('✓ Indexes created/verified');

		try {
			await query(`ALTER TABLE product_package_items ENABLE ROW LEVEL SECURITY;`, []);
		} catch (e) {
			// RLS may already be enabled - safe to ignore
		}

		console.log('\n✅ Package items migration completed successfully!');
		process.exit(0);
	} catch (error) {
		console.error('❌ Error creating product_package_items table:', error.message);
		process.exit(1);
	}
}

addPackageItemsTable();
