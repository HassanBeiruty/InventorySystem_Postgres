const express = require('express');
const { query } = require('../db');
const jwt = require('jsonwebtoken');
const moment = require('moment-timezone');
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
	// Lebanon REAL OFFSET (Winter = UTC+2)
	const offset = 2; // change to 3 if DST is active
	const beirut = new Date(now.getTime() + offset * 60 * 60 * 1000);
	const pad = (n) => String(n).padStart(2, "0");
	return `${beirut.getFullYear()}-${pad(beirut.getMonth() + 1)}-${pad(beirut.getDate())} ` +
		`${pad(beirut.getHours())}:${pad(beirut.getMinutes())}:${pad(beirut.getSeconds())}`;
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

// ===== AUTH =====
const SESSION_KEY = 'local_auth_session';

function hashPassword(pw) {
	let h = 0;
	for (let i = 0; i < pw.length; i++) h = (h << 5) - h + pw.charCodeAt(i);
	return `${h}`;
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
		
		// Check if user is admin
		const result = await query('SELECT is_admin FROM users WHERE id = $1', [{ id: req.user.userId }]);
		
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

router.post('/auth/signup', async (req, res) => {
	try {
		const { email, password } = req.body;
		const result = await query('SELECT id FROM users WHERE email = $1', [{ email }]);
		if (result.recordset.length > 0) {
			return res.status(400).json({ error: 'User already exists' });
		}
		
		// Check if this is the first user (table is empty)
		const userCountResult = await query('SELECT COUNT(*) as count FROM users', []);
		const userCount = userCountResult.recordset[0]?.count || 0;
		const isFirstUser = userCount === 0;
		
		const passwordHash = hashPassword(password);
		const insertResult = await query(
			'INSERT INTO users (email, passwordHash, is_admin, created_at) VALUES ($1, $2, $3, $4) RETURNING id, is_admin',
			[{ email, passwordHash, is_admin: isFirstUser, created_at: nowIso() }]
		);
		const user = insertResult.recordset[0];
		const isAdmin = user.is_admin === true || user.is_admin === 1;
		
		if (isFirstUser) {
			console.log(`✓ First user created and set as admin: ${email}`);
		}
		
		// Generate JWT token
		const token = jwt.sign({ userId: user.id, email, isAdmin }, JWT_SECRET, { expiresIn: '7d' });
		res.json({ id: user.id, email, isAdmin, token });
	} catch (err) {
		console.error('Signup error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/auth/signin', async (req, res) => {
	try {
		const { email, password } = req.body;
		const passwordHash = hashPassword(password);
		const result = await query('SELECT id, email, is_admin FROM users WHERE email = $1 AND passwordHash = $2', [
			{ email, passwordHash },
		]);
		if (result.recordset.length === 0) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		const user = result.recordset[0];
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
		const result = await query('SELECT id, email, is_admin FROM users WHERE id = $1', [{ id: req.user.userId }]);
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

router.post('/customers', async (req, res) => {
	try {
		const { name, phone, address, credit_limit } = req.body;
		const result = await query(
			'INSERT INTO customers (name, phone, address, credit_limit, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
			[{ name, phone: phone || null, address: address || null, credit_limit: credit_limit || 0, created_at: nowIso() }]
		);
		const id = result.recordset[0].id;
		res.json({ id });
	} catch (err) {
		console.error('Create customer error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.put('/customers/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { name, phone, address, credit_limit } = req.body;
		const updates = [];
		const params = [{ id }];
		let paramIndex = 1;
		if (name !== undefined) {
			updates.push(`name = $${++paramIndex}`);
			params.push({ name });
		}
		if (phone !== undefined) {
			updates.push(`phone = $${++paramIndex}`);
			params.push({ phone: phone || null });
		}
		if (address !== undefined) {
			updates.push(`address = $${++paramIndex}`);
			params.push({ address: address || null });
		}
		if (credit_limit !== undefined) {
			updates.push(`credit_limit = $${++paramIndex}`);
			params.push({ credit_limit });
		}
		if (updates.length === 0) {
			return res.json({ id });
		}
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

router.post('/suppliers', async (req, res) => {
	try {
		const { name, phone, address } = req.body;
		const result = await query(
			'INSERT INTO suppliers (name, phone, address, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
			[{ name }, { phone: phone || null }, { address: address || null }, { created_at: nowIso() }]
		);
		const id = result.recordset[0].id;
		res.json({ id });
	} catch (err) {
		console.error('Create supplier error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.put('/suppliers/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { name, phone, address } = req.body;
		const updates = [];
		const params = [{ id }];
		let paramIndex = 1;
		if (name !== undefined) {
			updates.push(`name = $${++paramIndex}`);
			params.push({ name });
		}
		if (phone !== undefined) {
			updates.push(`phone = $${++paramIndex}`);
			params.push({ phone: phone || null });
		}
		if (address !== undefined) {
			updates.push(`address = $${++paramIndex}`);
			params.push({ address: address || null });
		}
		if (updates.length === 0) {
			return res.json({ id });
		}
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
		const result = await query('SELECT * FROM categories ORDER BY name ASC', []);
		res.json(result.recordset);
	} catch (err) {
		console.error('List categories error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/categories', async (req, res) => {
	try {
		const { name, description } = req.body;
		const result = await query(
			'INSERT INTO categories (name, description, created_at) VALUES ($1, $2, $3) RETURNING id',
			[{ name }, { description: description || null }, { created_at: nowIso() }]
		);
		const id = result.recordset[0].id;
		res.json({ id });
	} catch (err) {
		console.error('Create category error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.put('/categories/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { name, description } = req.body;
		const updates = [];
		const params = [{ id }];
		let paramIndex = 1;
		if (name !== undefined) {
			updates.push(`name = $${++paramIndex}`);
			params.push({ name });
		}
		if (description !== undefined) {
			updates.push(`description = $${++paramIndex}`);
			params.push({ description: description || null });
		}
		if (updates.length === 0) {
			return res.json({ id });
		}
		await query(`UPDATE categories SET ${updates.join(', ')} WHERE id = $1`, params);
		res.json({ id });
	} catch (err) {
		console.error('Update category error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.delete('/categories/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		// Check if any products are using this category
		const productsResult = await query('SELECT COUNT(*) as count FROM products WHERE category_id = $1', [{ id }]);
		if (productsResult.recordset[0].count > 0) {
			return res.status(400).json({ error: 'Cannot delete category: products are still assigned to it' });
		}
		await query('DELETE FROM categories WHERE id = $1', [{ id }]);
		res.json({ success: true });
	} catch (err) {
		console.error('Delete category error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== PRODUCTS =====
router.get('/products', async (req, res) => {
	try {
		const result = await query(
			'SELECT p.id, p.name, p.barcode, p.category_id, p.description, p.sku, p.shelf, p.created_at, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC',
			[]
		);
		res.json(result.recordset);
	} catch (err) {
		console.error('List products error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/products', async (req, res) => {
	try {
		const { name, barcode, category_id, description, sku, shelf } = req.body;
		const result = await query(
			'INSERT INTO products (name, barcode, category_id, description, sku, shelf, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
			[
				{ name }, 
				{ barcode: barcode || null }, 
				{ category_id: category_id ? parseInt(category_id) : null },
				{ description: description || null },
				{ sku: sku || null },
				{ shelf: shelf || null },
				{ created_at: nowIso() }
			]
		);
		const id = result.recordset[0].id;
		// Ensure daily stock entry
		const today = getTodayLocal();
		await query(
			`INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) 
			 VALUES ($1, 0, 0, $2, $3, $3)
			 ON CONFLICT (product_id, date) DO NOTHING`,
			[{ product_id: id }, { date: today }, { created_at: nowIso() }]
		);
		res.json({ id });
	} catch (err) {
		console.error('Create product error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.put('/products/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { name, barcode, category_id, description, sku, shelf } = req.body;
		const updates = [];
		const params = [{ id }];
		let paramIndex = 1;
		if (name !== undefined) {
			updates.push(`name = $${++paramIndex}`);
			params.push({ name });
		}
		if (barcode !== undefined) {
			updates.push(`barcode = $${++paramIndex}`);
			params.push({ barcode: barcode || null });
		}
		if (category_id !== undefined) {
			updates.push(`category_id = $${++paramIndex}`);
			params.push({ category_id: category_id ? parseInt(category_id) : null });
		}
		if (description !== undefined) {
			updates.push(`description = $${++paramIndex}`);
			params.push({ description: description || null });
		}
		if (sku !== undefined) {
			updates.push(`sku = $${++paramIndex}`);
			params.push({ sku: sku || null });
		}
		if (shelf !== undefined) {
			updates.push(`shelf = $${++paramIndex}`);
			params.push({ shelf: shelf || null });
		}
		if (updates.length === 0) {
			return res.json({ id });
		}
		await query(`UPDATE products SET ${updates.join(', ')} WHERE id = $1`, params);
		res.json({ id });
	} catch (err) {
		console.error('Update product error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.delete('/products/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		// Check if product exists
		const checkResult = await query('SELECT id FROM products WHERE id = $1', [{ id }]);
		if (checkResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Product not found' });
		}
		// Delete product (cascade will handle related records)
		await query('DELETE FROM products WHERE id = $1', [{ id }]);
		res.json({ success: true, id });
	} catch (err) {
		console.error('Delete product error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== INVOICES =====
router.get('/invoices', async (req, res) => {
	try {
		// Load invoices with customer and supplier data via JOINs (more efficient)
		const [invoicesResult, invoiceItemsResult] = await Promise.all([
			query(
				`SELECT 
					i.*,
					c.id as customer_id_val, c.name as customer_name, c.phone as customer_phone, c.address as customer_address, c.credit_limit as customer_credit_limit, c.created_at as customer_created_at,
					s.id as supplier_id_val, s.name as supplier_name, s.phone as supplier_phone, s.address as supplier_address, s.created_at as supplier_created_at
				FROM invoices i
				LEFT JOIN customers c ON i.customer_id = c.id
				LEFT JOIN suppliers s ON i.supplier_id = s.id
				ORDER BY i.created_at DESC`,
				[]
			),
			query('SELECT * FROM invoice_items ORDER BY invoice_id, id', [])
		]);
		
		// Log the count for debugging
		console.log(`[Invoices] Total invoices fetched: ${invoicesResult.recordset.length}`);
		
		// Group invoice items by invoice_id
		const idToItems = new Map();
		invoiceItemsResult.recordset.forEach(item => {
			if (!idToItems.has(item.invoice_id)) {
				idToItems.set(item.invoice_id, []);
			}
			idToItems.get(item.invoice_id).push(item);
		});
		
		const result = invoicesResult.recordset.map((inv) => {
			try {
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
					is_paid: !!inv.is_paid,
					amount_paid: amountPaid,
					payment_status: paymentStatus,
					remaining_balance: remainingBalance,
					customers,
					suppliers,
					invoice_items: idToItems.get(inv.id) || [],
				};
			} catch (err) {
				console.error(`[Invoices] Error processing invoice ${inv.id}:`, err);
				// Return a basic invoice object even if processing fails
				return {
					...inv,
					is_paid: !!inv.is_paid,
					amount_paid: inv.amount_paid || 0,
					payment_status: 'pending',
					remaining_balance: (inv.total_amount || 0) - (inv.amount_paid || 0),
					customers: undefined,
					suppliers: undefined,
					invoice_items: idToItems.get(inv.id) || [],
				};
			}
		});
		
		console.log(`[Invoices] Total invoices returned: ${result.length}`);
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
				SELECT * FROM invoices ORDER BY invoice_date DESC LIMIT $1
			) i
			LEFT JOIN customers c ON i.customer_id = c.id
			LEFT JOIN suppliers s ON i.supplier_id = s.id
			ORDER BY i.invoice_date DESC`,
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
				is_paid: !!inv.is_paid,
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
		
		const { invoice_type, customer_id, supplier_id, total_amount, is_paid, due_date, items } = req.body;
		const today = getTodayLocal();

		// Get existing invoice with its date
		const existingInvoice = await query('SELECT * FROM invoices WHERE id = $1', [{ id }]);
		
		if (existingInvoice.recordset.length === 0) {
			return res.status(404).json({ error: `Invoice not found with id: ${id}` });
		}
		const oldInvoice = existingInvoice.recordset[0];
		// Get the original invoice date (might be in the past) - convert to local timezone
		const invoiceDate = oldInvoice.invoice_date ? toLocalDateString(oldInvoice.invoice_date) : today;

		// Get existing invoice items
		const oldItemsResult = await query('SELECT * FROM invoice_items WHERE invoice_id = $1', [{ invoice_id: id }]);
		const oldItems = oldItemsResult.recordset;

		// Collect all affected products (from both old and new items)
		const affectedProducts = new Set();
		oldItems.forEach(item => affectedProducts.add(item.product_id));
		items.forEach(item => affectedProducts.add(parseInt(item.product_id)));

		// Delete old invoice items (stock movements will be updated by the function, not deleted)
		await query('DELETE FROM invoice_items WHERE invoice_id = $1', [{ invoice_id: id }]);

		// Update invoice
		await query(
			'UPDATE invoices SET invoice_type = $1, customer_id = $2, supplier_id = $3, total_amount = $4, is_paid = $5, due_date = $6 WHERE id = $7',
			[
				{ invoice_type },
				{ customer_id: customer_id ? parseInt(customer_id) : null },
				{ supplier_id: supplier_id ? parseInt(supplier_id) : null },
				{ total_amount },
				{ is_paid: is_paid ? 1 : 0 },
				{ due_date: due_date || null },
				{ id }
			]
		);

		// Create new invoice items (stock movements already exist and will be updated by the function)
		for (const item of items) {
			await query(
				'INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price, price_type, is_private_price, private_price_amount, private_price_note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
				[
					{ invoice_id: id },
					{ product_id: parseInt(item.product_id) },
					{ quantity: item.quantity },
					{ unit_price: item.unit_price },
					{ total_price: item.total_price },
					{ price_type: item.price_type },
					{ is_private_price: item.is_private_price ? 1 : 0 },
					{ private_price_amount: item.is_private_price ? item.private_price_amount : null },
					{ private_price_note: item.is_private_price ? item.private_price_note : null }
				]
			);
		}

		// Call the function to recalculate stock for each affected product
		// The function will update existing stock movements and recalculate all later movements
		for (const productId of affectedProducts) {
			const item = items.find(item => parseInt(item.product_id) === productId);
			if (item) {
				const change = invoice_type === 'sell' ? -item.quantity : item.quantity;
				const unitCost = parseFloat(item.unit_price);
				
				// Call the function to recalculate - it will update the stock movement we just created
				await query(
					'SELECT recalculate_stock_after_invoice($1, $2, $3, $4, $5)',
					[
						{ invoice_id: id },
						{ product_id: productId },
						{ action_type: 'EDIT' },
						{ new_qty: change },
						{ new_unit_cost: unitCost }
					]
				);
			}
		}

		res.json({ id: String(id), invoice_date: oldInvoice.invoice_date });
	} catch (err) {
		console.error('Update invoice error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.delete('/invoices/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		
		// Check if invoice exists and get its items
		const checkResult = await query('SELECT id FROM invoices WHERE id = $1', [{ id }]);
		if (checkResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Invoice not found' });
		}
		
		// Get invoice items to know which products are affected
		const itemsResult = await query('SELECT DISTINCT product_id FROM invoice_items WHERE invoice_id = $1', [{ invoice_id: id }]);
		const affectedProducts = itemsResult.recordset.map(row => row.product_id);
		
		// Call the function for each affected product with DELETE action
		for (const productId of affectedProducts) {
			await query(
				'SELECT recalculate_stock_after_invoice($1, $2, $3, NULL, NULL)',
				[
					{ invoice_id: id },
					{ product_id: productId },
					{ action_type: 'DELETE' }
				]
			);
			console.log(`  Recalculated stock for product ${productId} after DELETE using function`);
		}
		
		// Delete related records (function already deleted stock_movements)
		await query('DELETE FROM invoice_items WHERE invoice_id = $1', [{ invoice_id: id }]);
		await query('DELETE FROM invoice_payments WHERE invoice_id = $1', [{ invoice_id: id }]);
		
		// Delete invoice
		await query('DELETE FROM invoices WHERE id = $1', [{ id }]);
		
		res.json({ success: true, id });
	} catch (err) {
		console.error('Delete invoice error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.get('/invoices/overdue', async (req, res) => {
	try {
		const today = getTodayLocal();
		const invoices = await query(
			`SELECT i.*, c.name as customer_name, c.phone as customer_phone, s.name as supplier_name, s.phone as supplier_phone
			 FROM invoices i
			 LEFT JOIN customers c ON i.customer_id = c.id
			 LEFT JOIN suppliers s ON i.supplier_id = s.id
			 WHERE i.due_date IS NOT NULL 
			   AND CAST(i.due_date AS DATE) < CAST($1 AS DATE)
			   AND i.payment_status != 'paid'
			 ORDER BY i.due_date ASC`,
			[{ today }]
		);
		
		// Format the response to match frontend expectations
		const result = invoices.recordset.map(inv => ({
			...inv,
			customers: inv.customer_id ? { name: inv.customer_name, phone: inv.customer_phone } : undefined,
			suppliers: inv.supplier_id ? { name: inv.supplier_name, phone: inv.supplier_phone } : undefined,
		}));
		
		res.json(result);
	} catch (err) {
		console.error('Get overdue invoices error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/invoices', async (req, res) => {
	try {
		const { invoice_type, customer_id, supplier_id, total_amount, is_paid, due_date, items } = req.body;
		// Use PostgreSQL's NOW() with timezone conversion to get current time in Lebanon timezone
		const today = getTodayLocal();

		// Create invoice - use lebanonISO() which returns PostgreSQL compatible format
		const invoiceTimestamp = nowIso();
		// Format is already "YYYY-MM-DD HH:mm" - directly usable for PostgreSQL TIMESTAMP
		const invoiceResult = await query(
			`INSERT INTO invoices (invoice_type, customer_id, supplier_id, total_amount, is_paid, invoice_date, due_date, created_at) 
			 VALUES ($1, $2, $3, $4, $5, $6::timestamp, $7, $6::timestamp) RETURNING id, invoice_date`,
			[
				{ invoice_type },
				{ customer_id: customer_id ? parseInt(customer_id) : null },
				{ supplier_id: supplier_id ? parseInt(supplier_id) : null },
				{ total_amount },
				{ is_paid: is_paid ? 1 : 0 },
				{ invoice_date: invoiceTimestamp },
				{ due_date: due_date || null },
			]
		);
		const invoiceId = invoiceResult.recordset[0].id;
		const invoice_date = invoiceResult.recordset[0].invoice_date;

		// Create invoice items and update stock
		for (const item of items) {
			await query(
				'INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price, price_type, is_private_price, private_price_amount, private_price_note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
				[
					{ invoice_id: invoiceId },
					{ product_id: parseInt(item.product_id) },
					{ quantity: item.quantity },
					{ unit_price: item.unit_price },
					{ total_price: item.total_price },
					{ price_type: item.price_type },
					{ is_private_price: item.is_private_price ? 1 : 0 },
					{ private_price_amount: item.is_private_price ? item.private_price_amount : null },
					{ private_price_note: item.is_private_price ? item.private_price_note : null },
				]
			);

			// Get the quantity before this transaction (from today or last available)
			let stockBefore = await query(
				'SELECT available_qty, avg_cost FROM daily_stock WHERE product_id = $1 AND date <= $2 ORDER BY date DESC, updated_at DESC LIMIT 1', 
				[
					{ product_id: parseInt(item.product_id) },
					{ date: today },
				]
			);
			
			let qtyBefore = stockBefore.recordset[0]?.available_qty || 0;
			let prevAvgCost = stockBefore.recordset[0]?.avg_cost || 0;
			
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

			// Calculate unit_cost and avg_cost_after
			const unitCost = parseFloat(item.unit_price);
			const avgCostAfter = newAvgCost;
			
			// Record stock movement with today's date, including unit_cost and avg_cost_after
			// Use lebanonISO() which returns PostgreSQL compatible format
			const movementTimestamp = nowIso();
			const movementResult = await query(
				`INSERT INTO stock_movements (product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, unit_cost, avg_cost_after, created_at) 
				 VALUES ($1, $2, (SELECT invoice_date FROM invoices WHERE id = $2), $3, $4, $5, $6, $7, $8::timestamp) RETURNING id`,
				[
					{ product_id: parseInt(item.product_id) },
					{ invoice_id: invoiceId },
					{ quantity_before: qtyBefore },
					{ quantity_change: change },
					{ quantity_after: qtyAfter },
					{ unit_cost: unitCost },
					{ avg_cost_after: avgCostAfter },
					{ created_at: movementTimestamp },
				]
			);

			// Update daily_stock with quantity_after and avg_cost_after
			const stockTimestamp = nowIso();
			await query(
				`INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) 
				 VALUES ($1, $2, $3, $4, $5, $5)
				 ON CONFLICT (product_id, date) 
				 DO UPDATE SET available_qty = $2, avg_cost = $3, updated_at = $5`,
				[
					{ product_id: parseInt(item.product_id) },
					{ available_qty: qtyAfter },
					{ avg_cost: avgCostAfter },
					{ date: today },
					{ updated_at: stockTimestamp },
				]
			);
		}

		res.json({ id: invoiceId, invoice_date });
	} catch (err) {
		console.error('Create invoice error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== INVOICE PAYMENTS =====
// Get single invoice with payment details
router.get('/invoices/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		
		// Get invoice
		const invoiceResult = await query('SELECT * FROM invoices WHERE id = $1', [{ id }]);
		if (invoiceResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Invoice not found' });
		}
		
		const invoice = invoiceResult.recordset[0];
		
		// Get payments (with currency information)
		const paymentsResult = await query(
			`SELECT id, invoice_id, paid_amount, currency_code, exchange_rate_on_payment, usd_equivalent_amount, 
			 payment_date, payment_method, notes, created_at 
			 FROM invoice_payments WHERE invoice_id = $1 ORDER BY payment_date DESC`,
			[{ invoice_id: id }]
		);
		const payments = paymentsResult.recordset;
		
		// Calculate amount_paid from USD equivalents of all payments (for consistency)
		const totalPaidUsd = payments.reduce((sum, p) => {
			return sum + parseFloat(String(p.usd_equivalent_amount || 0));
		}, 0);
		
		// Get invoice items with product details
		const itemsResult = await query(
			`SELECT ii.*, p.name as product_name, p.barcode as product_barcode
			 FROM invoice_items ii
			 LEFT JOIN products p ON ii.product_id = p.id
			 WHERE ii.invoice_id = $1
			 ORDER BY ii.id`,
			[{ invoice_id: id }]
		);
		const invoice_items = itemsResult.recordset;
		
		// Get customer/supplier details
		const customersResult = await query('SELECT * FROM customers WHERE id = $1', [{ id: invoice.customer_id || 0 }]);
		const suppliersResult = await query('SELECT * FROM suppliers WHERE id = $1', [{ id: invoice.supplier_id || 0 }]);
		
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
			is_paid: !!invoice.is_paid,
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
			'UPDATE invoices SET amount_paid = $1, payment_status = $2, is_paid = $3 WHERE id = $4',
			[
				{ amount_paid: newAmountPaid },
				{ payment_status: newPaymentStatus },
				{ is_paid: newAmountPaid >= totalAmount ? 1 : 0 },
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
		// Use JOIN to get products with stock data (more efficient)
		const result = await query(
			`SELECT 
				ds.*,
				p.id as product_id_val, p.name as product_name, p.barcode as product_barcode, p.category_id as product_category_id,
				p.description as product_description, p.sku as product_sku, p.shelf as product_shelf, p.created_at as product_created_at
			FROM daily_stock ds
			LEFT JOIN products p ON ds.product_id = p.id
			ORDER BY ds.date DESC`,
			[]
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
			ORDER BY ds.updated_at DESC`,
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
		// Use JOIN to get products with stock data (more efficient)
		const result = await query(
			`SELECT 
				ds.*,
				p.id as product_id_val, p.name as product_name, p.barcode as product_barcode, p.category_id as product_category_id,
				p.description as product_description, p.sku as product_sku, p.shelf as product_shelf, p.created_at as product_created_at
			FROM daily_stock ds
			LEFT JOIN products p ON ds.product_id = p.id
			ORDER BY ds.date DESC, ds.product_id ASC`,
			[]
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
		console.error('Daily history error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== STOCK MOVEMENTS =====
router.get('/stock-movements/recent/:limit', async (req, res) => {
	try {
		const limit = parseInt(req.params.limit) || 20;
		
		// Use JOIN to only get products for the limited movements (more efficient)
		const result = await query(
			`SELECT 
				sm.*,
				p.id as product_id_val, p.name as product_name, p.barcode as product_barcode, p.category_id as product_category_id,
				p.description as product_description, p.sku as product_sku, p.shelf as product_shelf, p.created_at as product_created_at
			FROM (
				SELECT * FROM stock_movements ORDER BY invoice_date DESC LIMIT $1
			) sm
			LEFT JOIN products p ON sm.product_id = p.id
			ORDER BY sm.invoice_date DESC`,
			[{ limit }]
		);
		
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
            params.push({ product_id: parseInt(product_id) }); 
        }
        
        // If no date filters provided, default to today only (live/current costs)
        if (!start_date && !end_date) {
            paramIndex++;
            sql += ` AND ds.date = $${paramIndex}`;
            params.push({ today });
        } else {
            // If date filters are provided, use them
            if (start_date) { 
                paramIndex++;
                sql += ` AND ds.date >= $${paramIndex}`; 
                params.push({ start_date }); 
            }
            if (end_date) { 
                paramIndex++;
                sql += ` AND ds.date <= $${paramIndex}`; 
                params.push({ end_date }); 
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
			params.push({ product_id });
		}
		if (start_date) {
			paramIndex++;
			sql += ` AND pp.effective_date >= $${paramIndex}`;
			params.push({ start_date });
		}
		if (end_date) {
			paramIndex++;
			sql += ` AND pp.effective_date <= $${paramIndex}`;
			params.push({ end_date });
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
router.get('/products/:id/prices', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const result = await query(
			`SELECT pp.*, p.name as product_name, p.barcode
			 FROM product_prices pp
			 LEFT JOIN products p ON pp.product_id = p.id
			 WHERE pp.product_id = $1
			 ORDER BY pp.effective_date DESC`,
			[{ productId: id }]
		);
		res.json(result.recordset);
	} catch (err) {
		console.error('Get product prices error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get latest price for a specific product
router.get('/products/:id/price-latest', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const result = await query(
			`SELECT pp.*
			 FROM product_prices pp
			 WHERE pp.product_id = $1
			 ORDER BY pp.effective_date DESC, pp.created_at DESC
			 LIMIT 1`,
			[{ productId: id }]
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
		const result = await query(
			`SELECT pp.product_id, p.name, p.barcode, pp.wholesale_price, pp.retail_price, pp.effective_date
			 FROM product_prices pp
			 INNER JOIN products p ON pp.product_id = p.id
			 INNER JOIN (
				 SELECT product_id, MAX(effective_date) as max_date
				 FROM product_prices
				 GROUP BY product_id
			 ) latest ON pp.product_id = latest.product_id AND pp.effective_date = latest.max_date
			 ORDER BY p.name`
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
		const result = await query(
			`INSERT INTO product_prices (product_id, wholesale_price, retail_price, effective_date, created_at)
			 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			[
				{ product_id: parseInt(product_id) },
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

// Export products
router.get('/export/products', async (req, res) => {
	try {
		// Check if categories table exists, if not, query without join
		let result;
		try {
			result = await query(
				'SELECT p.id, p.name, p.sku, p.barcode, p.shelf, p.description, c.name as category_name, p.created_at FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC',
				[]
			);
		} catch (joinErr) {
			// If join fails (categories table doesn't exist), query without category
			result = await query(
				'SELECT p.id, p.name, p.sku, p.barcode, p.shelf, p.description, NULL as category_name, p.created_at FROM products p ORDER BY p.created_at DESC',
				[]
			);
		}
		const csv = toCSV(result.recordset, ['id', 'name', 'sku', 'barcode', 'shelf', 'description', 'category_name', 'created_at']);
		res.setHeader('Content-Type', 'text/csv');
		res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
		res.send(csv);
	} catch (err) {
		console.error('Export products error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Export invoices
router.get('/export/invoices', async (req, res) => {
	try {
		const invoices = await query('SELECT * FROM invoices ORDER BY invoice_date DESC', []);
		const customers = await query('SELECT * FROM customers', []);
		const suppliers = await query('SELECT * FROM suppliers', []);
		const idToCustomer = new Map(customers.recordset.map((c) => [c.id, c]));
		const idToSupplier = new Map(suppliers.recordset.map((s) => [s.id, s]));
		
		const data = invoices.recordset.map((inv) => ({
			id: inv.id,
			invoice_type: inv.invoice_type,
			customer_name: inv.customer_id ? idToCustomer.get(inv.customer_id)?.name || '' : '',
			supplier_name: inv.supplier_id ? idToSupplier.get(inv.supplier_id)?.name || '' : '',
			total_amount: inv.total_amount,
			amount_paid: inv.amount_paid || 0,
			remaining_balance: (inv.total_amount || 0) - (inv.amount_paid || 0),
			payment_status: inv.payment_status || 'pending',
			invoice_date: inv.invoice_date,
			created_at: inv.created_at
		}));
		
		const csv = toCSV(data, ['id', 'invoice_type', 'customer_name', 'supplier_name', 'total_amount', 'amount_paid', 'remaining_balance', 'payment_status', 'invoice_date', 'created_at']);
		res.setHeader('Content-Type', 'text/csv');
		res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
		res.send(csv);
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
			const snapshotResult = await query(`
				SELECT MAX(created_at) as last_snapshot 
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
			timestamp: new Date().toISOString(),
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
				scheduledTime: '00:05 (Asia/Beirut)'
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
		console.log('[Admin] Manual database initialization requested');
		
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

// Manual trigger for daily stock snapshot
router.post('/admin/daily-stock-snapshot', authenticateToken, requireAdmin, async (req, res) => {
	try {
		console.log('[Admin] Manual daily stock snapshot requested');
		
		const startTime = new Date().toISOString();
		const todayLebanon = getTodayLocal();
		console.log(`[Admin] Running daily stock snapshot at ${startTime}`);
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
		
		const endTime = new Date().toISOString();
		console.log(`[Admin] ✓ Daily stock snapshot completed successfully at ${endTime}`);
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

// Admin: Clear all users (WARNING: This will delete all users except the current admin)
router.post('/admin/users/clear', authenticateToken, requireAdmin, async (req, res) => {
	try {
		// Get current admin user ID
		const currentUserId = req.user.userId;
		
		// Delete all users except the current admin
		await query('DELETE FROM users WHERE id != $1', [{ id: currentUserId }]);
		
		console.log(`[Admin] Users table cleared (admin ${currentUserId} preserved)`);
		
		res.json({ 
			success: true, 
			message: 'All users cleared. Next user to sign up will become admin.' 
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
		
		// If deleting an admin, ensure at least one admin remains
		if (user.is_admin === true || user.is_admin === 1) {
			const adminCountResult = await query('SELECT COUNT(*) as count FROM users WHERE is_admin = true', []);
			const adminCount = adminCountResult.recordset[0]?.count || 0;
			if (adminCount <= 1) {
				return res.status(400).json({ error: 'Cannot delete last admin. At least one admin must exist.' });
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
		
		// Ensure at least one admin remains
		if (isAdmin === false) {
			const adminCountResult = await query('SELECT COUNT(*) as count FROM users WHERE is_admin = true', []);
			const adminCount = adminCountResult.recordset[0]?.count || 0;
			if (adminCount <= 1) {
				return res.status(400).json({ error: 'Cannot remove last admin. At least one admin must exist.' });
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

module.exports = router;

