const fs = require('fs');
const path = require('path');
const { query } = require('../db');

// Tables to create (in order to handle FK dependencies)
const tables = [
	{
		name: 'users',
		sql: `CREATE TABLE IF NOT EXISTS users (
	id SERIAL PRIMARY KEY,
	email VARCHAR(255) NOT NULL UNIQUE,
	passwordHash VARCHAR(255) NOT NULL,
	created_at TIMESTAMP NOT NULL
);`
	},
	{
		name: 'categories',
		sql: `CREATE TABLE IF NOT EXISTS categories (
	id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL UNIQUE,
	description VARCHAR(500) NULL,
	created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS IX_categories_name ON categories(name);`
	},
	{
		name: 'products',
		sql: `CREATE TABLE IF NOT EXISTS products (
	id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	barcode VARCHAR(100) NULL,
	category_id INT NULL,
	description VARCHAR(1000) NULL,
	sku VARCHAR(100) NULL,
	shelf VARCHAR(100) NULL,
	created_at TIMESTAMP NOT NULL,
	CONSTRAINT FK_products_category FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS IX_products_name ON products(name);

CREATE INDEX IF NOT EXISTS IX_products_category ON products(category_id);`
	},
	{
		name: 'product_prices',
		sql: `CREATE TABLE IF NOT EXISTS product_prices (
	id SERIAL PRIMARY KEY,
	product_id INT NOT NULL,
	wholesale_price DECIMAL(18,2) NOT NULL,
	retail_price DECIMAL(18,2) NOT NULL,
	effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
	created_at TIMESTAMP NOT NULL,
	CONSTRAINT FK_product_prices_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IX_product_prices_product_date ON product_prices(product_id, effective_date);`
	},
	{
		name: 'customers',
		sql: `CREATE TABLE IF NOT EXISTS customers (
	id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	phone VARCHAR(50) NULL,
	address VARCHAR(255) NULL,
	credit_limit DECIMAL(18,2) NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS IX_customers_name ON customers(name);`
	},
	{
		name: 'suppliers',
		sql: `CREATE TABLE IF NOT EXISTS suppliers (
	id SERIAL PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	phone VARCHAR(50) NULL,
	address VARCHAR(255) NULL,
	created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS IX_suppliers_name ON suppliers(name);`
	},
	{
		name: 'invoices',
		sql: `CREATE TABLE IF NOT EXISTS invoices (
	id SERIAL PRIMARY KEY,
	invoice_type VARCHAR(10) NOT NULL CHECK (invoice_type IN ('buy','sell')),
	customer_id INT NULL,
	supplier_id INT NULL,
	total_amount DECIMAL(18,2) NOT NULL,
	amount_paid DECIMAL(18,2) NOT NULL DEFAULT 0,
	payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','partial','paid')),
	is_paid BOOLEAN NOT NULL DEFAULT FALSE,
	invoice_date TIMESTAMP NOT NULL,
	due_date DATE NULL,
	created_at TIMESTAMP NOT NULL,
	CONSTRAINT FK_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
	CONSTRAINT FK_invoices_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE INDEX IF NOT EXISTS IX_invoices_invoice_date ON invoices(invoice_date);`
	},
	{
		name: 'invoice_items',
		sql: `CREATE TABLE IF NOT EXISTS invoice_items (
	id SERIAL PRIMARY KEY,
	invoice_id INT NOT NULL,
	product_id INT NOT NULL,
	quantity INT NOT NULL,
	unit_price DECIMAL(18,2) NOT NULL,
	total_price DECIMAL(18,2) NOT NULL,
	price_type VARCHAR(20) NOT NULL CHECK (price_type IN ('retail','wholesale')),
	is_private_price BOOLEAN NOT NULL DEFAULT FALSE,
	private_price_amount DECIMAL(18,2) NULL,
	private_price_note VARCHAR(255) NULL,
	CONSTRAINT FK_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
	CONSTRAINT FK_invoice_items_product FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS IX_invoice_items_invoice ON invoice_items(invoice_id);`
	},
	{
		name: 'daily_stock',
		sql: `CREATE TABLE IF NOT EXISTS daily_stock (
	id SERIAL PRIMARY KEY,
	product_id INT NOT NULL,
	available_qty INT NOT NULL DEFAULT 0,
	avg_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
	date DATE NOT NULL,
	created_at TIMESTAMP NOT NULL,
	updated_at TIMESTAMP NOT NULL,
	CONSTRAINT FK_daily_stock_product FOREIGN KEY (product_id) REFERENCES products(id),
	CONSTRAINT UQ_daily_stock_product_date UNIQUE (product_id, date)
);

CREATE INDEX IF NOT EXISTS IX_daily_stock_product_date ON daily_stock(product_id, date);

CREATE INDEX IF NOT EXISTS IX_daily_stock_available_qty ON daily_stock(available_qty);`
	},
	{
		name: 'stock_movements',
		sql: `CREATE TABLE IF NOT EXISTS stock_movements (
	id SERIAL PRIMARY KEY,
	product_id INT NOT NULL,
	invoice_id INT NOT NULL,
	invoice_date TIMESTAMP NOT NULL,
	quantity_before INT NOT NULL,
	quantity_change INT NOT NULL,
	quantity_after INT NOT NULL,
	unit_cost DECIMAL(18,2) NULL,
	avg_cost_after DECIMAL(18,2) NULL,
	created_at TIMESTAMP NOT NULL,
	CONSTRAINT FK_stock_movements_product FOREIGN KEY (product_id) REFERENCES products(id),
	CONSTRAINT FK_stock_movements_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE INDEX IF NOT EXISTS IX_stock_movements_invoice_date ON stock_movements(invoice_date);`
	},
	{
		name: 'stock_movements_add_cost_columns',
		sql: `-- Add unit_cost and avg_cost_after columns to stock_movements table (if they don't exist)
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_movements' AND column_name = 'unit_cost') THEN
		ALTER TABLE stock_movements ADD COLUMN unit_cost DECIMAL(18,2) NULL;
	END IF;
	
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_movements' AND column_name = 'avg_cost_after') THEN
		ALTER TABLE stock_movements ADD COLUMN avg_cost_after DECIMAL(18,2) NULL;
	END IF;
END $$;`
	},
	{
		name: 'invoice_payments',
		sql: `CREATE TABLE IF NOT EXISTS invoice_payments (
	id SERIAL PRIMARY KEY,
	invoice_id INT NOT NULL,
	payment_amount DECIMAL(18,2) NOT NULL,
	payment_date TIMESTAMP NOT NULL,
	payment_method VARCHAR(50) NULL,
	notes VARCHAR(500) NULL,
	created_at TIMESTAMP NOT NULL,
	CONSTRAINT FK_invoice_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IX_invoice_payments_invoice ON invoice_payments(invoice_id);`
	},
	{
		name: 'invoice_payment_columns',
		sql: `-- Add payment tracking columns to invoices table (if they don't exist)
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'amount_paid') THEN
		ALTER TABLE invoices ADD COLUMN amount_paid DECIMAL(18,2) NOT NULL DEFAULT 0;
	END IF;
	
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'payment_status') THEN
		ALTER TABLE invoices ADD COLUMN payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','partial','paid'));
	END IF;
END $$;`
	},
	{
		name: 'products_add_columns',
		sql: `-- Add optional columns to products table (if they don't exist)
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'category_id') THEN
		ALTER TABLE products ADD COLUMN category_id INT NULL;
	END IF;
	
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'description') THEN
		ALTER TABLE products ADD COLUMN description VARCHAR(1000) NULL;
	END IF;
	
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sku') THEN
		ALTER TABLE products ADD COLUMN sku VARCHAR(100) NULL;
	END IF;
	
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'shelf') THEN
		ALTER TABLE products ADD COLUMN shelf VARCHAR(100) NULL;
	END IF;
END $$;`
	},
	{
		name: 'invoices_add_due_date',
		sql: `-- Add due_date column to invoices table (if it doesn't exist)
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'due_date') THEN
		ALTER TABLE invoices ADD COLUMN due_date DATE NULL;
	END IF;
END $$;`
	},
	{
		name: 'daily_stock_unique_constraint',
		sql: `-- Add unique constraint on (product_id, date) if it doesn't exist
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint 
		WHERE LOWER(conname) = 'uq_daily_stock_product_date' 
		AND conrelid = 'daily_stock'::regclass
	) THEN
		ALTER TABLE daily_stock ADD CONSTRAINT UQ_daily_stock_product_date UNIQUE (product_id, date);
	END IF;
END $$;`
	},
	{
		name: 'products_add_foreign_key',
		sql: `-- Add foreign key constraint if it doesn't exist (index is already created in products table)
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'categories')
		AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE LOWER(constraint_name) = 'fk_products_category' AND table_name = 'products') THEN
		ALTER TABLE products ADD CONSTRAINT FK_products_category FOREIGN KEY (category_id) REFERENCES categories(id);
	END IF;
END $$;`
	},
	{
		name: 'function_recalculate_stock_after_invoice',
		sql: `-- Function: RecalculateStockAfterInvoice
-- Handles recalculation of stock movements and daily stock after editing or deleting invoice products
CREATE OR REPLACE FUNCTION recalculate_stock_after_invoice(
	p_invoice_id INT,
	p_product_id INT,
	p_action_type VARCHAR(10), -- 'DELETE' or 'EDIT'
	p_new_qty DECIMAL(18,4) DEFAULT NULL,
	p_new_unit_cost DECIMAL(18,4) DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
	v_quantity_before DECIMAL(18,4);
	v_avg_cost_before DECIMAL(18,4);
	v_invoice_date TIMESTAMP;
	v_movement_id INT;
	v_qty_change DECIMAL(18,4);
	v_unit_cost DECIMAL(18,4);
	v_quantity_after DECIMAL(18,4);
	v_avg_cost_after DECIMAL(18,4);
	v_invoice_date_only DATE;
	v_updated_count INT;
BEGIN
	-- 1. Handle the invoice action (DELETE / EDIT)
	IF p_action_type = 'DELETE' THEN
		DELETE FROM stock_movements
		WHERE product_id = p_product_id
		  AND invoice_id = p_invoice_id;
	ELSIF p_action_type = 'EDIT' THEN
		-- Update existing record only (no insert)
		UPDATE stock_movements
		SET quantity_change = p_new_qty,
			unit_cost = p_new_unit_cost
		WHERE product_id = p_product_id
		  AND invoice_id = p_invoice_id;
		
		GET DIAGNOSTICS v_updated_count = ROW_COUNT;
		IF v_updated_count = 0 THEN
			RAISE EXCEPTION 'No matching stock movement found for EDIT';
		END IF;
	END IF;
	
	-- 2. Find last correct state before this invoice
	SELECT invoice_date INTO v_invoice_date
	FROM invoices 
	WHERE id = p_invoice_id;
	
	SELECT quantity_after, avg_cost_after
	INTO v_quantity_before, v_avg_cost_before
	FROM stock_movements
	WHERE product_id = p_product_id
	  AND invoice_id < p_invoice_id
	ORDER BY invoice_id DESC, id DESC
	LIMIT 1;
	
	v_quantity_before := COALESCE(v_quantity_before, 0);
	v_avg_cost_before := COALESCE(v_avg_cost_before, 0);
	
	-- 3. Recalculate all later movements (including edited one)
	FOR v_movement_id, v_qty_change, v_unit_cost IN
		SELECT id, quantity_change, unit_cost
		FROM stock_movements
		WHERE product_id = p_product_id
		  AND invoice_id >= p_invoice_id
		ORDER BY invoice_id ASC, id ASC
	LOOP
		v_quantity_after := v_quantity_before + v_qty_change;
		
		IF v_qty_change > 0 AND v_unit_cost IS NOT NULL THEN
			v_avg_cost_after := ((v_quantity_before * v_avg_cost_before) + (v_qty_change * v_unit_cost)) / NULLIF(v_quantity_after, 0);
		ELSE
			v_avg_cost_after := v_avg_cost_before;
		END IF;
		
		UPDATE stock_movements
		SET quantity_before = v_quantity_before,
			quantity_after = v_quantity_after,
			avg_cost_after = v_avg_cost_after
		WHERE id = v_movement_id;
		
		v_quantity_before := v_quantity_after;
		v_avg_cost_before := v_avg_cost_after;
	END LOOP;
	
	-- 4. Update daily stock snapshots
	v_invoice_date_only := CAST(v_invoice_date AS DATE);
	
	-- Delete daily_stock records from invoice date onwards
	DELETE FROM daily_stock
	WHERE product_id = p_product_id
	  AND date >= v_invoice_date_only;
	
	-- Re-insert daily_stock records based on latest movements per date
	INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at)
	SELECT 
		product_id,
		quantity_after AS quantity,
		avg_cost_after AS avg_cost,
		CAST(invoice_date AS DATE) AS stock_date,
		NOW() AS created_at,
		NOW() AS updated_at
	FROM (
		SELECT 
			product_id,
			invoice_date,
			quantity_after,
			avg_cost_after,
			ROW_NUMBER() OVER (
				PARTITION BY product_id, CAST(invoice_date AS DATE)
				ORDER BY invoice_date DESC, invoice_id DESC, id DESC
			) AS rn
		FROM stock_movements
		WHERE product_id = p_product_id
		  AND CAST(invoice_date AS DATE) >= v_invoice_date_only
	) AS LatestMovements
	WHERE rn = 1
	ON CONFLICT (product_id, date) DO UPDATE SET
		available_qty = EXCLUDED.available_qty,
		avg_cost = EXCLUDED.avg_cost,
		updated_at = EXCLUDED.updated_at;
END;
$$;`
	},
	{
		name: 'function_daily_stock_snapshot',
		sql: `-- Function: sp_DailyStockSnapshot
-- Creates daily stock snapshots for all products
CREATE OR REPLACE FUNCTION sp_daily_stock_snapshot()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
	v_yesterday DATE := CURRENT_DATE - INTERVAL '1 day';
	v_today DATE := CURRENT_DATE;
	v_now TIMESTAMP := NOW();
	v_product_id INT;
	v_yesterday_ending_qty INT;
	v_yesterday_avg_cost DECIMAL(18,2);
	v_today_record_exists INT;
	v_success_count INT := 0;
	v_skipped_count INT := 0;
BEGIN
	FOR v_product_id IN SELECT id FROM products
	LOOP
		-- Get yesterday's ending quantity and average cost for this product
		SELECT available_qty, avg_cost
		INTO v_yesterday_ending_qty, v_yesterday_avg_cost
		FROM daily_stock
		WHERE product_id = v_product_id
		AND date <= v_yesterday
		ORDER BY 
			CASE WHEN date = v_yesterday THEN 0 ELSE 1 END,
			date DESC,
			updated_at DESC
		LIMIT 1;
		
		-- If no record exists, default to 0
		IF v_yesterday_ending_qty IS NULL THEN
			v_yesterday_ending_qty := 0;
			v_yesterday_avg_cost := 0;
		END IF;
		
		-- Check if a record already exists for today's date
		SELECT COUNT(*) INTO v_today_record_exists
		FROM daily_stock
		WHERE product_id = v_product_id
		AND date = v_today;
		
		IF v_today_record_exists = 0 THEN
			-- Insert NEW record for today's date
			INSERT INTO daily_stock 
			(product_id, available_qty, avg_cost, date, created_at, updated_at)
			VALUES 
			(v_product_id, v_yesterday_ending_qty, v_yesterday_avg_cost, v_today, v_now, v_now);
			
			v_success_count := v_success_count + 1;
		ELSE
			v_skipped_count := v_skipped_count + 1;
		END IF;
	END LOOP;
	
	RAISE NOTICE 'Daily stock snapshot completed. Processed: %, Skipped: %', v_success_count, v_skipped_count;
END;
$$;`
	},
	{
		name: 'function_recompute_positions',
		sql: `-- Function: sp_RecomputePositions
-- Recomputes daily stock positions, filling gaps
CREATE OR REPLACE FUNCTION sp_recompute_positions(p_product_id INT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
	v_now TIMESTAMP := NOW();
	v_today DATE := CURRENT_DATE;
	v_inserted_count INT := 0;
	v_gap_count INT := 0;
BEGIN
	-- Step 1: Detect gaps
	DROP TABLE IF EXISTS gap_ranges;
	CREATE TEMP TABLE gap_ranges AS
	WITH FilteredStock AS (
		SELECT *
		FROM daily_stock
		WHERE (p_product_id IS NULL OR product_id = p_product_id)
	),
	Ordered AS (
		SELECT
			product_id,
			date,
			LEAD(date) OVER (PARTITION BY product_id ORDER BY date) AS next_date
		FROM FilteredStock
	),
	NaturalGaps AS (
		SELECT
			product_id,
			date AS gap_start,
			next_date AS gap_end
		FROM Ordered
		WHERE next_date IS NOT NULL
		  AND next_date - date > INTERVAL '1 day'
	),
	EndOfDataGaps AS (
		SELECT 
			product_id,
			MAX(date) AS gap_start,
			v_today AS gap_end
		FROM FilteredStock
		GROUP BY product_id
		HAVING MAX(date) < v_today
	)
	SELECT * FROM NaturalGaps
	UNION ALL
	SELECT * FROM EndOfDataGaps;
	
	SELECT COUNT(*) INTO v_gap_count FROM gap_ranges;
	
	IF v_gap_count = 0 THEN
		RAISE NOTICE 'No gaps found. Exiting.';
		RETURN;
	END IF;
	
	-- Step 2: Determine span
	DROP TABLE IF EXISTS product_gap_span;
	CREATE TEMP TABLE product_gap_span AS
	SELECT 
		product_id,
		MIN(gap_start) AS span_start,
		v_today AS span_end
	FROM gap_ranges
	GROUP BY product_id;
	
	-- Step 3: Copy existing records
	DROP TABLE IF EXISTS existing_records_in_gaps;
	CREATE TEMP TABLE existing_records_in_gaps AS
	SELECT ds.*
	FROM daily_stock ds
	INNER JOIN product_gap_span pgs
		ON ds.product_id = pgs.product_id
	   AND ds.date BETWEEN pgs.span_start AND pgs.span_end;
	
	-- Step 4: Delete everything in the span
	DELETE FROM daily_stock ds
	USING product_gap_span pgs
	WHERE ds.product_id = pgs.product_id
	  AND ds.date BETWEEN pgs.span_start AND pgs.span_end;
	
	-- Step 5: Generate all dates from span_start to today
	DROP TABLE IF EXISTS all_gap_dates;
	CREATE TEMP TABLE all_gap_dates AS
	SELECT 
		pgs.product_id,
		(pgs.span_start + (generate_series(0, (pgs.span_end - pgs.span_start))::INT || ' days')::INTERVAL)::DATE AS date
	FROM product_gap_span pgs;
	
	-- Step 6: Compute missing values using last known values
	DROP TABLE IF EXISTS missing_values_to_fill;
	CREATE TEMP TABLE missing_values_to_fill AS
	WITH GapValues AS (
		SELECT
			gd.product_id,
			gd.date,
			COALESCE(er.available_qty, lk.available_qty) AS available_qty,
			COALESCE(er.avg_cost, lk.avg_cost) AS avg_cost
		FROM all_gap_dates gd
		LEFT JOIN existing_records_in_gaps er
			ON er.product_id = gd.product_id
		   AND er.date = gd.date
		LEFT JOIN LATERAL (
			SELECT available_qty, avg_cost
			FROM existing_records_in_gaps ds
			WHERE ds.product_id = gd.product_id
			  AND ds.date < gd.date
			ORDER BY ds.date DESC
			LIMIT 1
		) AS lk ON true
	)
	SELECT * FROM GapValues;
	
	-- Step 7: Insert everything back
	INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at)
	SELECT
		product_id,
		COALESCE(available_qty, 0),
		COALESCE(avg_cost, 0),
		date,
		v_now,
		v_now
	FROM missing_values_to_fill
	ON CONFLICT (product_id, date) DO UPDATE SET
		available_qty = EXCLUDED.available_qty,
		avg_cost = EXCLUDED.avg_cost,
		updated_at = EXCLUDED.updated_at;
	
	GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
	
	RAISE NOTICE 'Recalculation completed. Inserted rows: %', v_inserted_count;
	
	-- Clean up temp tables
	DROP TABLE IF EXISTS gap_ranges;
	DROP TABLE IF EXISTS product_gap_span;
	DROP TABLE IF EXISTS existing_records_in_gaps;
	DROP TABLE IF EXISTS all_gap_dates;
	DROP TABLE IF EXISTS missing_values_to_fill;
END;
$$;`
	}
];

async function runInit() {
	let executed = 0;
	let errors = 0;
	const errorDetails = [];

	console.log(`Initializing database schema (${tables.length} tables)...`);
	console.log(`Connecting to: ${process.env.PG_HOST || 'localhost'}:${process.env.PG_PORT || '5432'}`);
	console.log(`Database: ${process.env.PG_DATABASE || 'invoicesystem'}`);
	
	for (let i = 0; i < tables.length; i++) {
		const table = tables[i];
		try {
			// For DO $$ blocks (migrations) and CREATE FUNCTION statements, execute as single statement
			if (table.sql.includes('DO $$') || table.sql.includes('CREATE OR REPLACE FUNCTION') || table.sql.includes('CREATE FUNCTION')) {
				try {
					await query(table.sql, []);
					executed++;
					if (table.sql.includes('FUNCTION')) {
						console.log(`✓ Function '${table.name}' created/updated`);
					} else {
						console.log(`✓ Columns for '${table.name}' added/verified`);
					}
					continue;
				} catch (err) {
					const errMsg = err.message?.toLowerCase() || '';
					if (errMsg.includes('already exists') || errMsg.includes('duplicate') || errMsg.includes('already an object named')) {
						if (table.sql.includes('FUNCTION')) {
							console.log(`⚠ Function '${table.name}' already exists (skipped)`);
						} else {
							console.log(`⚠ Columns for '${table.name}' already exist (skipped)`);
						}
						executed++;
						continue;
					}
					console.warn(`Warning in ${table.name}:`, err.message);
					executed++;
					continue;
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
