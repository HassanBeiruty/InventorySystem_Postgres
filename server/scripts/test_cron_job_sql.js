/**
 * Test the pg_cron job SQL syntax
 */

require('dotenv').config();
const { query } = require('../db');

const testSQL = `-- Create scheduled job for sp_recompute_positions (runs daily at 12:05 AM)
-- This will only work if pg_cron extension is enabled
DO $body$
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
END $body$;`;

async function testSQLSyntax() {
  try {
    console.log('Testing pg_cron job SQL syntax...\n');
    await query(testSQL, []);
    console.log('✓ SQL syntax is valid!');
    console.log('  (Note: Job creation may still fail if pg_cron is not available, but syntax is correct)');
  } catch (error) {
    console.error('✗ SQL syntax error:');
    console.error('  Message:', error.message);
    if (error.position) {
      console.error('  Position:', error.position);
    }
    process.exit(1);
  }
}

testSQLSyntax();

