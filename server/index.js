require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// CORS configuration - allow frontend domain in production
const allowedOrigins = process.env.FRONTEND_URL 
	? process.env.FRONTEND_URL.split(',').map(url => url.trim())
	: ['http://localhost:8080', 'http://localhost:3000'];

// Add common Vercel patterns to allowed origins
if (process.env.NODE_ENV === 'production') {
	// Allow any Vercel deployment
	allowedOrigins.push(/^https:\/\/.*\.vercel\.app$/);
	// Allow any Render deployment (for testing)
	allowedOrigins.push(/^https:\/\/.*\.onrender\.com$/);
}

app.use(cors({ 
	origin: function (origin, callback) {
		// Allow requests with no origin (like mobile apps or curl requests)
		if (!origin) return callback(null, true);
		
		// In development, allow all origins
		if (process.env.NODE_ENV !== 'production') {
			return callback(null, true);
		}
		
		// Check if origin matches any allowed origin (string or regex)
		for (const allowed of allowedOrigins) {
			if (typeof allowed === 'string') {
				if (origin === allowed) {
					return callback(null, true);
				}
			} else if (allowed instanceof RegExp) {
				if (allowed.test(origin)) {
					return callback(null, true);
				}
			}
		}
		
		// Log for debugging
		console.log('CORS blocked origin:', origin);
		console.log('Allowed origins:', allowedOrigins);
		callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
	},
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Disable caching for all API responses in development
app.use('/api', (req, res, next) => {
	res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
	res.set('Pragma', 'no-cache');
	res.set('Expires', '0');
	next();
});

// Basic root route to verify server is up
app.get('/', (req, res) => {
	res.json({ status: 'ok', service: 'Invoice System Backend' });
});

// Initialize SQL schema on startup (idempotent)
let initCompleted = false;
(async () => {
	try {
		// Wait for DB connection to be ready
		console.log('Waiting for database connection...');
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		// Test connection first
		try {
			const { query } = require('./db');
			await query('SELECT 1 AS test', []);
			console.log('✓ Database connection verified');
		} catch (connErr) {
			console.error('✗ Database connection failed:', connErr.message);
			return;
		}
		
		// Run initialization
		console.log('Starting SQL schema initialization...');
		const { runInit } = require('./sql/runInit');
		const result = await runInit();
		initCompleted = true;
		
		if (result?.ok) {
			console.log(`✓ SQL init completed: ${result.batches}/${result.total} tables created${result.errors > 0 ? `, ${result.errors} errors` : ''}`);
		} else if (result?.skipped) {
			console.log('⚠ SQL init skipped (no init.sql file)');
		}
	} catch (e) {
		console.error('✗ SQL init failed:', e.message);
		console.error(e.stack);
		initCompleted = false;
	}
})();

// DB health check
app.get('/api/health', async (req, res) => {
	const info = {
		host: process.env.PG_HOST || 'localhost',
		port: process.env.PG_PORT || '5432',
		database: process.env.PG_DATABASE || 'invoicesystem',
		user: process.env.PG_USER || 'postgres',
	};
	try {
		const { query } = require('./db');
		const pong = await query('SELECT 1 AS ok', []);
		const result = await query('SELECT NOW() AS now, current_database() AS db', []);
		const tables = await query('SELECT COUNT(*) AS tablesCount FROM information_schema.tables WHERE table_schema = \'public\'', []);
		res.json({ status: 'ok', ping: pong.recordset?.[0]?.ok === 1, db: result.recordset?.[0] ?? null, tablesCount: tables.recordset?.[0]?.tablesCount ?? 0, info });
	} catch (err) {
		let message = 'Unknown error';
		if (err) {
			if (err.message) message = err.message;
			else if (err.code) message = `Error ${err.code}: ${err.message || String(err)}`;
			else if (typeof err === 'string') message = err;
			else {
				try {
					message = JSON.stringify(err, Object.getOwnPropertyNames(err));
				} catch {
					message = String(err);
				}
			}
		}
		console.error('Health check failed:', message);
		if (err?.stack) console.error('Stack:', err.stack);
		res.status(500).json({ status: 'error', error: message, info, errorCode: err?.code || err?.number || 'UNKNOWN' });
	}
});

// Simple DB test: list first 20 rows from Invoices if exists, else list tables
app.get('/api/db-test', async (req, res) => {
	try {
		const { query } = require('./db');
		const hasInvoices = await query("SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices' AND table_schema = 'public'", []);
		if (hasInvoices.recordset.length > 0) {
			const rows = await query('SELECT * FROM invoices ORDER BY created_at DESC LIMIT 20', []);
			return res.json({ source: 'invoices', rows: rows.recordset });
		}
		const tables = await query('SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = \'public\' ORDER BY table_schema, table_name', []);
		res.json({ source: 'information_schema.tables', rows: tables.recordset });
	} catch (err) {
		const errorMsg = err?.message || err?.toString() || 'Unknown error';
		console.error('DB test failed:', errorMsg);
		res.status(500).json({ status: 'error', error: errorMsg });
	}
});

// API routes
app.use('/api', require('./routes/api'));

// Admin: force-run SQL initialization
app.post('/api/admin/init', async (req, res) => {
	try {
		console.log('Manual SQL init requested...');
		const { runInit } = require('./sql/runInit');
		const result = await runInit();
		console.log('Manual init result:', result);
		res.json({ status: 'ok', result, message: `Created ${result.batches}/${result.total} tables` });
	} catch (e) {
		const errorMsg = e.message || String(e);
		console.error('Manual SQL init failed:', errorMsg);
		console.error(e.stack);
		res.status(500).json({ status: 'error', error: errorMsg, stack: process.env.NODE_ENV === 'development' ? e.stack : undefined });
	}
});

// Get init status
app.get('/api/admin/init-status', async (req, res) => {
	try {
		const { query } = require('./db');
		const tables = await query('SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' AND table_type = \'BASE TABLE\' ORDER BY table_name', []);
		res.json({ 
			status: 'ok', 
			tablesCount: tables.recordset.length,
			tables: tables.recordset.map(t => t.table_name),
			initCompleted 
		});
	} catch (e) {
		res.status(500).json({ status: 'error', error: e.message });
	}
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
	console.log(`Backend server running on http://localhost:${PORT}`);
});


