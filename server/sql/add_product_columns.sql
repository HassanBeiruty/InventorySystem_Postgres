-- Add category_id, description, and sku columns to products table
-- Run this script directly in SQL Server Management Studio

-- Add category_id column
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'products' AND COLUMN_NAME = 'category_id')
BEGIN
	ALTER TABLE dbo.products ADD category_id INT NULL;
	PRINT 'category_id column added';
END
ELSE
	PRINT 'category_id column already exists';

-- Add description column
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'products' AND COLUMN_NAME = 'description')
BEGIN
	ALTER TABLE dbo.products ADD description NVARCHAR(1000) NULL;
	PRINT 'description column added';
END
ELSE
	PRINT 'description column already exists';

-- Add sku column
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'products' AND COLUMN_NAME = 'sku')
BEGIN
	ALTER TABLE dbo.products ADD sku NVARCHAR(100) NULL;
	PRINT 'sku column added';
END
ELSE
	PRINT 'sku column already exists';

-- Add foreign key constraint if categories table exists
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'categories')
BEGIN
	IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('dbo.FK_products_category') AND type = 'F')
	BEGIN
		ALTER TABLE dbo.products ADD CONSTRAINT FK_products_category FOREIGN KEY (category_id) REFERENCES dbo.categories(id);
		PRINT 'Foreign key constraint added';
	END
	ELSE
		PRINT 'Foreign key constraint already exists';

	-- Add index
	IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_products_category' AND object_id = OBJECT_ID('dbo.products'))
	BEGIN
		CREATE INDEX IX_products_category ON dbo.products(category_id);
		PRINT 'Index added';
	END
	ELSE
		PRINT 'Index already exists';
END
ELSE
	PRINT 'Categories table does not exist yet - foreign key will be added when categories table is created';

PRINT 'Product columns migration completed!';

