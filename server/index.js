require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Basic root route to verify server is up
app.get('/', (req, res) => {
	res.json({ status: 'ok', service: 'dream-weaver-den backend' });
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
		server: process.env.SQL_SERVER,
		database: process.env.SQL_DATABASE,
		trustServerCert: process.env.SQL_TRUST_SERVER_CERT,
		odbcDriver: process.env.SQL_ODBC_DRIVER || 'ODBC Driver 18 for SQL Server',
	};
	try {
		const { query } = require('./db');
		const pong = await query('SELECT 1 AS ok', []);
		const result = await query('SELECT GETDATE() AS now, DB_NAME() AS db', []);
		const tables = await query('SELECT COUNT(*) AS tablesCount FROM INFORMATION_SCHEMA.TABLES', []);
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
		const hasInvoices = await query("SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'invoices'", []);
		if (hasInvoices.recordset.length > 0) {
			const rows = await query('SELECT TOP 20 * FROM invoices ORDER BY created_at DESC', []);
			return res.json({ source: 'invoices', rows: rows.recordset });
		}
		const tables = await query('SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_SCHEMA, TABLE_NAME', []);
		res.json({ source: 'INFORMATION_SCHEMA.TABLES', rows: tables.recordset });
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
		const tables = await query('SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = \'BASE TABLE\' ORDER BY TABLE_NAME', []);
		res.json({ 
			status: 'ok', 
			tablesCount: tables.recordset.length,
			tables: tables.recordset.map(t => t.TABLE_NAME),
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


