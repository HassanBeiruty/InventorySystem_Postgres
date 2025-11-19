/**
 * Test script for sp_recompute_positions function and job setup
 * 
 * This script:
 * 1. Tests the database connection
 * 2. Verifies the function exists
 * 3. Tests running the function manually
 * 4. Checks if pg_cron is available
 * 5. Verifies the cron job is set up (if pg_cron is available)
 */

require('dotenv').config();
const { query } = require('../db');

async function testRecomputeJob() {
  console.log('='.repeat(60));
  console.log('Testing Recompute Positions Job Setup');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. Test database connection
    console.log('1. Testing database connection...');
    await query('SELECT 1 AS test', []);
    console.log('   ✓ Database connection successful\n');

    // 2. Check if function exists
    console.log('2. Checking if sp_recompute_positions function exists...');
    const functionCheck = await query(`
      SELECT 
        proname,
        pg_get_function_arguments(oid) AS arguments,
        pg_get_functiondef(oid) LIKE '%sp_recompute_positions%' AS is_correct
      FROM pg_proc 
      WHERE proname = 'sp_recompute_positions'
    `, []);

    if (functionCheck.rows.length > 0) {
      console.log('   ✓ Function exists');
      console.log(`   - Name: ${functionCheck.rows[0].proname}`);
      console.log(`   - Arguments: ${functionCheck.rows[0].arguments || 'none'}\n`);
    } else {
      console.log('   ✗ Function does not exist - run runInit.js first\n');
      return;
    }

    // 3. Check if pg_cron extension is available
    console.log('3. Checking pg_cron extension...');
    const extensionCheck = await query(`
      SELECT EXISTS(
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
      ) AS pg_cron_available
    `, []);

    const pgCronAvailable = extensionCheck.rows[0]?.pg_cron_available;
    if (pgCronAvailable) {
      console.log('   ✓ pg_cron extension is available\n');

      // 4. Check if cron job exists
      console.log('4. Checking if cron job is scheduled...');
      const jobCheck = await query(`
        SELECT 
          jobid,
          jobname,
          schedule,
          command,
          database,
          username,
          active
        FROM cron.job 
        WHERE jobname = 'recompute-positions-daily-job'
      `, []);

      if (jobCheck.rows.length > 0) {
        const job = jobCheck.rows[0];
        console.log('   ✓ Cron job is scheduled');
        console.log(`   - Job ID: ${job.jobid}`);
        console.log(`   - Schedule: ${job.schedule}`);
        console.log(`   - Command: ${job.command.substring(0, 50)}...`);
        console.log(`   - Database: ${job.database}`);
        console.log(`   - Active: ${job.active ? 'Yes' : 'No'}\n`);

        // Check recent job runs
        console.log('5. Checking recent job execution history...');
        const historyCheck = await query(`
          SELECT 
            runid,
            status,
            return_message,
            start_time,
            end_time
          FROM cron.job_run_details
          WHERE jobid = $1
          ORDER BY start_time DESC
          LIMIT 5
        `, [job.jobid]);

        if (historyCheck.rows.length > 0) {
          console.log(`   Found ${historyCheck.rows.length} recent execution(s):`);
          historyCheck.rows.forEach((run, idx) => {
            console.log(`   ${idx + 1}. ${run.start_time} - Status: ${run.status}`);
            if (run.return_message) {
              console.log(`      Message: ${run.return_message.substring(0, 100)}`);
            }
          });
        } else {
          console.log('   No execution history yet (job hasn\'t run yet)\n');
        }
      } else {
        console.log('   ⚠ Cron job not found - will use Node.js cron as fallback\n');
      }
    } else {
      console.log('   ⚠ pg_cron extension not available');
      console.log('   → Will use Node.js cron job instead\n');
    }

    // 5. Test running the function manually (dry run - just check it doesn't error)
    console.log('6. Testing function execution (dry run)...');
    console.log('   Note: This will actually run the function. Press Ctrl+C to cancel.');
    console.log('   Waiting 3 seconds...\n');
    
    await new Promise(resolve => setTimeout(resolve, 3000));

    const startTime = Date.now();
    await query('SELECT sp_recompute_positions(NULL)', []);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`   ✓ Function executed successfully in ${duration}s\n`);

    // 6. Summary
    console.log('='.repeat(60));
    console.log('Summary:');
    console.log('='.repeat(60));
    console.log('✓ Database connection: OK');
    console.log('✓ Function exists: OK');
    if (pgCronAvailable) {
      console.log('✓ pg_cron: Available');
      const jobExists = await query(`
        SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'recompute-positions-daily-job') AS exists
      `, []);
      if (jobExists.rows[0]?.exists) {
        console.log('✓ Cron job: Scheduled (runs daily at 12:05 AM)');
      } else {
        console.log('⚠ Cron job: Not scheduled (will use Node.js cron)');
      }
    } else {
      console.log('⚠ pg_cron: Not available (using Node.js cron)');
    }
    console.log('✓ Function test: OK');
    console.log('');
    console.log('Setup complete! The job will run daily at 12:05 AM.');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n✗ Error during testing:');
    console.error('  Message:', error.message);
    if (error.stack) {
      console.error('  Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testRecomputeJob()
  .then(() => {
    console.log('\nTest completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nTest failed:', error);
    process.exit(1);
  });

