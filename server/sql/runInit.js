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
	is_admin BOOLEAN NOT NULL DEFAULT false,
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
		sql: `-- Function: sp_daily_stock_snapshot
-- Creates daily stock snapshots for all products
CREATE OR REPLACE FUNCTION public.sp_daily_stock_snapshot()
RETURNS void
LANGUAGE 'plpgsql'
COST 100
VOLATILE PARALLEL UNSAFE
AS $BODY$
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
$BODY$;

ALTER FUNCTION public.sp_daily_stock_snapshot()
    OWNER TO postgres;`
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
		  AND (next_date - date)::INTEGER > 1
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
	},
	{
		name: 'exchange_rates',
		sql: `CREATE TABLE IF NOT EXISTS exchange_rates (
	id SERIAL PRIMARY KEY,
	currency_code VARCHAR(3) NOT NULL CHECK (currency_code IN ('USD', 'LBP', 'EUR')),
	rate_to_usd DECIMAL(18,6) NOT NULL,
	effective_date DATE NOT NULL,
	is_active BOOLEAN NOT NULL DEFAULT TRUE,
	created_at TIMESTAMP NOT NULL,
	updated_at TIMESTAMP NOT NULL,
	CONSTRAINT UQ_exchange_rates_currency_date UNIQUE (currency_code, effective_date)
);

CREATE INDEX IF NOT EXISTS IX_exchange_rates_currency ON exchange_rates(currency_code);
CREATE INDEX IF NOT EXISTS IX_exchange_rates_effective_date ON exchange_rates(effective_date);
CREATE INDEX IF NOT EXISTS IX_exchange_rates_active ON exchange_rates(is_active);`
	},
	{
		name: 'invoice_payments_multi_currency',
		sql: `-- Add multi-currency columns to invoice_payments table
DO $$
BEGIN
	-- Rename payment_amount to paid_amount if it exists and new column doesn't
	IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_payments' AND column_name = 'payment_amount')
		AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_payments' AND column_name = 'paid_amount') THEN
		ALTER TABLE invoice_payments RENAME COLUMN payment_amount TO paid_amount;
	END IF;
	
	-- Add currency_code column if it doesn't exist
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_payments' AND column_name = 'currency_code') THEN
		ALTER TABLE invoice_payments ADD COLUMN currency_code VARCHAR(3) NOT NULL DEFAULT 'USD';
		ALTER TABLE invoice_payments ADD CONSTRAINT CHK_invoice_payments_currency CHECK (currency_code IN ('USD', 'LBP', 'EUR'));
	END IF;
	
	-- Add exchange_rate_on_payment column if it doesn't exist
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_payments' AND column_name = 'exchange_rate_on_payment') THEN
		ALTER TABLE invoice_payments ADD COLUMN exchange_rate_on_payment DECIMAL(18,6) NOT NULL DEFAULT 1.0;
	END IF;
	
	-- Add usd_equivalent_amount column if it doesn't exist
	IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_payments' AND column_name = 'usd_equivalent_amount') THEN
		ALTER TABLE invoice_payments ADD COLUMN usd_equivalent_amount DECIMAL(18,2) NOT NULL DEFAULT 0;
	END IF;
	
	-- Migrate existing data: set currency_code='USD', exchange_rate_on_payment=1.0, usd_equivalent_amount=paid_amount
	-- for records where usd_equivalent_amount is 0 or NULL (indicating they need migration)
	UPDATE invoice_payments
	SET 
		currency_code = COALESCE(currency_code, 'USD'),
		exchange_rate_on_payment = COALESCE(exchange_rate_on_payment, 1.0),
		usd_equivalent_amount = CASE 
			WHEN usd_equivalent_amount = 0 OR usd_equivalent_amount IS NULL THEN paid_amount
			ELSE usd_equivalent_amount
		END
	WHERE usd_equivalent_amount = 0 OR usd_equivalent_amount IS NULL;
END $$;`
	},
	{
		name: 'pg_cron_extension',
		sql: `-- Enable pg_cron extension (if available and not already enabled)
-- Note: This requires superuser privileges and may not be available on all PostgreSQL instances
DO $$
BEGIN
	-- Check if pg_cron extension exists
	IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
		-- Try to create extension if it doesn't exist
		CREATE EXTENSION IF NOT EXISTS pg_cron;
		RAISE NOTICE 'pg_cron extension enabled';
	ELSE
		RAISE NOTICE 'pg_cron extension not available - scheduled jobs will need to be set up manually or via application-level cron';
	END IF;
EXCEPTION
	WHEN insufficient_privilege THEN
		RAISE NOTICE 'Insufficient privileges to enable pg_cron - contact database administrator';
	WHEN OTHERS THEN
		RAISE NOTICE 'Could not enable pg_cron: %', SQLERRM;
END $$;`
	},
	{
		name: 'recompute_positions_job',
		sql: `-- Create scheduled job for sp_recompute_positions (runs daily at 12:05 AM)
-- This will only work if pg_cron extension is enabled
DO $$
DECLARE
	v_job_exists BOOLEAN;
BEGIN
	-- Check if pg_cron is available
	IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
		RAISE NOTICE 'pg_cron extension not available - skipping job creation';
		RETURN;
	END IF;
	
	-- Check if job already exists
	SELECT EXISTS (
		SELECT 1 FROM cron.job WHERE jobname = 'recompute-positions-daily-job'
	) INTO v_job_exists;
	
	-- Remove existing job if it exists
	IF v_job_exists THEN
		PERFORM cron.unschedule('recompute-positions-daily-job');
		RAISE NOTICE 'Removed existing recompute-positions-daily-job';
	END IF;
	
	-- Create the scheduled job
	-- Schedule: Every day at 12:05 AM (00:05)
	-- Cron format: '5 0 * * *' = minute 5, hour 0, every day, every month, every day of week
	PERFORM cron.schedule(
		'recompute-positions-daily-job',           -- Job name
		'5 0 * * *',                              -- Cron schedule: 5 minutes past midnight every day
		$cmd$SELECT sp_recompute_positions(NULL);$cmd$, -- Command to execute (NULL = all products)
		current_database(),                       -- Database name
		current_user,                             -- Username
		true                                      -- Active (enabled)
	);
	
	RAISE NOTICE 'Scheduled job recompute-positions-daily-job created successfully (runs daily at 12:05 AM)';
EXCEPTION
	WHEN insufficient_privilege THEN
		RAISE NOTICE 'Insufficient privileges to create cron job - contact database administrator';
	WHEN OTHERS THEN
		RAISE NOTICE 'Could not create cron job: %', SQLERRM;
		RAISE NOTICE 'You may need to set up the job manually using pgAdmin or psql';
END $$;`
	},
	{
		name: 'pgagent_extension',
		sql: `-- Enable pgagent extension (if available and not already enabled)
-- Note: pgAgent must be installed separately and requires superuser privileges
DO $$
BEGIN
	-- Check if pgagent extension exists
	IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgagent') THEN
		-- Try to create extension if it doesn't exist
		CREATE EXTENSION IF NOT EXISTS pgagent;
		RAISE NOTICE 'pgagent extension enabled';
	ELSE
		RAISE NOTICE 'pgagent extension not available - scheduled jobs will need to be set up manually via pgAdmin';
	END IF;
EXCEPTION
	WHEN insufficient_privilege THEN
		RAISE NOTICE 'Insufficient privileges to enable pgagent - contact database administrator';
	WHEN OTHERS THEN
		RAISE NOTICE 'Could not enable pgagent: %', SQLERRM;
		RAISE NOTICE 'pgAgent must be installed separately. See: https://www.pgadmin.org/docs/pgadmin4/latest/pgagent.html';
END $$;`
	},
	{
		name: 'daily_stock_snapshot_pgagent_job',
		sql: `-- Create pgAgent job for sp_daily_stock_snapshot (runs daily at 12:05 AM)
-- This will only work if pgagent extension is enabled
DO $$
DECLARE
	v_job_id INTEGER;
	v_job_exists BOOLEAN;
	v_schedule_id INTEGER;
BEGIN
	-- Check if pgagent is available
	IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgagent') THEN
		RAISE NOTICE 'pgagent extension not available - skipping job creation';
		RAISE NOTICE 'To use pgAgent, install it separately and enable the extension';
		RETURN;
	END IF;
	
	-- Check if job already exists
	SELECT EXISTS (
		SELECT 1 FROM pgagent.pga_job WHERE jobname = 'daily-stock-snapshot-job'
	) INTO v_job_exists;
	
	-- Remove existing job if it exists
	IF v_job_exists THEN
		DELETE FROM pgagent.pga_job WHERE jobname = 'daily-stock-snapshot-job';
		RAISE NOTICE 'Removed existing daily-stock-snapshot-job';
	END IF;
	
	-- Create the job
	INSERT INTO pgagent.pga_job (
		jobjclid,      -- Job class ID (1 = SQL job)
		jobjname,      -- Job name
		jobjdesc,      -- Job description
		jobhostagent,  -- Host agent (NULL = any agent)
		jobenabled     -- Enabled (true)
	) VALUES (
		1,
		'daily-stock-snapshot-job',
		'Creates daily stock snapshots for all products. Runs daily at 12:05 AM.',
		NULL,
		true
	) RETURNING jobid INTO v_job_id;
	
	-- Create job step
	INSERT INTO pgagent.pga_jobstep (
		jstjobid,      -- Job ID
		jstname,       -- Step name
		jstkind,       -- Step kind ('s' = SQL)
		jstcode,       -- SQL code to execute
		jstdbname,     -- Database name
		jstenabled     -- Enabled (true)
	) VALUES (
		v_job_id,
		'Run Daily Stock Snapshot',
		's',
		'SELECT sp_daily_stock_snapshot();',
		current_database(),
		true
	);
	
	-- Create schedule: Daily at 12:05 AM (00:05)
	-- pgAgent schedule format uses bit arrays:
	-- jscminutes: bit array for minutes (0-59), bit 5 = minute 5
	-- jschours: bit array for hours (0-23), bit 0 = hour 0 (midnight)
	-- jscweekdays: bit array for weekdays (0-6, Sunday=0), all bits set = all days
	-- jscmonthdays: bit array for month days (1-31), all bits set = all days
	-- jscmonths: bit array for months (1-12), all bits set = all months
	-- Note: pgAgent uses bit arrays where each bit represents a time unit
	
	-- For minute 5: set bit 5 (0-indexed, so 2^5 = 32)
	-- For hour 0: set bit 0 (2^0 = 1)
	-- For all weekdays: 127 (bits 0-6 all set)
	-- For all month days: 2147483647 (bits 0-30 all set for days 1-31)
	-- For all months: 4095 (bits 0-11 all set for months 1-12)
	
	INSERT INTO pgagent.pga_schedule (
		jscjobid,      -- Job ID
		jscname,       -- Schedule name
		jscdesc,       -- Schedule description
		jscenabled,    -- Enabled (true)
		jscminutes,    -- Minutes: only minute 5 (value: 32 = 2^5)
		jschours,      -- Hours: only hour 0 (value: 1 = 2^0)
		jscweekdays,   -- Weekdays: all days (value: 127 = all bits 0-6 set)
		jscmonthdays,  -- Month days: all days (value: 2147483647 = all bits set)
		jscmonths      -- Months: all months (value: 4095 = all bits 0-11 set)
	) VALUES (
		v_job_id,
		'Daily at 12:05 AM',
		'Runs every day at 12:05 AM (00:05)',
		true,
		32,              -- Minute 5: bit 5 set (2^5 = 32)
		1,               -- Hour 0: bit 0 set (2^0 = 1)
		127,             -- All weekdays: Sunday(0) through Saturday(6) = 127
		2147483647,      -- All month days: days 1-31 = 2147483647
		4095             -- All months: months 1-12 = 4095
	) RETURNING jscid INTO v_schedule_id;
	
	RAISE NOTICE 'pgAgent job daily-stock-snapshot-job created successfully (runs daily at 12:05 AM)';
	RAISE NOTICE 'Job ID: %, Schedule ID: %', v_job_id, v_schedule_id;
EXCEPTION
	WHEN insufficient_privilege THEN
		RAISE NOTICE 'Insufficient privileges to create pgAgent job - contact database administrator';
	WHEN undefined_table THEN
		RAISE NOTICE 'pgAgent tables not found - ensure pgagent extension is properly installed';
	WHEN OTHERS THEN
		RAISE NOTICE 'Could not create pgAgent job: %', SQLERRM;
		RAISE NOTICE 'You may need to set up the job manually using pgAdmin GUI';
		RAISE NOTICE 'In pgAdmin: Right-click Jobs > New Job > Set schedule to run daily at 00:05';
END $$;`
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

	// Migration: Add is_admin column if it doesn't exist and set first user as admin
	try {
		// Check if is_admin column exists
		const columnCheck = await query(`
			SELECT column_name 
			FROM information_schema.columns 
			WHERE table_name = 'users' AND column_name = 'is_admin'
		`, []);
		
		if (columnCheck.recordset.length === 0) {
			// Add is_admin column
			await query('ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false', []);
			console.log('✓ Added is_admin column to users table');
		}
		
		// Set first user (lowest ID) as admin if no admin exists
		const adminCheck = await query('SELECT COUNT(*) as admin_count FROM users WHERE is_admin = true', []);
		const adminCount = adminCheck.recordset[0]?.admin_count || 0;
		
		if (adminCount === 0) {
			// Set first user as admin
			await query(`
				UPDATE users 
				SET is_admin = true 
				WHERE id = (SELECT MIN(id) FROM users)
			`, []);
			console.log('✓ Set first user as admin');
		}
	} catch (migrationErr) {
		console.warn('⚠ Migration warning:', migrationErr.message);
		// Don't fail initialization if migration has issues
	}

	const result = { ok: errors === 0, batches: executed, errors, total: tables.length, errorDetails: errorDetails.length > 0 ? errorDetails : undefined };
	
	if (errors > 0) {
		console.error(`\n✗ Initialization completed with ${errors} error(s):`);
		errorDetails.forEach(e => console.error(`  - ${e.table}: ${e.error}`));
	}
	
	return result;
}

module.exports = { runInit };
