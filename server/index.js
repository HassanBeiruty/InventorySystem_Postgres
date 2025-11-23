require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// Security middleware - Helmet for security headers
app.use(helmet({
	contentSecurityPolicy: false, // Disable CSP for API (can be configured per route if needed)
	crossOriginEmbedderPolicy: false,
}));

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

// Optimize CORS for faster preflight responses
const corsOptions = {
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
	allowedHeaders: ['Content-Type', 'Authorization'],
	// Cache preflight requests for 24 hours to reduce OPTIONS requests
	maxAge: 86400, // 24 hours in seconds
	// Preflight requests should complete quickly
	preflightContinue: false,
	optionsSuccessStatus: 204
};

// Apply CORS middleware (handles OPTIONS requests automatically)
app.use(cors(corsOptions));
app.use(express.json());


// Cache control for API responses
app.use('/api', (req, res, next) => {
	// Always disable caching for admin routes to prevent stale data
	// Admin routes need fresh data for proper rendering and state management
	if (req.path.startsWith('/admin/')) {
		res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
		res.set('Pragma', 'no-cache');
		res.set('Expires', '0');
		return next();
	}
	
	// Always disable caching for auth endpoints to prevent stale admin status
	// Admin status can change and we need fresh data on every request
	if (req.path.startsWith('/auth/')) {
		res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
		res.set('Pragma', 'no-cache');
		res.set('Expires', '0');
		return next();
	}
	
	// Disable caching for POST, PUT, DELETE requests (they modify data)
	if (req.method !== 'GET') {
		res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
		res.set('Pragma', 'no-cache');
		res.set('Expires', '0');
		return next();
	}
	
	// In development, disable all caching
	if (process.env.NODE_ENV === 'development') {
		res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
		res.set('Pragma', 'no-cache');
		res.set('Expires', '0');
		return next();
	}
	
	// In production, apply strategic caching for GET requests only
	// Cache stats endpoints for 30 seconds (balance between performance and freshness)
	if (req.path === '/invoices/stats' || req.path.startsWith('/invoices/recent/')) {
		res.set('Cache-Control', 'private, max-age=30'); // 30 second cache for stats
		return next();
	}
	
	// Cache other read-only GET endpoints for 60 seconds
	res.set('Cache-Control', 'private, max-age=60'); // 1 minute cache for other GET requests
	
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

// Schedule daily stock snapshot at 12:05 AM (works on cloud databases like Render)
// This is the alternative to pgAgent for cloud databases
// Wait for DB initialization to complete before setting up cron job
(async () => {
	// Wait for database initialization to complete
	let attempts = 0;
	while (!initCompleted && attempts < 30) {
		await new Promise(resolve => setTimeout(resolve, 1000));
		attempts++;
	}
	
	if (!initCompleted) {
		console.warn('⚠ Database initialization not completed, but setting up cron job anyway...');
	}
	
	try {
		const cron = require('node-cron');
		const { query } = require('./db');
		
		// Helper function to get Lebanon time formatted for logging
		function lebanonTimeForLog() {
			const now = new Date();
			let year = now.getUTCFullYear();
			let month = now.getUTCMonth();
			let day = now.getUTCDate();
			let hours = now.getUTCHours();
			let minutes = now.getUTCMinutes();
			let seconds = now.getUTCSeconds();
			
			if (hours >= 24) {
				hours -= 24;
				day += 1;
				const daysInMonth = new Date(year, month + 1, 0).getDate();
				if (day > daysInMonth) {
					day = 1;
					month += 1;
					if (month > 11) {
						month = 0;
						year += 1;
					}
				}
			}
			
			if (hours < 0) {
				hours += 24;
				day -= 1;
				if (day < 1) {
					month -= 1;
					if (month < 0) {
						month = 11;
						year -= 1;
					}
					day = new Date(year, month + 1, 0).getDate();
				}
			}
			
			const pad = (n) => String(n).padStart(2, "0");
			const timeStr = `${year}-${pad(month + 1)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
			return timeStr.replace(' ', 'T');
		}

		// Run daily at 12:05 PM (noon) - Lebanon timezone
		// Cron format: '5 12 * * *' = minute 5, hour 12, every day, every month, every day of week
		cron.schedule('5 12 * * *', async () => {
			try {
				const startTime = lebanonTimeForLog();
				console.log(`[Cron] Running daily stock snapshot at ${startTime} (Lebanon time)`);
				
				// CRITICAL: Set timezone to Lebanon for this session
				// The stored procedure uses CURRENT_DATE which depends on session timezone
				// Without this, PostgreSQL uses UTC and creates records for the wrong date
				await query("SET TIMEZONE = 'Asia/Beirut';", []);
				
				// Call the stored procedure - it uses CURRENT_DATE which now uses Beirut timezone
				const result = await query('SELECT sp_daily_stock_snapshot();', []);
				
				// Verify records were created for today (using PostgreSQL CURRENT_DATE with Beirut timezone)
				// Query using CURRENT_DATE directly to match what the function used
				const checkResult = await query(
					'SELECT COUNT(*) as count FROM daily_stock WHERE date = CURRENT_DATE',
					[]
				);
				const recordsCreated = parseInt(checkResult.recordset[0]?.count || 0);
				
				// Get total products count for reference
				const productsResult = await query('SELECT COUNT(*) as count FROM products', []);
				const totalProducts = parseInt(productsResult.recordset[0]?.count || 0);
				
				const endTime = lebanonTimeForLog();
				console.log(`[Cron] ✓ Daily stock snapshot completed successfully at ${endTime} (Lebanon time)`);
				console.log(`[Cron] Records created for today: ${recordsCreated} out of ${totalProducts} products`);
				
				if (recordsCreated === 0 && totalProducts > 0) {
					console.warn(`[Cron] ⚠ WARNING: No records created but ${totalProducts} products exist. Check timezone settings.`);
				}
			} catch (error) {
				console.error('[Cron] ✗ Error running daily stock snapshot:', error.message);
				if (error.stack) {
					console.error('[Cron] Stack:', error.stack);
				}
			}
		}, {
			timezone: "Asia/Beirut" // Change to your timezone if needed
		});
		
		console.log('✓ Scheduled job: Daily stock snapshot (runs daily at 12:05 PM Beirut time)');
	} catch (error) {
		// node-cron might not be installed, that's okay
		if (error.code !== 'MODULE_NOT_FOUND') {
			console.error('⚠ Failed to set up scheduled job:', error.message);
		} else {
			console.warn('⚠ node-cron not found - scheduled jobs disabled');
		}
	}
})();

// Global error handler - must be last middleware
// Ensures CORS headers are always sent even on errors to prevent browser blocking
app.use((err, req, res, next) => {
	const origin = req.headers.origin;
	
	// Always set CORS headers on error responses to prevent browser blocking
	if (origin) {
		// Check if origin is allowed
		let allowed = false;
		if (process.env.NODE_ENV !== 'production') {
			allowed = true;
		} else {
			for (const allowedOrigin of allowedOrigins) {
				if (typeof allowedOrigin === 'string') {
					if (origin === allowedOrigin) {
						allowed = true;
						break;
					}
				} else if (allowedOrigin instanceof RegExp) {
					if (allowedOrigin.test(origin)) {
						allowed = true;
						break;
					}
				}
			}
		}
		
		if (allowed || !origin) {
			res.setHeader('Access-Control-Allow-Origin', origin);
			res.setHeader('Access-Control-Allow-Credentials', 'true');
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
		}
	}
	
	// Handle CORS errors specifically
	if (err.message && err.message.includes('CORS')) {
		return res.status(403).json({ 
			error: 'CORS policy violation',
			message: 'The request was blocked due to CORS policy. Please check your origin.' 
		});
	}
	
	// Handle other errors
	console.error('Server error:', err.message);
	console.error('Stack:', err.stack);
	
	const statusCode = err.statusCode || err.status || 500;
	res.status(statusCode).json({
		error: err.message || 'Internal server error',
		...(process.env.NODE_ENV === 'development' && { stack: err.stack })
	});
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
	console.log(`Backend server running on http://localhost:${PORT}`);
});


