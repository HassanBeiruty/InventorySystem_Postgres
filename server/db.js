const { Pool } = require('pg');

// Support both DATABASE_URL (from Render) and individual connection parameters
let poolConfig;

if (process.env.DATABASE_URL) {
	// Use DATABASE_URL if provided (common in Render)
	// This is the easiest and most reliable method
	poolConfig = {
		connectionString: process.env.DATABASE_URL,
		ssl: process.env.PG_SSL === 'true' || process.env.DATABASE_URL.includes('render.com') || process.env.DATABASE_URL.includes('dpg-')
			? { rejectUnauthorized: false } 
			: false,
		max: 20,
		idleTimeoutMillis: 30000,
		connectionTimeoutMillis: 30000,
	};
	console.log('[DB] Using DATABASE_URL connection string');
} else {
	// Use individual connection parameters
	const password = process.env.PG_PASSWORD || '';
	
	// Log connection attempt (without password)
	console.log('[DB] Using individual connection parameters');
	console.log('[DB] Host:', process.env.PG_HOST);
	console.log('[DB] Port:', process.env.PG_PORT);
	console.log('[DB] Database:', process.env.PG_DATABASE);
	console.log('[DB] User:', process.env.PG_USER);
	console.log('[DB] Password length:', password.length, 'characters');
	console.log('[DB] SSL:', process.env.PG_SSL === 'true' ? 'enabled' : 'disabled');
	
	poolConfig = {
		host: process.env.PG_HOST || 'localhost',
		port: parseInt(process.env.PG_PORT || '5432'),
		database: process.env.PG_DATABASE || 'invoicesystem',
		user: process.env.PG_USER || 'postgres',
		password: password,
		ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
		max: 20,
		idleTimeoutMillis: 30000,
		connectionTimeoutMillis: 30000,
	};
}

// Log connection details (without password) for debugging
if (process.env.NODE_ENV === 'production') {
	console.log('[DB] Connecting to:', {
		host: poolConfig.host || 'DATABASE_URL',
		port: poolConfig.port || 'from URL',
		database: poolConfig.database || 'from URL',
		user: poolConfig.user || 'from URL',
		ssl: poolConfig.ssl ? 'enabled' : 'disabled'
	});
}

const pool = new Pool(poolConfig);

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
