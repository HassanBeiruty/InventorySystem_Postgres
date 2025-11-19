/**
 * Update sp_recompute_positions function with the fixed version
 */

require('dotenv').config();
const { query } = require('../db');

const fixedFunction = `
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
		  AND (next_date - date) > 1
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
$$;
`;

async function updateFunction() {
  try {
    console.log('Updating sp_recompute_positions function...');
    await query(fixedFunction, []);
    console.log('✓ Function updated successfully!');
    
    // Test the function
    console.log('\nTesting the function...');
    await query('SELECT sp_recompute_positions(NULL)', []);
    console.log('✓ Function test passed!');
  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  }
}

updateFunction();

