const { Pool } = require('pg');

const pool = new Pool({
	host: process.env.PG_HOST || 'localhost',
	port: parseInt(process.env.PG_PORT || '5432'),
	database: process.env.PG_DATABASE || 'invoicesystem',
	user: process.env.PG_USER || 'postgres',
	password: process.env.PG_PASSWORD || '',
	ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
	max: 20,
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 30000,
});

pool.on('error', (err) => {
	console.error('[DB] Unexpected error on idle client', err);
});

// Test connection on startup
(async () => {
	try {
		const result = await pool.query('SELECT NOW()');
		console.log('[DB] ✅ Connected to PostgreSQL successfully!');
		console.log('[DB] Server time:', result.rows[0].now);
	} catch (err) {
		console.error('[DB] ❌ Connection failed:', err.message);
	}
})();

/**
 * Execute a query with parameters
 * @param {string} text - SQL query with $1, $2, etc. placeholders
 * @param {Array} params - Array of parameter values (not objects)
 * @returns {Promise} Query result with rows property
 */
async function query(text, params = []) {
	// Convert params array of objects to array of values
	// SQL Server used [{name: value}, {name2: value2}] or [{name1: value1, name2: value2}]
	// PostgreSQL uses [value1, value2]
	let paramValues = params;
	
	if (Array.isArray(params) && params.length > 0 && typeof params[0] === 'object') {
		// Check if it's an array of single-property objects or a single multi-property object
		if (params.length === 1 && Object.keys(params[0]).length > 1) {
			// Single object with multiple properties: {email: '...', passwordHash: '...', created_at: '...'}
			// Extract all values in order
			paramValues = Object.values(params[0]);
		} else {
			// Array of single-property objects: [{email: '...'}, {passwordHash: '...'}]
			// Extract first value from each object
			paramValues = params.map(p => Object.values(p)[0]);
		}
	}

	try {
		const result = await pool.query(text, paramValues);
		// Return in a format similar to SQL Server (with recordset property for compatibility)
		return {
			rows: result.rows,
			recordset: result.rows, // For backward compatibility
			rowCount: result.rowCount,
		};
	} catch (err) {
		console.error('[DB] Query error:', err.message);
		console.error('[DB] Query:', text);
		console.error('[DB] Params:', paramValues);
		throw err;
	}
}

function getPool() {
	return pool;
}

module.exports = {
	pool,
	getPool,
	query,
};
