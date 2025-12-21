const { Pool } = require('pg');

// Support both DATABASE_URL (from Render) and individual connection parameters
let poolConfig;

if (process.env.DATABASE_URL) {
	// Use DATABASE_URL if provided (common in Render or Supabase)
	// This is the easiest and most reliable method
	const isSupabase = process.env.DATABASE_URL.includes('supabase.co');
	const usePgbouncer = process.env.DATABASE_URL.includes('pgbouncer=true') || process.env.USE_PGBOUNCER === 'true';
	
	// Optimize pool settings for production
	const maxConnections = usePgbouncer ? 10 : 20; // Lower for pgbouncer since it handles pooling
	
	poolConfig = {
		connectionString: process.env.DATABASE_URL,
		ssl: process.env.PG_SSL === 'true' || process.env.DATABASE_URL.includes('render.com') || process.env.DATABASE_URL.includes('dpg-') || isSupabase
			? { rejectUnauthorized: false } 
			: false,
		max: maxConnections,
		min: 2, // Keep minimum connections ready
		idleTimeoutMillis: 30000,
		connectionTimeoutMillis: 10000, // Faster timeout for production
		allowExitOnIdle: false, // Keep pool alive
		// Force IPv4 for Supabase if needed (connection pooler handles this better)
		...(isSupabase && { 
			// Supabase connection pooler handles IPv4/IPv6 automatically
		}),
	};
	console.log('[DB] Using DATABASE_URL connection string');
	if (usePgbouncer) {
		console.log('[DB] ✅ PgBouncer connection pooling enabled');
	}
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
	
	const isSupabase = process.env.PG_HOST && process.env.PG_HOST.includes('supabase.co');
	
	const usePgbouncer = process.env.USE_PGBOUNCER === 'true';
	const maxConnections = usePgbouncer ? 10 : 20;
	
	poolConfig = {
		host: process.env.PG_HOST || 'localhost',
		port: parseInt(process.env.PG_PORT || '5432'),
		database: process.env.PG_DATABASE || 'invoicesystem',
		user: process.env.PG_USER || 'postgres',
		password: password,
		ssl: process.env.PG_SSL === 'true' || isSupabase ? { rejectUnauthorized: false } : false,
		max: maxConnections,
		min: 2, // Keep minimum connections ready
		idleTimeoutMillis: 30000,
		connectionTimeoutMillis: 10000, // Faster timeout for production
		allowExitOnIdle: false, // Keep pool alive
		// For Supabase, prefer IPv4 by using connection pooler port
		...(isSupabase && process.env.PG_PORT === '5432' && {
			// Note: If direct connection fails, use connection pooler port 6543
		}),
	};
	
	if (usePgbouncer) {
		console.log('[DB] ✅ PgBouncer connection pooling enabled');
	}
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

// Set timezone for all connections to Asia/Beirut (Lebanon timezone)
pool.on('connect', async (client) => {
	try {
		await client.query("SET TIMEZONE = 'Asia/Beirut'");
	} catch (err) {
		console.error('[DB] Failed to set timezone:', err.message);
	}
});

// Test connection on startup
(async () => {
	try {
		const result = await pool.query('SELECT NOW(), current_setting(\'timezone\') as tz');
		console.log('[DB] ✅ Connected to PostgreSQL successfully!');
		console.log('[DB] Server time:', result.rows[0].now);
		console.log('[DB] Timezone:', result.rows[0].tz);
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
// Track which clients have had timezone set
const timezoneSetClients = new WeakSet();

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
		// Get a client from the pool
		const client = await pool.connect();
		try {
			// Set timezone for this client if not already set
			if (!timezoneSetClients.has(client)) {
				await client.query("SET TIMEZONE = 'Asia/Beirut'");
				timezoneSetClients.add(client);
			}
			// Execute the query
			const result = await client.query(text, paramValues);
			// Return in a format similar to SQL Server (with recordset property for compatibility)
			return {
				rows: result.rows,
				recordset: result.rows, // For backward compatibility
				rowCount: result.rowCount,
			};
		} finally {
			// Release the client back to the pool
			client.release();
		}
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
