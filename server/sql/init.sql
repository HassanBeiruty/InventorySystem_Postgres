-- Create schema for InvoiceSystem (id as NVARCHAR(50) for simplicity)
IF DB_ID(N'InvoiceSystem') IS NULL
BEGIN
    PRINT 'Create database InvoiceSystem manually or ensure context is set to it.'
END
GO

-- Users
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
CREATE TABLE dbo.users (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    email NVARCHAR(255) NOT NULL UNIQUE,
    passwordHash NVARCHAR(255) NOT NULL,
    created_at DATETIME2 NOT NULL
);

-- Products
IF OBJECT_ID(N'dbo.products', N'U') IS NULL
CREATE TABLE dbo.products (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    barcode NVARCHAR(100) NULL,
    wholesale_price DECIMAL(18,2) NOT NULL,
    retail_price DECIMAL(18,2) NOT NULL,
    created_at DATETIME2 NOT NULL
);
CREATE INDEX IX_products_name ON dbo.products(name);

-- Product Prices (independent from products)
IF OBJECT_ID(N'dbo.product_prices', N'U') IS NULL
CREATE TABLE dbo.product_prices (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    product_id NVARCHAR(50) NOT NULL,
    wholesale_price DECIMAL(18,2) NOT NULL,
    retail_price DECIMAL(18,2) NOT NULL,
    effective_date DATE NOT NULL DEFAULT(CONVERT(date, GETDATE())),
    created_at DATETIME2 NOT NULL,
    CONSTRAINT FK_product_prices_product FOREIGN KEY (product_id) REFERENCES dbo.products(id) ON DELETE CASCADE
);
CREATE INDEX IX_product_prices_product_date ON dbo.product_prices(product_id, effective_date);

-- Customers
IF OBJECT_ID(N'dbo.customers', N'U') IS NULL
CREATE TABLE dbo.customers (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    phone NVARCHAR(50) NULL,
    address NVARCHAR(255) NULL,
    credit_limit DECIMAL(18,2) NOT NULL DEFAULT(0),
    created_at DATETIME2 NOT NULL
);
CREATE INDEX IX_customers_name ON dbo.customers(name);

-- Suppliers
IF OBJECT_ID(N'dbo.suppliers', N'U') IS NULL
CREATE TABLE dbo.suppliers (
    id NVARCHAR(50) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    phone NVARCHAR(50) NULL,
    address NVARCHAR(255) NULL,
    created_at DATETIME2 NOT NULL
);
CREATE INDEX IX_suppliers_name ON dbo.suppliers(name);

-- Invoices
IF OBJECT_ID(N'dbo.invoices', N'U') IS NULL
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
CREATE INDEX IX_invoices_invoice_date ON dbo.invoices(invoice_date);

-- Invoice Items
IF OBJECT_ID(N'dbo.invoice_items', N'U') IS NULL
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
CREATE INDEX IX_invoice_items_invoice ON dbo.invoice_items(invoice_id);

-- Daily Stock
IF OBJECT_ID(N'dbo.daily_stock', N'U') IS NULL
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
CREATE INDEX IX_daily_stock_product_date ON dbo.daily_stock(product_id, date);
CREATE INDEX IX_daily_stock_available_qty ON dbo.daily_stock(available_qty);

-- Stock Movements
IF OBJECT_ID(N'dbo.stock_movements', N'U') IS NULL
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
CREATE INDEX IX_stock_movements_invoice_date ON dbo.stock_movements(invoice_date);


