const express = require('express');
const { query } = require('../db');
const jwt = require('jsonwebtoken');
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
function nowLebanonIso() {
	const now = new Date();
	
	// Get current time components in Lebanon timezone
	const lebanonParts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Beirut',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	}).formatToParts(now);
	
	const year = parseInt(lebanonParts.find(p => p.type === 'year')?.value || '0');
	const month = parseInt(lebanonParts.find(p => p.type === 'month')?.value || '0');
	const day = parseInt(lebanonParts.find(p => p.type === 'day')?.value || '0');
	const hour = parseInt(lebanonParts.find(p => p.type === 'hour')?.value || '0');
	const minute = parseInt(lebanonParts.find(p => p.type === 'minute')?.value || '0');
	const second = parseInt(lebanonParts.find(p => p.type === 'second')?.value || '0');
	const ms = now.getMilliseconds();
	
	// Create ISO string with Lebanon time components
	// Since DATETIME2 doesn't store timezone, we store the Lebanon local time directly
	// Format: YYYY-MM-DDTHH:mm:ss.sss (no Z suffix, as it's local time)
	const isoStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
	
	return isoStr;
}

function nowIso() {
	// Return current time in Lebanon timezone (Asia/Beirut) as ISO string
	return nowLebanonIso();
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

router.post('/auth/signup', async (req, res) => {
	try {
		const { email, password } = req.body;
		const result = await query('SELECT id FROM users WHERE email = $1', [{ email }]);
		if (result.recordset.length > 0) {
			return res.status(400).json({ error: 'User already exists' });
		}
		const passwordHash = hashPassword(password);
		const insertResult = await query(
			'INSERT INTO users (email, passwordHash, created_at) VALUES ($1, $2, $3) RETURNING id',
			[{ email, passwordHash, created_at: nowIso() }]
		);
		const id = insertResult.recordset[0].id;
		// Generate JWT token
		const token = jwt.sign({ userId: id, email }, JWT_SECRET, { expiresIn: '7d' });
		res.json({ id, email, token });
	} catch (err) {
		console.error('Signup error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/auth/signin', async (req, res) => {
	try {
		const { email, password } = req.body;
		const passwordHash = hashPassword(password);
		const result = await query('SELECT id, email FROM users WHERE email = $1 AND passwordHash = $2', [
			{ email, passwordHash },
		]);
		if (result.recordset.length === 0) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		const user = result.recordset[0];
		// Generate JWT token
		const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
		res.json({ id: user.id, email: user.email, token });
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
		const invoices = await query('SELECT * FROM invoices ORDER BY created_at DESC', []);
		const customers = await query('SELECT * FROM customers', []);
		const suppliers = await query('SELECT * FROM suppliers', []);
		const invoiceItems = await query('SELECT * FROM invoice_items', []);
		const idToCustomer = new Map(customers.recordset.map((c) => [c.id, c]));
		const idToSupplier = new Map(suppliers.recordset.map((s) => [s.id, s]));
		const idToItems = new Map();
		invoiceItems.recordset.forEach(item => {
			if (!idToItems.has(item.invoice_id)) {
				idToItems.set(item.invoice_id, []);
			}
			idToItems.get(item.invoice_id).push(item);
		});
		const result = invoices.recordset.map((inv) => {
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
			return {
				...inv,
				is_paid: !!inv.is_paid, // Convert BIT to boolean
				amount_paid: amountPaid,
				payment_status: paymentStatus,
				remaining_balance: remainingBalance,
				customers: inv.customer_id ? idToCustomer.get(inv.customer_id) : undefined,
				suppliers: inv.supplier_id ? idToSupplier.get(inv.supplier_id) : undefined,
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
		const invoices = await query(`SELECT * FROM invoices ORDER BY invoice_date DESC LIMIT $1`, [{ limit }]);
		const customers = await query('SELECT * FROM customers', []);
		const suppliers = await query('SELECT * FROM suppliers', []);
		const invoiceItems = await query('SELECT * FROM invoice_items', []);
		const idToCustomer = new Map(customers.recordset.map((c) => [c.id, c]));
		const idToSupplier = new Map(suppliers.recordset.map((s) => [s.id, s]));
		const idToItems = new Map();
		invoiceItems.recordset.forEach(item => {
			if (!idToItems.has(item.invoice_id)) {
				idToItems.set(item.invoice_id, []);
			}
			idToItems.get(item.invoice_id).push(item);
		});
		const result = invoices.recordset.map((inv) => {
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
			return {
				...inv,
				is_paid: !!inv.is_paid,
				amount_paid: amountPaid,
				payment_status: paymentStatus,
				remaining_balance: remainingBalance,
				customers: inv.customer_id ? idToCustomer.get(inv.customer_id) : undefined,
				suppliers: inv.supplier_id ? idToSupplier.get(inv.supplier_id) : undefined,
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
		
		console.log(`Dashboard stats: Fetching data for today: ${today}`);
		
		// Today's invoices - READ FROM INVOICES TABLE (not daily_stock)
		const todayInvoices = await query(
			'SELECT * FROM invoices WHERE CAST(invoice_date AS DATE) = $1', 
			[{ today }]
		);
		
		// Today's inventory - READ FROM DAILY_STOCK TABLE (today's records only)
		const todayStock = await query(
			'SELECT COUNT(DISTINCT product_id) as product_count, SUM(available_qty) as total_qty FROM daily_stock WHERE date = $1', 
			[{ today }]
		);
		
		// All time data (for reference)
		const [invoices, products, customers, suppliers] = await Promise.all([
			query('SELECT * FROM invoices', []),
			query('SELECT * FROM products', []),
			query('SELECT * FROM customers', []),
			query('SELECT * FROM suppliers', []),
		]);
		
		// Calculate totals
		const totalRevenue = invoices.recordset
			.filter((inv) => inv.invoice_type === 'sell')
			.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);
		
		// Today's revenue - FROM INVOICES TABLE
		const todayRevenue = todayInvoices.recordset
			.filter((inv) => inv.invoice_type === 'sell')
			.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);
		
		// Today's inventory stats - FROM DAILY_STOCK TABLE
		const todayProductsCount = todayStock.recordset[0]?.product_count || 0;
		const todayTotalQuantity = todayStock.recordset[0]?.total_qty || 0;
		
		console.log(`Dashboard stats: Today invoices=${todayInvoices.recordset.length}, Today products=${todayProductsCount}, Today revenue=$${todayRevenue}`);
		
		res.json({
			// All time stats (for reference)
			invoicesCount: invoices.recordset.length,
			productsCount: products.recordset.length,
			customersCount: customers.recordset.length,
			suppliersCount: suppliers.recordset.length,
			revenue: totalRevenue,
			// Today's live data
			todayInvoicesCount: todayInvoices.recordset.length, // FROM INVOICES TABLE
			todayProductsCount: todayProductsCount, // FROM DAILY_STOCK TABLE
			todayRevenue: todayRevenue, // FROM INVOICES TABLE
			todayTotalQuantity: todayTotalQuantity, // FROM DAILY_STOCK TABLE
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
		console.log('PUT /invoices/:id called with:', { 
			paramId: req.params.id, 
			parsedId: id, 
			body: req.body,
			method: req.method 
		});
		
		if (isNaN(id) || id <= 0) {
			return res.status(400).json({ error: `Invalid invoice ID: ${req.params.id}` });
		}
		
		const { invoice_type, customer_id, supplier_id, total_amount, is_paid, due_date, items } = req.body;
		const today = getTodayLocal();

		// Get existing invoice with its date
		const existingInvoice = await query('SELECT * FROM invoices WHERE id = $1', [{ id }]);
		console.log('Invoice lookup result:', { 
			id, 
			found: existingInvoice.recordset.length > 0,
			invoice: existingInvoice.recordset.length > 0 ? existingInvoice.recordset[0] : null
		});
		
		if (existingInvoice.recordset.length === 0) {
			return res.status(404).json({ error: `Invoice not found with id: ${id}` });
		}
		const oldInvoice = existingInvoice.recordset[0];
		// Get the original invoice date (might be in the past) - convert to local timezone
		const invoiceDate = oldInvoice.invoice_date ? toLocalDateString(oldInvoice.invoice_date) : today;
		
		console.log('=== INVOICE UPDATE DEBUG ===');
		console.log('Invoice ID:', id);
		console.log('Old invoice date:', oldInvoice.invoice_date);
		console.log('Parsed invoice date:', invoiceDate);
		console.log('Today:', today);
		console.log('Date comparison:', { invoiceDate, today, isToday: invoiceDate === today });

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
		console.log('Recalculating stock for products using function:', Array.from(affectedProducts));
		
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
				
				console.log(`  Recalculated stock for product ${productId} using function`);
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
		const invoice_date = nowIso();
		const today = getTodayLocal();

		console.log('=== CREATING NEW INVOICE ===');
		console.log('Server time:', new Date().toString());
		console.log('Invoice type:', invoice_type);
		console.log('Invoice date:', invoice_date);
		console.log('Today (calculated):', today);
		console.log('Items count:', items?.length || 0);

		// Create invoice
		const invoiceResult = await query(
			'INSERT INTO invoices (invoice_type, customer_id, supplier_id, total_amount, is_paid, invoice_date, due_date, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
			[
				{ invoice_type },
				{ customer_id: customer_id ? parseInt(customer_id) : null },
				{ supplier_id: supplier_id ? parseInt(supplier_id) : null },
				{ total_amount },
				{ is_paid: is_paid ? 1 : 0 },
				{ invoice_date },
				{ due_date: due_date || null },
				{ created_at: nowIso() },
			]
		);
		const invoiceId = invoiceResult.recordset[0].id;
		console.log('Created invoice ID:', invoiceId);

		// Create invoice items and update stock
		for (const item of items) {
			console.log(`Processing item: product_id=${item.product_id}, quantity=${item.quantity}`);
			
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
			
			console.log(`  Product ${item.product_id}: qtyBefore=${qtyBefore}, prevAvgCost=${prevAvgCost}`);
			
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

			console.log(`  Calculated: change=${change}, qtyAfter=${qtyAfter}, newAvgCost=${newAvgCost}`);

			// Calculate unit_cost and avg_cost_after
			const unitCost = parseFloat(item.unit_price);
			const avgCostAfter = newAvgCost;
			
			// Record stock movement with today's date, including unit_cost and avg_cost_after
			const movementResult = await query(
				'INSERT INTO stock_movements (product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, unit_cost, avg_cost_after, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
				[
					{ product_id: parseInt(item.product_id) },
					{ invoice_id: invoiceId },
					{ invoice_date }, // This is nowIso() which includes today's date
					{ qtyBefore },
					{ change },
					{ qtyAfter },
					{ unit_cost: unitCost },
					{ avg_cost_after: avgCostAfter },
					{ created_at: nowIso() },
				]
			);
			
			const movementId = movementResult.recordset[0]?.id;
			console.log(`  Created stock_movement ID=${movementId}, invoice_date=${invoice_date}, qtyBefore=${qtyBefore}, change=${change}, qtyAfter=${qtyAfter}, unit_cost=${unitCost}, avg_cost_after=${avgCostAfter}`);

			// Update daily_stock with quantity_after and avg_cost_after
			await query(
				`INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) 
				 VALUES ($1, $2, $3, $4, $5, $6)
				 ON CONFLICT (product_id, date) 
				 DO UPDATE SET available_qty = $2, avg_cost = $3, updated_at = $6`,
				[
					{ product_id: parseInt(item.product_id) },
					{ qty: qtyAfter },
					{ avgCost: avgCostAfter },
					{ date: today },
					{ created_at: nowIso() },
					{ updated_at: nowIso() }
				]
			);
		}

		console.log('=== INVOICE CREATION COMPLETE ===');
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
		
		// Get payments
		const paymentsResult = await query(
			'SELECT * FROM invoice_payments WHERE invoice_id = $1 ORDER BY payment_date DESC',
			[{ invoice_id: id }]
		);
		const payments = paymentsResult.recordset;
		
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
		const amountPaid = parseFloat(String(invoice.amount_paid || 0));
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
			'SELECT * FROM invoice_payments WHERE invoice_id = $1 ORDER BY payment_date DESC',
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
		const { payment_amount, payment_method, notes } = req.body;
		
		if (!payment_amount || payment_amount <= 0) {
			return res.status(400).json({ error: 'Payment amount must be greater than 0' });
		}
		
		// Get invoice details
		const invoiceResult = await query('SELECT * FROM invoices WHERE id = $1', [{ id }]);
		if (invoiceResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Invoice not found' });
		}
		
		const invoice = invoiceResult.recordset[0];
		// Convert DECIMAL strings to numbers
		const currentAmountPaid = parseFloat(String(invoice.amount_paid || 0));
		const totalAmount = parseFloat(String(invoice.total_amount || 0));
		const remainingBalance = totalAmount - currentAmountPaid;
		
		// Validate payment doesn't exceed remaining balance (use epsilon for floating point comparison)
		const epsilon = 0.01;
		if (payment_amount > remainingBalance + epsilon) {
			return res.status(400).json({ 
				error: `Payment amount (${payment_amount}) exceeds remaining balance (${remainingBalance.toFixed(2)})` 
			});
		}
		
		// Use current date/time for payment_date (not the invoice creation date)
		const payment_date = nowIso();
		const newAmountPaid = currentAmountPaid + parseFloat(String(payment_amount));
		
		// Determine new payment status
		let newPaymentStatus = 'pending';
		if (newAmountPaid >= totalAmount) {
			newPaymentStatus = 'paid';
		} else if (newAmountPaid > 0) {
			newPaymentStatus = 'partial';
		}
		
		// Insert payment record
		const paymentResult = await query(
			'INSERT INTO invoice_payments (invoice_id, payment_amount, payment_date, payment_method, notes, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
			[
				{ invoice_id: id },
				{ payment_amount },
				{ payment_date },
				{ payment_method: payment_method || null },
				{ notes: notes || null },
				{ created_at: nowIso() }
			]
		);
		const paymentId = paymentResult.recordset[0].id;
		
		// Update invoice amounts
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

// ===== INVENTORY =====
router.get('/inventory/low-stock/:threshold', async (req, res) => {
	try {
		const threshold = parseInt(req.params.threshold) || 10;
		const today = getTodayLocal();
		
		// Only get today's records (live quantities)
		const stock = await query(
			'SELECT * FROM daily_stock WHERE date = $1 AND available_qty < $2 ORDER BY available_qty ASC', 
			[{ today }, { threshold }]
		);
		
		const products = await query('SELECT * FROM products', []);
		const idToProduct = new Map(products.recordset.map((p) => [p.id, p]));
		const result = stock.recordset.map((d) => ({
			...d,
			products: idToProduct.get(d.product_id),
		}));
		
		console.log(`Low stock check: Found ${result.length} products below threshold ${threshold} for date ${today}`);
		res.json(result);
	} catch (err) {
		console.error('Low stock error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.get('/inventory/daily', async (req, res) => {
	try {
		const stock = await query('SELECT * FROM daily_stock ORDER BY date DESC', []);
		const products = await query('SELECT * FROM products', []);
		const idToProduct = new Map(products.recordset.map((p) => [p.id, p]));
		const result = stock.recordset.map((d) => ({
			...d,
			products: idToProduct.get(d.product_id),
		}));
		res.json(result);
	} catch (err) {
		console.error('Daily inventory error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.get('/inventory/today', async (req, res) => {
	try {
		const today = getTodayLocal();
		console.log(`Inventory Today: Fetching live quantities for date: ${today}`);
		
		const stock = await query('SELECT * FROM daily_stock WHERE date = $1 ORDER BY updated_at DESC', [{ date: today }]);
		const products = await query('SELECT * FROM products', []);
		
		// Get latest prices for all products
		const prices = await query(`
			SELECT pp1.product_id, pp1.wholesale_price, pp1.retail_price
			FROM product_prices pp1
			INNER JOIN (
				SELECT product_id, MAX(effective_date) as max_date
				FROM product_prices
				GROUP BY product_id
			) pp2 ON pp1.product_id = pp2.product_id AND pp1.effective_date = pp2.max_date
		`, []);
		
		const idToProduct = new Map(products.recordset.map((p) => [p.id, p]));
		const idToPrices = new Map(prices.recordset.map((p) => [p.product_id, p]));
		
		const result = stock.recordset.map((d) => {
			const product = idToProduct.get(d.product_id);
			const price = idToPrices.get(d.product_id);
			return {
				...d,
				products: product ? {
					...product,
					wholesale_price: price?.wholesale_price || 0,
					retail_price: price?.retail_price || 0,
				} : undefined,
			};
		});
		
		console.log(`Inventory Today: Returning ${result.length} products for ${today}`);
		res.json(result);
	} catch (err) {
		console.error('Today inventory error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.get('/inventory/daily-history', async (req, res) => {
	try {
		const stock = await query('SELECT * FROM daily_stock ORDER BY date DESC, product_id ASC', []);
		const products = await query('SELECT * FROM products', []);
		const idToProduct = new Map(products.recordset.map((p) => [p.id, p]));
		const result = stock.recordset.map((d) => ({
			...d,
			products: idToProduct.get(d.product_id),
		}));
		res.json(result);
	} catch (err) {
		console.error('Daily history error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== STOCK MOVEMENTS =====
router.get('/stock-movements/recent/:limit', async (req, res) => {
	try {
		const limit = parseInt(req.params.limit) || 20;
		const movements = await query(`SELECT * FROM stock_movements ORDER BY invoice_date DESC LIMIT $1`, [{ limit }]);
		const products = await query('SELECT * FROM products', []);
		const idToProduct = new Map(products.recordset.map((p) => [p.id, p]));
		const result = movements.recordset.map((m) => ({
			...m,
			products: idToProduct.get(m.product_id),
		}));
		res.json(result);
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

module.exports = router;

