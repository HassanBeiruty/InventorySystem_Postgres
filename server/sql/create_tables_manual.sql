USE InvoiceSystem;
GO

-- Users
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.users') AND type = N'U')
CREATE TABLE dbo.users (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    email NVARCHAR(255) NOT NULL UNIQUE,
    passwordHash NVARCHAR(255) NOT NULL,
    created_at DATETIME2 NOT NULL
);
GO

-- Products
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.products') AND type = N'U')
CREATE TABLE dbo.products (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    barcode NVARCHAR(100) NULL,
    wholesale_price DECIMAL(18,2) NOT NULL,
    retail_price DECIMAL(18,2) NOT NULL,
    created_at DATETIME2 NOT NULL
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_products_name' AND object_id = OBJECT_ID('dbo.products'))
CREATE INDEX IX_products_name ON dbo.products(name);
GO

-- Product Prices (independent from products)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.product_prices') AND type = N'U')
CREATE TABLE dbo.product_prices (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    product_id NVARCHAR(50) NOT NULL,
    wholesale_price DECIMAL(18,2) NOT NULL,
    retail_price DECIMAL(18,2) NOT NULL,
    effective_date DATE NOT NULL DEFAULT(CONVERT(date, GETDATE())),
    created_at DATETIME2 NOT NULL,
    CONSTRAINT FK_product_prices_product FOREIGN KEY (product_id) REFERENCES dbo.products(id) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_product_prices_product_date' AND object_id = OBJECT_ID('dbo.product_prices'))
CREATE INDEX IX_product_prices_product_date ON dbo.product_prices(product_id, effective_date);
GO

-- Product Costs
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.product_costs') AND type = N'U')
CREATE TABLE dbo.product_costs (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    product_id NVARCHAR(50) NOT NULL,
    supplier_id NVARCHAR(50) NULL,
    invoice_id NVARCHAR(50) NULL,
    cost DECIMAL(18,2) NOT NULL,
    quantity INT NOT NULL,
    purchase_date DATETIME2 NOT NULL,
    created_at DATETIME2 NOT NULL,
    CONSTRAINT FK_product_costs_product FOREIGN KEY (product_id) REFERENCES dbo.products(id) ON DELETE CASCADE,
    CONSTRAINT FK_product_costs_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.suppliers(id) ON DELETE SET NULL,
    CONSTRAINT FK_product_costs_invoice FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(id) ON DELETE SET NULL
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_product_costs_product' AND object_id = OBJECT_ID('dbo.product_costs'))
CREATE INDEX IX_product_costs_product ON dbo.product_costs(product_id);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_product_costs_purchase_date' AND object_id = OBJECT_ID('dbo.product_costs'))
CREATE INDEX IX_product_costs_purchase_date ON dbo.product_costs(purchase_date);
GO

-- Customers
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.customers') AND type = N'U')
CREATE TABLE dbo.customers (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    phone NVARCHAR(50) NULL,
    address NVARCHAR(255) NULL,
    credit_limit DECIMAL(18,2) NOT NULL DEFAULT(0),
    created_at DATETIME2 NOT NULL
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_customers_name' AND object_id = OBJECT_ID('dbo.customers'))
CREATE INDEX IX_customers_name ON dbo.customers(name);
GO

-- Suppliers
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.suppliers') AND type = N'U')
CREATE TABLE dbo.suppliers (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    phone NVARCHAR(50) NULL,
    address NVARCHAR(255) NULL,
    created_at DATETIME2 NOT NULL
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_suppliers_name' AND object_id = OBJECT_ID('dbo.suppliers'))
CREATE INDEX IX_suppliers_name ON dbo.suppliers(name);
GO

-- Invoices
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.invoices') AND type = N'U')
CREATE TABLE dbo.invoices (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    invoice_type NVARCHAR(10) NOT NULL CHECK (invoice_type IN ('buy','sell')),
    customer_id NVARCHAR(50) NULL,
    supplier_id NVARCHAR(50) NULL,
    total_amount DECIMAL(18,2) NOT NULL,
    is_paid BIT NOT NULL,
    invoice_date DATETIME2 NOT NULL,
    created_at DATETIME2 NOT NULL,
    CONSTRAINT FK_invoices_customer FOREIGN KEY (customer_id) REFERENCES dbo.customers(id),
    CONSTRAINT FK_invoices_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.suppliers(id)
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_invoices_invoice_date' AND object_id = OBJECT_ID('dbo.invoices'))
CREATE INDEX IX_invoices_invoice_date ON dbo.invoices(invoice_date);
GO

-- Invoice Items
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.invoice_items') AND type = N'U')
CREATE TABLE dbo.invoice_items (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    invoice_id NVARCHAR(50) NOT NULL,
    product_id NVARCHAR(50) NOT NULL,
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
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_invoice_items_invoice' AND object_id = OBJECT_ID('dbo.invoice_items'))
CREATE INDEX IX_invoice_items_invoice ON dbo.invoice_items(invoice_id);
GO

-- Daily Stock
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.daily_stock') AND type = N'U')
CREATE TABLE dbo.daily_stock (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    product_id NVARCHAR(50) NOT NULL,
    available_qty INT NOT NULL DEFAULT(0),
    avg_cost DECIMAL(18,2) NOT NULL DEFAULT(0),
    date DATE NOT NULL,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT FK_daily_stock_product FOREIGN KEY (product_id) REFERENCES dbo.products(id)
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_daily_stock_product_date' AND object_id = OBJECT_ID('dbo.daily_stock'))
CREATE INDEX IX_daily_stock_product_date ON dbo.daily_stock(product_id, date);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_daily_stock_available_qty' AND object_id = OBJECT_ID('dbo.daily_stock'))
CREATE INDEX IX_daily_stock_available_qty ON dbo.daily_stock(available_qty);
GO

-- Stock Movements
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.stock_movements') AND type = N'U')
CREATE TABLE dbo.stock_movements (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    product_id NVARCHAR(50) NOT NULL,
    invoice_id NVARCHAR(50) NOT NULL,
    invoice_date DATETIME2 NOT NULL,
    quantity_before INT NOT NULL,
    quantity_change INT NOT NULL,
    quantity_after INT NOT NULL,
    created_at DATETIME2 NOT NULL,
    CONSTRAINT FK_stock_movements_product FOREIGN KEY (product_id) REFERENCES dbo.products(id),
    CONSTRAINT FK_stock_movements_invoice FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(id)
);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_stock_movements_invoice_date' AND object_id = OBJECT_ID('dbo.stock_movements'))
CREATE INDEX IX_stock_movements_invoice_date ON dbo.stock_movements(invoice_date);
GO

PRINT 'All tables created successfully!';
GO


