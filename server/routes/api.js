const express = require('express');
const { query, getPool } = require('../db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { body, param, query: queryValidator, validationResult } = require('express-validator');
const multer = require('multer');
const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');

// Import security middleware
const {
	authLimiter,
	apiLimiter,
	strictApiLimiter,
	fileUploadLimiter,
	sanitizeInput,
	validateSQLInput,
	validateFileUpload,
	requestSizeLimiter,
} = require('../middleware/security');

const router = express.Router();

// JWT secret - MUST be set in environment variables for production
// For development, a default is provided with a warning
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production-do-not-use-in-production';
if (!process.env.JWT_SECRET) {
	console.warn('⚠️  WARNING: JWT_SECRET environment variable is not set!');
	console.warn('⚠️  Using default development secret. This is INSECURE for production!');
	console.warn('⚠️  Please set JWT_SECRET in your server/.env file.');
	console.warn('⚠️  Example: JWT_SECRET=your-strong-random-secret-key-here');
}

// generateId() removed - using auto-increment INT IDs now

// Helper function to get current datetime in Lebanon timezone (ISO string)
// Lebanon timezone: Asia/Beirut (GMT+2 in winter, GMT+3 in summer with DST)
// Returns ISO string representing current time in Lebanon timezone
// Note: SQL Server DATETIME2 doesn't store timezone, so we store Lebanon local time directly
function lebanonTime() {
	const now = new Date();
	
	
	// Get UTC components directly
	let year = now.getUTCFullYear();
	let month = now.getUTCMonth();
	let day = now.getUTCDate();
	let hours = now.getUTCHours() ;
	let minutes = now.getUTCMinutes();
	let seconds = now.getUTCSeconds();
	
	// Handle hour overflow (if hours >= 24, move to next day)
	if (hours >= 24) {
		hours -= 24;
		day += 1;
		// Handle day overflow
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		if (day > daysInMonth) {
			day = 1;
			month += 1;
			// Handle month overflow
			if (month > 11) {
				month = 0;
				year += 1;
			}
		}
	}
	
	// Handle hour underflow (if hours < 0, move to previous day)
	if (hours < 0) {
		hours += 24;
		day -= 1;
		// Handle day underflow
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
	return `${year}-${pad(month + 1)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Helper function to get Lebanon time formatted for logging (ISO-like format)
function lebanonTimeForLog() {
	const timeStr = lebanonTime();
	// Convert "YYYY-MM-DD HH:mm:ss" to "YYYY-MM-DDTHH:mm:ss" format for logging
	return timeStr.replace(' ', 'T');
}

function nowIso() {
	// Return current time in Lebanon timezone (Asia/Beirut) as formatted string
	return lebanonTime();
}

// Helper function to get today's date in Lebanon timezone (Asia/Beirut - GMT+2/GMT+3)
// Lebanon uses EET (GMT+2) in winter and EEST (GMT+3) in summer (with DST)
function getTodayLocal() {
	const now = new Date();
	// Use Intl.DateTimeFormat for reliable timezone conversion to Asia/Beirut
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Beirut',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});
	return formatter.format(now);
}

// Helper function to convert a date to Lebanon timezone date string (YYYY-MM-DD format)
function toLocalDateString(date) {
	const d = new Date(date);
	// Convert to Lebanon timezone (Asia/Beirut)
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Beirut',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});
	return formatter.format(d);
}

/**
 * Normalizes barcode or SKU by removing all spaces and converting to uppercase
 * This ensures consistent storage and case-insensitive comparison regardless of how values are entered
 * 
 * @param {string|null|undefined} value - The barcode or SKU value to normalize
 * @returns {string|null} - Normalized value (uppercase, no spaces) or null if input is falsy
 * 
 * Examples:
 * - "12 34 56" -> "123456"
 * - "abc 123" -> "ABC123"
 * - "  ABC-123  " -> "ABC-123"
 * - null/undefined/"" -> null
 */
function normalizeBarcodeOrSku(value) {
	if (!value) return null;
	// Remove all spaces from the string (not just trim) and convert to uppercase for case-insensitive matching
	const normalized = String(value).replace(/\s+/g, '').toUpperCase();
	return normalized || null;
}

// ===== AUTH =====
const SESSION_KEY = 'local_auth_session';

// Secure password hashing with bcrypt
async function hashPassword(pw) {
	const saltRounds = 10;
	return await bcrypt.hash(pw, saltRounds);
}

async function comparePassword(pw, hash) {
	if (!pw || !hash) {
		return false;
	}
	try {
		return await bcrypt.compare(pw, hash);
	} catch (err) {
		console.error('Password comparison error:', err);
		return false;
	}
}

// ===== MIDDLEWARE =====
// JWT Authentication Middleware
async function authenticateToken(req, res, next) {
	try {
		const authHeader = req.headers['authorization'];
		const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
		
		if (!token) {
			return res.status(401).json({ error: 'Authentication required' });
		}
		
		const decoded = jwt.verify(token, JWT_SECRET);
		req.user = decoded; // Attach user info to request
		next();
	} catch (err) {
		if (err.name === 'TokenExpiredError') {
			return res.status(401).json({ error: 'Token expired' });
		}
		if (err.name === 'JsonWebTokenError') {
			return res.status(401).json({ error: 'Invalid token' });
		}
		return res.status(401).json({ error: 'Authentication failed' });
	}
}

// Admin Role Check Middleware
async function requireAdmin(req, res, next) {
	try {
		if (!req.user || !req.user.userId) {
			return res.status(401).json({ error: 'Authentication required' });
		}
		
		// Check if user is admin - using plain array params
		const result = await query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
		
		if (result.recordset.length === 0) {
			return res.status(404).json({ error: 'User not found' });
		}
		
		const isAdmin = result.recordset[0].is_admin === true || result.recordset[0].is_admin === 1;
		
		if (!isAdmin) {
			return res.status(403).json({ error: 'Admin access required' });
		}
		
		next();
	} catch (err) {
		console.error('Admin check error:', err);
		return res.status(500).json({ error: 'Failed to verify admin status' });
	}
}

// Apply security middleware to all API routes
// Note: Rate limiting is handled per route type (auth has stricter limits)
// Input sanitization and SQL injection validation are applied to all routes
router.use((req, res, next) => {
	// Skip for auth routes (they handle their own validation)
	if (req.path.startsWith('/auth/')) {
		return next();
	}
	// Apply sanitization and validation
	sanitizeInput(req, res, () => {
		validateSQLInput(req, res, next);
	});
});

// Rate limiting is only applied to auth routes (signin/signup)
// Business API routes have no rate limiting to allow normal operations

// Validation error handler
function handleValidationErrors(req, res, next) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ error: 'Validation failed', details: errors.array() });
	}
	next();
}

router.post('/auth/signup', requestSizeLimiter('10mb'), authLimiter, sanitizeInput, [
	body('email').isEmail().normalizeEmail(),
	body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], handleValidationErrors, async (req, res) => {
	try {
		const { email, password } = req.body;
		// Using plain array params
		const result = await query('SELECT id FROM users WHERE email = $1', [email]);
		if (result.recordset.length > 0) {
			return res.status(400).json({ error: 'User already exists' });
		}
		
		// Check if there are any admins in the system
		// If no admins exist, this new user will become admin
		// Otherwise, they will be a regular user
		const adminCountResult = await query('SELECT COUNT(*) as count FROM users WHERE is_admin = true', []);
		const adminCount = parseInt(adminCountResult.recordset[0]?.count || 0);
		const willBeAdmin = adminCount === 0;
		
		// Use bcrypt for secure password hashing
		const passwordHash = await hashPassword(password);
		
		// Validate hash was created
		if (!passwordHash || passwordHash.length === 0) {
			throw new Error('Failed to hash password');
		}
		
		const createdAt = nowIso();
		const insertResult = await query(
			'INSERT INTO users (email, passwordhash, is_admin, created_at) VALUES ($1, $2, $3, $4) RETURNING id, is_admin',
			[email, passwordHash, willBeAdmin, createdAt]
		);
		const user = insertResult.recordset[0];
		const isAdmin = user.is_admin === true || user.is_admin === 1;
		
		if (willBeAdmin && process.env.NODE_ENV !== 'production') {
		}
		
		// Generate JWT token
		const token = jwt.sign({ userId: user.id, email, isAdmin }, JWT_SECRET, { expiresIn: '7d' });
		res.json({ id: user.id, email, isAdmin, token });
	} catch (err) {
		console.error('Signup error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/auth/signin', requestSizeLimiter('10mb'), authLimiter, sanitizeInput, [
	body('email').isEmail().normalizeEmail(),
	body('password').notEmpty(),
], handleValidationErrors, async (req, res) => {
	try {
		const { email, password } = req.body;
		
		// Validate inputs
		if (!email || !password) {
			return res.status(400).json({ error: 'Email and password are required' });
		}
		
		// Using plain array params - get user first
		// Use LOWER() to handle case-insensitive email matching
		// PostgreSQL converts unquoted identifiers to lowercase, so passwordHash becomes passwordhash
		const result = await query('SELECT id, email, is_admin, passwordhash FROM users WHERE LOWER(email) = LOWER($1)', [email]);
		if (result.recordset.length === 0) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		const user = result.recordset[0];
		
		// Verify password with bcrypt
		// PostgreSQL returns column names in lowercase, so passwordhash (not passwordHash)
		const passwordHash = user.passwordhash || user.passwordHash; // Support both cases
		if (!user || !passwordHash) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		
		// Ensure passwordHash is a non-empty string
		const hashStr = String(passwordHash || '').trim();
		if (!hashStr || hashStr.length === 0) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		
		// Ensure password is a non-empty string
		const passwordStr = String(password || '').trim();
		if (!passwordStr || passwordStr.length === 0) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		
		// Check if this is an old hash format (numeric string) - if so, reject
		// Old format was just a number, bcrypt hashes start with $2a$, $2b$, or $2y$
		if (!hashStr.startsWith('$2')) {
			// This is an old hash format - user needs to reset password
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		
		const passwordMatch = await comparePassword(passwordStr, hashStr);
		if (!passwordMatch) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		
		const isAdmin = user.is_admin === true || user.is_admin === 1;
		// Generate JWT token
		const token = jwt.sign({ userId: user.id, email: user.email, isAdmin }, JWT_SECRET, { expiresIn: '7d' });
		res.json({ id: user.id, email: user.email, isAdmin, token });
	} catch (err) {
		console.error('Signin error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/auth/logout', async (req, res) => {
	// For JWT, logout is handled client-side by removing the token
	// This endpoint exists for compatibility
	res.json({ success: true });
});

// Check if current user is admin
router.get('/auth/me', authenticateToken, async (req, res) => {
	try {
		// Using plain array params
		const result = await query('SELECT id, email, is_admin FROM users WHERE id = $1', [req.user.userId]);
		if (result.recordset.length === 0) {
			return res.status(404).json({ error: 'User not found' });
		}
		const user = result.recordset[0];
		const isAdmin = user.is_admin === true || user.is_admin === 1;
		res.json({ id: user.id, email: user.email, isAdmin });
	} catch (err) {
		console.error('Get user info error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== CUSTOMERS =====
router.get('/customers', async (req, res) => {
	try {
		const result = await query('SELECT * FROM customers ORDER BY created_at DESC', []);
		res.json(result.recordset);
	} catch (err) {
		console.error('List customers error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/customers', [
	body('name').trim().notEmpty().withMessage('Name is required'),
], handleValidationErrors, async (req, res) => {
	try {
		const { name, phone, address, credit_limit } = req.body;
		const createdAt = nowIso();
		// Using plain array params
		const result = await query(
			'INSERT INTO customers (name, phone, address, credit_limit, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
			[name, phone || null, address || null, credit_limit || 0, createdAt]
		);
		const id = result.recordset[0].id;
		res.json({ id });
	} catch (err) {
		console.error('Create customer error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.put('/customers/:id', [
	param('id').isInt().withMessage('Invalid customer ID'),
], handleValidationErrors, async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { name, phone, address, credit_limit } = req.body;
		const updates = [];
		const params = [];
		let paramIndex = 1;
		if (name !== undefined) {
			updates.push(`name = $${++paramIndex}`);
			params.push(name);
		}
		if (phone !== undefined) {
			updates.push(`phone = $${++paramIndex}`);
			params.push(phone || null);
		}
		if (address !== undefined) {
			updates.push(`address = $${++paramIndex}`);
			params.push(address || null);
		}
		if (credit_limit !== undefined) {
			updates.push(`credit_limit = $${++paramIndex}`);
			params.push(credit_limit);
		}
		if (updates.length === 0) {
			return res.json({ id });
		}
		params.unshift(id); // Add id as first parameter
		await query(`UPDATE customers SET ${updates.join(', ')} WHERE id = $1`, params);
		res.json({ id });
	} catch (err) {
		console.error('Update customer error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== SUPPLIERS =====
router.get('/suppliers', async (req, res) => {
	try {
		const result = await query('SELECT * FROM suppliers ORDER BY created_at DESC', []);
		res.json(result.recordset);
	} catch (err) {
		console.error('List suppliers error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/suppliers', [
	body('name').trim().notEmpty().withMessage('Name is required'),
], handleValidationErrors, async (req, res) => {
	try {
		const { name, phone, address } = req.body;
		const createdAt = nowIso();
		// Using plain array params
		const result = await query(
			'INSERT INTO suppliers (name, phone, address, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
			[name, phone || null, address || null, createdAt]
		);
		const id = result.recordset[0].id;
		res.json({ id });
	} catch (err) {
		console.error('Create supplier error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.put('/suppliers/:id', [
	param('id').isInt().withMessage('Invalid supplier ID'),
], handleValidationErrors, async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { name, phone, address } = req.body;
		const updates = [];
		const params = [];
		let paramIndex = 1;
		if (name !== undefined) {
			updates.push(`name = $${++paramIndex}`);
			params.push(name);
		}
		if (phone !== undefined) {
			updates.push(`phone = $${++paramIndex}`);
			params.push(phone || null);
		}
		if (address !== undefined) {
			updates.push(`address = $${++paramIndex}`);
			params.push(address || null);
		}
		if (updates.length === 0) {
			return res.json({ id });
		}
		params.unshift(id); // Add id as first parameter
		await query(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = $1`, params);
		res.json({ id });
	} catch (err) {
		console.error('Update supplier error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== CATEGORIES =====
router.get('/categories', async (req, res) => {
	try {
		const cache = require('../cache');
		const cacheKey = 'categories:list';
		
		// Check cache first
		let categories = cache.get(cacheKey);
		if (categories) {
			return res.json(categories);
		}
		
		// Fetch from database
		const result = await query('SELECT * FROM categories ORDER BY name ASC', []);
		categories = result.recordset;
		
		// Cache for 5 minutes (categories don't change often)
		cache.set(cacheKey, categories, 5 * 60 * 1000);
		
		res.json(categories);
	} catch (err) {
		console.error('List categories error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/categories', [
	body('name').trim().notEmpty().withMessage('Name is required'),
], handleValidationErrors, async (req, res) => {
	try {
		const { name, description } = req.body;
		const createdAt = nowIso();
		// Using plain array params
		const result = await query(
			'INSERT INTO categories (name, description, created_at) VALUES ($1, $2, $3) RETURNING id',
			[name, description || null, createdAt]
		);
		const id = result.recordset[0].id;
		
		// Invalidate cache
		const cache = require('../cache');
		cache.invalidate('categories:*');
		
		res.json({ id });
	} catch (err) {
		console.error('Create category error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.put('/categories/:id', [
	param('id').isInt().withMessage('Invalid category ID'),
], handleValidationErrors, async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { name, description } = req.body;
		const updates = [];
		const params = [];
		let paramIndex = 1;
		if (name !== undefined) {
			updates.push(`name = $${++paramIndex}`);
			params.push(name);
		}
		if (description !== undefined) {
			updates.push(`description = $${++paramIndex}`);
			params.push(description || null);
		}
		if (updates.length === 0) {
			return res.json({ id });
		}
		params.unshift(id); // Add id as first parameter
		await query(`UPDATE categories SET ${updates.join(', ')} WHERE id = $1`, params);
		
		// Invalidate cache
		const cache = require('../cache');
		cache.invalidate('categories:*');
		
		res.json({ id });
	} catch (err) {
		console.error('Update category error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.delete('/categories/:id', [
	param('id').isInt().withMessage('Invalid category ID'),
], handleValidationErrors, async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		// Check if any products are using this category - using plain array params
		const productsResult = await query('SELECT COUNT(*) as count FROM products WHERE category_id = $1', [id]);
		if (productsResult.recordset[0].count > 0) {
			return res.status(400).json({ error: 'Cannot delete category: products are still assigned to it' });
		}
		await query('DELETE FROM categories WHERE id = $1', [id]);
		
		// Invalidate cache
		const cache = require('../cache');
		cache.invalidate('categories:*');
		
		res.json({ success: true });
	} catch (err) {
		console.error('Delete category error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== PRODUCTS =====
router.get('/products', async (req, res) => {
	try {
		const cache = require('../cache');
		// Add pagination for performance
		const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
		const offset = Math.max(parseInt(req.query.offset) || 0, 0);
		const search = req.query.search || '';
		
		// Create cache key based on pagination and search
		const cacheKey = `products:list:${limit}:${offset}:${search}`;
		
		// Check cache first (only for first page without search)
		if (offset === 0 && !search) {
			const cached = cache.get(cacheKey);
			if (cached) {
				return res.json(cached);
			}
		}
		
		// Build query with optional search
		let queryText = 'SELECT p.id, p.name, p.barcode, p.category_id, p.description, p.sku, p.shelf, p.created_at, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id';
		const queryParams = [];
		
		if (search) {
			// Normalize search term - remove all spaces and convert to uppercase for barcode/SKU matching
			// Performance: Direct comparison first (uses index), REPLACE for backward compatibility
			const normalizedSearch = normalizeBarcodeOrSku(search) || '';
			const searchPattern = `%${search.trim()}%`;
			const normalizedPattern = `%${normalizedSearch}%`;
			// Optimized: Try direct match first (indexed), then REPLACE for old data
			queryText += ` WHERE p.name ILIKE $1 
				OR (p.barcode IS NOT NULL AND (p.barcode ILIKE $2 OR REPLACE(p.barcode, ' ', '') ILIKE $3))
				OR (p.sku IS NOT NULL AND (p.sku ILIKE $2 OR REPLACE(p.sku, ' ', '') ILIKE $3))`;
			queryParams.push(searchPattern, normalizedPattern, normalizedPattern);
			queryText += ` ORDER BY p.id DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
			queryParams.push(limit, offset);
		} else {
			queryText += ` ORDER BY p.id DESC LIMIT $1 OFFSET $2`;
			queryParams.push(limit, offset);
		}
		
		const result = await query(queryText, queryParams);
		
		// Get total count for pagination info (calculate for all pages to ensure accurate pagination)
		let totalCount = null;
			if (search) {
				// Normalize search term for barcode/SKU matching (same as main query)
				// Performance optimized: Direct comparison first, REPLACE for backward compatibility
				const normalizedSearch = normalizeBarcodeOrSku(search) || '';
				const searchPattern = `%${search.trim()}%`;
				const normalizedPattern = `%${normalizedSearch}%`;
				const countResult = await query(
					`SELECT COUNT(*) as count FROM products 
					 WHERE name ILIKE $1 
					 OR (barcode IS NOT NULL AND (barcode ILIKE $2 OR REPLACE(barcode, ' ', '') ILIKE $3))
					 OR (sku IS NOT NULL AND (sku ILIKE $2 OR REPLACE(sku, ' ', '') ILIKE $3))`,
					[searchPattern, normalizedPattern, normalizedPattern]
				);
				totalCount = parseInt(countResult.recordset[0].count);
			} else {
				const countResult = await query('SELECT COUNT(*) as count FROM products', []);
				totalCount = parseInt(countResult.recordset[0].count);
		}
		
		const response = {
			data: result.recordset,
			pagination: {
				limit,
				offset,
				total: totalCount,
				hasMore: totalCount ? offset + limit < totalCount : null
			}
		};
		
		// Cache first page without search for 2 minutes
		if (offset === 0 && !search) {
			cache.set(cacheKey, response, 2 * 60 * 1000);
		}
		
		res.json(response);
	} catch (err) {
		console.error('List products error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Quick add product (barcode scanner optimized - only barcode + name)
router.post('/products/quick-add', [
	body('name').trim().notEmpty().withMessage('Product name is required'),
	body('barcode').trim().notEmpty().withMessage('Barcode is required'),
], handleValidationErrors, async (req, res) => {
	try {
		const { name, barcode } = req.body;
		// Normalize barcode by removing ALL spaces (left, right, and middle)
		const normalizedBarcode = normalizeBarcodeOrSku(barcode);
		
		if (!normalizedBarcode) {
			return res.status(400).json({ error: 'Barcode is required' });
		}
		
		// Check if barcode already exists
		// Performance optimized: Direct comparison uses index, REPLACE handles old data
		// PostgreSQL can optimize OR conditions and use appropriate indexes
		const existingBarcode = await query(
			'SELECT id FROM products WHERE barcode = $1 OR (barcode IS NOT NULL AND REPLACE(barcode, \' \', \'\') = $1) LIMIT 1',
			[normalizedBarcode]
		);
		if (existingBarcode.recordset.length > 0) {
			return res.status(400).json({ error: 'Product already exists with this barcode' });
		}
		
		const createdAt = nowIso();
		// Using plain array params - save normalized barcode (no spaces)
		const result = await query(
			'INSERT INTO products (name, barcode, category_id, description, sku, shelf, created_at) VALUES ($1, $2, NULL, NULL, NULL, NULL, $3) RETURNING id',
			[name, normalizedBarcode, createdAt]
		);
		const id = result.recordset[0].id;
		// Ensure daily stock entry - using plain array params
		const today = getTodayLocal();
		const stockTimestamp = nowIso();
		await query(
			`INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) 
			 VALUES ($1, 0, 0, $2, $3, $3)
			 ON CONFLICT (product_id, date) DO NOTHING`,
			[id, today, stockTimestamp]
		);
		// Invalidate products cache
		const cache = require('../cache');
		cache.invalidate('products:*');
		
		res.json({ id });
	} catch (err) {
		console.error('Quick add product error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Quick add product (SKU scanner optimized - only SKU + name)
router.post('/products/quick-add-sku', [
	body('name').trim().notEmpty().withMessage('Product name is required'),
	body('sku').trim().notEmpty().withMessage('SKU is required'),
], handleValidationErrors, async (req, res) => {
	try {
		const { name, sku } = req.body;
		// Normalize SKU by removing ALL spaces (left, right, and middle)
		const normalizedSku = normalizeBarcodeOrSku(sku);
		
		if (!normalizedSku) {
			return res.status(400).json({ error: 'SKU is required' });
		}
		
		// Check if SKU already exists
		// Performance optimized: Direct comparison uses index, REPLACE handles old data
		const existingSku = await query(
			'SELECT id FROM products WHERE sku = $1 OR (sku IS NOT NULL AND REPLACE(sku, \' \', \'\') = $1) LIMIT 1',
			[normalizedSku]
		);
		if (existingSku.recordset.length > 0) {
			return res.status(400).json({ error: 'Product already exists with this SKU' });
		}
		
		const createdAt = nowIso();
		// Using plain array params - save normalized SKU (no spaces)
		const result = await query(
			'INSERT INTO products (name, barcode, category_id, description, sku, shelf, created_at) VALUES ($1, NULL, NULL, NULL, $2, NULL, $3) RETURNING id',
			[name, normalizedSku, createdAt]
		);
		const id = result.recordset[0].id;
		// Ensure daily stock entry - using plain array params
		const today = getTodayLocal();
		const stockTimestamp = nowIso();
		await query(
			`INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) 
			 VALUES ($1, 0, 0, $2, $3, $3)
			 ON CONFLICT (product_id, date) DO NOTHING`,
			[id, today, stockTimestamp]
		);
		// Invalidate products cache
		const cache = require('../cache');
		cache.invalidate('products:*');
		
		res.json({ id });
	} catch (err) {
		console.error('Quick add product (SKU) error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/products', [
	body('name').trim().notEmpty().withMessage('Product name is required'),
], handleValidationErrors, async (req, res) => {
	try {
		const { name, barcode, category_id, description, sku, shelf } = req.body;
		// Normalize barcode and SKU by removing ALL spaces (left, right, and middle)
		const normalizedBarcode = normalizeBarcodeOrSku(barcode);
		const normalizedSku = normalizeBarcodeOrSku(sku);
		
		// Check if product already exists (same barcode or same SKU)
		// Priority: barcode first, then SKU if barcode is null
		// Multiple products can have the same name, but must have different barcode (or if barcode is null, different SKU)
		
		if (normalizedBarcode) {
			// Check if barcode already exists - Performance optimized
			const existingBarcode = await query(
				'SELECT id FROM products WHERE barcode = $1 OR (barcode IS NOT NULL AND REPLACE(barcode, \' \', \'\') = $1) LIMIT 1',
				[normalizedBarcode]
			);
			if (existingBarcode.recordset.length > 0) {
				return res.status(400).json({ error: 'Product already exists with this barcode' });
			}
		}
		
		if (normalizedSku) {
			// Check if SKU already exists - Performance optimized
			const existingSku = await query(
				'SELECT id FROM products WHERE sku = $1 OR (sku IS NOT NULL AND REPLACE(sku, \' \', \'\') = $1) LIMIT 1',
				[normalizedSku]
			);
			if (existingSku.recordset.length > 0) {
				return res.status(400).json({ error: 'Product already exists with this SKU' });
			}
		}
		
		// If both barcode and SKU are null, allow insertion (only name-based)
		// If at least one is provided and doesn't exist, proceed with insertion
		const createdAt = nowIso();
		// Using plain array params - save normalized barcode and SKU (no spaces)
		const result = await query(
			'INSERT INTO products (name, barcode, category_id, description, sku, shelf, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
			[name, normalizedBarcode, category_id ? parseInt(category_id) : null, description || null, normalizedSku, shelf || null, createdAt]
		);
		const id = result.recordset[0].id;
		// Ensure daily stock entry - using plain array params
		const today = getTodayLocal();
		const stockTimestamp = nowIso();
		await query(
			`INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) 
			 VALUES ($1, 0, 0, $2, $3, $3)
			 ON CONFLICT (product_id, date) DO NOTHING`,
			[id, today, stockTimestamp]
		);
		// Invalidate products cache
		const cache = require('../cache');
		cache.invalidate('products:*');
		
		res.json({ id });
	} catch (err) {
		console.error('Create product error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.put('/products/:id', [
	param('id').isInt().withMessage('Invalid product ID'),
], handleValidationErrors, async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { name, barcode, category_id, description, sku, shelf } = req.body;
		
		// Normalize barcode and SKU by removing ALL spaces (left, right, and middle)
		const normalizedBarcode = barcode !== undefined ? normalizeBarcodeOrSku(barcode) : undefined;
		const normalizedSku = sku !== undefined ? normalizeBarcodeOrSku(sku) : undefined;
		
		// Check for duplicates if barcode or SKU is being updated (only if value is not null/empty)
		if (normalizedBarcode !== undefined && normalizedBarcode !== null) {
			// Performance optimized: Direct comparison uses index, REPLACE handles old data
			const existingBarcode = await query(
				'SELECT id FROM products WHERE id != $2 AND (barcode = $1 OR (barcode IS NOT NULL AND REPLACE(barcode, \' \', \'\') = $1)) LIMIT 1',
				[normalizedBarcode, id]
			);
			if (existingBarcode.recordset.length > 0) {
				return res.status(400).json({ error: 'Product already exists with this barcode' });
			}
		}
		
		if (normalizedSku !== undefined && normalizedSku !== null) {
			// Performance optimized: Direct comparison uses index, REPLACE handles old data
			const existingSku = await query(
				'SELECT id FROM products WHERE id != $2 AND (sku = $1 OR (sku IS NOT NULL AND REPLACE(sku, \' \', \'\') = $1)) LIMIT 1',
				[normalizedSku, id]
			);
			if (existingSku.recordset.length > 0) {
				return res.status(400).json({ error: 'Product already exists with this SKU' });
			}
		}
		
		const updates = [];
		const params = [];
		let paramIndex = 1;
		if (name !== undefined) {
			updates.push(`name = $${++paramIndex}`);
			params.push(name);
		}
		if (barcode !== undefined) {
			updates.push(`barcode = $${++paramIndex}`);
			params.push(normalizedBarcode);
		}
		if (category_id !== undefined) {
			updates.push(`category_id = $${++paramIndex}`);
			params.push(category_id ? parseInt(category_id) : null);
		}
		if (description !== undefined) {
			updates.push(`description = $${++paramIndex}`);
			params.push(description || null);
		}
		if (sku !== undefined) {
			updates.push(`sku = $${++paramIndex}`);
			params.push(normalizedSku);
		}
		if (shelf !== undefined) {
			updates.push(`shelf = $${++paramIndex}`);
			params.push(shelf || null);
		}
		if (updates.length === 0) {
			return res.json({ id });
		}
		params.unshift(id); // Add id as first parameter
		await query(`UPDATE products SET ${updates.join(', ')} WHERE id = $1`, params);
		
		// Invalidate products cache
		const cache = require('../cache');
		cache.invalidate('products:*');
		
		res.json({ id });
	} catch (err) {
		console.error('Update product error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.delete('/products/:id', [
	param('id').isInt().withMessage('Invalid product ID'),
], handleValidationErrors, async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		// Check if product exists - using plain array params
		const checkResult = await query('SELECT id FROM products WHERE id = $1', [id]);
		if (checkResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Product not found' });
		}

		// Check if product is used in invoice_items (historical invoices - should not be deleted)
		const invoiceItemsCheck = await query('SELECT COUNT(*) as count FROM invoice_items WHERE product_id = $1', [id]);
		if (invoiceItemsCheck.recordset[0]?.count > 0) {
			return res.status(400).json({ 
				error: 'Cannot delete product: it is referenced in historical invoices. Products with invoice history cannot be deleted to maintain data integrity.' 
			});
		}

		// Delete related records first (in correct order to avoid foreign key violations)
		// Delete from daily_stock (daily snapshots can be removed)
		await query('DELETE FROM daily_stock WHERE product_id = $1', [id]);
		
		// Delete from stock_movements (movement history can be removed when product is deleted)
		await query('DELETE FROM stock_movements WHERE product_id = $1', [id]);
		
		// product_prices will be deleted automatically due to ON DELETE CASCADE
		
		// Now delete the product
		await query('DELETE FROM products WHERE id = $1', [id]);
		
		// Invalidate products cache
		const cache = require('../cache');
		cache.invalidate('products:*');
		
		res.json({ success: true, id });
	} catch (err) {
		console.error('Delete product error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== INVOICES =====
router.get('/invoices', async (req, res) => {
	try {
		// Add pagination support - default to 100 items max for performance
		const limit = Math.min(parseInt(req.query.limit) || 100, 500); // Max 500 items
		const offset = Math.max(parseInt(req.query.offset) || 0, 0);
		
		// Optimized query with pagination - only load invoice items for returned invoices
		const invoicesResult = await query(
			`SELECT 
				i.*,
				c.id as customer_id_val, c.name as customer_name, c.phone as customer_phone, c.address as customer_address, c.credit_limit as customer_credit_limit, c.created_at as customer_created_at,
				s.id as supplier_id_val, s.name as supplier_name, s.phone as supplier_phone, s.address as supplier_address, s.created_at as supplier_created_at
			FROM invoices i
			LEFT JOIN customers c ON i.customer_id = c.id
			LEFT JOIN suppliers s ON i.supplier_id = s.id
			ORDER BY i.created_at DESC
			LIMIT $1 OFFSET $2`,
			[limit, offset]
		);
		
		// Only fetch invoice items for the invoices we're returning (much faster)
		const invoiceIds = invoicesResult.recordset.map(inv => inv.id);
		let invoiceItemsResult = { recordset: [] };
		if (invoiceIds.length > 0) {
			const placeholders = invoiceIds.map((_, i) => `$${i + 1}`).join(',');
			invoiceItemsResult = await query(
				`SELECT 
					ii.*,
					p.name as product_name,
					p.barcode as product_barcode,
					p.sku as product_sku
				FROM invoice_items ii
				LEFT JOIN products p ON ii.product_id = p.id
				WHERE ii.invoice_id IN (${placeholders})
				ORDER BY ii.invoice_id, ii.id`,
				invoiceIds
			);
		}
		
		// Group invoice items by invoice_id
		const idToItems = new Map();
		invoiceItemsResult.recordset.forEach(item => {
			if (!idToItems.has(item.invoice_id)) {
				idToItems.set(item.invoice_id, []);
			}
			idToItems.get(item.invoice_id).push(item);
		});
		
		// Fetch payments for all invoices to calculate amount_paid accurately
		let paymentsResult = { recordset: [] };
		if (invoiceIds.length > 0) {
			const placeholders = invoiceIds.map((_, i) => `$${i + 1}`).join(',');
			paymentsResult = await query(
				`SELECT invoice_id, COALESCE(SUM(usd_equivalent_amount), 0) as total_paid 
				 FROM invoice_payments 
				 WHERE invoice_id IN (${placeholders})
				 GROUP BY invoice_id`,
				invoiceIds
			);
		}
		
		// Create a map of invoice_id to total paid amount
		const idToAmountPaid = new Map();
		paymentsResult.recordset.forEach(row => {
			idToAmountPaid.set(row.invoice_id, parseFloat(String(row.total_paid || 0)));
		});
		
		const result = invoicesResult.recordset.map((inv) => {
			// Calculate amount_paid from payments (for consistency, same as details endpoint)
			const amountPaid = idToAmountPaid.get(inv.id) || 0;
			const totalAmount = inv.total_amount || 0;
			const remainingBalance = totalAmount - amountPaid;
			// Calculate payment status based on amount_paid (always recalculate for consistency)
			let paymentStatus;
			if (amountPaid >= totalAmount) {
				paymentStatus = 'paid';
			} else if (amountPaid > 0) {
				paymentStatus = 'partial';
			} else {
				paymentStatus = 'pending';
			}
			
			// Build customer object if exists
			const customers = inv.customer_id_val ? {
				id: inv.customer_id_val,
				name: inv.customer_name,
				phone: inv.customer_phone,
				address: inv.customer_address,
				credit_limit: inv.customer_credit_limit,
				created_at: inv.customer_created_at
			} : undefined;
			
			// Build supplier object if exists
			const suppliers = inv.supplier_id_val ? {
				id: inv.supplier_id_val,
				name: inv.supplier_name,
				phone: inv.supplier_phone,
				address: inv.supplier_address,
				created_at: inv.supplier_created_at
			} : undefined;
			
			// Remove JOIN columns from invoice object
			const { customer_id_val, customer_name, customer_phone, customer_address, customer_credit_limit, customer_created_at,
				supplier_id_val, supplier_name, supplier_phone, supplier_address, supplier_created_at, ...invoiceData } = inv;
			
			return {
				...invoiceData,
				amount_paid: amountPaid,
				payment_status: paymentStatus,
				remaining_balance: remainingBalance,
				customers,
				suppliers,
				invoice_items: idToItems.get(inv.id) || [],
			};
		});
		
		res.json(result);
	} catch (err) {
		console.error('List invoices error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.get('/invoices/recent/:limit', async (req, res) => {
	try {
		const limit = parseInt(req.params.limit) || 10;
		
		// Use a subquery to get only the needed invoices with JOINs
		// This avoids loading all customers, suppliers, and invoice_items
		const invoicesResult = await query(
			`SELECT 
				i.*,
				c.id as customer_id_val, c.name as customer_name, c.phone as customer_phone, c.address as customer_address, c.credit_limit as customer_credit_limit, c.created_at as customer_created_at,
				s.id as supplier_id_val, s.name as supplier_name, s.phone as supplier_phone, s.address as supplier_address, s.created_at as supplier_created_at
			FROM (
				SELECT * FROM invoices ORDER BY id DESC LIMIT $1
			) i
			LEFT JOIN customers c ON i.customer_id = c.id
			LEFT JOIN suppliers s ON i.supplier_id = s.id
			ORDER BY i.id DESC`,
			[{ limit }]
		);
		
		if (invoicesResult.recordset.length === 0) {
			return res.json([]);
		}
		
		const invoiceIds = invoicesResult.recordset.map(r => r.id);
		
		// Fetch invoice items only for these specific invoices
		// Build query with proper parameterization
		const placeholders = invoiceIds.map((_, i) => `$${i + 1}`).join(',');
		const invoiceItemsResult = await query(
			`SELECT * FROM invoice_items 
			WHERE invoice_id IN (${placeholders})
			ORDER BY invoice_id, id`,
			invoiceIds.map(id => ({ invoice_id: id }))
		);
		
		// Group invoice items by invoice_id
		const idToItems = new Map();
		invoiceItemsResult.recordset.forEach(item => {
			if (!idToItems.has(item.invoice_id)) {
				idToItems.set(item.invoice_id, []);
			}
			idToItems.get(item.invoice_id).push(item);
		});
		
		// Build result with customer/supplier objects
		const result = invoicesResult.recordset.map((inv) => {
			const amountPaid = inv.amount_paid || 0;
			const totalAmount = inv.total_amount || 0;
			const remainingBalance = totalAmount - amountPaid;
			// Calculate payment status based on amount_paid (always recalculate for consistency)
			let paymentStatus;
			if (amountPaid >= totalAmount) {
				paymentStatus = 'paid';
			} else if (amountPaid > 0) {
				paymentStatus = 'partial';
			} else {
				paymentStatus = 'pending';
			}
			
			// Build customer object if exists
			const customers = inv.customer_id_val ? {
				id: inv.customer_id_val,
				name: inv.customer_name,
				phone: inv.customer_phone,
				address: inv.customer_address,
				credit_limit: inv.customer_credit_limit,
				created_at: inv.customer_created_at
			} : undefined;
			
			// Build supplier object if exists
			const suppliers = inv.supplier_id_val ? {
				id: inv.supplier_id_val,
				name: inv.supplier_name,
				phone: inv.supplier_phone,
				address: inv.supplier_address,
				created_at: inv.supplier_created_at
			} : undefined;
			
			// Remove JOIN columns from invoice object
			const { customer_id_val, customer_name, customer_phone, customer_address, customer_credit_limit, customer_created_at,
				supplier_id_val, supplier_name, supplier_phone, supplier_address, supplier_created_at, ...invoiceData } = inv;
			
			return {
				...invoiceData,
				amount_paid: amountPaid,
				payment_status: paymentStatus,
				remaining_balance: remainingBalance,
				customers,
				suppliers,
				invoice_items: idToItems.get(inv.id) || [],
			};
		});
		
		res.json(result);
	} catch (err) {
		console.error('Recent invoices error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.get('/invoices/stats', async (req, res) => {
	try {
		const today = getTodayLocal();
		
		// Run all queries in parallel for better performance
		const [
			todayInvoices,
			todayStock,
			invoicesCount,
			productsCount,
			customersCount,
			suppliersCount,
			totalRevenueResult
		] = await Promise.all([
			// Today's invoices - only count and sum revenue
			query(
				`SELECT 
					COUNT(*) as invoice_count,
					COALESCE(SUM(CASE WHEN invoice_type = 'sell' THEN total_amount ELSE 0 END), 0) as today_revenue
				FROM invoices 
				WHERE CAST(invoice_date AS DATE) = $1`, 
				[{ today }]
			),
			// Today's inventory - READ FROM DAILY_STOCK TABLE (today's records only)
			query(
				'SELECT COUNT(DISTINCT product_id) as product_count, COALESCE(SUM(available_qty), 0) as total_qty FROM daily_stock WHERE date = $1', 
				[{ today }]
			),
			// All time counts - use COUNT(*) instead of loading all records
			query('SELECT COUNT(*) as count FROM invoices', []),
			query('SELECT COUNT(*) as count FROM products', []),
			query('SELECT COUNT(*) as count FROM customers', []),
			query('SELECT COUNT(*) as count FROM suppliers', []),
			// Total revenue - use SUM directly in SQL
			query(
				`SELECT COALESCE(SUM(total_amount), 0) as revenue 
				FROM invoices 
				WHERE invoice_type = 'sell'`,
				[]
			)
		]);
		
		// Extract results
		const todayInvoicesCount = parseInt(todayInvoices.recordset[0]?.invoice_count || 0);
		const todayRevenue = parseFloat(todayInvoices.recordset[0]?.today_revenue || 0);
		const todayProductsCount = parseInt(todayStock.recordset[0]?.product_count || 0);
		const todayTotalQuantity = parseFloat(todayStock.recordset[0]?.total_qty || 0);
		const invoicesCountAll = parseInt(invoicesCount.recordset[0]?.count || 0);
		const productsCountAll = parseInt(productsCount.recordset[0]?.count || 0);
		const customersCountAll = parseInt(customersCount.recordset[0]?.count || 0);
		const suppliersCountAll = parseInt(suppliersCount.recordset[0]?.count || 0);
		const totalRevenue = parseFloat(totalRevenueResult.recordset[0]?.revenue || 0);
		
		res.json({
			// All time stats (for reference)
			invoicesCount: invoicesCountAll,
			productsCount: productsCountAll,
			customersCount: customersCountAll,
			suppliersCount: suppliersCountAll,
			revenue: totalRevenue,
			// Today's live data
			todayInvoicesCount: todayInvoicesCount,
			todayProductsCount: todayProductsCount,
			todayRevenue: todayRevenue,
			todayTotalQuantity: todayTotalQuantity,
		});
	} catch (err) {
		console.error('Invoice stats error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Update invoice - MUST come before GET /invoices/:id to avoid route conflicts
router.put('/invoices/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		
		if (isNaN(id) || id <= 0) {
			return res.status(400).json({ error: `Invalid invoice ID: ${req.params.id}` });
		}
		
		const { invoice_type, customer_id, supplier_id, total_amount, due_date, items } = req.body;
		const today = getTodayLocal();

		// Get existing invoice with its date - using plain array params
		const existingInvoice = await query('SELECT * FROM invoices WHERE id = $1', [id]);
		
		if (existingInvoice.recordset.length === 0) {
			return res.status(404).json({ error: `Invoice not found with id: ${id}` });
		}
		const oldInvoice = existingInvoice.recordset[0];
		// Get the original invoice date (might be in the past) - convert to local timezone
		const invoiceDate = oldInvoice.invoice_date ? toLocalDateString(oldInvoice.invoice_date) : today;

		// Get existing invoice items - using plain array params
		const oldItemsResult = await query('SELECT * FROM invoice_items WHERE invoice_id = $1', [id]);
		const oldItems = oldItemsResult.recordset;

		// Collect all affected products (from both old and new items)
		const affectedProducts = new Set();
		oldItems.forEach(item => affectedProducts.add(item.product_id));
		items.forEach(item => affectedProducts.add(parseInt(item.product_id)));

		// Delete old invoice items (stock movements will be updated by the function, not deleted) - using plain array params
		await query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);

		// Update invoice - using plain array params
		await query(
			'UPDATE invoices SET invoice_type = $1, customer_id = $2, supplier_id = $3, total_amount = $4, due_date = $5 WHERE id = $6',
			[invoice_type, customer_id ? parseInt(customer_id) : null, supplier_id ? parseInt(supplier_id) : null, 
			 total_amount, due_date || null, id]
		);

		// Batch insert new invoice items for better performance
		if (items.length > 0) {
			const itemValues = [];
			const itemParams = [];
			let paramIndex = 1;
			
			for (const item of items) {
				itemValues.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8})`);
				itemParams.push(
					id, parseInt(item.product_id), item.quantity, item.unit_price, item.total_price,
					item.price_type, item.is_private_price ? 1 : 0,
					item.is_private_price ? item.private_price_amount : null,
					item.is_private_price ? item.private_price_note : null
				);
				paramIndex += 9;
			}
			
			await query(
				`INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price, price_type, is_private_price, private_price_amount, private_price_note) 
				 VALUES ${itemValues.join(', ')}`,
				itemParams
			);
		}

		// Call the function to recalculate stock for each affected product
		// The function will update existing stock movements and recalculate all later movements
		
		// First, handle deleted items (products in oldItems but not in new items)
		const newProductIds = new Set(items.map(item => parseInt(item.product_id)));
		for (const oldItem of oldItems) {
			const productId = oldItem.product_id;
			if (!newProductIds.has(productId)) {
				// This product was deleted from the invoice - call with DELETE action
				await query(
					'SELECT recalculate_stock_after_invoice($1, $2, $3, NULL, NULL)',
					[id, productId, 'DELETE']
				);
			}
		}
		
		// Then, handle items that exist in new items (either new or edited)
		for (const productId of affectedProducts) {
			const item = items.find(item => parseInt(item.product_id) === productId);
			if (item) {
				const change = invoice_type === 'sell' ? -item.quantity : item.quantity;
				const unitCost = parseFloat(item.unit_price);
				
				// Call the stored procedure to recalculate - using plain array params
				await query(
					'SELECT recalculate_stock_after_invoice($1, $2, $3, $4, $5)',
					[id, productId, 'EDIT', change, unitCost]
				);
			}
		}

		res.json({ id: String(id), invoice_date: oldInvoice.invoice_date });
	} catch (err) {
		console.error('Update invoice error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.delete('/invoices/:id', [
	param('id').isInt().withMessage('Invalid invoice ID'),
], handleValidationErrors, async (req, res) => {
	const pool = getPool();
	const client = await pool.connect();
	
	try {
		await client.query('BEGIN');
		
		const id = parseInt(req.params.id);
		
		// Check if invoice exists - using plain array params
		const checkResult = await client.query('SELECT id FROM invoices WHERE id = $1', [id]);
		if (checkResult.rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Invoice not found' });
		}
		
		// Check if invoice has payments - if so, prevent deletion
		const paymentsCheck = await client.query(
			'SELECT COUNT(*) as payment_count FROM invoice_payments WHERE invoice_id = $1',
			[id]
		);
		const paymentCount = parseInt(paymentsCheck.rows[0]?.payment_count || 0);
		if (paymentCount > 0) {
			await client.query('ROLLBACK');
			return res.status(400).json({ 
				error: 'Cannot delete invoice with existing payments. Please remove all payments first.',
				hasPayments: true,
				paymentCount: paymentCount
			});
		}
		
		// Get invoice items to know which products are affected - using plain array params
		const itemsResult = await client.query('SELECT DISTINCT product_id FROM invoice_items WHERE invoice_id = $1', [id]);
		const affectedProducts = itemsResult.rows.map(row => row.product_id);
		
		// Call the stored procedure for each affected product with DELETE action - using plain array params
		for (const productId of affectedProducts) {
			await client.query(
				'SELECT recalculate_stock_after_invoice($1, $2, $3, NULL, NULL)',
				[id, productId, 'DELETE']
			);
		}
		
		// Delete related records (stored procedure already deleted stock_movements) - using plain array params
		await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
		await client.query('DELETE FROM invoice_payments WHERE invoice_id = $1', [id]);
		
		// Delete invoice - using plain array params
		await client.query('DELETE FROM invoices WHERE id = $1', [id]);
		
		await client.query('COMMIT');
		res.json({ success: true, id });
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('Delete invoice error:', err);
		res.status(500).json({ error: err.message });
	} finally {
		client.release();
	}
});

router.get('/invoices/overdue', async (req, res) => {
	try {
		const today = getTodayLocal();
		// Using plain array params
		const invoices = await query(
			`SELECT i.*, c.name as customer_name, c.phone as customer_phone, s.name as supplier_name, s.phone as supplier_phone
			 FROM invoices i
			 LEFT JOIN customers c ON i.customer_id = c.id
			 LEFT JOIN suppliers s ON i.supplier_id = s.id
			 WHERE i.due_date IS NOT NULL 
			   AND CAST(i.due_date AS DATE) < CAST($1 AS DATE)
			   AND i.payment_status != 'paid'
			 ORDER BY i.due_date ASC`,
			[today]
		);
		
		// Format the response to match frontend expectations
		const result = invoices.recordset.map(inv => {
			// Calculate remaining balance: total_amount - amount_paid
			const totalAmount = parseFloat(inv.total_amount || 0);
			const amountPaid = parseFloat(inv.amount_paid || 0);
			const remainingBalance = Math.max(0, totalAmount - amountPaid);
			
			return {
				...inv,
				customers: inv.customer_id ? { name: inv.customer_name, phone: inv.customer_phone } : undefined,
				suppliers: inv.supplier_id ? { name: inv.supplier_name, phone: inv.supplier_phone } : undefined,
				remaining_balance: remainingBalance,
			};
		});
		
		res.json(result);
	} catch (err) {
		console.error('Get overdue invoices error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/invoices', [
	body('invoice_type').isIn(['buy', 'sell']).withMessage('Invoice type must be buy or sell'),
	body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
	body('total_amount').isFloat({ min: 0 }).withMessage('Total amount must be a positive number'),
], handleValidationErrors, async (req, res) => {
	const pool = getPool();
	const client = await pool.connect();
	
	try {
		await client.query('BEGIN');
		
		const { invoice_type, customer_id, supplier_id, total_amount, due_date, items, paid_directly } = req.body;
		const today = getTodayLocal();
		const invoiceTimestamp = nowIso();
		
		// Create invoice - using plain array params
		const invoiceResult = await client.query(
			`INSERT INTO invoices (invoice_type, customer_id, supplier_id, total_amount, invoice_date, due_date, created_at) 
			 VALUES ($1, $2, $3, $4, $5::timestamp, $6, $5::timestamp) RETURNING id, invoice_date`,
			[invoice_type, customer_id ? parseInt(customer_id) : null, supplier_id ? parseInt(supplier_id) : null, 
			 total_amount, invoiceTimestamp, due_date || null]
		);
		const invoiceId = invoiceResult.rows[0].id;
		const invoice_date = invoiceResult.rows[0].invoice_date;
		
		// Batch fetch stock data for all products at once (minimize DB calls)
		const productIds = items.map(item => parseInt(item.product_id));
		const stockDataResult = await client.query(
			`SELECT product_id, available_qty, avg_cost 
			 FROM daily_stock 
			 WHERE product_id = ANY($1) AND date <= $2 
			 ORDER BY product_id, date DESC, updated_at DESC`,
			[productIds, today]
		);
		
		// Create a map of product_id -> latest stock data
		const stockMap = new Map();
		stockDataResult.rows.forEach(row => {
			if (!stockMap.has(row.product_id)) {
				stockMap.set(row.product_id, {
					available_qty: row.available_qty || 0,
					avg_cost: row.avg_cost || 0
				});
			}
		});
		
		// Prepare batch insert data for invoice items
		const itemValues = [];
		const itemParams = [];
		
		// Prepare batch insert data for stock movements  
		const movementValues = [];
		const movementParams = [];
		
		// Prepare batch upsert data for daily_stock
		const stockValues = [];
		const stockParams = [];
		
		const stockTimestamp = nowIso();
		let itemParamIndex = 1;
		let movementParamIndex = 1;
		let stockParamIndex = 1;
		
		for (const item of items) {
			const productId = parseInt(item.product_id);
			const stockData = stockMap.get(productId) || { available_qty: 0, avg_cost: 0 };
			let qtyBefore = stockData.available_qty;
			let prevAvgCost = stockData.avg_cost;
			
			const change = invoice_type === 'sell' ? -item.quantity : item.quantity;
			const qtyAfter = qtyBefore + change;
			
			// Determine new avg cost for BUY; keep previous for SELL
			let newAvgCost = prevAvgCost || 0;
			if (invoice_type === 'buy') {
				const buyQty = item.quantity;
				const buyCost = item.unit_price;
				const denominator = (qtyBefore || 0) + buyQty;
				newAvgCost = denominator > 0 ? (((prevAvgCost || 0) * (qtyBefore || 0)) + (buyCost * buyQty)) / denominator : buyCost;
			}
			
			const unitCost = parseFloat(item.unit_price);
			
			// Build invoice items batch insert
			itemValues.push(`($${itemParamIndex}, $${itemParamIndex + 1}, $${itemParamIndex + 2}, $${itemParamIndex + 3}, $${itemParamIndex + 4}, $${itemParamIndex + 5}, $${itemParamIndex + 6}, $${itemParamIndex + 7}, $${itemParamIndex + 8})`);
			itemParams.push(
				invoiceId, productId, item.quantity, item.unit_price, item.total_price,
				item.price_type, item.is_private_price ? 1 : 0,
				item.is_private_price ? item.private_price_amount : null,
				item.is_private_price ? item.private_price_note : null
			);
			itemParamIndex += 9;
			
			// Build stock movements batch insert (using invoice_date subquery)
			movementValues.push(`($${movementParamIndex}, $${movementParamIndex + 1}, (SELECT invoice_date FROM invoices WHERE id = $${movementParamIndex + 1}), $${movementParamIndex + 2}, $${movementParamIndex + 3}, $${movementParamIndex + 4}, $${movementParamIndex + 5}, $${movementParamIndex + 6}, $${movementParamIndex + 7}::timestamp)`);
			movementParams.push(productId, invoiceId, qtyBefore, change, qtyAfter, unitCost, newAvgCost, invoiceTimestamp);
			movementParamIndex += 8;
			
			// Build daily_stock batch upsert
			stockValues.push(`($${stockParamIndex}, $${stockParamIndex + 1}, $${stockParamIndex + 2}, $${stockParamIndex + 3}, $${stockParamIndex + 4}, $${stockParamIndex + 4})`);
			stockParams.push(productId, qtyAfter, newAvgCost, today, stockTimestamp);
			stockParamIndex += 5;
		}
		
		// Batch insert invoice items
		if (itemValues.length > 0) {
			await client.query(
				`INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price, price_type, is_private_price, private_price_amount, private_price_note) 
				 VALUES ${itemValues.join(', ')}`,
				itemParams
			);
		}
		
		// Batch insert stock movements
		if (movementValues.length > 0) {
			await client.query(
				`INSERT INTO stock_movements (product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, unit_cost, avg_cost_after, created_at) 
				 VALUES ${movementValues.join(', ')}`,
				movementParams
			);
		}
		
		// Batch upsert daily_stock
		if (stockValues.length > 0) {
			await client.query(
				`INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) 
				 VALUES ${stockValues.join(', ')}
				 ON CONFLICT (product_id, date) 
				 DO UPDATE SET available_qty = EXCLUDED.available_qty, avg_cost = EXCLUDED.avg_cost, updated_at = EXCLUDED.updated_at`,
				stockParams
			);
		}
		
		// If paid_directly is true, create a payment record for the full amount
		if (paid_directly === true) {
			const totalAmountNum = parseFloat(String(total_amount));
			if (totalAmountNum > 0) {
				// Create payment record with full amount in USD
				await client.query(
					`INSERT INTO invoice_payments (invoice_id, paid_amount, currency_code, exchange_rate_on_payment, usd_equivalent_amount, payment_date, payment_method, notes, created_at) 
					 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
					[
						invoiceId,
						totalAmountNum, // paid_amount in USD
						'USD', // currency_code
						1.0, // exchange_rate_on_payment (1 USD = 1 USD)
						totalAmountNum, // usd_equivalent_amount
						invoiceTimestamp, // payment_date (same as invoice creation)
						'direct', // payment_method
						'Paid directly on invoice creation', // notes
						invoiceTimestamp // created_at
					]
				);
				
				// Update invoice payment status to 'paid'
				await client.query(
					'UPDATE invoices SET amount_paid = $1, payment_status = $2 WHERE id = $3',
					[totalAmountNum, 'paid', invoiceId]
				);
			}
		}
		
		await client.query('COMMIT');
		res.json({ id: invoiceId, invoice_date });
	} catch (err) {
		await client.query('ROLLBACK');
		console.error('Create invoice error:', err);
		res.status(500).json({ error: err.message });
	} finally {
		client.release();
	}
});

// ===== INVOICE PAYMENTS =====
// Get single invoice with payment details
router.get('/invoices/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		
		// Get invoice - using plain array params
		const invoiceResult = await query('SELECT * FROM invoices WHERE id = $1', [id]);
		if (invoiceResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Invoice not found' });
		}
		
		const invoice = invoiceResult.recordset[0];
		
		// Get payments (with currency information) - using plain array params
		const paymentsResult = await query(
			`SELECT id, invoice_id, paid_amount, currency_code, exchange_rate_on_payment, usd_equivalent_amount, 
			 payment_date, payment_method, notes, created_at 
			 FROM invoice_payments WHERE invoice_id = $1 ORDER BY payment_date DESC`,
			[id]
		);
		const payments = paymentsResult.recordset;
		
		// Calculate amount_paid from USD equivalents of all payments (for consistency)
		const totalPaidUsd = payments.reduce((sum, p) => {
			return sum + parseFloat(String(p.usd_equivalent_amount || 0));
		}, 0);
		
		// Get invoice items with product details - using plain array params
		const itemsResult = await query(
			`SELECT ii.*, p.name as product_name, p.barcode as product_barcode, p.sku as product_sku
			 FROM invoice_items ii
			 LEFT JOIN products p ON ii.product_id = p.id
			 WHERE ii.invoice_id = $1
			 ORDER BY ii.id`,
			[id]
		);
		const invoice_items = itemsResult.recordset;
		
		// Get customer/supplier details - using plain array params
		const customersResult = await query('SELECT * FROM customers WHERE id = $1', [invoice.customer_id || 0]);
		const suppliersResult = await query('SELECT * FROM suppliers WHERE id = $1', [invoice.supplier_id || 0]);
		
		// Convert DECIMAL strings to numbers
		const amountPaid = totalPaidUsd; // Use calculated USD equivalent total
		const totalAmount = parseFloat(String(invoice.total_amount || 0));
		const remainingBalance = totalAmount - amountPaid;
		// Calculate payment status based on amount_paid (always recalculate for consistency)
		let paymentStatus;
		if (amountPaid >= totalAmount) {
			paymentStatus = 'paid';
		} else if (amountPaid > 0) {
			paymentStatus = 'partial';
		} else {
			paymentStatus = 'pending';
		}
		
		const result = {
			...invoice,
			amount_paid: amountPaid,
			payment_status: paymentStatus,
			remaining_balance: remainingBalance,
			payments: payments,
			invoice_items: invoice_items,
			customers: customersResult.recordset[0] || undefined,
			suppliers: suppliersResult.recordset[0] || undefined,
		};
		
		res.json(result);
	} catch (err) {
		console.error('Get invoice error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get payment history for an invoice
router.get('/invoices/:id/payments', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const result = await query(
			`SELECT id, invoice_id, paid_amount, currency_code, exchange_rate_on_payment, usd_equivalent_amount, 
			 payment_date, payment_method, notes, created_at 
			 FROM invoice_payments WHERE invoice_id = $1 ORDER BY payment_date DESC`,
			[{ invoice_id: id }]
		);
		res.json(result.recordset);
	} catch (err) {
		console.error('Get payments error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Record a new payment
router.post('/invoices/:id/payments', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { paid_amount, currency_code, exchange_rate_on_payment, payment_method, notes } = req.body;
		
		// Validate required fields
		if (!paid_amount || paid_amount <= 0) {
			return res.status(400).json({ error: 'paid_amount must be greater than 0' });
		}
		
		if (!currency_code) {
			return res.status(400).json({ error: 'currency_code is required' });
		}
		
		const currency = currency_code.toUpperCase();
		if (!['USD', 'LBP', 'EUR'].includes(currency)) {
			return res.status(400).json({ error: 'Invalid currency_code. Must be USD, LBP, or EUR' });
		}
		
		if (!exchange_rate_on_payment || exchange_rate_on_payment <= 0) {
			return res.status(400).json({ error: 'exchange_rate_on_payment must be greater than 0' });
		}
		
		// Get invoice details
		const invoiceResult = await query('SELECT * FROM invoices WHERE id = $1', [{ id }]);
		if (invoiceResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Invoice not found' });
		}
		
		const invoice = invoiceResult.recordset[0];
		
		// Calculate USD equivalent
		// Exchange rate is stored as "1 USD = X currency", so USD equivalent = paid_amount / exchange_rate
		const paidAmount = parseFloat(String(paid_amount));
		const exchangeRateRaw = exchange_rate_on_payment;
		const exchangeRate = parseFloat(String(exchangeRateRaw));
		
		// Validate inputs
		if (isNaN(paidAmount) || paidAmount <= 0) {
			return res.status(400).json({ error: 'Invalid paid amount' });
		}
		if (isNaN(exchangeRate) || exchangeRate <= 0) {
			return res.status(400).json({ error: `Invalid exchange rate: ${exchangeRateRaw} (parsed as ${exchangeRate})` });
		}
		
		// Calculate USD equivalent
		// Exchange rate format: 1 USD = exchangeRate currency units
		// For USD: USD equivalent = paid amount (no conversion needed)
		// For other currencies: USD equivalent = paid_amount / exchange_rate
		// Example: 777755 LBP / 89500 = 8.69 USD
		let usdEquivalentAmount;
		if (currency === 'USD') {
			usdEquivalentAmount = paidAmount;
		} else {
			// Use division: USD equivalent = paid_amount / exchange_rate
			// Exchange rate format: 1 USD = exchangeRate currency units
			usdEquivalentAmount = Number(paidAmount) / Number(exchangeRate);
		}
		
		// Validate result
		if (isNaN(usdEquivalentAmount) || !isFinite(usdEquivalentAmount)) {
			return res.status(400).json({ error: 'Invalid USD equivalent calculation result' });
		}
		
		// Get current total paid amount (sum of all USD equivalents)
		const paymentsResult = await query(
			'SELECT COALESCE(SUM(usd_equivalent_amount), 0) as total_paid FROM invoice_payments WHERE invoice_id = $1',
			[{ invoice_id: id }]
		);
		const currentAmountPaid = parseFloat(String(paymentsResult.recordset[0]?.total_paid || 0));
		const totalAmount = parseFloat(String(invoice.total_amount || 0));
		const remainingBalance = totalAmount - currentAmountPaid;
		
		// Validate payment doesn't exceed remaining balance (use epsilon for floating point comparison)
		const epsilon = 0.01;
		if (usdEquivalentAmount > remainingBalance + epsilon) {
			return res.status(400).json({ 
				error: `Payment USD equivalent (${usdEquivalentAmount.toFixed(2)}) exceeds remaining balance (${remainingBalance.toFixed(2)})` 
			});
		}
		
		// Use current date/time for payment_date (not the invoice creation date)
		const payment_date = nowIso();
		const newAmountPaid = currentAmountPaid + usdEquivalentAmount;
		
		// Determine new payment status
		let newPaymentStatus = 'pending';
		if (newAmountPaid >= totalAmount) {
			newPaymentStatus = 'paid';
		} else if (newAmountPaid > 0) {
			newPaymentStatus = 'partial';
		}
		
		// Insert payment record
		const paymentResult = await query(
			`INSERT INTO invoice_payments (invoice_id, paid_amount, currency_code, exchange_rate_on_payment, usd_equivalent_amount, payment_date, payment_method, notes, created_at) 
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
			[
				{ invoice_id: id },
				{ paid_amount: paidAmount },
				{ currency_code: currency },
				{ exchange_rate_on_payment: exchangeRate },
				{ usd_equivalent_amount: usdEquivalentAmount },
				{ payment_date },
				{ payment_method: payment_method || null },
				{ notes: notes || null },
				{ created_at: nowIso() }
			]
		);
		const paymentId = paymentResult.recordset[0].id;
		
		// Update invoice amounts (using USD equivalents)
		await query(
			'UPDATE invoices SET amount_paid = $1, payment_status = $2 WHERE id = $3',
			[
				{ amount_paid: newAmountPaid },
				{ payment_status: newPaymentStatus },
				{ id }
			]
		);
		
		res.json({ 
			id: paymentId,
			invoice_id: id,
			amount_paid: newAmountPaid,
			remaining_balance: totalAmount - newAmountPaid,
			payment_status: newPaymentStatus
		});
	} catch (err) {
		console.error('Record payment error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Helper function to recalculate invoice payment status
async function recalculateInvoicePaymentStatus(invoiceId) {
	try {
		// Get invoice details
		const invoiceResult = await query('SELECT * FROM invoices WHERE id = $1', [{ id: invoiceId }]);
		if (invoiceResult.recordset.length === 0) {
			throw new Error('Invoice not found');
		}
		const invoice = invoiceResult.recordset[0];
		
		// Calculate total paid from all payments
		const paymentsResult = await query(
			'SELECT COALESCE(SUM(usd_equivalent_amount), 0) as total_paid FROM invoice_payments WHERE invoice_id = $1',
			[{ invoice_id: invoiceId }]
		);
		const totalPaid = parseFloat(String(paymentsResult.recordset[0]?.total_paid || 0));
		const totalAmount = parseFloat(String(invoice.total_amount || 0));
		
		// Determine payment status
		let paymentStatus = 'pending';
		if (totalPaid >= totalAmount) {
			paymentStatus = 'paid';
		} else if (totalPaid > 0) {
			paymentStatus = 'partial';
		}
		
		// Update invoice
		await query(
			'UPDATE invoices SET amount_paid = $1, payment_status = $2 WHERE id = $3',
			[
				{ amount_paid: totalPaid },
				{ payment_status: paymentStatus },
				{ id: invoiceId }
			]
		);
		
		return {
			amount_paid: totalPaid,
			payment_status: paymentStatus,
			remaining_balance: totalAmount - totalPaid
		};
	} catch (err) {
		console.error('Recalculate invoice payment status error:', err);
		throw err;
	}
}

// Update a payment
router.put('/invoices/:invoiceId/payments/:paymentId', async (req, res) => {
	try {
		const invoiceId = parseInt(req.params.invoiceId);
		const paymentId = parseInt(req.params.paymentId);
		const { paid_amount, currency_code, exchange_rate_on_payment, payment_method, notes, payment_date } = req.body;
		
		// Validate required fields
		if (!paid_amount || paid_amount <= 0) {
			return res.status(400).json({ error: 'paid_amount must be greater than 0' });
		}
		
		if (!currency_code) {
			return res.status(400).json({ error: 'currency_code is required' });
		}
		
		const currency = currency_code.toUpperCase();
		if (!['USD', 'LBP', 'EUR'].includes(currency)) {
			return res.status(400).json({ error: 'Invalid currency_code. Must be USD, LBP, or EUR' });
		}
		
		if (!exchange_rate_on_payment || exchange_rate_on_payment <= 0) {
			return res.status(400).json({ error: 'exchange_rate_on_payment must be greater than 0' });
		}
		
		// Get payment to verify it exists and belongs to the invoice
		const paymentResult = await query(
			'SELECT * FROM invoice_payments WHERE id = $1 AND invoice_id = $2',
			[{ id: paymentId }, { invoice_id: invoiceId }]
		);
		if (paymentResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Payment not found' });
		}
		
		// Get invoice details
		const invoiceResult = await query('SELECT * FROM invoices WHERE id = $1', [{ id: invoiceId }]);
		if (invoiceResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Invoice not found' });
		}
		const invoice = invoiceResult.recordset[0];
		
		// Calculate USD equivalent
		const paidAmount = parseFloat(String(paid_amount));
		const exchangeRate = parseFloat(String(exchange_rate_on_payment));
		
		let usdEquivalentAmount;
		if (currency === 'USD') {
			usdEquivalentAmount = paidAmount;
		} else {
			usdEquivalentAmount = Number(paidAmount) / Number(exchangeRate);
		}
		
		if (isNaN(usdEquivalentAmount) || !isFinite(usdEquivalentAmount)) {
			return res.status(400).json({ error: 'Invalid USD equivalent calculation result' });
		}
		
		// Get current total paid (excluding the payment being edited)
		const currentPaymentsResult = await query(
			'SELECT COALESCE(SUM(usd_equivalent_amount), 0) as total_paid FROM invoice_payments WHERE invoice_id = $1 AND id != $2',
			[{ invoice_id: invoiceId }, { id: paymentId }]
		);
		const currentAmountPaid = parseFloat(String(currentPaymentsResult.recordset[0]?.total_paid || 0));
		const totalAmount = parseFloat(String(invoice.total_amount || 0));
		const remainingBalance = totalAmount - currentAmountPaid;
		
		// Validate payment doesn't exceed remaining balance
		const epsilon = 0.01;
		if (usdEquivalentAmount > remainingBalance + epsilon) {
			return res.status(400).json({ 
				error: `Payment USD equivalent (${usdEquivalentAmount.toFixed(2)}) exceeds remaining balance (${remainingBalance.toFixed(2)})` 
			});
		}
		
		// Use provided payment_date or current date
		const paymentDate = payment_date || nowIso();
		
		// Update payment record
		await query(
			`UPDATE invoice_payments 
			 SET paid_amount = $1, currency_code = $2, exchange_rate_on_payment = $3, usd_equivalent_amount = $4, 
			     payment_date = $5, payment_method = $6, notes = $7
			 WHERE id = $8 AND invoice_id = $9`,
			[
				{ paid_amount: paidAmount },
				{ currency_code: currency },
				{ exchange_rate_on_payment: exchangeRate },
				{ usd_equivalent_amount: usdEquivalentAmount },
				{ payment_date: paymentDate },
				{ payment_method: payment_method || null },
				{ notes: notes || null },
				{ id: paymentId },
				{ invoice_id: invoiceId }
			]
		);
		
		// Recalculate invoice payment status
		const updatedStatus = await recalculateInvoicePaymentStatus(invoiceId);
		
		res.json({ 
			id: paymentId,
			invoice_id: invoiceId,
			amount_paid: updatedStatus.amount_paid,
			remaining_balance: updatedStatus.remaining_balance,
			payment_status: updatedStatus.payment_status
		});
	} catch (err) {
		console.error('Update payment error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Delete a payment
router.delete('/invoices/:invoiceId/payments/:paymentId', async (req, res) => {
	try {
		const invoiceId = parseInt(req.params.invoiceId);
		const paymentId = parseInt(req.params.paymentId);
		
		// Verify payment exists and belongs to the invoice
		const paymentResult = await query(
			'SELECT * FROM invoice_payments WHERE id = $1 AND invoice_id = $2',
			[{ id: paymentId }, { invoice_id: invoiceId }]
		);
		if (paymentResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Payment not found' });
		}
		
		// Delete payment
		await query(
			'DELETE FROM invoice_payments WHERE id = $1 AND invoice_id = $2',
			[{ id: paymentId }, { invoice_id: invoiceId }]
		);
		
		// Recalculate invoice payment status
		const updatedStatus = await recalculateInvoicePaymentStatus(invoiceId);
		
		res.json({ 
			success: true,
			id: paymentId,
			invoice_id: invoiceId,
			amount_paid: updatedStatus.amount_paid,
			remaining_balance: updatedStatus.remaining_balance,
			payment_status: updatedStatus.payment_status
		});
	} catch (err) {
		console.error('Delete payment error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get all payments across all invoices
router.get('/payments', async (req, res) => {
	try {
		const { invoice_id, start_date, end_date, currency_code } = req.query;
		
		let sql = `
			SELECT 
				ip.*,
				i.id as invoice_id,
				i.invoice_type,
				i.total_amount as invoice_total_amount,
				i.invoice_date,
				c.name as customer_name,
				s.name as supplier_name
			FROM invoice_payments ip
			INNER JOIN invoices i ON ip.invoice_id = i.id
			LEFT JOIN customers c ON i.customer_id = c.id
			LEFT JOIN suppliers s ON i.supplier_id = s.id
			WHERE 1=1
		`;
		const params = [];
		let paramIndex = 1;
		
		if (invoice_id) {
			sql += ` AND ip.invoice_id = $${paramIndex}`;
			params.push(parseInt(invoice_id));
			paramIndex++;
		}
		
		if (start_date) {
			sql += ` AND CAST(ip.payment_date AS DATE) >= $${paramIndex}`;
			params.push(start_date);
			paramIndex++;
		}
		
		if (end_date) {
			sql += ` AND CAST(ip.payment_date AS DATE) <= $${paramIndex}`;
			params.push(end_date);
			paramIndex++;
		}
		
		if (currency_code) {
			sql += ` AND ip.currency_code = $${paramIndex}`;
			params.push(currency_code.toUpperCase());
			paramIndex++;
		}
		
		sql += ` ORDER BY ip.payment_date DESC, ip.created_at DESC`;
		
		const result = await query(sql, params);
		res.json(result.recordset);
	} catch (err) {
		console.error('List payments error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== EXCHANGE RATES =====
// List all exchange rates
// Get exchange rates (admin only - for management)
router.get('/exchange-rates', authenticateToken, requireAdmin, async (req, res) => {
	try {
		const { currency_code, is_active } = req.query;
		let sql = 'SELECT * FROM exchange_rates WHERE 1=1';
		const params = [];
		
		if (currency_code) {
			sql += ' AND currency_code = $' + (params.length + 1);
			params.push({ currency_code });
		}
		
		if (is_active !== undefined) {
			sql += ' AND is_active = $' + (params.length + 1);
			params.push({ is_active: is_active === 'true' || is_active === true });
		}
		
		sql += ' ORDER BY currency_code, effective_date DESC';
		
		const result = await query(sql, params);
		res.json(result.recordset);
	} catch (err) {
		console.error('Get exchange rates error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get current active rate for a currency
router.get('/exchange-rates/:currency/rate', async (req, res) => {
	try {
		const currency = req.params.currency.toUpperCase();
		
		// Validate currency
		if (!['USD', 'LBP', 'EUR'].includes(currency)) {
			return res.status(400).json({ error: 'Invalid currency code. Must be USD, LBP, or EUR' });
		}
		
		// USD always has rate 1.0
		if (currency === 'USD') {
			return res.json({
				currency_code: 'USD',
				rate_to_usd: 1.0,
				effective_date: getTodayLocal(),
				is_active: true
			});
		}
		
		// Get most recent active rate for the currency
		const result = await query(
			`SELECT * FROM exchange_rates 
			 WHERE currency_code = $1 AND is_active = true 
			 ORDER BY effective_date DESC, created_at DESC 
			 LIMIT 1`,
			[{ currency_code: currency }]
		);
		
		if (result.recordset.length === 0) {
			return res.status(404).json({ error: `No active exchange rate found for ${currency}` });
		}
		
		res.json(result.recordset[0]);
	} catch (err) {
		console.error('Get exchange rate error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Create new exchange rate (admin only)
router.post('/exchange-rates', authenticateToken, requireAdmin, async (req, res) => {
	try {
		const { currency_code, rate_to_usd, effective_date, is_active } = req.body;
		
		// Validate required fields
		if (!currency_code || !rate_to_usd || !effective_date) {
			return res.status(400).json({ error: 'currency_code, rate_to_usd, and effective_date are required' });
		}
		
		const currency = currency_code.toUpperCase();
		
		// Validate currency
		if (!['USD', 'LBP', 'EUR'].includes(currency)) {
			return res.status(400).json({ error: 'Invalid currency_code. Must be USD, LBP, or EUR' });
		}
		
		// Validate rate
		const rate = parseFloat(String(rate_to_usd));
		if (isNaN(rate) || rate <= 0) {
			return res.status(400).json({ error: 'rate_to_usd must be a positive number' });
		}
		
		// Insert exchange rate
		const result = await query(
			`INSERT INTO exchange_rates (currency_code, rate_to_usd, effective_date, is_active, created_at, updated_at) 
			 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
			[
				{ currency_code: currency },
				{ rate_to_usd: rate },
				{ effective_date },
				{ is_active: is_active !== undefined ? (is_active === true || is_active === 'true') : true },
				{ created_at: nowIso() },
				{ updated_at: nowIso() }
			]
		);
		
		res.status(201).json(result.recordset[0]);
	} catch (err) {
		console.error('Create exchange rate error:', err);
		if (err.code === '23505') { // Unique constraint violation
			return res.status(400).json({ error: 'Exchange rate for this currency and date already exists' });
		}
		res.status(500).json({ error: err.message });
	}
});

// Update exchange rate (admin only)
router.put('/exchange-rates/:id', authenticateToken, requireAdmin, async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { currency_code, rate_to_usd, effective_date, is_active } = req.body;
		
		// Check if exchange rate exists
		const existingResult = await query('SELECT * FROM exchange_rates WHERE id = $1', [{ id }]);
		if (existingResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Exchange rate not found' });
		}
		
		const updates = [];
		const params = [];
		
		if (currency_code !== undefined) {
			const currency = currency_code.toUpperCase();
			if (!['USD', 'LBP', 'EUR'].includes(currency)) {
				return res.status(400).json({ error: 'Invalid currency_code. Must be USD, LBP, or EUR' });
			}
			updates.push(`currency_code = $${params.length + 1}`);
			params.push({ currency_code: currency });
		}
		
		if (rate_to_usd !== undefined) {
			const rate = parseFloat(String(rate_to_usd));
			if (isNaN(rate) || rate <= 0) {
				return res.status(400).json({ error: 'rate_to_usd must be a positive number' });
			}
			updates.push(`rate_to_usd = $${params.length + 1}`);
			params.push({ rate_to_usd: rate });
		}
		
		if (effective_date !== undefined) {
			updates.push(`effective_date = $${params.length + 1}`);
			params.push({ effective_date });
		}
		
		if (is_active !== undefined) {
			updates.push(`is_active = $${params.length + 1}`);
			params.push({ is_active: is_active === true || is_active === 'true' });
		}
		
		if (updates.length === 0) {
			return res.status(400).json({ error: 'No fields to update' });
		}
		
		updates.push(`updated_at = $${params.length + 1}`);
		params.push({ updated_at: nowIso() });
		
		params.push({ id });
		
		const sql = `UPDATE exchange_rates SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`;
		const result = await query(sql, params);
		
		res.json(result.recordset[0]);
	} catch (err) {
		console.error('Update exchange rate error:', err);
		if (err.code === '23505') { // Unique constraint violation
			return res.status(400).json({ error: 'Exchange rate for this currency and date already exists' });
		}
		res.status(500).json({ error: err.message });
	}
});

// Delete exchange rate (soft delete, admin only)
router.delete('/exchange-rates/:id', authenticateToken, requireAdmin, async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		
		// Check if exchange rate exists
		const existingResult = await query('SELECT * FROM exchange_rates WHERE id = $1', [{ id }]);
		if (existingResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Exchange rate not found' });
		}
		
		// Soft delete by setting is_active = false
		const result = await query(
			'UPDATE exchange_rates SET is_active = false, updated_at = $1 WHERE id = $2 RETURNING *',
			[{ updated_at: nowIso() }, { id }]
		);
		
		res.json(result.recordset[0]);
	} catch (err) {
		console.error('Delete exchange rate error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== INVENTORY =====
router.get('/inventory/low-stock/:threshold', async (req, res) => {
	try {
		const threshold = parseInt(req.params.threshold) || 10;
		const today = getTodayLocal();
		
		// Use JOIN to only get products for low stock items (more efficient)
		const result = await query(
			`SELECT 
				ds.*,
				p.id as product_id_val, p.name as product_name, p.barcode as product_barcode, p.category_id as product_category_id,
				p.description as product_description, p.sku as product_sku, p.shelf as product_shelf, p.created_at as product_created_at
			FROM daily_stock ds
			LEFT JOIN products p ON ds.product_id = p.id
			WHERE ds.date = $1 AND ds.available_qty < $2
			ORDER BY ds.available_qty ASC`, 
			[{ today }, { threshold }]
		);
		
		const formattedResult = result.recordset.map((row) => {
			const { product_id_val, product_name, product_barcode, product_category_id, product_description, 
				product_sku, product_shelf, product_created_at, ...stockData } = row;
			
			const products = product_id_val ? {
				id: product_id_val,
				name: product_name,
				barcode: product_barcode,
				category_id: product_category_id,
				description: product_description,
				sku: product_sku,
				shelf: product_shelf,
				created_at: product_created_at
			} : undefined;
			
			return {
				...stockData,
				products
			};
		});
		
		res.json(formattedResult);
	} catch (err) {
		console.error('Low stock error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.get('/inventory/daily', async (req, res) => {
	try {
		// Add pagination for performance
		const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
		const offset = Math.max(parseInt(req.query.offset) || 0, 0);
		
		// Optimized query with pagination
		const result = await query(
			`SELECT 
				ds.*,
				p.id as product_id_val, p.name as product_name, p.barcode as product_barcode, p.category_id as product_category_id,
				p.description as product_description, p.sku as product_sku, p.shelf as product_shelf, p.created_at as product_created_at
			FROM daily_stock ds
			LEFT JOIN products p ON ds.product_id = p.id
			ORDER BY ds.date DESC, ds.product_id ASC
			LIMIT $1 OFFSET $2`,
			[limit, offset]
		);
		
		const formattedResult = result.recordset.map((row) => {
			const { product_id_val, product_name, product_barcode, product_category_id, product_description, 
				product_sku, product_shelf, product_created_at, ...stockData } = row;
			
			const products = product_id_val ? {
				id: product_id_val,
				name: product_name,
				barcode: product_barcode,
				category_id: product_category_id,
				description: product_description,
				sku: product_sku,
				shelf: product_shelf,
				created_at: product_created_at
			} : undefined;
			
			return {
				...stockData,
				products
			};
		});
		
		res.json(formattedResult);
	} catch (err) {
		console.error('Daily inventory error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.get('/inventory/today', async (req, res) => {
	try {
		const today = getTodayLocal();
		
		// Use JOINs to get products and prices in one query (more efficient)
		const result = await query(
			`SELECT 
				ds.*,
				p.id as product_id_val, p.name as product_name, p.barcode as product_barcode, p.category_id as product_category_id,
				p.description as product_description, p.sku as product_sku, p.shelf as product_shelf, p.created_at as product_created_at,
				COALESCE(pp.wholesale_price, 0) as wholesale_price,
				COALESCE(pp.retail_price, 0) as retail_price
			FROM daily_stock ds
			LEFT JOIN products p ON ds.product_id = p.id
			LEFT JOIN LATERAL (
				SELECT wholesale_price, retail_price
				FROM product_prices
				WHERE product_id = ds.product_id
				ORDER BY effective_date DESC, created_at DESC
				LIMIT 1
			) pp ON true
			WHERE ds.date = $1
			ORDER BY ds.product_id ASC`,
			[{ date: today }]
		);
		
		const formattedResult = result.recordset.map((row) => {
			const { product_id_val, product_name, product_barcode, product_category_id, product_description, 
				product_sku, product_shelf, product_created_at, wholesale_price, retail_price, ...stockData } = row;
			
			const products = product_id_val ? {
				id: product_id_val,
				name: product_name,
				barcode: product_barcode,
				category_id: product_category_id,
				description: product_description,
				sku: product_sku,
				shelf: product_shelf,
				created_at: product_created_at,
				wholesale_price: wholesale_price || 0,
				retail_price: retail_price || 0
			} : undefined;
			
			return {
				...stockData,
				products
			};
		});
		
		res.json(formattedResult);
	} catch (err) {
		console.error('Today inventory error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.get('/inventory/daily-history', async (req, res) => {
	try {
		// Add pagination and date filtering for performance
		// Increase limit when filtering by date to ensure all records are returned
		const defaultLimit = 1000; // Increased default for date-filtered queries
		const limit = Math.min(parseInt(req.query.limit) || defaultLimit, 5000);
		const offset = Math.max(parseInt(req.query.offset) || 0, 0);
		const { start_date, end_date, search } = req.query;
		
		let sql = `SELECT 
				ds.*,
				p.id as product_id_val, p.name as product_name, p.barcode as product_barcode, p.category_id as product_category_id,
				p.description as product_description, p.sku as product_sku, p.shelf as product_shelf, p.created_at as product_created_at
			FROM daily_stock ds
			LEFT JOIN products p ON ds.product_id = p.id
			WHERE 1=1`;
		const params = [];
		let paramIndex = 0;
		
		// Optimize date filtering: use equality when start_date === end_date, otherwise use range
		// Cast to DATE to ensure proper comparison regardless of timezone
		if (start_date && end_date && start_date === end_date) {
			// Single date: use equality for better performance and accuracy
			paramIndex++;
			sql += ` AND ds.date = $${paramIndex}::DATE`;
			params.push(start_date);
		} else {
			// Date range: use >= and <= with proper date casting
			if (start_date) {
				paramIndex++;
				sql += ` AND ds.date >= $${paramIndex}::DATE`;
				params.push(start_date);
			}
			if (end_date) {
				paramIndex++;
				sql += ` AND ds.date <= $${paramIndex}::DATE`;
				params.push(end_date);
			}
		}
		
		// Add product search filter (name, barcode, SKU) - Performance optimized
		if (search && search.trim()) {
			const searchTerm = search.trim();
			const normalizedSearch = normalizeBarcodeOrSku(searchTerm) || '';
			const searchPattern = `%${searchTerm}%`; // For product name search (case-insensitive)
			const normalizedPattern = `%${normalizedSearch}%`; // For barcode/SKU (normalized, uppercase, no spaces)
			
			// Search in product name (case-insensitive) and normalized barcode/SKU
			// New data is stored normalized (uppercase, no spaces), so we check both direct match and REPLACE for old data
			paramIndex++;
			const nameParam = paramIndex;
			paramIndex++;
			const barcodeSkuNormalizedParam = paramIndex; // For normalized barcode/SKU match
			paramIndex++;
			const barcodeSkuReplaceParam = paramIndex; // For REPLACE() on old data with spaces
			
			sql += ` AND (
				p.name ILIKE $${nameParam}
				OR (p.barcode IS NOT NULL AND (REPLACE(p.barcode, ' ', '') ILIKE $${barcodeSkuNormalizedParam} OR p.barcode ILIKE $${barcodeSkuReplaceParam}))
				OR (p.sku IS NOT NULL AND (REPLACE(p.sku, ' ', '') ILIKE $${barcodeSkuNormalizedParam} OR p.sku ILIKE $${barcodeSkuReplaceParam}))
			)`;
			params.push(searchPattern, normalizedPattern, normalizedPattern);
		}
		
		sql += ` ORDER BY ds.date DESC, ds.product_id ASC LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}`;
		params.push(limit, offset);
		
		const result = await query(sql, params);
		
		const formattedResult = result.recordset.map((row) => {
			const { product_id_val, product_name, product_barcode, product_category_id, product_description, 
				product_sku, product_shelf, product_created_at, ...stockData } = row;
			
			const products = product_id_val ? {
				id: product_id_val,
				name: product_name,
				barcode: product_barcode,
				category_id: product_category_id,
				description: product_description,
				sku: product_sku,
				shelf: product_shelf,
				created_at: product_created_at
			} : undefined;
			
			return {
				...stockData,
				products
			};
		});
		
		res.json(formattedResult);
	} catch (err) {
		console.error('Daily history error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== STOCK MOVEMENTS =====
router.get('/stock-movements/recent/:limit', async (req, res) => {
	try {
		const limit = Math.min(parseInt(req.params.limit) || 20, 500); // Cap at 500 for performance
		const { start_date, end_date } = req.query;
		
		let sql = `SELECT 
				sm.*,
				p.id as product_id_val, p.name as product_name, p.barcode as product_barcode, p.category_id as product_category_id,
				p.description as product_description, p.sku as product_sku, p.shelf as product_shelf, p.created_at as product_created_at
			FROM stock_movements sm
			LEFT JOIN products p ON sm.product_id = p.id
			WHERE 1=1`;
		const params = [];
		let paramIndex = 0;
		
		if (start_date) {
			paramIndex++;
			sql += ` AND CAST(sm.invoice_date AS DATE) >= $${paramIndex}`;
			params.push(start_date);
		}
		if (end_date) {
			paramIndex++;
			sql += ` AND CAST(sm.invoice_date AS DATE) <= $${paramIndex}`;
			params.push(end_date);
		}
		
		sql += ` ORDER BY sm.invoice_date DESC, sm.created_at DESC LIMIT $${paramIndex + 1}`;
		params.push(limit);
		
		const result = await query(sql, params);
		
		const formattedResult = result.recordset.map((row) => {
			const { product_id_val, product_name, product_barcode, product_category_id, product_description, 
				product_sku, product_shelf, product_created_at, ...movementData } = row;
			
			const products = product_id_val ? {
				id: product_id_val,
				name: product_name,
				barcode: product_barcode,
				category_id: product_category_id,
				description: product_description,
				sku: product_sku,
				shelf: product_shelf,
				created_at: product_created_at
			} : undefined;
			
			return {
				...movementData,
				products
			};
		});
		
		res.json(formattedResult);
	} catch (err) {
		console.error('Recent stock movements error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== AVG COSTS FROM DAILY_STOCK =====
// Get today's average costs for all products
router.get('/daily-stock/today/avg-cost', async (req, res) => {
	try {
		const today = getTodayLocal();
		const result = await query(
			`SELECT product_id, available_qty, avg_cost
			 FROM daily_stock
			 WHERE date = $1
			 ORDER BY product_id`,
			[{ date: today }]
		);
		res.json(result.recordset);
	} catch (err) {
		console.error('Get today avg cost error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get all average costs (latest for each product)
router.get('/daily-stock/avg-costs/all', async (req, res) => {
	try {
		const today = getTodayLocal();
		const result = await query(
			`SELECT product_id, available_qty, avg_cost
			 FROM daily_stock
			 WHERE date = $1
			 ORDER BY product_id`,
			[{ date: today }]
		);
		
		// Convert to Record<string, number> format (product_id -> avg_cost)
		const costs = {};
		result.recordset.forEach(row => {
			costs[row.product_id.toString()] = parseFloat(row.avg_cost || 0);
		});
		res.json(costs);
	} catch (err) {
		console.error('Get all avg costs error:', err);
		res.status(500).json({ error: err.message });
	}
});

// List avg costs snapshots from daily_stock with optional filters
// By default returns only today's records (current/live costs), unless date filters are provided
router.get('/daily-stock/avg-costs', async (req, res) => {
    try {
        const { product_id, start_date, end_date } = req.query;
        const today = getTodayLocal();
        
        let sql = `
            SELECT ds.product_id,
                   ds.date,
                   ds.available_qty,
                   ds.avg_cost,
                   p.name as product_name,
                   p.barcode,
                   ds.created_at,
                   ds.updated_at
            FROM daily_stock ds
            LEFT JOIN products p ON p.id = ds.product_id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 0;

        if (product_id) { 
            paramIndex++;
            sql += ` AND ds.product_id = $${paramIndex}`; 
            params.push(parseInt(product_id)); 
        }
        
        // If no date filters provided, default to today only (live/current costs)
        if (!start_date && !end_date) {
            paramIndex++;
            sql += ` AND ds.date = $${paramIndex}`;
            params.push(today);
        } else {
            // If date filters are provided, use them
            if (start_date) { 
                paramIndex++;
                sql += ` AND ds.date >= $${paramIndex}`; 
                params.push(start_date); 
            }
            if (end_date) { 
                paramIndex++;
                sql += ` AND ds.date <= $${paramIndex}`; 
                params.push(end_date); 
            }
        }

        sql += ' ORDER BY p.name ASC, ds.date DESC, ds.updated_at DESC';

        const result = await query(sql, params);
        res.json(result.recordset);
    } catch (err) {
        console.error('List daily avg costs error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ===== PRODUCT PRICES =====
// Get products without any prices (for add price dialog)
router.get('/products/without-prices', async (req, res) => {
	try {
		// Get all products that don't have any prices - using plain array params
		const result = await query(
			`SELECT p.id, p.name, p.barcode, p.category_id, p.description, p.sku, p.shelf, p.created_at, c.name as category_name
			 FROM products p
			 LEFT JOIN categories c ON p.category_id = c.id
			 WHERE p.id NOT IN (SELECT DISTINCT product_id FROM product_prices WHERE product_id IS NOT NULL)
			 ORDER BY p.created_at DESC`,
			[]
		);
		res.json(result.recordset);
	} catch (err) {
		console.error('Get products without prices error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get all product prices with optional filters
router.get('/product-prices', async (req, res) => {
	try {
		const { product_id, start_date, end_date } = req.query;
		let sql = `
			SELECT pp.*, 
				   p.name as product_name,
				   p.barcode
			FROM product_prices pp
			LEFT JOIN products p ON pp.product_id = p.id
			WHERE 1=1
		`;
		const params = [];
		let paramIndex = 0;
		
		if (product_id) {
			paramIndex++;
			sql += ` AND pp.product_id = $${paramIndex}`;
			params.push(product_id);
		}
		if (start_date) {
			paramIndex++;
			sql += ` AND pp.effective_date >= $${paramIndex}`;
			params.push(start_date);
		}
		if (end_date) {
			paramIndex++;
			sql += ` AND pp.effective_date <= $${paramIndex}`;
			params.push(end_date);
		}
		
		sql += ' ORDER BY pp.effective_date DESC, pp.created_at DESC';
		
		const result = await query(sql, params);
		res.json(result.recordset);
	} catch (err) {
		console.error('List product prices error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get prices for a specific product
router.get('/products/:id/prices', [
	param('id').isInt().withMessage('Invalid product ID'),
], handleValidationErrors, async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		// Using plain array params
		const result = await query(
			`SELECT pp.*, p.name as product_name, p.barcode
			 FROM product_prices pp
			 LEFT JOIN products p ON pp.product_id = p.id
			 WHERE pp.product_id = $1
			 ORDER BY pp.effective_date DESC`,
			[id]
		);
		res.json(result.recordset);
	} catch (err) {
		console.error('Get product prices error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get latest price for a specific product
router.get('/products/:id/price-latest', [
	param('id').isInt().withMessage('Invalid product ID'),
], handleValidationErrors, async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		// Using plain array params
		const result = await query(
			`SELECT pp.*
			 FROM product_prices pp
			 WHERE pp.product_id = $1
			 ORDER BY pp.effective_date DESC, pp.created_at DESC
			 LIMIT 1`,
			[id]
		);
		res.json(result.recordset[0] || null);
	} catch (err) {
		console.error('Get latest product price error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get latest prices for all products
router.get('/product-prices/latest', async (req, res) => {
	try {
		// Optimized query using DISTINCT ON (PostgreSQL specific, faster than subquery)
		const result = await query(
			`SELECT DISTINCT ON (pp.product_id)
				pp.product_id, p.name, p.barcode, pp.wholesale_price, pp.retail_price, pp.effective_date
			 FROM product_prices pp
			 INNER JOIN products p ON pp.product_id = p.id
			 ORDER BY pp.product_id, pp.effective_date DESC, pp.created_at DESC`
		);
		res.json(result.recordset);
	} catch (err) {
		console.error('Get latest product prices error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Create product price
router.post('/product-prices', async (req, res) => {
	try {
		const { product_id, wholesale_price, retail_price, effective_date } = req.body;
		
		// Validate product_id exists
		const productId = parseInt(product_id);
		if (!productId || isNaN(productId)) {
			return res.status(400).json({ error: 'Invalid product_id' });
		}
		
		// Check if product exists
		const productCheck = await query('SELECT id FROM products WHERE id = $1', [{ id: productId }]);
		if (productCheck.recordset.length === 0) {
			return res.status(404).json({ error: `Product with id ${productId} does not exist` });
		}
		
		const result = await query(
			`INSERT INTO product_prices (product_id, wholesale_price, retail_price, effective_date, created_at)
			 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			[
				{ product_id: productId },
				{ wholesale_price },
				{ retail_price },
				{ effective_date: effective_date || getTodayLocal() },
				{ created_at: nowIso() }
			]
		);
		const id = result.recordset[0].id;
		res.json({ id });
	} catch (err) {
		console.error('Create product price error:', err);
		// Check if it's a foreign key constraint error
		if (err.code === '23503') {
			return res.status(404).json({ error: `Product with id ${product_id} does not exist` });
		}
		res.status(500).json({ error: err.message });
	}
});

// Update product price
router.put('/product-prices/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { wholesale_price, retail_price, effective_date } = req.body;
		const updates = [];
		const params = [{ id }];
		let paramIndex = 1;
		
		if (wholesale_price !== undefined) {
			updates.push(`wholesale_price = $${++paramIndex}`);
			params.push({ wholesale_price });
		}
		if (retail_price !== undefined) {
			updates.push(`retail_price = $${++paramIndex}`);
			params.push({ retail_price });
		}
		if (effective_date !== undefined) {
			updates.push(`effective_date = $${++paramIndex}`);
			params.push({ effective_date });
		}
		
		if (updates.length === 0) {
			return res.json({ id });
		}
		
		await query(`UPDATE product_prices SET ${updates.join(', ')} WHERE id = $1`, params);
		res.json({ id });
	} catch (err) {
		console.error('Update product price error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Delete product price
router.delete('/product-prices/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		await query('DELETE FROM product_prices WHERE id = $1', [{ id }]);
		res.json({ success: true });
	} catch (err) {
		console.error('Delete product price error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== CSV EXPORT =====
// Helper function to escape CSV values
function escapeCsvValue(value) {
	if (value === null || value === undefined) return '';
	const str = String(value);
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

// Helper function to convert data to CSV
function toCSV(data, headers) {
	if (!data || data.length === 0) {
		return headers.join(',') + '\n';
	}
	const rows = [headers.join(',')];
	for (const row of data) {
		const values = headers.map(h => escapeCsvValue(row[h] || ''));
		rows.push(values.join(','));
	}
	return rows.join('\n');
}

// Export products (requires authentication) - Excel format matching import template
router.get('/export/products', authenticateToken, async (req, res) => {
	try {
		// Check if categories table exists, if not, query without join
		let result;
		try {
			result = await query(
				'SELECT p.id, p.name, p.sku, p.barcode, p.shelf, p.description, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC',
				[]
			);
		} catch (joinErr) {
			// If join fails (categories table doesn't exist), query without category
			result = await query(
				'SELECT p.id, p.name, p.sku, p.barcode, p.shelf, p.description, NULL as category_name FROM products p ORDER BY p.created_at DESC',
				[]
			);
		}
		
		// Get latest prices for all products
		const pricesResult = await query(
			`SELECT DISTINCT ON (product_id) product_id, wholesale_price, retail_price
			 FROM product_prices
			 ORDER BY product_id, effective_date DESC, created_at DESC`,
			[]
		);
		
		// Create a map of product_id -> latest prices
		const pricesMap = new Map();
		pricesResult.recordset.forEach(row => {
			pricesMap.set(row.product_id, {
				wholesale_price: parseFloat(row.wholesale_price) || 0,
				retail_price: parseFloat(row.retail_price) || null
			});
		});
		
		// Prepare export data matching import template format
		// Import template columns: name, sku, barcode, description, category, wholesale_price, retail_price, shelf
		const exportRows = result.recordset.map(row => {
			const productId = row.id;
			const prices = pricesMap.get(productId) || { wholesale_price: 0, retail_price: null };
			
			return {
				name: row.name || '',
				sku: row.sku || '',
				barcode: row.barcode || '',
				description: row.description || '',
				category: row.category_name || '',
				wholesale_price: prices.wholesale_price || 0,
				retail_price: prices.retail_price || '',
				shelf: row.shelf || ''
			};
		});
		
		// Generate Excel file with exact column order matching import template
		// Column order: name, sku, barcode, description, category, wholesale_price, retail_price, shelf
		const worksheet = XLSX.utils.json_to_sheet(exportRows, {
			header: ['name', 'sku', 'barcode', 'description', 'category', 'wholesale_price', 'retail_price', 'shelf']
		});
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
		
		// Generate buffer
		const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
		
		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		res.setHeader('Content-Disposition', 'attachment; filename="products_export.xlsx"');
		res.send(excelBuffer);
	} catch (err) {
		console.error('Export products error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Export invoices (supports filtering by date range) - Excel format matching import template
router.get('/export/invoices', authenticateToken, async (req, res) => {
	try {
		const { startDate, endDate, invoice_type } = req.query;
		
		// Build the WHERE clause based on filters
		let whereClauses = [];
		let params = [];
		let paramIndex = 1;
		
		if (startDate) {
			whereClauses.push(`CAST(i.invoice_date AS DATE) >= $${paramIndex}`);
			params.push(startDate);
			paramIndex++;
		}
		
		if (endDate) {
			whereClauses.push(`CAST(i.invoice_date AS DATE) <= $${paramIndex}`);
			params.push(endDate);
			paramIndex++;
		}
		
		if (invoice_type) {
			whereClauses.push(`i.invoice_type = $${paramIndex}`);
			params.push(invoice_type);
			paramIndex++;
		}
		
		const whereClause = whereClauses.length > 0 
			? `WHERE ${whereClauses.join(' AND ')}`
			: '';
		
		// Fetch invoices with items, customers, suppliers, and products
		const invoicesQuery = `
			SELECT 
				i.id as invoice_id,
				i.invoice_type,
				i.invoice_date,
				i.due_date,
				i.payment_status,
				i.customer_id,
				i.supplier_id,
				ii.id as item_id,
				ii.product_id,
				ii.quantity,
				ii.unit_price,
				ii.is_private_price,
				ii.private_price_amount,
				ii.price_type,
				c.name as customer_name,
				s.name as supplier_name,
				p.barcode as product_barcode,
				p.sku as product_sku
			FROM invoices i
			INNER JOIN invoice_items ii ON ii.invoice_id = i.id
			LEFT JOIN customers c ON c.id = i.customer_id
			LEFT JOIN suppliers s ON s.id = i.supplier_id
			LEFT JOIN products p ON p.id = ii.product_id
			${whereClause}
			ORDER BY i.invoice_date DESC, i.id DESC
		`;
		
		const itemsResult = await query(invoicesQuery, params);
		
		// Get latest product prices for sell invoices to determine retail/wholesale
		const pricesResult = await query(
			`SELECT DISTINCT ON (pp.product_id)
				pp.product_id, pp.wholesale_price, pp.retail_price
			 FROM product_prices pp
			 ORDER BY pp.product_id, pp.effective_date DESC, pp.created_at DESC`,
			[]
		);
		const productPrices = new Map();
		pricesResult.recordset.forEach(price => {
			productPrices.set(price.product_id, {
				wholesale_price: parseFloat(price.wholesale_price) || 0,
				retail_price: parseFloat(price.retail_price) || 0
			});
		});
		
		// Build export data - one row per invoice item
		const exportRows = [];
		
		for (const row of itemsResult.recordset) {
			const invoiceType = row.invoice_type;
			const entityName = invoiceType === 'sell' 
				? (row.customer_name || '')
				: (row.supplier_name || '');
			
			// Determine unit_price for export
			let unitPriceExport;
			if (row.is_private_price) {
				// Private price: export the amount as number
				unitPriceExport = row.private_price_amount || 0;
			} else if (invoiceType === 'sell') {
				// For sell invoices: check if unit_price matches retail/wholesale from product_prices
				const prices = productPrices.get(row.product_id);
				if (prices) {
					const unitPrice = parseFloat(row.unit_price) || 0;
					const wholesalePrice = prices.wholesale_price;
					const retailPrice = prices.retail_price;
					
					// Match with tolerance for floating point comparison
					if (Math.abs(unitPrice - wholesalePrice) < 0.01) {
						unitPriceExport = 'wholesale';
					} else if (Math.abs(unitPrice - retailPrice) < 0.01) {
						unitPriceExport = 'retail';
					} else {
						// Doesn't match retail or wholesale, export as number
						unitPriceExport = unitPrice;
					}
				} else {
					// No prices found, export as number
					unitPriceExport = parseFloat(row.unit_price) || 0;
				}
			} else {
				// Buy invoice: unit_price is cost, export as number
				unitPriceExport = parseFloat(row.unit_price) || 0;
			}
			
			// Determine paid_directly: true if payment_status is 'paid' and amount_paid equals total
			// We'll need to check this, but for now we'll check payment_status
			const paidDirectly = row.payment_status === 'paid';
			
			// Format invoice_date as YYYY-MM-DD
			let invoiceDateStr = '';
			if (row.invoice_date) {
				const date = new Date(row.invoice_date);
				invoiceDateStr = date.toISOString().split('T')[0];
			}
			
			// Format due_date as YYYY-MM-DD (if exists)
			let dueDateStr = '';
			if (row.due_date) {
				const date = new Date(row.due_date);
				dueDateStr = date.toISOString().split('T')[0];
			}
			
			exportRows.push({
				invoice_type: invoiceType,
				invoice_date: invoiceDateStr,
				entity_name: entityName,
				due_date: dueDateStr || '',
				paid_directly: paidDirectly ? 'true' : 'false',
				product_barcode: (row.product_barcode != null && row.product_barcode !== '') ? String(row.product_barcode) : '',
				product_sku: (row.product_sku != null && row.product_sku !== '') ? String(row.product_sku) : '',
				quantity: row.quantity || 0,
				unit_price: unitPriceExport
			});
		}
		
		// Generate Excel file with exact column order matching import template
		// Column order: invoice_type, invoice_date, entity_name, due_date, paid_directly, product_barcode, product_sku, quantity, unit_price
		const worksheet = XLSX.utils.json_to_sheet(exportRows, {
			header: ['invoice_type', 'invoice_date', 'entity_name', 'due_date', 'paid_directly', 'product_barcode', 'product_sku', 'quantity', 'unit_price']
		});
		const workbook = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices');
		
		// Generate buffer
		const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
		
		// Generate filename with date range if applicable
		let filename = 'invoices_export.xlsx';
		if (startDate || endDate) {
			const dateStr = startDate && endDate 
				? `${startDate}_to_${endDate}`
				: startDate 
				? `from_${startDate}`
				: `until_${endDate}`;
			filename = `invoices_export_${dateStr}.xlsx`;
		}
		
		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
		res.send(excelBuffer);
	} catch (err) {
		console.error('Export invoices error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Export customers
router.get('/export/customers', async (req, res) => {
	try {
		const result = await query('SELECT id, name, phone, address, credit_limit, created_at FROM customers ORDER BY created_at DESC', []);
		const csv = toCSV(result.recordset, ['id', 'name', 'phone', 'address', 'credit_limit', 'created_at']);
		res.setHeader('Content-Type', 'text/csv');
		res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
		res.send(csv);
	} catch (err) {
		console.error('Export customers error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Export suppliers
router.get('/export/suppliers', async (req, res) => {
	try {
		const result = await query('SELECT id, name, phone, address, created_at FROM suppliers ORDER BY created_at DESC', []);
		const csv = toCSV(result.recordset, ['id', 'name', 'phone', 'address', 'created_at']);
		res.setHeader('Content-Type', 'text/csv');
		res.setHeader('Content-Disposition', 'attachment; filename="suppliers.csv"');
		res.send(csv);
	} catch (err) {
		console.error('Export suppliers error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Export inventory/stock
router.get('/export/inventory', async (req, res) => {
	try {
		const today = getTodayLocal();
		const result = await query(
			`SELECT p.id as product_id, p.name, p.sku, p.barcode, c.name as category_name, ds.available_qty, ds.avg_cost, ds.date
			 FROM daily_stock ds
			 LEFT JOIN products p ON ds.product_id = p.id
			 LEFT JOIN categories c ON p.category_id = c.id
			 WHERE ds.date = $1
			 ORDER BY p.name`,
			[{ today }]
		);
		const csv = toCSV(result.recordset, ['product_id', 'name', 'sku', 'barcode', 'category_name', 'available_qty', 'avg_cost', 'date']);
		res.setHeader('Content-Type', 'text/csv');
		res.setHeader('Content-Disposition', 'attachment; filename="inventory.csv"');
		res.send(csv);
	} catch (err) {
		console.error('Export inventory error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== ADMIN =====
// Health Check Endpoint (admin-only)
router.get('/admin/health', authenticateToken, requireAdmin, async (req, res) => {
	try {
		const startTime = Date.now();
		
		// Test database connection
		let dbStatus = 'disconnected';
		let dbResponseTime = 0;
		try {
			const dbStart = Date.now();
			await query('SELECT 1 AS test', []);
			dbResponseTime = Date.now() - dbStart;
			dbStatus = 'connected';
		} catch (dbErr) {
			dbStatus = 'error';
		}
		
		// Get last daily stock snapshot time
		let lastSnapshot = null;
		try {
			// Format the timestamp directly in SQL to return it as a string in Lebanon time
			// This avoids JavaScript Date object timezone interpretation issues
			const snapshotResult = await query(`
				SELECT TO_CHAR(MAX(created_at), 'YYYY-MM-DD HH24:MI:SS') as last_snapshot 
				FROM daily_stock 
				WHERE date = CURRENT_DATE
			`, []);
			lastSnapshot = snapshotResult.recordset[0]?.last_snapshot || null;
		} catch (err) {
			// Ignore if table doesn't exist yet
		}
		
		// Get system info
		const serverUptime = process.uptime();
		const memoryUsage = process.memoryUsage();
		
		const responseTime = Date.now() - startTime;
		
		res.json({
			status: 'ok',
			timestamp: lebanonTimeForLog(),
			database: {
				status: dbStatus,
				responseTime: `${dbResponseTime}ms`,
				host: process.env.PG_HOST || 'localhost',
				database: process.env.PG_DATABASE || 'invoicesystem'
			},
			server: {
				uptime: `${Math.floor(serverUptime)}s`,
				memory: {
					used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
					total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
				},
				nodeVersion: process.version,
				environment: process.env.NODE_ENV || 'development'
			},
			dailyStockSnapshot: {
				lastRun: lastSnapshot,
				scheduledTime: '00:00 (Asia/Beirut)'
			},
			responseTime: `${responseTime}ms`
		});
	} catch (error) {
		console.error('[Admin] Health check error:', error);
		res.status(500).json({
			status: 'error',
			error: error.message,
			timestamp: new Date().toISOString()
		});
	}
});

// Get supplier purchases breakdown (all-time totals per supplier)
router.get('/reports/supplier-purchases', authenticateToken, async (req, res) => {
	try {
		// Get all buy invoices grouped by supplier with totals
		const result = await query(
			`SELECT 
				s.id as supplier_id,
				s.name as supplier_name,
				COALESCE(SUM(i.total_amount), 0) as total_purchases,
				COUNT(i.id) as invoice_count
			FROM suppliers s
			LEFT JOIN invoices i ON i.supplier_id = s.id AND i.invoice_type = 'buy'
			GROUP BY s.id, s.name
			HAVING COALESCE(SUM(i.total_amount), 0) > 0
			ORDER BY total_purchases DESC`,
			[]
		);
		
		res.json(result.recordset.map(row => ({
			supplier_id: row.supplier_id,
			supplier_name: row.supplier_name,
			total_purchases: parseFloat(row.total_purchases) || 0,
			invoice_count: parseInt(row.invoice_count) || 0
		})));
	} catch (err) {
		console.error('Get supplier purchases error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get minimum invoice date for sell invoices
router.get('/reports/min-sell-date', authenticateToken, async (req, res) => {
	try {
		const result = await query(
			`SELECT MIN(CAST(invoice_date AS DATE)) as min_date
			FROM invoices
			WHERE invoice_type = 'sell'`,
			[]
		);
		
		const minDate = result.recordset[0]?.min_date;
		if (minDate) {
			// Format date as YYYY-MM-DD
			const date = new Date(minDate);
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			res.json({ min_date: `${year}-${month}-${day}` });
		} else {
			// No sell invoices found, return today's date as fallback
			const today = getTodayLocal();
			res.json({ min_date: today });
		}
	} catch (err) {
		console.error('Get min sell date error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get customer sales breakdown (all-time totals per customer)
router.get('/reports/customer-sales', authenticateToken, async (req, res) => {
	try {
		// Get all sell invoices grouped by customer with totals
		const result = await query(
			`SELECT 
				c.id as customer_id,
				c.name as customer_name,
				COALESCE(SUM(i.total_amount), 0) as total_sales,
				COUNT(i.id) as invoice_count
			FROM customers c
			LEFT JOIN invoices i ON i.customer_id = c.id AND i.invoice_type = 'sell'
			GROUP BY c.id, c.name
			HAVING COALESCE(SUM(i.total_amount), 0) > 0
			ORDER BY total_sales DESC`,
			[]
		);
		
		res.json(result.recordset.map(row => ({
			customer_id: row.customer_id,
			customer_name: row.customer_name,
			total_sales: parseFloat(row.total_sales) || 0,
			invoice_count: parseInt(row.invoice_count) || 0
		})));
	} catch (err) {
		console.error('Get customer sales error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Reports: Get net profit using stored procedure

router.get('/reports/net-profit', async (req, res) => {
	try {
		const { start_date, end_date } = req.query;
		
		if (!start_date || !end_date) {
			return res.status(400).json({ error: 'start_date and end_date are required' });
		}
		
		// Validate dates
		const startDate = new Date(start_date);
		const endDate = new Date(end_date);
		
		if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
			return res.status(400).json({ error: 'Invalid date format' });
		}
		
		// Call stored procedure
		const result = await query(
			'SELECT * FROM get_net_profit($1, $2)',
			[start_date, end_date]
		);
		
		if (result.recordset.length === 0) {
			return res.json({
				net_profit: 0,
				total_revenue: 0,
				total_cost: 0
			});
		}
		
		const data = result.recordset[0];
		const netProfit = parseFloat(data.net_profit);
		const totalRevenue = parseFloat(data.total_revenue);
		const totalCost = parseFloat(data.total_cost);
		
		res.json({
			net_profit: isNaN(netProfit) ? 0 : netProfit,
			total_revenue: isNaN(totalRevenue) ? 0 : totalRevenue,
			total_cost: isNaN(totalCost) ? 0 : totalCost
		});
	} catch (err) {
		console.error('Get net profit error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Admin: Recompute positions
router.post('/admin/recompute-positions', authenticateToken, requireAdmin, async (req, res) => {
	try {
		const { product_id } = req.body;
		
		// Validate product_id if provided
		let productIdParam = null;
		if (product_id !== null && product_id !== undefined && product_id !== '') {
			const parsedId = parseInt(product_id);
			if (isNaN(parsedId)) {
				return res.status(400).json({ error: 'Invalid product_id. Must be a number.' });
			}
			productIdParam = parsedId;
		}
		
		// Call the stored procedure
		const sql = productIdParam !== null 
			? 'SELECT sp_recompute_positions($1);'
			: 'SELECT sp_recompute_positions(NULL);';
		
		const params = productIdParam !== null ? [productIdParam] : [];
		
		await query(sql, params);
		
		const message = productIdParam !== null
			? `Positions recomputed successfully for product ID ${productIdParam}`
			: 'Positions recomputed successfully for all products';
		
		res.json({ 
			success: true, 
			message,
			product_id: productIdParam
		});
	} catch (err) {
		console.error('Recompute positions error:', err);
		res.status(500).json({ 
			error: err.message || 'Failed to recompute positions',
			details: process.env.NODE_ENV === 'development' ? err.stack : undefined
		});
	}
});

router.post('/admin/init', authenticateToken, requireAdmin, async (req, res) => {
	try {
		console.log(`[Admin] Manual database initialization requested at ${lebanonTimeForLog()} (Lebanon time)`);
		
		// Test database connection first
		try {
			await query('SELECT 1 AS test', []);
		} catch (connErr) {
			return res.status(500).json({ 
				error: 'Database connection failed', 
				details: connErr.message 
			});
		}
		
		// Run initialization
		const { runInit } = require('../sql/runInit');
		const result = await runInit();
		
		if (result?.ok) {
			console.log(`[Admin] Initialization completed: ${result.batches}/${result.total} tables/migrations processed`);
			res.json({
				success: true,
				message: 'Database initialization completed successfully',
				details: {
					processed: result.batches,
					total: result.total,
					errors: result.errors || 0
				}
			});
		} else {
			console.error('[Admin] Initialization failed:', result?.errorDetails);
			res.status(500).json({
				success: false,
				error: 'Database initialization failed',
				details: result?.errorDetails || 'Unknown error'
			});
		}
	} catch (err) {
		console.error('[Admin] Initialization error:', err);
		res.status(500).json({ 
			success: false,
			error: 'Database initialization error', 
			details: err.message 
		});
	}
});

// Manual trigger for seed data (categories, products, prices, customers, suppliers - NO invoices)
router.post('/admin/seed-master-data', authenticateToken, requireAdmin, async (req, res) => {
	try {
		console.log(`[Admin] Manual seed data requested at ${lebanonTimeForLog()} (Lebanon time)`);
		
		// Import and run the seed script function
		const { seedData } = require('../scripts/seed_data');
		
		// Run the seed script
		await seedData();
		
		console.log(`[Admin] ✓ Seed data completed successfully at ${lebanonTimeForLog()} (Lebanon time)`);
		
		res.json({
			success: true,
			message: 'Seed data completed successfully. All master data (categories, products, prices, customers, suppliers) seeded. No invoices created.',
		});
		
	} catch (err) {
		console.error('[Admin] Seed data error:', err);
		res.status(500).json({ 
			success: false,
			error: 'Seed script failed', 
			details: err.message 
		});
	}
});

// Clear transactions only (keep entities)
router.post('/admin/clear-transactions-only', authenticateToken, requireAdmin, async (req, res) => {
	try {
		console.log(`[Admin] Clear transactions only requested at ${lebanonTimeForLog()} (Lebanon time)`);
		
		// Import and run the clear function
		const { clearTransactionsOnly } = require('../scripts/clear_data');
		
		// Run the clear function
		const result = await clearTransactionsOnly();
		
		console.log(`[Admin] ✓ Clear transactions completed successfully at ${lebanonTimeForLog()} (Lebanon time)`);
		
		res.json({
			success: true,
			message: result.message || 'Transactions cleared successfully. Entities (categories, products, customers, suppliers) preserved.',
		});
		
	} catch (err) {
		console.error('[Admin] Clear transactions error:', err);
		res.status(500).json({ 
			error: err.message || 'Failed to clear transactions',
			details: process.env.NODE_ENV === 'development' ? err.stack : undefined
		});
	}
});

// Clear everything (fresh start)
router.post('/admin/clear-everything', authenticateToken, requireAdmin, async (req, res) => {
	try {
		console.log(`[Admin] Clear everything requested at ${lebanonTimeForLog()} (Lebanon time)`);
		
		// Import and run the clear function
		const { clearEverything } = require('../scripts/clear_data');
		
		// Run the clear function
		const result = await clearEverything();
		
		console.log(`[Admin] ✓ Clear everything completed successfully at ${lebanonTimeForLog()} (Lebanon time)`);
		
		res.json({
			success: true,
			message: result.message || 'All data cleared successfully. Fresh start ready.',
		});
		
	} catch (err) {
		console.error('[Admin] Clear everything error:', err);
		res.status(500).json({ 
			error: err.message || 'Failed to clear data',
			details: process.env.NODE_ENV === 'development' ? err.stack : undefined
		});
	}
});

// Manual trigger for daily stock snapshot
router.post('/admin/daily-stock-snapshot', authenticateToken, requireAdmin, async (req, res) => {
	try {
		console.log(`[Admin] Manual daily stock snapshot requested at ${lebanonTimeForLog()} (Lebanon time)`);
		
		const startTime = lebanonTimeForLog();
		const todayLebanon = getTodayLocal();
		console.log(`[Admin] Running daily stock snapshot at ${startTime} (Lebanon time)`);
		console.log(`[Admin] Today (Lebanon time): ${todayLebanon}`);
		
		// Set timezone to Lebanon for this session so CURRENT_DATE in the function uses Lebanon time
		await query('SET TIMEZONE = \'Asia/Beirut\';', []);
		
		// Call the stored procedure - for VOID functions in PostgreSQL, we use SELECT
		const result = await query('SELECT sp_daily_stock_snapshot();', []);
		
		// Get count of records created today to verify
		const checkResult = await query(
			'SELECT COUNT(*) as count FROM daily_stock WHERE date = $1',
			[{ date: todayLebanon }]
		);
		const recordsCreated = checkResult.recordset[0]?.count || 0;
		
		// Get total products count for reference
		const productsResult = await query('SELECT COUNT(*) as count FROM products', []);
		const totalProducts = productsResult.recordset[0]?.count || 0;
		
		const endTime = lebanonTimeForLog();
		console.log(`[Admin] ✓ Daily stock snapshot completed successfully at ${endTime} (Lebanon time)`);
		console.log(`[Admin] Records found for ${todayLebanon}: ${recordsCreated} out of ${totalProducts} products`);
		
		res.json({
			success: true,
			message: `Daily stock snapshot completed successfully. ${recordsCreated} record(s) found for today (${totalProducts} total products).`,
			started_at: startTime,
			completed_at: endTime,
			records_created: recordsCreated,
			total_products: totalProducts,
			date: todayLebanon
		});
	} catch (error) {
		console.error('[Admin] ✗ Error running daily stock snapshot:', error.message);
		if (error.stack) {
			console.error('[Admin] Stack:', error.stack);
		}
		res.status(500).json({
			success: false,
			error: 'Failed to run daily stock snapshot',
			details: error.message,
			stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
		});
	}
});

// Admin: List all users
router.get('/admin/users', authenticateToken, requireAdmin, async (req, res) => {
	try {
		const result = await query('SELECT id, email, is_admin, created_at FROM users ORDER BY created_at DESC', []);
		res.json(result.recordset);
	} catch (err) {
		console.error('[Admin] List users error:', err);
		res.status(500).json({ error: err.message });
	}
});

// One-time endpoint to set first user as admin (for production setup)
// Only works if no admin exists - safe to call multiple times
router.post('/admin/setup-first-admin', async (req, res) => {
	try {
		// Check if any admin exists
		const adminCheck = await query('SELECT COUNT(*) as admin_count FROM users WHERE is_admin = true', []);
		const adminCount = adminCheck.recordset[0]?.admin_count || 0;
		
		if (adminCount > 0) {
			return res.json({ 
				success: true, 
				message: 'Admin already exists. No action needed.',
				adminCount 
			});
		}
		
		// Check if users table has is_admin column
		const columnCheck = await query(`
			SELECT column_name 
			FROM information_schema.columns 
			WHERE table_name = 'users' AND column_name = 'is_admin'
		`, []);
		
		if (columnCheck.recordset.length === 0) {
			// Add is_admin column if it doesn't exist
			await query('ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false', []);
		}
		
		// Get first user (lowest ID)
		const firstUserResult = await query('SELECT id, email FROM users ORDER BY id ASC LIMIT 1', []);
		
		if (firstUserResult.recordset.length === 0) {
			return res.status(400).json({ 
				error: 'No users found. Please create a user account first.' 
			});
		}
		
		const firstUser = firstUserResult.recordset[0];
		
		// Set first user as admin
		await query('UPDATE users SET is_admin = true WHERE id = $1', [{ id: firstUser.id }]);
		
		console.log(`[Setup] First user set as admin: ${firstUser.email} (ID: ${firstUser.id})`);
		
		res.json({ 
			success: true, 
			message: `First user (${firstUser.email}) has been set as admin`,
			userId: firstUser.id,
			email: firstUser.email
		});
	} catch (err) {
		console.error('[Setup] Set first admin error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Admin: Clear all users (WARNING: This will delete ALL users EXCEPT the first admin)
router.post('/admin/users/clear', authenticateToken, requireAdmin, async (req, res) => {
	try {
		// Get first admin (lowest ID admin) to protect
		const firstAdminResult = await query('SELECT id, email FROM users WHERE is_admin = true ORDER BY id ASC LIMIT 1', []);
		
		if (firstAdminResult.recordset.length === 0) {
			return res.status(400).json({ 
				error: 'Cannot clear users: No admin found. At least one admin must exist.' 
			});
		}
		
		const firstAdmin = firstAdminResult.recordset[0];
		const firstAdminId = firstAdmin.id;
		
		// Get total user count before deletion
		const countResult = await query('SELECT COUNT(*) as count FROM users', []);
		const totalCount = parseInt(countResult.recordset[0]?.count || 0);
		
		// Delete all users EXCEPT the first admin
		await query('DELETE FROM users WHERE id != $1', [firstAdminId]);
		
		const deletedCount = totalCount - 1; // Subtract 1 for the first admin that was kept
		
		console.log(`[Admin] ${deletedCount} user(s) cleared from database (first admin ${firstAdmin.email} preserved)`);
		
		res.json({ 
			success: true, 
			message: `${deletedCount} user(s) cleared. First admin (${firstAdmin.email}) has been preserved.` 
		});
	} catch (err) {
		console.error('[Admin] Clear users error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Admin: Delete user
router.delete('/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
	try {
		const userId = parseInt(req.params.id);
		
		if (isNaN(userId)) {
			return res.status(400).json({ error: 'Invalid user ID' });
		}
		
		// Prevent deleting yourself
		if (userId === req.user.userId) {
			return res.status(400).json({ error: 'Cannot delete yourself' });
		}
		
		// Check if user exists and get admin status
		const userCheck = await query('SELECT id, email, is_admin FROM users WHERE id = $1', [{ id: userId }]);
		if (userCheck.recordset.length === 0) {
			return res.status(404).json({ error: 'User not found' });
		}
		
		const user = userCheck.recordset[0];
		
		// Prevent deleting the first admin (user with lowest ID)
		// The first admin is the original admin created in the system and should always remain
		const firstAdminResult = await query('SELECT id, email FROM users WHERE is_admin = true ORDER BY id ASC LIMIT 1', []);
		if (firstAdminResult.recordset.length > 0) {
			const firstAdmin = firstAdminResult.recordset[0];
			if (userId === firstAdmin.id) {
				return res.status(400).json({ error: 'Cannot delete the first admin user. The first admin must always remain in the system.' });
			}
		}
		
		// Delete the user
		await query('DELETE FROM users WHERE id = $1', [{ id: userId }]);
		
		console.log(`[Admin] User deleted: ${user.email} (ID: ${userId})`);
		
		res.json({ 
			success: true, 
			message: `User ${user.email} has been deleted successfully.` 
		});
	} catch (err) {
		console.error('[Admin] Delete user error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Admin: Update user admin status
router.put('/admin/users/:id/admin', authenticateToken, requireAdmin, async (req, res) => {
	try {
		const userId = parseInt(req.params.id);
		const { isAdmin } = req.body;
		
		if (isNaN(userId)) {
			return res.status(400).json({ error: 'Invalid user ID' });
		}
		
		if (typeof isAdmin !== 'boolean') {
			return res.status(400).json({ error: 'isAdmin must be a boolean' });
		}
		
		// Prevent removing admin from yourself
		if (userId === req.user.userId && isAdmin === false) {
			return res.status(400).json({ error: 'Cannot remove admin status from yourself' });
		}
		
		// Prevent removing admin status from the first admin (user with lowest ID)
		// The first admin is the original admin created in the system and should always remain admin
		if (isAdmin === false) {
			const firstAdminResult = await query('SELECT id, email FROM users WHERE is_admin = true ORDER BY id ASC LIMIT 1', []);
			if (firstAdminResult.recordset.length > 0) {
				const firstAdmin = firstAdminResult.recordset[0];
				if (userId === firstAdmin.id) {
					return res.status(400).json({ error: 'Cannot remove admin status from the first admin user. The first admin must always remain as admin.' });
				}
			}
		}
		
		// Check if user exists
		const userCheck = await query('SELECT id, email FROM users WHERE id = $1', [{ id: userId }]);
		if (userCheck.recordset.length === 0) {
			return res.status(404).json({ error: 'User not found' });
		}
		
		// Update admin status
		await query('UPDATE users SET is_admin = $1 WHERE id = $2', [{ is_admin: isAdmin }, { id: userId }]);
		
		console.log(`[Admin] User ${userCheck.recordset[0].email} admin status set to ${isAdmin}`);
		
		res.json({ 
			success: true, 
			message: `User admin status ${isAdmin ? 'granted' : 'revoked'}`,
			user: {
				id: userId,
				email: userCheck.recordset[0].email,
				isAdmin
			}
		});
	} catch (err) {
		console.error('[Admin] Update user admin status error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== EXCEL IMPORT =====
// Configure multer for file uploads (memory storage)
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		fileSize: 10 * 1024 * 1024 // 10MB limit
	},
	fileFilter: (req, file, cb) => {
		// Accept Excel files
		const allowedMimes = [
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
			'application/vnd.ms-excel', // .xls
			'application/octet-stream' // Sometimes Excel files are sent as this
		];
		if (allowedMimes.includes(file.mimetype) || 
			file.originalname.endsWith('.xlsx') || 
			file.originalname.endsWith('.xls')) {
			cb(null, true);
		} else {
			cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'));
		}
	}
});

// Excel import preview endpoint - analyzes file and returns what would be created/updated
router.post('/products/import-excel-preview',
	authenticateToken, 
	requireAdmin, 
	fileUploadLimiter, 
	upload.single('file'),
	validateFileUpload,
	sanitizeInput,
	async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: 'No file uploaded' });
		}

		// Parse Excel file
		const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
		const sheetName = workbook.SheetNames[0]; // Use first sheet
		const worksheet = workbook.Sheets[sheetName];
		
		// Convert to JSON array
		const data = XLSX.utils.sheet_to_json(worksheet, { 
			raw: false, // Convert all values to strings for consistency
			defval: '' // Default value for empty cells
		});

		if (!data || data.length === 0) {
			return res.status(400).json({ error: 'Excel file is empty or has no data' });
		}

		// Normalize column names (case-insensitive, trim whitespace)
		const normalizeKey = (key) => {
			if (!key) return '';
			return String(key).trim().toLowerCase().replace(/\s+/g, '_');
		};

		// Map Excel columns to database fields
		const columnMappings = {
			sku: ['oem', 'oem_no', 'oem no', 'oem no.', 'item', 'sku', 'product_code', 'code'],
			name: ['english name', 'english_name', 'name', 'product name', 'product_name', 'description', 'desc'],
			description: ['desc', 'description', 'chinese name', 'chinese_name'],
			barcode: ['barcode', 'barcode_no', 'barcode no'],
			category: ['category', 'category_name'],
			wholesale_price: ['wholesale_price', 'wholesale price', 'wholesale retail price', 'wholesaleretailprice', 'wholesaleprice', 'wholesale', 'unit price', 'unit_price', 'unitprice', 'price', 'price (rmb)', 'price(rmb)'],
			retail_price: ['retail_price', 'retail price', 'retail'],
			shelf: ['shelf', 'shelf_location', 'location']
		};

		// Find column indices
		const findColumn = (row, mappings) => {
			for (const key in row) {
				const normalized = normalizeKey(key);
				for (const mapping of mappings) {
					if (normalized === normalizeKey(mapping)) {
						return key; // Return original key to access the value
					}
				}
			}
			return null;
		};

		const firstRow = data[0];
		const columnMap = {};
		for (const [dbField, excelColumns] of Object.entries(columnMappings)) {
			const found = findColumn(firstRow, excelColumns);
			if (found) {
				columnMap[dbField] = found;
			}
		}

		// Validate required columns
		if (!columnMap.name && !columnMap.sku) {
			return res.status(400).json({ 
				error: 'Excel file must contain at least one of: Name/English Name or SKU/OEM/OEM NO./ITEM column',
				availableColumns: Object.keys(firstRow),
				detectedColumns: columnMap
			});
		}

		// Get existing products to check for matches (with category names)
		const existingProductsResult = await query(
			'SELECT p.id, p.name, p.barcode, p.sku, p.category_id, p.description, p.shelf, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id',
			[]
		);
		const existingProducts = new Map();
		existingProductsResult.recordset.forEach(product => {
			const normalizedBarcode = normalizeBarcodeOrSku(product.barcode);
			const normalizedSku = normalizeBarcodeOrSku(product.sku);
			// Store by barcode if available (priority match)
			if (normalizedBarcode) {
				existingProducts.set(`barcode:${normalizedBarcode}`, product);
			}
			// Store by SKU if available (for cases where barcode is null in import)
			if (normalizedSku) {
				existingProducts.set(`sku:${normalizedSku}`, product);
			}
		});

		const newProducts = [];
		const existingProductsToUpdate = [];
		const errors = [];

		// Process each row
		for (let i = 0; i < data.length; i++) {
			const row = data[i];
			const rowNum = i + 2; // +2 because Excel rows start at 1 and we have header

			try {
				// Extract values
				const skuRaw = columnMap.sku ? String(row[columnMap.sku] || '').trim() : '';
				const nameRaw = columnMap.name ? String(row[columnMap.name] || '').trim() : '';
				const descriptionRaw = columnMap.description ? String(row[columnMap.description] || '').trim() : null;
				const barcodeRaw = columnMap.barcode ? String(row[columnMap.barcode] || '').trim() : null;
				const categoryName = columnMap.category ? String(row[columnMap.category] || '').trim() : null;
				// Parse prices - only if column exists and value is not empty
				const wholesalePriceRaw = columnMap.wholesale_price ? String(row[columnMap.wholesale_price] || '').trim() : '';
				const retailPriceRaw = columnMap.retail_price ? String(row[columnMap.retail_price] || '').trim() : '';
				const wholesalePrice = wholesalePriceRaw ? (parseFloat(wholesalePriceRaw.replace(/[^0-9.-]/g, '')) || 0) : 0;
				const retailPrice = retailPriceRaw ? (parseFloat(retailPriceRaw.replace(/[^0-9.-]/g, '')) || null) : null;
				const shelf = columnMap.shelf ? String(row[columnMap.shelf] || '').trim() : null;

				// Normalize barcode and SKU
				const normalizedBarcode = normalizeBarcodeOrSku(barcodeRaw);
				const normalizedSku = normalizeBarcodeOrSku(skuRaw);
				const name = nameRaw || null;

				// Skip empty rows
				if (!name && !normalizedSku) {
					continue;
				}

				const productName = name || normalizedSku || 'Imported Product';
				const productSku = normalizedSku;

				// Check if product already exists
				let existingProduct = null;
				if (normalizedBarcode) {
					existingProduct = existingProducts.get(`barcode:${normalizedBarcode}`);
				}
				if (!existingProduct && productSku) {
					existingProduct = existingProducts.get(`sku:${productSku}`);
				}

				const productData = {
					row: rowNum,
					name: productName,
					sku: productSku,
					barcode: normalizedBarcode,
					description: descriptionRaw || null,
					category: categoryName || null,
					wholesale_price: wholesalePrice || 0,
					retail_price: retailPrice || null,
					shelf: shelf || null,
				};

				if (existingProduct) {
					// Get existing prices for comparison
					const existingPricesResult = await query(
						`SELECT DISTINCT ON (product_id) wholesale_price, retail_price 
						 FROM product_prices 
						 WHERE product_id = $1 
						 ORDER BY product_id, effective_date DESC, created_at DESC 
						 LIMIT 1`,
						[existingProduct.id]
					);
					const existingPrices = existingPricesResult.recordset[0] || { wholesale_price: 0, retail_price: 0 };
					const existingWholesalePrice = parseFloat(existingPrices.wholesale_price) || 0;
					const existingRetailPrice = parseFloat(existingPrices.retail_price) || 0;
					
					// Normalize values for comparison
					const existingBarcodeNormalized = normalizeBarcodeOrSku(existingProduct.barcode);
					const existingSkuNormalized = normalizeBarcodeOrSku(existingProduct.sku);
					const existingDescription = existingProduct.description || null;
					const existingCategory = existingProduct.category_name || null;
					const existingShelf = existingProduct.shelf || null;
					
					// Normalize import values
					const importDescription = descriptionRaw || null;
					const importCategory = categoryName || null;
					const importShelf = shelf || null;
					
					// Check if prices were provided in import (non-empty values)
					const hasWholesalePriceInImport = wholesalePriceRaw && wholesalePriceRaw.trim() !== '';
					const hasRetailPriceInImport = retailPriceRaw && retailPriceRaw.trim() !== '';
					
					// Check if there are any changes (including prices and barcode)
					// Compare normalized barcodes and SKUs, and normalize null/empty strings
					// Only compare prices if they were provided in the import
					const hasChanges = 
						productName !== existingProduct.name ||
						productSku !== existingSkuNormalized ||
						normalizedBarcode !== existingBarcodeNormalized ||
						importCategory !== existingCategory ||
						importDescription !== existingDescription ||
						importShelf !== existingShelf ||
						(hasWholesalePriceInImport && Math.abs(wholesalePrice - existingWholesalePrice) > 0.01) ||
						(hasRetailPriceInImport && Math.abs((retailPrice || 0) - existingRetailPrice) > 0.01);
					
					// Only add to update list if there are changes
					if (hasChanges) {
						existingProductsToUpdate.push({
							...productData,
							existing_id: existingProduct.id,
							existing_name: existingProduct.name,
							existing_sku: existingProduct.sku,
							existing_barcode: existingProduct.barcode,
							existing_category_id: existingProduct.category_id,
							existing_category_name: existingProduct.category_name,
							existing_description: existingProduct.description,
							existing_shelf: existingProduct.shelf,
							existing_wholesale_price: existingWholesalePrice,
							existing_retail_price: existingRetailPrice,
						});
					}
					// If no changes, skip this product (don't add to new or existing lists)
				} else {
					// New product - will be created
					newProducts.push(productData);
				}

			} catch (rowError) {
				errors.push({
					row: rowNum,
					error: rowError.message || 'Unknown error',
				});
			}
		}

		res.json({
			success: true,
			newProducts,
			existingProducts: existingProductsToUpdate,
			errors,
			summary: {
				new: newProducts.length,
				existing: existingProductsToUpdate.length,
				errors: errors.length
			}
		});

	} catch (err) {
		console.error('Excel import preview error:', err);
		res.status(500).json({ 
			error: err.message || 'Failed to preview Excel file',
			details: process.env.NODE_ENV === 'development' ? err.stack : undefined
		});
	}
});

// Excel import endpoint with enhanced security - now updates existing products
router.post('/products/import-excel', 
	authenticateToken, 
	requireAdmin, 
	fileUploadLimiter, 
	upload.single('file'),
	validateFileUpload,
	sanitizeInput,
	async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: 'No file uploaded' });
		}

		// Parse Excel file
		const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
		const sheetName = workbook.SheetNames[0]; // Use first sheet
		const worksheet = workbook.Sheets[sheetName];
		
		// Convert to JSON array
		const data = XLSX.utils.sheet_to_json(worksheet, { 
			raw: false, // Convert all values to strings for consistency
			defval: '' // Default value for empty cells
		});

		if (!data || data.length === 0) {
			return res.status(400).json({ error: 'Excel file is empty or has no data' });
		}

		// Parse updateRows from form data (list of row numbers to update)
		let updateRows = new Set();
		if (req.body && req.body.updateRows) {
			try {
				const parsedRows = JSON.parse(req.body.updateRows);
				if (Array.isArray(parsedRows)) {
					updateRows = new Set(parsedRows.map(r => parseInt(r)));
				}
			} catch (e) {
				console.warn('Failed to parse updateRows:', e);
			}
		}

		// Normalize column names (case-insensitive, trim whitespace)
		const normalizeKey = (key) => {
			if (!key) return '';
			return String(key).trim().toLowerCase().replace(/\s+/g, '_');
		};

		// Map Excel columns to database fields
		// Support multiple possible column names
		const columnMappings = {
			sku: ['oem', 'oem_no', 'oem no', 'oem no.', 'item', 'sku', 'product_code', 'code'],
			name: ['english name', 'english_name', 'name', 'product name', 'product_name', 'description', 'desc'],
			description: ['desc', 'description', 'chinese name', 'chinese_name'],
			barcode: ['barcode', 'barcode_no', 'barcode no'],
			category: ['category', 'category_name'],
			wholesale_price: ['wholesale_price', 'wholesale price', 'wholesale retail price', 'wholesaleretailprice', 'wholesaleprice', 'wholesale', 'unit price', 'unit_price', 'unitprice', 'price', 'price (rmb)', 'price(rmb)'],
			retail_price: ['retail_price', 'retail price', 'retail'],
			shelf: ['shelf', 'shelf_location', 'location']
		};

		// Find column indices
		const findColumn = (row, mappings) => {
			for (const key in row) {
				const normalized = normalizeKey(key);
				for (const mapping of mappings) {
					if (normalized === normalizeKey(mapping)) {
						return key; // Return original key to access the value
					}
				}
			}
			return null;
		};

		const firstRow = data[0];
		const columnMap = {};
		for (const [dbField, excelColumns] of Object.entries(columnMappings)) {
			const found = findColumn(firstRow, excelColumns);
			if (found) {
				columnMap[dbField] = found;
			}
		}

		// Log detected columns for debugging
		console.log('Detected columns:', columnMap);
		console.log('Available columns in file:', Object.keys(firstRow));

		// Validate required columns
		if (!columnMap.name && !columnMap.sku) {
			return res.status(400).json({ 
				error: 'Excel file must contain at least one of: Name/English Name or SKU/OEM/OEM NO./ITEM column',
				availableColumns: Object.keys(firstRow),
				detectedColumns: columnMap
			});
		}

		// Get all categories for matching
		const categoriesResult = await query('SELECT id, LOWER(name) as lower_name FROM categories', []);
		const categoryMap = new Map();
		categoriesResult.recordset.forEach(cat => {
			categoryMap.set(cat.lower_name, cat.id);
		});

		// Start transaction
		const pool = getPool();
		const client = await pool.connect();
		
		try {
			await client.query('BEGIN');

			const results = {
				success: 0,
				created: 0,
				updated: 0,
				skipped: 0,
				errors: [],
				products: []
			};

			const createdAt = nowIso();
			const today = getTodayLocal();

			// Process each row
			for (let i = 0; i < data.length; i++) {
				const row = data[i];
				const rowNum = i + 2; // +2 because Excel rows start at 1 and we have header

				try {
					// Extract values
					const skuRaw = columnMap.sku ? String(row[columnMap.sku] || '').trim() : '';
					const nameRaw = columnMap.name ? String(row[columnMap.name] || '').trim() : '';
					const descriptionRaw = columnMap.description ? String(row[columnMap.description] || '').trim() : null;
					const barcodeRaw = columnMap.barcode ? String(row[columnMap.barcode] || '').trim() : null;
					const categoryName = columnMap.category ? String(row[columnMap.category] || '').trim() : null;
					// Parse prices - only if column exists and value is not empty
					const wholesalePriceRaw = columnMap.wholesale_price ? String(row[columnMap.wholesale_price] || '').trim() : '';
					const retailPriceRaw = columnMap.retail_price ? String(row[columnMap.retail_price] || '').trim() : '';
					const wholesalePrice = wholesalePriceRaw ? (parseFloat(wholesalePriceRaw.replace(/[^0-9.-]/g, '')) || 0) : 0;
					const retailPrice = retailPriceRaw ? (parseFloat(retailPriceRaw.replace(/[^0-9.-]/g, '')) || null) : null;
					const shelf = columnMap.shelf ? String(row[columnMap.shelf] || '').trim() : null;

					// Normalize barcode and SKU by removing ALL spaces (left, right, and middle)
					const normalizedBarcode = normalizeBarcodeOrSku(barcodeRaw);
					const normalizedSku = normalizeBarcodeOrSku(skuRaw);
					const name = nameRaw || null;
					const description = descriptionRaw || null;

					// Skip empty rows
					if (!name && !normalizedSku) {
						results.skipped++;
						continue;
					}

					// Use SKU as name if name is missing, or name if SKU is missing
					const productName = name || normalizedSku || 'Imported Product';
					const productSku = normalizedSku;

					// Find category ID, create if doesn't exist
					let categoryId = null;
					if (categoryName) {
						const lowerCategoryName = categoryName.toLowerCase();
						categoryId = categoryMap.get(lowerCategoryName) || null;
						
						// Create category if it doesn't exist
						if (!categoryId && categoryName.trim()) {
							const createCategoryResult = await client.query(
								'INSERT INTO categories (name, description, created_at) VALUES ($1, NULL, $2) RETURNING id',
								[categoryName.trim(), createdAt]
							);
							categoryId = createCategoryResult.rows[0].id;
							// Add to map for subsequent rows
							categoryMap.set(lowerCategoryName, categoryId);
						}
					}

					// Check if product already exists (same barcode or same SKU)
					// Priority: barcode first, then SKU if barcode is null or not found
					// Use REPLACE for backward compatibility with old data that may contain spaces
					let existingProduct = null;
					
					if (normalizedBarcode) {
						// Check if barcode already exists - Performance optimized
						const existingCheck = await client.query(
							'SELECT id FROM products WHERE barcode = $1 OR (barcode IS NOT NULL AND REPLACE(barcode, \' \', \'\') = $1) LIMIT 1',
							[normalizedBarcode]
						);
						if (existingCheck.rows.length > 0) {
							existingProduct = existingCheck.rows[0];
						}
					}

					// If not found by barcode, check by SKU (if provided) - Performance optimized
					if (!existingProduct && productSku) {
						const existingCheck = await client.query(
							'SELECT id FROM products WHERE sku = $1 OR (sku IS NOT NULL AND REPLACE(sku, \' \', \'\') = $1) LIMIT 1',
							[productSku]
						);
						if (existingCheck.rows.length > 0) {
							existingProduct = existingCheck.rows[0];
						}
					}

					if (existingProduct) {
						// Only update if this row is in the updateRows set
						if (!updateRows.has(rowNum)) {
							// Skip this product - don't update, don't create
						results.skipped++;
						results.products.push({
							row: rowNum,
							name: productName,
							sku: productSku,
							barcode: normalizedBarcode,
							action: 'skipped',
								reason: 'Not selected for update'
						});
						continue; // Skip to next row
						}

						// Fetch full existing product to check for changes
						const fullProductResult = await client.query(
							'SELECT p.id, p.name, p.barcode, p.sku, p.category_id, p.description, p.shelf, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = $1',
							[existingProduct.id]
						);
						
						if (fullProductResult.rows.length === 0) {
							results.errors.push({
								row: rowNum,
								error: 'Product not found',
								data: row
							});
							continue;
						}
						
						const fullExistingProduct = fullProductResult.rows[0];
						const productId = existingProduct.id;
						
						// Get existing prices for comparison
						const existingPricesResult = await client.query(
							`SELECT DISTINCT ON (product_id) wholesale_price, retail_price 
							 FROM product_prices 
							 WHERE product_id = $1 
							 ORDER BY product_id, effective_date DESC, created_at DESC 
							 LIMIT 1`,
							[productId]
						);
						const existingPrices = existingPricesResult.rows[0] || { wholesale_price: 0, retail_price: 0 };
						const existingWholesalePrice = parseFloat(existingPrices.wholesale_price) || 0;
						const existingRetailPrice = parseFloat(existingPrices.retail_price) || 0;
						
						// Normalize values for comparison
						const existingBarcodeNormalized = normalizeBarcodeOrSku(fullExistingProduct.barcode);
						const existingSkuNormalized = normalizeBarcodeOrSku(fullExistingProduct.sku);
						const existingDescription = fullExistingProduct.description || null;
						const existingCategory = fullExistingProduct.category_name || null;
						const existingShelf = fullExistingProduct.shelf || null;
						
						// Normalize import values
						const importDescription = description || null;
						const importCategory = categoryName || null;
						const importShelf = shelf || null;
						
						// Check if prices were provided in import (non-empty values)
						const hasWholesalePriceInImport = wholesalePriceRaw && wholesalePriceRaw.trim() !== '';
						const hasRetailPriceInImport = retailPriceRaw && retailPriceRaw.trim() !== '';
						
						// Check if there are any changes - skip if no changes (including prices)
						// Compare normalized barcodes and SKUs, and normalize null/empty strings
						// Only compare prices if they were provided in the import
						const hasChanges = 
							productName !== fullExistingProduct.name ||
							productSku !== existingSkuNormalized ||
							normalizedBarcode !== existingBarcodeNormalized ||
							importCategory !== existingCategory ||
							importDescription !== existingDescription ||
							importShelf !== existingShelf ||
							(hasWholesalePriceInImport && Math.abs(wholesalePrice - existingWholesalePrice) > 0.01) ||
							(hasRetailPriceInImport && Math.abs((retailPrice || 0) - existingRetailPrice) > 0.01);
						
						if (!hasChanges) {
							// No changes - skip this product
							results.skipped++;
							results.products.push({
								row: rowNum,
								name: productName,
								sku: productSku,
								barcode: normalizedBarcode,
								action: 'skipped',
								reason: 'No changes detected'
							});
							continue; // Skip to next row
						}

						// Update existing product with new data
						
						// Update product (including barcode)
						await client.query(
							'UPDATE products SET name = $1, barcode = $2, category_id = $3, description = $4, sku = $5, shelf = $6 WHERE id = $7',
							[productName, normalizedBarcode, categoryId, description, productSku, shelf, productId]
						);

						// Update or add price ONLY if BOTH wholesale_price AND retail_price are provided (> 0)
						if (wholesalePrice > 0 && retailPrice !== null && retailPrice > 0) {
							// Check if price already exists for today
							const existingPrice = await client.query(
								'SELECT id FROM product_prices WHERE product_id = $1 AND effective_date = $2',
								[productId, today]
							);

							if (existingPrice.rows.length === 0) {
								await client.query(
									`INSERT INTO product_prices (product_id, wholesale_price, retail_price, effective_date, created_at)
									 VALUES ($1, $2, $3, $4, $5)`,
									[productId, wholesalePrice, retailPrice, today, createdAt]
								);
							} else {
								// Update existing price
								await client.query(
									`UPDATE product_prices SET wholesale_price = $1, retail_price = $2, created_at = $3 WHERE id = $4`,
									[wholesalePrice, retailPrice, createdAt, existingPrice.rows[0].id]
								);
							}
						}

						results.success++;
						results.updated++;
						results.products.push({
							row: rowNum,
							name: productName,
							sku: productSku,
							barcode: normalizedBarcode,
							action: 'updated'
						});
						continue; // Continue to next row
					}

					// Insert new product (only if it doesn't exist)
					// Save normalized barcode and SKU (no spaces)
					const insertResult = await client.query(
						'INSERT INTO products (name, barcode, category_id, description, sku, shelf, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
						[productName, normalizedBarcode, categoryId, description, productSku, shelf, createdAt]
					);
					const productId = insertResult.rows[0].id;

					// Create daily stock entry
					await client.query(
						`INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) 
						 VALUES ($1, 0, 0, $2, $3, $3)
						 ON CONFLICT (product_id, date) DO NOTHING`,
						[productId, today, createdAt]
					);

					// Add price ONLY if BOTH wholesale_price AND retail_price are provided (> 0)
					if (wholesalePrice > 0 && retailPrice !== null && retailPrice > 0) {
						// Check if price already exists for today
						const existingPrice = await client.query(
							'SELECT id FROM product_prices WHERE product_id = $1 AND effective_date = $2',
							[productId, today]
						);

						if (existingPrice.rows.length === 0) {
							await client.query(
								`INSERT INTO product_prices (product_id, wholesale_price, retail_price, effective_date, created_at)
								 VALUES ($1, $2, $3, $4, $5)`,
								[productId, wholesalePrice, retailPrice, today, createdAt]
							);
						} else {
							// Update existing price
							await client.query(
								`UPDATE product_prices SET wholesale_price = $1, retail_price = $2, created_at = $3 WHERE id = $4`,
								[wholesalePrice, retailPrice, createdAt, existingPrice.rows[0].id]
							);
						}
					}

					results.success++;
					results.created++;
					results.products.push({
						row: rowNum,
						name: productName,
						sku: productSku,
						barcode: normalizedBarcode,
						action: 'created'
					});

				} catch (rowError) {
					results.errors.push({
						row: rowNum,
						error: rowError.message || 'Unknown error',
						data: row
					});
				}
			}

			await client.query('COMMIT');
			client.release();

			res.json({
				success: true,
				message: `Import completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped, ${results.errors.length} errors`,
				summary: {
					success: results.success,
					created: results.created,
					updated: results.updated,
					skipped: results.skipped,
					errors: results.errors.length
				},
				products: results.products,
				errors: results.errors.length > 0 ? results.errors : undefined
			});

		} catch (transactionError) {
			await client.query('ROLLBACK');
			client.release();
			throw transactionError;
		}

	} catch (err) {
		console.error('Excel import error:', err);
		res.status(500).json({ 
			error: err.message || 'Failed to import Excel file',
			details: process.env.NODE_ENV === 'development' ? err.stack : undefined
		});
	}
});

// ===== INVOICE EXCEL IMPORT =====
// Invoice import preview endpoint - analyzes file and returns what would be created
router.post('/invoices/import-excel-preview',
	authenticateToken, 
	requireAdmin, 
	fileUploadLimiter, 
	upload.single('file'),
	validateFileUpload,
	sanitizeInput,
	async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ error: 'No file uploaded' });
		}

		// Parse Excel file
		const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
		const sheetName = workbook.SheetNames[0];
		const worksheet = workbook.Sheets[sheetName];
		
		const data = XLSX.utils.sheet_to_json(worksheet, { 
			raw: false,
			defval: ''
		});

		if (!data || data.length === 0) {
			return res.status(400).json({ error: 'Excel file is empty or has no data' });
		}

		const normalizeKey = (key) => {
			if (!key) return '';
			return String(key).trim().toLowerCase().replace(/\s+/g, '_');
		};

		const columnMappings = {
			invoice_type: ['invoice_type', 'type', 'invoice type'],
			invoice_date: ['invoice_date', 'invoice date', 'date'],
			entity_name: ['entity_name', 'entity name', 'entity'],
			customer_name: ['customer_name', 'customer name', 'customer'],
			supplier_name: ['supplier_name', 'supplier name', 'supplier'],
			due_date: ['due_date', 'due date'],
			paid_directly: ['paid_directly', 'paid directly', 'paid'],
			product_barcode: ['product_barcode', 'product barcode', 'barcode', 'bar_code'],
			product_sku: ['product_sku', 'product sku', 'sku', 'oem', 'oem_no', 'oem no'],
			quantity: ['quantity', 'qty', 'qty.', 'amount'],
			unit_price: ['unit_price', 'unit price', 'price', 'unitprice']
		};

		const findColumn = (row, mappings) => {
			for (const key in row) {
				const normalized = normalizeKey(key);
				for (const mapping of mappings) {
					if (normalized === normalizeKey(mapping)) {
						return key;
					}
				}
			}
			return null;
		};

		const firstRow = data[0];
		const columnMap = {};
		for (const [dbField, excelColumns] of Object.entries(columnMappings)) {
			const found = findColumn(firstRow, excelColumns);
			if (found) {
				columnMap[dbField] = found;
			}
		}

		if (!columnMap.invoice_type) {
			return res.status(400).json({ 
				error: 'Excel file must contain invoice_type column',
				availableColumns: Object.keys(firstRow),
				detectedColumns: columnMap
			});
		}
		if (!columnMap.invoice_date) {
			return res.status(400).json({ 
				error: 'Excel file must contain invoice_date column',
				availableColumns: Object.keys(firstRow),
				detectedColumns: columnMap
			});
		}
		if (!columnMap.product_barcode && !columnMap.product_sku) {
			return res.status(400).json({ 
				error: 'Excel file must contain product_barcode or product_sku column',
				availableColumns: Object.keys(firstRow),
				detectedColumns: columnMap
			});
		}
		if (!columnMap.quantity || !columnMap.unit_price) {
			return res.status(400).json({ 
				error: 'Excel file must contain quantity and unit_price columns',
				availableColumns: Object.keys(firstRow),
				detectedColumns: columnMap
			});
		}

		// Get existing products, customers, and suppliers
		const productsResult = await query('SELECT id, name, barcode, sku FROM products', []);
		const products = new Map();
		productsResult.recordset.forEach(product => {
			const normalizedBarcode = normalizeBarcodeOrSku(product.barcode);
			const normalizedSku = normalizeBarcodeOrSku(product.sku);
			if (normalizedBarcode) {
				products.set(`barcode:${normalizedBarcode}`, product);
			}
			if (normalizedSku) {
				products.set(`sku:${normalizedSku}`, product);
			}
		});

		const customersResult = await query('SELECT id, name FROM customers', []);
		const customers = new Map();
		customersResult.recordset.forEach(customer => {
			customers.set(customer.name.toLowerCase().trim(), customer);
		});

		const suppliersResult = await query('SELECT id, name FROM suppliers', []);
		const suppliers = new Map();
		suppliersResult.recordset.forEach(supplier => {
			suppliers.set(supplier.name.toLowerCase().trim(), supplier);
		});

		// Get latest product prices for sell invoices (to lookup retail/wholesale prices)
		const pricesResult = await query(
			`SELECT DISTINCT ON (pp.product_id)
				pp.product_id, pp.wholesale_price, pp.retail_price, pp.effective_date
			 FROM product_prices pp
			 ORDER BY pp.product_id, pp.effective_date DESC, pp.created_at DESC`,
			[]
		);
		const productPrices = new Map();
		pricesResult.recordset.forEach(price => {
			productPrices.set(price.product_id, {
				wholesale_price: parseFloat(price.wholesale_price) || 0,
				retail_price: parseFloat(price.retail_price) || 0
			});
		});

		// Group rows by invoice (invoice_date + invoice_type + entity)
		const invoiceGroups = new Map();
		const errors = [];

		for (let i = 0; i < data.length; i++) {
			const row = data[i];
			const rowNum = i + 2;

			try {
				const invoiceType = String(row[columnMap.invoice_type] || '').trim().toLowerCase();
				if (invoiceType !== 'buy' && invoiceType !== 'sell') {
					errors.push({ row: rowNum, error: `Invalid invoice_type: ${invoiceType}. Must be 'buy' or 'sell'` });
					continue;
				}

				const invoiceDate = String(row[columnMap.invoice_date] || '').trim();
				if (!invoiceDate) {
					errors.push({ row: rowNum, error: 'Missing invoice_date' });
					continue;
				}

				let parsedDate;
				try {
					parsedDate = new Date(invoiceDate);
					if (isNaN(parsedDate.getTime())) {
						throw new Error('Invalid date');
					}
				} catch (e) {
					errors.push({ row: rowNum, error: `Invalid invoice_date format: ${invoiceDate}` });
					continue;
				}

				// Support single entity_name column or separate customer_name/supplier_name
				let entityName = '';
				if (columnMap.entity_name) {
					entityName = String(row[columnMap.entity_name] || '').trim();
				} else {
					entityName = invoiceType === 'sell' 
						? String(row[columnMap.customer_name] || '').trim()
						: String(row[columnMap.supplier_name] || '').trim();
				}

				if (!entityName) {
					errors.push({ row: rowNum, error: `Missing ${columnMap.entity_name ? 'entity_name' : (invoiceType === 'sell' ? 'customer_name' : 'supplier_name')}` });
					continue;
				}

				const entityMap = invoiceType === 'sell' ? customers : suppliers;
				const entity = entityMap.get(entityName.toLowerCase());
				if (!entity) {
					errors.push({ row: rowNum, error: `${invoiceType === 'sell' ? 'Customer' : 'Supplier'} not found: ${entityName}` });
					continue;
				}

				const invoiceKey = `${invoiceDate}_${invoiceType}_${entity.id}`;

				if (!invoiceGroups.has(invoiceKey)) {
					const dueDateStr = String(row[columnMap.due_date] || '').trim();
					let dueDate = null;
					if (dueDateStr) {
						try {
							dueDate = new Date(dueDateStr);
							if (isNaN(dueDate.getTime())) {
								dueDate = null;
							}
						} catch (e) {
							dueDate = null;
						}
					}

					const paidDirectly = String(row[columnMap.paid_directly] || 'false').trim().toLowerCase();
					const isPaidDirectly = paidDirectly === 'true' || paidDirectly === '1' || paidDirectly === 'yes';

					invoiceGroups.set(invoiceKey, {
						invoice_type: invoiceType,
						invoice_date: parsedDate.toISOString(),
						due_date: dueDate ? dueDate.toISOString() : null,
						paid_directly: isPaidDirectly,
						customer_id: invoiceType === 'sell' ? entity.id : null,
						supplier_id: invoiceType === 'buy' ? entity.id : null,
						entity_name: entityName,
						items: []
					});
				}

				const barcode = String(row[columnMap.product_barcode] || '').trim();
				const sku = String(row[columnMap.product_sku] || '').trim();
				
				if (!barcode && !sku) {
					errors.push({ row: rowNum, error: 'Missing product_barcode and product_sku' });
					continue;
				}

				// Lookup product: check both barcode and SKU columns for the value
				// If barcode provided: check barcode column first, then SKU column (same value)
				// If SKU provided: check SKU column first, then barcode column (same value)
				let product = null;
				
				// If barcode is provided, check barcode column first, then SKU column
				if (barcode) {
					const normalizedBarcode = normalizeBarcodeOrSku(barcode);
					if (normalizedBarcode) {
						// Try barcode column first
						product = products.get(`barcode:${normalizedBarcode}`);
						// If not found, try SKU column with the same value
						if (!product) {
							product = products.get(`sku:${normalizedBarcode}`);
						}
					}
				}
				
				// If still not found and SKU is provided, check SKU column first, then barcode column
				if (!product && sku) {
					const normalizedSku = normalizeBarcodeOrSku(sku);
					if (normalizedSku) {
						// Try SKU column first
						product = products.get(`sku:${normalizedSku}`);
						// If not found, try barcode column with the same value
						if (!product) {
							product = products.get(`barcode:${normalizedSku}`);
						}
					}
				}

				if (!product) {
					// If both barcode and sku are provided but product not found, show what was searched
					if (barcode && sku) {
						errors.push({ row: rowNum, error: `Product not found: barcode="${barcode}" or sku="${sku}"` });
					} else {
						errors.push({ row: rowNum, error: `Product not found: ${barcode || sku}` });
					}
					continue;
				}

				const quantity = parseFloat(String(row[columnMap.quantity] || '0'));
				if (isNaN(quantity) || quantity <= 0) {
					errors.push({ row: rowNum, error: `Invalid quantity: ${row[columnMap.quantity]}` });
					continue;
				}

				// For SELL invoices: 
				// - If unit_price is a number → private price
				// - If unit_price is "retail" or "wholesale" → use product_prices
				// - If unit_price is empty → error
				// For BUY invoices: unit_price is always the cost (must be a number)
				let unitPrice = 0;
				let isPrivatePrice = false;
				let privatePriceAmount = 0;

				if (invoiceType === 'sell') {
					const unitPriceStr = String(row[columnMap.unit_price] || '').trim().toLowerCase();
					
					if (!unitPriceStr) {
						// Empty unit_price → error
						errors.push({ row: rowNum, error: 'unit_price is required for sell invoices. Provide a number (private price) or "retail"/"wholesale" to use product_prices' });
						continue;
					}
					
					// Try to parse as number first
					const parsedUnitPrice = parseFloat(unitPriceStr);
					
					if (!isNaN(parsedUnitPrice) && parsedUnitPrice > 0) {
						// Number provided = private price
						isPrivatePrice = true;
						privatePriceAmount = parsedUnitPrice;
						unitPrice = 0; // Not used for private prices, but keep for reference
					} else if (unitPriceStr === 'retail' || unitPriceStr === 'wholesale' || unitPriceStr === 'wholsesale') {
						// String "retail" or "wholesale" (handle common typo "wholsesale") = use product_prices
						const priceType = (unitPriceStr === 'wholesale' || unitPriceStr === 'wholsesale') ? 'wholesale' : 'retail';
						const prices = productPrices.get(product.id);
						if (prices) {
							unitPrice = priceType === 'wholesale' ? prices.wholesale_price : prices.retail_price;
							isPrivatePrice = false;
						} else {
							errors.push({ row: rowNum, error: `Product has no ${priceType} price defined in product_prices` });
							continue;
						}
					} else {
						// Invalid value
						errors.push({ row: rowNum, error: `Invalid unit_price: "${unitPriceStr}". Must be a number (private price) or "retail"/"wholesale"` });
						continue;
					}
				} else {
					// BUY invoice: unit_price is always the cost (must be a number)
					const unitPriceStr = String(row[columnMap.unit_price] || '').trim();
					const parsedUnitPrice = unitPriceStr ? parseFloat(unitPriceStr) : NaN;
					if (isNaN(parsedUnitPrice) || parsedUnitPrice < 0) {
						errors.push({ row: rowNum, error: `Invalid unit_price (cost): ${row[columnMap.unit_price]}` });
						continue;
					}
					unitPrice = parsedUnitPrice;
				}

				// Determine price_type: if using product_prices, use the type from unit_price; otherwise default to retail
				let priceType = 'retail';
				if (invoiceType === 'sell' && !isPrivatePrice) {
					const unitPriceStr = String(row[columnMap.unit_price] || '').trim().toLowerCase();
					if (unitPriceStr === 'wholesale' || unitPriceStr === 'retail') {
						priceType = unitPriceStr;
					}
				}

				const effectivePrice = isPrivatePrice ? privatePriceAmount : unitPrice;
				const totalPrice = effectivePrice * quantity;

				const invoice = invoiceGroups.get(invoiceKey);
				invoice.items.push({
					product_id: product.id,
					product_name: product.name,
					product_barcode: product.barcode,
					product_sku: product.sku,
					quantity: quantity,
					unit_price: unitPrice,
					price_type: priceType,
					total_price: totalPrice,
					is_private_price: isPrivatePrice,
					private_price_amount: isPrivatePrice ? privatePriceAmount : null,
					row: rowNum
				});

			} catch (err) {
				errors.push({ row: rowNum, error: err.message || 'Unknown error processing row' });
			}
		}

		const invoices = Array.from(invoiceGroups.values()).map(invoice => {
			const totalAmount = invoice.items.reduce((sum, item) => sum + item.total_price, 0);
			return {
				...invoice,
				total_amount: totalAmount
			};
		});

		res.json({
			invoices: invoices,
			errors: errors,
			summary: {
				total_invoices: invoices.length,
				total_items: invoices.reduce((sum, inv) => sum + inv.items.length, 0),
				total_errors: errors.length
			}
		});

	} catch (err) {
		console.error('Invoice import preview error:', err);
		res.status(500).json({ 
			error: err.message || 'Failed to preview invoice import',
			details: process.env.NODE_ENV === 'development' ? err.stack : undefined
		});
	}
});

// Invoice import endpoint - creates invoices and items
router.post('/invoices/import-excel',
	authenticateToken,
	requireAdmin,
	fileUploadLimiter,
	upload.single('file'),
	validateFileUpload,
	sanitizeInput,
	async (req, res) => {
	const pool = getPool();
	const client = await pool.connect();

	try {
		await client.query('BEGIN');

		if (!req.file) {
			throw new Error('No file uploaded');
		}

		const today = getTodayLocal(); // Used for stock queries

		// Re-parse Excel file (same logic as preview)
		const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
		const sheetName = workbook.SheetNames[0];
		const worksheet = workbook.Sheets[sheetName];
		
		const data = XLSX.utils.sheet_to_json(worksheet, { 
			raw: false,
			defval: ''
		});

		if (!data || data.length === 0) {
			throw new Error('Excel file is empty or has no data');
		}

		const normalizeKey = (key) => {
			if (!key) return '';
			return String(key).trim().toLowerCase().replace(/\s+/g, '_');
		};

		const columnMappings = {
			invoice_type: ['invoice_type', 'type', 'invoice type'],
			invoice_date: ['invoice_date', 'invoice date', 'date'],
			entity_name: ['entity_name', 'entity name', 'entity'],
			customer_name: ['customer_name', 'customer name', 'customer'],
			supplier_name: ['supplier_name', 'supplier name', 'supplier'],
			due_date: ['due_date', 'due date'],
			paid_directly: ['paid_directly', 'paid directly', 'paid'],
			product_barcode: ['product_barcode', 'product barcode', 'barcode', 'bar_code'],
			product_sku: ['product_sku', 'product sku', 'sku', 'oem', 'oem_no', 'oem no'],
			quantity: ['quantity', 'qty', 'qty.', 'amount'],
			unit_price: ['unit_price', 'unit price', 'price', 'unitprice']
		};

		const findColumn = (row, mappings) => {
			for (const key in row) {
				const normalized = normalizeKey(key);
				for (const mapping of mappings) {
					if (normalized === normalizeKey(mapping)) {
						return key;
					}
				}
			}
			return null;
		};

		const firstRow = data[0];
		const columnMap = {};
		for (const [dbField, excelColumns] of Object.entries(columnMappings)) {
			const found = findColumn(firstRow, excelColumns);
			if (found) {
				columnMap[dbField] = found;
			}
		}

		// Get existing data
		const productsResult = await client.query('SELECT id, name, barcode, sku FROM products', []);
		const products = new Map();
		productsResult.rows.forEach(product => {
			const normalizedBarcode = normalizeBarcodeOrSku(product.barcode);
			const normalizedSku = normalizeBarcodeOrSku(product.sku);
			if (normalizedBarcode) {
				products.set(`barcode:${normalizedBarcode}`, product);
			}
			if (normalizedSku) {
				products.set(`sku:${normalizedSku}`, product);
			}
		});

		const customersResult = await client.query('SELECT id, name FROM customers', []);
		const customers = new Map();
		customersResult.rows.forEach(customer => {
			customers.set(customer.name.toLowerCase().trim(), customer);
		});

		const suppliersResult = await client.query('SELECT id, name FROM suppliers', []);
		const suppliers = new Map();
		suppliersResult.rows.forEach(supplier => {
			suppliers.set(supplier.name.toLowerCase().trim(), supplier);
		});

		// Get latest product prices for sell invoices (to lookup retail/wholesale prices)
		const pricesResult = await client.query(
			`SELECT DISTINCT ON (pp.product_id)
				pp.product_id, pp.wholesale_price, pp.retail_price, pp.effective_date
			 FROM product_prices pp
			 ORDER BY pp.product_id, pp.effective_date DESC, pp.created_at DESC`,
			[]
		);
		const productPrices = new Map();
		pricesResult.rows.forEach(price => {
			productPrices.set(price.product_id, {
				wholesale_price: parseFloat(price.wholesale_price) || 0,
				retail_price: parseFloat(price.retail_price) || 0
			});
		});

		// Group rows by invoice
		const invoiceGroups = new Map();
		// today is already defined above

		for (let i = 0; i < data.length; i++) {
			const row = data[i];
			const invoiceType = String(row[columnMap.invoice_type] || '').trim().toLowerCase();
			if (invoiceType !== 'buy' && invoiceType !== 'sell') continue;

			const invoiceDate = String(row[columnMap.invoice_date] || '').trim();
			if (!invoiceDate) continue;

			let parsedDate;
			try {
				parsedDate = new Date(invoiceDate);
				if (isNaN(parsedDate.getTime())) continue;
			} catch (e) {
				continue;
			}

			// Support single entity_name column or separate customer_name/supplier_name
			let entityName = '';
			if (columnMap.entity_name) {
				entityName = String(row[columnMap.entity_name] || '').trim();
			} else {
				entityName = invoiceType === 'sell' 
					? String(row[columnMap.customer_name] || '').trim()
					: String(row[columnMap.supplier_name] || '').trim();
			}

			if (!entityName) continue;

			const entityMap = invoiceType === 'sell' ? customers : suppliers;
			const entity = entityMap.get(entityName.toLowerCase());
			if (!entity) continue;

			const invoiceKey = `${invoiceDate}_${invoiceType}_${entity.id}`;

			if (!invoiceGroups.has(invoiceKey)) {
				const dueDateStr = String(row[columnMap.due_date] || '').trim();
				let dueDate = null;
				if (dueDateStr) {
					try {
						dueDate = new Date(dueDateStr);
						if (isNaN(dueDate.getTime())) {
							dueDate = null;
						} else {
							dueDate = dueDate.toISOString();
						}
					} catch (e) {
						dueDate = null;
					}
				}

				// Parse paid_directly: accept true, 1, yes, or any case variation
				const paidDirectlyRaw = row[columnMap.paid_directly];
				let isPaidDirectly = false;
				if (paidDirectlyRaw !== undefined && paidDirectlyRaw !== null && paidDirectlyRaw !== '') {
					const paidDirectly = String(paidDirectlyRaw).trim().toLowerCase();
					isPaidDirectly = paidDirectly === 'true' || paidDirectly === '1' || paidDirectly === 'yes' || paidDirectly === 'y';
				}
				console.log(`  Row ${i + 2}: paid_directly="${paidDirectlyRaw}" → parsed as ${isPaidDirectly}`);

				invoiceGroups.set(invoiceKey, {
					invoice_type: invoiceType,
					invoice_date: parsedDate.toISOString(),
					due_date: dueDate,
					paid_directly: isPaidDirectly,
					customer_id: invoiceType === 'sell' ? entity.id : null,
					supplier_id: invoiceType === 'buy' ? entity.id : null,
					items: []
				});
			}

			const barcode = String(row[columnMap.product_barcode] || '').trim();
			const sku = String(row[columnMap.product_sku] || '').trim();
			
			if (!barcode && !sku) continue;

			// Lookup product: check both barcode and SKU columns for the value
			// If barcode provided: check barcode column first, then SKU column (same value)
			// If SKU provided: check SKU column first, then barcode column (same value)
			let product = null;
			
			// If barcode is provided, check barcode column first, then SKU column
			if (barcode) {
				const normalizedBarcode = normalizeBarcodeOrSku(barcode);
				if (normalizedBarcode) {
					// Try barcode column first
					product = products.get(`barcode:${normalizedBarcode}`);
					// If not found, try SKU column with the same value
					if (!product) {
						product = products.get(`sku:${normalizedBarcode}`);
					}
				}
			}
			
			// If still not found and SKU is provided, check SKU column first, then barcode column
			if (!product && sku) {
				const normalizedSku = normalizeBarcodeOrSku(sku);
				if (normalizedSku) {
					// Try SKU column first
					product = products.get(`sku:${normalizedSku}`);
					// If not found, try barcode column with the same value
					if (!product) {
						product = products.get(`barcode:${normalizedSku}`);
					}
				}
			}

			if (!product) continue;

			const quantity = parseFloat(String(row[columnMap.quantity] || '0'));
			if (isNaN(quantity) || quantity <= 0) continue;

			// For SELL invoices: 
			// - If unit_price is a number → private price
			// - If unit_price is "retail" or "wholesale" → use product_prices
			// - If unit_price is empty → skip (error)
			// For BUY invoices: unit_price is always the cost (must be a number)
			let unitPrice = 0;
			let isPrivatePrice = false;
			let privatePriceAmount = 0;

			if (invoiceType === 'sell') {
				const unitPriceStr = String(row[columnMap.unit_price] || '').trim().toLowerCase();
				
				if (!unitPriceStr) {
					// Empty unit_price → skip (error)
					continue;
				}
				
				// Try to parse as number first
				const parsedUnitPrice = parseFloat(unitPriceStr);
				
				if (!isNaN(parsedUnitPrice) && parsedUnitPrice > 0) {
					// Number provided = private price
					isPrivatePrice = true;
					privatePriceAmount = parsedUnitPrice;
					unitPrice = 0; // Not used for private prices, but keep for reference
				} else if (unitPriceStr === 'retail' || unitPriceStr === 'wholesale') {
					// String "retail" or "wholesale" = use product_prices
					const prices = productPrices.get(product.id);
					if (prices) {
						unitPrice = unitPriceStr === 'wholesale' ? prices.wholesale_price : prices.retail_price;
						isPrivatePrice = false;
					} else {
						continue; // Skip items without price
					}
				} else {
					// Invalid value → skip
					continue;
				}
			} else {
				// BUY invoice: unit_price is always the cost (must be a number)
				const unitPriceStr = String(row[columnMap.unit_price] || '').trim();
				const parsedUnitPrice = unitPriceStr ? parseFloat(unitPriceStr) : NaN;
				if (isNaN(parsedUnitPrice) || parsedUnitPrice < 0) continue;
				unitPrice = parsedUnitPrice;
			}

			const effectivePrice = isPrivatePrice ? privatePriceAmount : unitPrice;
			const totalPrice = effectivePrice * quantity;

			// Determine price_type for sell invoices (retail or wholesale)
			let priceType = 'retail';
			if (invoiceType === 'sell' && !isPrivatePrice) {
				const unitPriceStr = String(row[columnMap.unit_price] || '').trim().toLowerCase();
				if (unitPriceStr === 'wholesale' || unitPriceStr === 'retail') {
					priceType = unitPriceStr;
				}
			}

			const invoice = invoiceGroups.get(invoiceKey);
			invoice.items.push({
				product_id: product.id,
				quantity: quantity,
				unit_price: unitPrice,
				price_type: priceType,
				total_price: totalPrice,
				is_private_price: isPrivatePrice,
				private_price_amount: isPrivatePrice ? privatePriceAmount : null
			});
		}

		// Parse invoiceIndices from form data (list of indices to import)
		let invoiceIndices = null;
		console.log('Request body keys:', Object.keys(req.body || {}));
		console.log('Request body:', req.body);
		console.log('invoiceIndices raw value:', req.body?.invoiceIndices);
		console.log('invoiceIndices type:', typeof req.body?.invoiceIndices);
		
		// Try to get invoiceIndices from req.body (multer puts non-file fields here)
		const rawIndices = req.body?.invoiceIndices;
		if (rawIndices !== undefined && rawIndices !== null) {
			try {
				let parsedIndices;
				if (typeof rawIndices === 'string') {
					// Try to parse as JSON first
					try {
						parsedIndices = JSON.parse(rawIndices);
					} catch (e) {
						// If not JSON, try to parse as comma-separated string
						parsedIndices = rawIndices.split(',').map(s => s.trim()).filter(s => s);
					}
				} else if (Array.isArray(rawIndices)) {
					parsedIndices = rawIndices;
				} else {
					parsedIndices = [rawIndices];
				}
				
				if (Array.isArray(parsedIndices) && parsedIndices.length > 0) {
					invoiceIndices = new Set(parsedIndices.map(i => parseInt(i)).filter(i => !isNaN(i)));
					console.log(`✓ Importing invoices with indices:`, Array.from(invoiceIndices));
				} else {
					console.warn('invoiceIndices is empty or invalid:', parsedIndices);
				}
			} catch (e) {
				console.error('✗ Failed to parse invoiceIndices:', e.message);
				console.error('Stack:', e.stack);
				console.error('Raw value:', rawIndices);
			}
		} else {
			console.log('⚠ No invoiceIndices provided, importing all invoices');
		}

		// Convert invoiceGroups Map to Array to maintain order (same as preview)
		const invoiceGroupsArray = Array.from(invoiceGroups.values());
		console.log(`Total invoice groups found: ${invoiceGroupsArray.length}`);

		// Create invoices - only process checked invoices if invoiceIndices is provided
		const created = { invoices: 0, items: 0 };

		if (invoiceGroupsArray.length === 0) {
			throw new Error('No invoices found in file to import');
		}

		for (let idx = 0; idx < invoiceGroupsArray.length; idx++) {
			// Skip if invoiceIndices is provided and this index is not checked
			if (invoiceIndices !== null && !invoiceIndices.has(idx)) {
				console.log(`⏭ Skipping invoice at index ${idx} (not in checked list)`);
				continue;
			}

			const invoiceData = invoiceGroupsArray[idx];
			
			// Skip invoices with no items
			if (!invoiceData.items || invoiceData.items.length === 0) {
				console.warn(`⏭ Skipping invoice at index ${idx}: no items`);
				continue;
			}
			
			console.log(`📝 Processing invoice ${idx}: type=${invoiceData.invoice_type}, entity=${invoiceData.customer_id || invoiceData.supplier_id}, items=${invoiceData.items.length}`);
			const totalAmount = invoiceData.items.reduce((sum, item) => sum + item.total_price, 0);
			const invoiceTimestamp = invoiceData.invoice_date ? new Date(invoiceData.invoice_date).toISOString() : nowIso();

			// Create invoice
			// Use the already-parsed paid_directly boolean value from invoiceData
			// It was parsed earlier when grouping rows (line 4748), so it's already a boolean
			const isPaidDirectly = invoiceData.paid_directly === true || invoiceData.paid_directly === 'true' || invoiceData.paid_directly === 1 || invoiceData.paid_directly === '1' || invoiceData.paid_directly === 'yes' || invoiceData.paid_directly === 'y';
			console.log(`  → Creating invoice: type=${invoiceData.invoice_type}, customer_id=${invoiceData.customer_id}, supplier_id=${invoiceData.supplier_id}, total=${totalAmount}, paid_directly=${invoiceData.paid_directly} (type: ${typeof invoiceData.paid_directly}, parsed: ${isPaidDirectly})`);
			
			try {
				// Set amount_paid and payment_status during INSERT if paid_directly is true
				const amountPaidValue = isPaidDirectly ? totalAmount : 0;
				const paymentStatusValue = isPaidDirectly ? 'paid' : 'pending';
				
				const invoiceResult = await client.query(
					`INSERT INTO invoices (invoice_type, customer_id, supplier_id, total_amount, invoice_date, due_date, amount_paid, payment_status, created_at) 
					 VALUES ($1, $2, $3, $4, $5::timestamp, $6, $7, $8, $9::timestamp) RETURNING id, invoice_date`,
					[invoiceData.invoice_type, invoiceData.customer_id, invoiceData.supplier_id, 
					 totalAmount, invoiceTimestamp, invoiceData.due_date || null, amountPaidValue, paymentStatusValue, nowIso()]
				);
				const invoiceId = invoiceResult.rows[0].id;
				console.log(`  ✓ Invoice created with ID: ${invoiceId}, payment_status: ${paymentStatusValue}, amount_paid: ${amountPaidValue}`);

				// If paid_directly is true, create a payment record and update invoice status IMMEDIATELY
				if (isPaidDirectly) {
					const totalAmountNum = parseFloat(String(totalAmount));
					if (totalAmountNum > 0) {
						console.log(`  → Creating payment record for paid_directly invoice`);
						// Create payment record with full amount in USD
						await client.query(
							`INSERT INTO invoice_payments (invoice_id, paid_amount, currency_code, exchange_rate_on_payment, usd_equivalent_amount, payment_date, payment_method, notes, created_at) 
							 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
							[
								invoiceId,
								totalAmountNum, // paid_amount in USD
								'USD', // currency_code
								1.0, // exchange_rate_on_payment (1 USD = 1 USD)
								totalAmountNum, // usd_equivalent_amount
								invoiceTimestamp, // payment_date (same as invoice creation)
								'direct', // payment_method
								'Paid directly on invoice import', // notes
								invoiceTimestamp // created_at
							]
						);
						
						// Update invoice payment status to 'paid'
						await client.query(
							'UPDATE invoices SET amount_paid = $1, payment_status = $2 WHERE id = $3',
							[totalAmountNum, 'paid', invoiceId]
						);
						console.log(`  ✓ Payment record created and invoice marked as paid`);
					}
				}

				// Batch fetch stock data for all products at once (same as manual invoice creation)
				const productIds = invoiceData.items.map(item => parseInt(item.product_id));
				const stockDataResult = await client.query(
					`SELECT product_id, available_qty, avg_cost 
					 FROM daily_stock 
					 WHERE product_id = ANY($1) AND date <= $2 
					 ORDER BY product_id, date DESC, updated_at DESC`,
					[productIds, today]
				);

				// Create a map of product_id -> latest stock data
				const stockMap = new Map();
				stockDataResult.rows.forEach(row => {
					if (!stockMap.has(row.product_id)) {
						stockMap.set(row.product_id, {
							available_qty: row.available_qty || 0,
							avg_cost: row.avg_cost || 0
						});
					}
				});

				// Prepare batch insert data for invoice items
				const itemValues = [];
				const itemParams = [];
				
				// Prepare batch insert data for stock movements
				const movementValues = [];
				const movementParams = [];
				
				// Prepare batch upsert data for daily_stock
				const stockValues = [];
				const stockParams = [];
				
				const stockTimestamp = nowIso();
				let itemParamIndex = 1;
				let movementParamIndex = 1;
				let stockParamIndex = 1;

				for (const item of invoiceData.items) {
					const productId = parseInt(item.product_id);
					const stockData = stockMap.get(productId) || { available_qty: 0, avg_cost: 0 };
					let qtyBefore = stockData.available_qty;
					let prevAvgCost = stockData.avg_cost;
					
					const change = invoiceData.invoice_type === 'sell' ? -item.quantity : item.quantity;
					const qtyAfter = qtyBefore + change;
					
					// Determine new avg cost for BUY; keep previous for SELL (same as manual invoice creation)
					let newAvgCost = prevAvgCost || 0;
					if (invoiceData.invoice_type === 'buy') {
						const buyQty = item.quantity;
						const buyCost = item.unit_price;
						const denominator = (qtyBefore || 0) + buyQty;
						newAvgCost = denominator > 0 ? (((prevAvgCost || 0) * (qtyBefore || 0)) + (buyCost * buyQty)) / denominator : buyCost;
					}
					
					const unitCost = parseFloat(item.unit_price);

					// Build invoice items batch insert
					itemValues.push(`($${itemParamIndex}, $${itemParamIndex + 1}, $${itemParamIndex + 2}, $${itemParamIndex + 3}, $${itemParamIndex + 4}, $${itemParamIndex + 5}, $${itemParamIndex + 6}, $${itemParamIndex + 7}, $${itemParamIndex + 8})`);
					itemParams.push(
						invoiceId, productId, item.quantity, item.unit_price, item.total_price,
						item.price_type, item.is_private_price ? 1 : 0,
						item.is_private_price ? item.private_price_amount : null,
						null // private_price_note (removed from import)
					);
					itemParamIndex += 9;
					
					// Build stock movements batch insert (using invoice_date subquery - same as manual invoice creation)
					movementValues.push(`($${movementParamIndex}, $${movementParamIndex + 1}, (SELECT invoice_date FROM invoices WHERE id = $${movementParamIndex + 1}), $${movementParamIndex + 2}, $${movementParamIndex + 3}, $${movementParamIndex + 4}, $${movementParamIndex + 5}, $${movementParamIndex + 6}, $${movementParamIndex + 7}::timestamp)`);
					movementParams.push(productId, invoiceId, qtyBefore, change, qtyAfter, unitCost, newAvgCost, invoiceTimestamp);
					movementParamIndex += 8;
					
					// Build daily_stock batch upsert (same as manual invoice creation)
					stockValues.push(`($${stockParamIndex}, $${stockParamIndex + 1}, $${stockParamIndex + 2}, $${stockParamIndex + 3}, $${stockParamIndex + 4}, $${stockParamIndex + 4})`);
					stockParams.push(productId, qtyAfter, newAvgCost, today, stockTimestamp);
					stockParamIndex += 5;
				}

				// Batch insert invoice items
				if (itemValues.length > 0) {
					console.log(`  → Inserting ${itemValues.length} invoice items`);
					await client.query(
						`INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price, price_type, is_private_price, private_price_amount, private_price_note) 
						 VALUES ${itemValues.join(', ')}`,
						itemParams
					);
					created.items += itemValues.length;
					console.log(`  ✓ Invoice items inserted`);
				} else {
					console.warn(`  ⚠ No items to insert for invoice ${invoiceId}`);
				}

				// Batch insert stock movements (same as manual invoice creation)
				if (movementValues.length > 0) {
					console.log(`  → Inserting ${movementValues.length} stock movements`);
					await client.query(
						`INSERT INTO stock_movements (product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, unit_cost, avg_cost_after, created_at) 
						 VALUES ${movementValues.join(', ')}`,
						movementParams
					);
					console.log(`  ✓ Stock movements inserted`);
				}

				// Batch upsert daily_stock (same as manual invoice creation)
				if (stockValues.length > 0) {
					console.log(`  → Upserting ${stockValues.length} daily stock records`);
					await client.query(
						`INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) 
						 VALUES ${stockValues.join(', ')}
						 ON CONFLICT (product_id, date) 
						 DO UPDATE SET available_qty = EXCLUDED.available_qty, avg_cost = EXCLUDED.avg_cost, updated_at = EXCLUDED.updated_at`,
						stockParams
					);
					console.log(`  ✓ Daily stock updated`);
				}

				created.invoices++;
				console.log(`✓ Invoice ${idx} completed (ID: ${invoiceId})`);
			} catch (invoiceError) {
				console.error(`✗ Failed to create invoice ${idx}:`, invoiceError.message);
				console.error('Stack:', invoiceError.stack);
				// Continue with next invoice instead of failing entire import
				// The transaction will rollback if there's a critical error, but individual invoice errors won't stop the import
				throw invoiceError; // Re-throw to rollback transaction on any error
			}
		}

		console.log(`\n📊 Import Summary: ${created.invoices} invoices, ${created.items} items`);
		
		// Validate that at least one invoice was created
		if (created.invoices === 0) {
			const checkedCount = invoiceIndices ? invoiceIndices.size : invoiceGroupsArray.length;
			throw new Error(`No invoices were created. ${checkedCount} invoice(s) were selected, but none could be processed. Check server logs for details.`);
		}

		await client.query('COMMIT');
		console.log(`✓ Transaction committed successfully`);

		res.json({
			success: true,
			created: created
		});

	} catch (err) {
		await client.query('ROLLBACK').catch(rollbackErr => {
			console.error('Failed to rollback transaction:', rollbackErr);
		});
		console.error('✗ Invoice import error:', err.message);
		console.error('Stack:', err.stack);
		res.status(500).json({ 
			error: err.message || 'Failed to import invoices',
			details: process.env.NODE_ENV === 'development' ? err.stack : undefined
		});
	} finally {
		client.release();
	}
});

// Download import templates
const fs = require('fs');
const path = require('path');

// Download product import template
router.get('/templates/products', authenticateToken, (req, res) => {
	try {
		// Try multiple possible paths for production compatibility
		const possiblePaths = [
			path.join(__dirname, '../../products_Import_template.xlsx'), // From server/routes/ to root
			path.resolve(process.cwd(), 'products_Import_template.xlsx'), // From current working directory
			path.resolve(__dirname, '../../../products_Import_template.xlsx'), // Alternative relative path
		];
		
		let templatePath = null;
		for (const possiblePath of possiblePaths) {
			if (fs.existsSync(possiblePath)) {
				templatePath = possiblePath;
				break;
			}
		}
		
		if (!templatePath) {
			console.error('Product template not found. Tried paths:', possiblePaths);
			return res.status(404).json({ error: 'Product import template not found' });
		}
		
		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		res.setHeader('Content-Disposition', 'attachment; filename="products_import_template.xlsx"');
		
		const fileStream = fs.createReadStream(templatePath);
		fileStream.on('error', (err) => {
			console.error('Error streaming product template:', err);
			if (!res.headersSent) {
				res.status(500).json({ error: 'Failed to stream template file' });
			}
		});
		fileStream.pipe(res);
	} catch (err) {
		console.error('Error serving product template:', err);
		if (!res.headersSent) {
			res.status(500).json({ error: 'Failed to download template' });
		}
	}
});

// Download invoice import template
router.get('/templates/invoices', authenticateToken, (req, res) => {
	try {
		// Try multiple possible paths for production compatibility
		const possiblePaths = [
			path.join(__dirname, '../../Invoice_Import_Template.xlsx'), // From server/routes/ to root
			path.resolve(process.cwd(), 'Invoice_Import_Template.xlsx'), // From current working directory
			path.resolve(__dirname, '../../../Invoice_Import_Template.xlsx'), // Alternative relative path
		];
		
		let templatePath = null;
		for (const possiblePath of possiblePaths) {
			if (fs.existsSync(possiblePath)) {
				templatePath = possiblePath;
				break;
			}
		}
		
		if (!templatePath) {
			console.error('Invoice template not found. Tried paths:', possiblePaths);
			return res.status(404).json({ error: 'Invoice import template not found' });
		}
		
		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		res.setHeader('Content-Disposition', 'attachment; filename="invoice_import_template.xlsx"');
		
		const fileStream = fs.createReadStream(templatePath);
		fileStream.on('error', (err) => {
			console.error('Error streaming invoice template:', err);
			if (!res.headersSent) {
				res.status(500).json({ error: 'Failed to stream template file' });
			}
		});
		fileStream.pipe(res);
	} catch (err) {
		console.error('Error serving invoice template:', err);
		if (!res.headersSent) {
			res.status(500).json({ error: 'Failed to download template' });
		}
	}
});

module.exports = router;





