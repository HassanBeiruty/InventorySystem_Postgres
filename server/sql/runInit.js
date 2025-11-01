const fs = require('fs');
const path = require('path');
const { query } = require('../db');

// Tables to create (in order to handle FK dependencies)
const tables = [
	{
		name: 'users',
		sql: `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.users') AND type = N'U')
CREATE TABLE dbo.users (
	id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
	email NVARCHAR(255) NOT NULL UNIQUE,
	passwordHash NVARCHAR(255) NOT NULL,
	created_at DATETIME2 NOT NULL
);`
	},
	{
		name: 'products',
		sql: `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.products') AND type = N'U')
CREATE TABLE dbo.products (
	id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
	name NVARCHAR(255) NOT NULL,
	barcode NVARCHAR(100) NULL,
	created_at DATETIME2 NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_products_name' AND object_id = OBJECT_ID('dbo.products'))
CREATE INDEX IX_products_name ON dbo.products(name);`
	},
	{
		name: 'product_prices',
		sql: `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.product_prices') AND type = N'U')
CREATE TABLE dbo.product_prices (
	id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
	product_id INT NOT NULL,
	wholesale_price DECIMAL(18,2) NOT NULL,
	retail_price DECIMAL(18,2) NOT NULL,
	effective_date DATE NOT NULL DEFAULT(CONVERT(date, GETDATE())),
	created_at DATETIME2 NOT NULL,
	CONSTRAINT FK_product_prices_product FOREIGN KEY (product_id) REFERENCES dbo.products(id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_product_prices_product_date' AND object_id = OBJECT_ID('dbo.product_prices'))
CREATE INDEX IX_product_prices_product_date ON dbo.product_prices(product_id, effective_date);`
	},
	{
		name: 'customers',
		sql: `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.customers') AND type = N'U')
CREATE TABLE dbo.customers (
	id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
	name NVARCHAR(255) NOT NULL,
	phone NVARCHAR(50) NULL,
	address NVARCHAR(255) NULL,
	credit_limit DECIMAL(18,2) NOT NULL DEFAULT(0),
	created_at DATETIME2 NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_customers_name' AND object_id = OBJECT_ID('dbo.customers'))
CREATE INDEX IX_customers_name ON dbo.customers(name);`
	},
	{
		name: 'suppliers',
		sql: `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.suppliers') AND type = N'U')
CREATE TABLE dbo.suppliers (
	id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
	name NVARCHAR(255) NOT NULL,
	phone NVARCHAR(50) NULL,
	address NVARCHAR(255) NULL,
	created_at DATETIME2 NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_suppliers_name' AND object_id = OBJECT_ID('dbo.suppliers'))
CREATE INDEX IX_suppliers_name ON dbo.suppliers(name);`
	},
	{
		name: 'invoices',
		sql: `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.invoices') AND type = N'U')
CREATE TABLE dbo.invoices (
	id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
	invoice_type NVARCHAR(10) NOT NULL CHECK (invoice_type IN ('buy','sell')),
	customer_id INT NULL,
	supplier_id INT NULL,
	total_amount DECIMAL(18,2) NOT NULL,
	is_paid BIT NOT NULL,
	invoice_date DATETIME2 NOT NULL,
	created_at DATETIME2 NOT NULL,
	CONSTRAINT FK_invoices_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(id),
	CONSTRAINT FK_invoices_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.suppliers(id)
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_invoices_invoice_date' AND object_id = OBJECT_ID('dbo.invoices'))
CREATE INDEX IX_invoices_invoice_date ON dbo.invoices(invoice_date);`
	},
	{
		name: 'invoice_items',
		sql: `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.invoice_items') AND type = N'U')
CREATE TABLE dbo.invoice_items (
	id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
	invoice_id INT NOT NULL,
	product_id INT NOT NULL,
	quantity INT NOT NULL,
	unit_price DECIMAL(18,2) NOT NULL,
	total_price DECIMAL(18,2) NOT NULL,
	price_type NVARCHAR(20) NOT NULL CHECK (price_type IN ('retail','wholesale')),
	is_private_price BIT NOT NULL,
	private_price_amount DECIMAL(18,2) NULL,
	private_price_note NVARCHAR(255) NULL,
	CONSTRAINT FK_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(id),
	CONSTRAINT FK_invoice_items_product FOREIGN KEY (product_id) REFERENCES dbo.products(id)
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_invoice_items_invoice' AND object_id = OBJECT_ID('dbo.invoice_items'))
CREATE INDEX IX_invoice_items_invoice ON dbo.invoice_items(invoice_id);`
	},
	{
		name: 'daily_stock',
		sql: `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.daily_stock') AND type = N'U')
CREATE TABLE dbo.daily_stock (
	id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
	product_id INT NOT NULL,
	available_qty INT NOT NULL DEFAULT(0),
	avg_cost DECIMAL(18,2) NOT NULL DEFAULT(0),
	date DATE NOT NULL,
	created_at DATETIME2 NOT NULL,
	updated_at DATETIME2 NOT NULL,
	CONSTRAINT FK_daily_stock_product FOREIGN KEY (product_id) REFERENCES dbo.products(id)
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_daily_stock_product_date' AND object_id = OBJECT_ID('dbo.daily_stock'))
CREATE INDEX IX_daily_stock_product_date ON dbo.daily_stock(product_id, date);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_daily_stock_available_qty' AND object_id = OBJECT_ID('dbo.daily_stock'))
CREATE INDEX IX_daily_stock_available_qty ON dbo.daily_stock(available_qty);`
	},
	{
		name: 'stock_movements',
		sql: `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.stock_movements') AND type = N'U')
CREATE TABLE dbo.stock_movements (
	id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
	product_id INT NOT NULL,
	invoice_id INT NOT NULL,
	invoice_date DATETIME2 NOT NULL,
	quantity_before INT NOT NULL,
	quantity_change INT NOT NULL,
	quantity_after INT NOT NULL,
	created_at DATETIME2 NOT NULL,
	CONSTRAINT FK_stock_movements_product FOREIGN KEY (product_id) REFERENCES dbo.products(id),
	CONSTRAINT FK_stock_movements_invoice FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(id)
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_stock_movements_invoice_date' AND object_id = OBJECT_ID('dbo.stock_movements'))
CREATE INDEX IX_stock_movements_invoice_date ON dbo.stock_movements(invoice_date);`
	},
	{
		name: 'invoice_payments',
		sql: `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.invoice_payments') AND type = N'U')
CREATE TABLE dbo.invoice_payments (
	id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
	invoice_id INT NOT NULL,
	payment_amount DECIMAL(18,2) NOT NULL,
	payment_date DATETIME2 NOT NULL,
	payment_method NVARCHAR(50) NULL,
	notes NVARCHAR(500) NULL,
	created_at DATETIME2 NOT NULL,
	CONSTRAINT FK_invoice_payments_invoice FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(id) ON DELETE CASCADE
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_invoice_payments_invoice' AND object_id = OBJECT_ID('dbo.invoice_payments'))
CREATE INDEX IX_invoice_payments_invoice ON dbo.invoice_payments(invoice_id);`
	},
	{
		name: 'invoice_payment_columns',
		sql: `-- Add payment tracking columns to invoices table
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'amount_paid')
BEGIN
	ALTER TABLE dbo.invoices ADD amount_paid DECIMAL(18,2) NOT NULL DEFAULT 0;
END

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'payment_status')
BEGIN
	ALTER TABLE dbo.invoices ADD payment_status NVARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','partial','paid'));
END`
	}
];

async function runInit() {
	let executed = 0;
	let errors = 0;
	const errorDetails = [];

	console.log(`Initializing database schema (${tables.length} tables)...`);
	console.log(`Connecting to: ${process.env.SQL_SERVER || 'HASSANLAPTOP\\MSSQLSERVER01'}`);
	console.log(`Database: ${process.env.SQL_DATABASE || 'InvoiceSystem'}`);
	
	for (let i = 0; i < tables.length; i++) {
		const table = tables[i];
		try {
			// For invoice_payment_columns, execute as single statement
			if (table.name === 'invoice_payment_columns') {
				try {
					await query(table.sql, []);
					executed++;
					console.log(`✓ Columns for '${table.name}' added/verified`);
					continue;
				} catch (err) {
					const errMsg = err.message?.toLowerCase() || '';
					if (errMsg.includes('already exists') || errMsg.includes('already an object named') || errMsg.includes('duplicate')) {
						console.log(`⚠ Columns for '${table.name}' already exist (skipped)`);
						executed++;
						continue;
					}
					throw err;
				}
			}
			
			// Split by semicolon to execute table creation and indexes separately if needed
			const statements = table.sql.split(';').filter(s => s.trim().length > 0);
			for (const stmt of statements) {
				const cleanStmt = stmt.trim();
				// Skip empty statements and comments
				if (!cleanStmt || cleanStmt.startsWith('--')) continue;
				
				try {
					await query(cleanStmt, []);
				} catch (stmtErr) {
					const stmtErrMsg = stmtErr.message?.toLowerCase() || '';
					// For statements within a table definition, check if it's an expected error
					if (
						stmtErrMsg.includes('already exists') ||
						stmtErrMsg.includes('duplicate') ||
						stmtErrMsg.includes('already an object named') ||
						stmtErrMsg.includes('already has a primary key') ||
						stmtErrMsg.includes('there is already') ||
						stmtErrMsg.includes('cannot drop') ||
						stmtErrMsg.includes('does not exist')
					) {
						// Expected - continue
						continue;
					}
					throw stmtErr; // Re-throw if unexpected
				}
			}
			executed++;
			console.log(`✓ Table '${table.name}' created/verified`);
		} catch (err) {
			const errMsg = err.message?.toLowerCase() || '';
			const fullErr = { table: table.name, error: err.message, sql: table.sql.substring(0, 150) };
			// Ignore "already exists" and similar expected errors
			if (
				errMsg.includes('already exists') ||
				errMsg.includes('duplicate') ||
				errMsg.includes('already an object named') ||
				errMsg.includes('already has a primary key') ||
				errMsg.includes('there is already')
			) {
				executed++;
				console.log(`⚠ Table '${table.name}' already exists (skipped)`);
			} else {
				console.error(`✗ Error creating table '${table.name}':`, err.message);
				if (err.stack) {
					console.error('Stack:', err.stack);
				}
				errorDetails.push(fullErr);
				errors++;
			}
		}
	}

	const result = { ok: errors === 0, batches: executed, errors, total: tables.length, errorDetails: errorDetails.length > 0 ? errorDetails : undefined };
	
	if (errors > 0) {
		console.error(`\n✗ Initialization completed with ${errors} error(s):`);
		errorDetails.forEach(e => console.error(`  - ${e.table}: ${e.error}`));
	}
	
	return result;
}

module.exports = { runInit };
