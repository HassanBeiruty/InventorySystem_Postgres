/**
 * Quick verification script to check if everything is set up correctly
 */

require('dotenv').config();
const { query } = require('../db');

async function verify() {
  console.log('Verifying Recompute Positions Job Setup...\n');

  const checks = {
    database: false,
    function: false,
    nodeCron: false,
    pgCron: false
  };

  try {
    // Check database
    await query('SELECT 1', []);
    checks.database = true;
    console.log('✓ Database connection: OK');

    // Check function
    const func = await query(`
      SELECT proname FROM pg_proc WHERE proname = 'sp_recompute_positions'
    `, []);
    checks.function = func.rows.length > 0;
    console.log(checks.function ? '✓ Function exists: OK' : '✗ Function missing');

    // Check node-cron
    try {
      require('node-cron');
      checks.nodeCron = true;
      console.log('✓ node-cron installed: OK');
    } catch {
      console.log('✗ node-cron not installed');
    }

    // Check pg_cron
    const pgCron = await query(`
      SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') AS available
    `, []);
    checks.pgCron = pgCron.rows[0]?.available || false;
    console.log(checks.pgCron ? '✓ pg_cron available: OK' : '⚠ pg_cron not available (will use Node.js cron)');

    console.log('\n' + '='.repeat(50));
    if (checks.database && checks.function && checks.nodeCron) {
      console.log('✓ Setup is complete and ready!');
      console.log('  The job will run daily at 12:05 AM (Asia/Beirut timezone)');
    } else {
      console.log('⚠ Some components are missing. Please check above.');
    }
    console.log('='.repeat(50));

  } catch (error) {
    console.error('✗ Verification failed:', error.message);
    process.exit(1);
  }
}

verify();

