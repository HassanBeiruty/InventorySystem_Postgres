/**
 * Script to clear all users from the users table
 * This allows you to start fresh with new users that have properly hashed passwords (bcrypt)
 * 
 * Usage: node scripts/clear-users.js
 * 
 * WARNING: This will delete ALL users from the database!
 */

require('dotenv').config();
const { query, getPool } = require('../db');

async function clearUsers() {
	try {
		console.log('⚠️  WARNING: This will delete ALL users from the database!');
		console.log('Connecting to database...');
		
		// Get user count before deletion
		const countResult = await query('SELECT COUNT(*) as count FROM users', []);
		const userCount = parseInt(countResult.recordset[0]?.count || 0);
		
		if (userCount === 0) {
			console.log('✓ Users table is already empty.');
			process.exit(0);
		}
		
		console.log(`Found ${userCount} user(s) in the database.`);
		console.log('Deleting all users...');
		
		// Delete all users
		await query('DELETE FROM users', []);
		
		// Verify deletion
		const verifyResult = await query('SELECT COUNT(*) as count FROM users', []);
		const remainingCount = parseInt(verifyResult.recordset[0]?.count || 0);
		
		if (remainingCount === 0) {
			console.log('✓ Successfully cleared all users from the database.');
			console.log('✓ You can now create new users with properly hashed passwords.');
		} else {
			console.error(`✗ Error: ${remainingCount} user(s) still remain in the database.`);
			process.exit(1);
		}
		
	} catch (error) {
		console.error('✗ Error clearing users:', error.message);
		console.error(error.stack);
		process.exit(1);
	} finally {
		// Close database connection
		const pool = getPool();
		if (pool && typeof pool.end === 'function') {
			await pool.end();
			console.log('✓ Database connection closed.');
		}
	}
}

// Run the script
clearUsers();

