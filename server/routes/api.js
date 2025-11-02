const express = require('express');
const { query } = require('../db');
const router = express.Router();

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
		const result = await query('SELECT id FROM users WHERE email = @email', [{ email }]);
		if (result.recordset.length > 0) {
			return res.status(400).json({ error: 'User already exists' });
		}
		const passwordHash = hashPassword(password);
		const insertResult = await query(
			'INSERT INTO users (email, passwordHash, created_at) OUTPUT INSERTED.id VALUES (@email, @passwordHash, @created_at)',
			[{ email, passwordHash, created_at: nowIso() }]
		);
		const id = insertResult.recordset[0].id;
		res.json({ id, email });
	} catch (err) {
		console.error('Signup error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/auth/signin', async (req, res) => {
	try {
		const { email, password } = req.body;
		const passwordHash = hashPassword(password);
		const result = await query('SELECT id, email FROM users WHERE email = @email AND passwordHash = @passwordHash', [
			{ email, passwordHash },
		]);
		if (result.recordset.length === 0) {
			return res.status(401).json({ error: 'Invalid credentials' });
		}
		res.json(result.recordset[0]);
	} catch (err) {
		console.error('Signin error:', err);
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
			'INSERT INTO customers (name, phone, address, credit_limit, created_at) OUTPUT INSERTED.id VALUES (@name, @phone, @address, @credit_limit, @created_at)',
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
		if (name !== undefined) {
			updates.push('name = @name');
			params.push({ name });
		}
		if (phone !== undefined) {
			updates.push('phone = @phone');
			params.push({ phone: phone || null });
		}
		if (address !== undefined) {
			updates.push('address = @address');
			params.push({ address: address || null });
		}
		if (credit_limit !== undefined) {
			updates.push('credit_limit = @credit_limit');
			params.push({ credit_limit });
		}
		if (updates.length === 0) {
			return res.json({ id });
		}
		await query(`UPDATE customers SET ${updates.join(', ')} WHERE id = @id`, params);
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
			'INSERT INTO suppliers (name, phone, address, created_at) OUTPUT INSERTED.id VALUES (@name, @phone, @address, @created_at)',
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
		if (name !== undefined) {
			updates.push('name = @name');
			params.push({ name });
		}
		if (phone !== undefined) {
			updates.push('phone = @phone');
			params.push({ phone: phone || null });
		}
		if (address !== undefined) {
			updates.push('address = @address');
			params.push({ address: address || null });
		}
		if (updates.length === 0) {
			return res.json({ id });
		}
		await query(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = @id`, params);
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
			'INSERT INTO categories (name, description, created_at) OUTPUT INSERTED.id VALUES (@name, @description, @created_at)',
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
		if (name !== undefined) {
			updates.push('name = @name');
			params.push({ name });
		}
		if (description !== undefined) {
			updates.push('description = @description');
			params.push({ description: description || null });
		}
		if (updates.length === 0) {
			return res.json({ id });
		}
		await query(`UPDATE categories SET ${updates.join(', ')} WHERE id = @id`, params);
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
		const productsResult = await query('SELECT COUNT(*) as count FROM products WHERE category_id = @id', [{ id }]);
		if (productsResult.recordset[0].count > 0) {
			return res.status(400).json({ error: 'Cannot delete category: products are still assigned to it' });
		}
		await query('DELETE FROM categories WHERE id = @id', [{ id }]);
		res.json({ success: true });
	} catch (err) {
		console.error('Delete category error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== PRODUCTS =====
router.get('/products', async (req, res) => {
	try {
		const result = await query('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC', []);
		res.json(result.recordset);
	} catch (err) {
		console.error('List products error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/products', async (req, res) => {
	try {
		const { name, barcode, category_id, description, sku } = req.body;
		const result = await query(
			'INSERT INTO products (name, barcode, category_id, description, sku, created_at) OUTPUT INSERTED.id VALUES (@name, @barcode, @category_id, @description, @sku, @created_at)',
			[
				{ name }, 
				{ barcode: barcode || null }, 
				{ category_id: category_id ? parseInt(category_id) : null },
				{ description: description || null },
				{ sku: sku || null },
				{ created_at: nowIso() }
			]
		);
		const id = result.recordset[0].id;
		// Ensure daily stock entry
		const today = getTodayLocal();
		await query(
			`IF NOT EXISTS (SELECT 1 FROM daily_stock WHERE product_id = @product_id AND date = @date)
			 INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) 
			 VALUES (@product_id, 0, 0, @date, @created_at, @created_at)`,
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
		const { name, barcode, category_id, description, sku } = req.body;
		const updates = [];
		const params = [{ id }];
		if (name !== undefined) {
			updates.push('name = @name');
			params.push({ name });
		}
		if (barcode !== undefined) {
			updates.push('barcode = @barcode');
			params.push({ barcode: barcode || null });
		}
		if (category_id !== undefined) {
			updates.push('category_id = @category_id');
			params.push({ category_id: category_id ? parseInt(category_id) : null });
		}
		if (description !== undefined) {
			updates.push('description = @description');
			params.push({ description: description || null });
		}
		if (sku !== undefined) {
			updates.push('sku = @sku');
			params.push({ sku: sku || null });
		}
		if (updates.length === 0) {
			return res.json({ id });
		}
		await query(`UPDATE products SET ${updates.join(', ')} WHERE id = @id`, params);
		res.json({ id });
	} catch (err) {
		console.error('Update product error:', err);
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
		const invoices = await query(`SELECT TOP ${limit} * FROM invoices ORDER BY invoice_date DESC`, []);
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
			'SELECT * FROM invoices WHERE CAST(invoice_date AS DATE) = @today', 
			[{ today }]
		);
		
		// Today's inventory - READ FROM DAILY_STOCK TABLE (today's records only)
		const todayStock = await query(
			'SELECT COUNT(DISTINCT product_id) as product_count, SUM(available_qty) as total_qty FROM daily_stock WHERE date = @today', 
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
		
		const { invoice_type, customer_id, supplier_id, total_amount, is_paid, items } = req.body;
		const today = getTodayLocal();

		// Get existing invoice with its date
		const existingInvoice = await query('SELECT * FROM invoices WHERE id = @id', [{ id }]);
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
		const oldItemsResult = await query('SELECT * FROM invoice_items WHERE invoice_id = @invoice_id', [{ invoice_id: id }]);
		const oldItems = oldItemsResult.recordset;

		// Collect all affected products (from both old and new items)
		const affectedProducts = new Set();
		oldItems.forEach(item => affectedProducts.add(item.product_id));
		items.forEach(item => affectedProducts.add(parseInt(item.product_id)));

		// Delete old invoice items and stock movements
		await query('DELETE FROM stock_movements WHERE invoice_id = @invoice_id', [{ invoice_id: id }]);
		await query('DELETE FROM invoice_items WHERE invoice_id = @invoice_id', [{ invoice_id: id }]);

		// Update invoice
		await query(
			'UPDATE invoices SET invoice_type = @invoice_type, customer_id = @customer_id, supplier_id = @supplier_id, total_amount = @total_amount, is_paid = @is_paid WHERE id = @id',
			[
				{ invoice_type },
				{ customer_id: customer_id ? parseInt(customer_id) : null },
				{ supplier_id: supplier_id ? parseInt(supplier_id) : null },
				{ total_amount },
				{ is_paid: is_paid ? 1 : 0 },
				{ id }
			]
		);

		// Create new invoice items and stock movements (we'll recalculate stock later)
		for (const item of items) {
			await query(
				'INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price, price_type, is_private_price, private_price_amount, private_price_note) OUTPUT INSERTED.id VALUES (@invoice_id, @product_id, @quantity, @unit_price, @total_price, @price_type, @is_private_price, @private_price_amount, @private_price_note)',
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
			
			// Create stock movement with placeholder quantities (will be recalculated)
			const change = invoice_type === 'sell' ? -item.quantity : item.quantity;
			await query(
				'INSERT INTO stock_movements (product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, created_at) VALUES (@product_id, @invoice_id, @invoice_date, @quantity_before, @quantity_change, @quantity_after, @created_at)',
				[
					{ product_id: parseInt(item.product_id) },
					{ invoice_id: id },
					{ invoice_date: oldInvoice.invoice_date },
					{ quantity_before: 0 }, // Will be recalculated
					{ quantity_change: change },
					{ quantity_after: 0 }, // Will be recalculated
					{ created_at: nowIso() }
				]
			);
		}

		// Now recalculate stock for all affected products from invoiceDate to today
		console.log('Recalculating stock for products:', Array.from(affectedProducts), 'from', invoiceDate, 'to', today);
		
		for (const productId of affectedProducts) {
			// Get the quantity before the invoice date (day before invoice date)
			const dayBeforeInvoice = new Date(invoiceDate);
			dayBeforeInvoice.setDate(dayBeforeInvoice.getDate() - 1);
			const dayBeforeStr = toLocalDateString(dayBeforeInvoice);
			
			const beforeResult = await query(
				'SELECT TOP 1 available_qty, avg_cost FROM daily_stock WHERE product_id = @product_id AND date <= @date ORDER BY date DESC, updated_at DESC',
				[{ product_id: productId }, { date: dayBeforeStr }]
			);
			
			let runningQty = beforeResult.recordset[0]?.available_qty || 0;
			let runningAvgCost = beforeResult.recordset[0]?.avg_cost || 0;
			
			console.log(`Product ${productId}: Starting qty from ${dayBeforeStr}:`, runningQty);

			// Get all stock movements for this product from invoiceDate to today (ordered chronologically)
			const movementsResult = await query(
				`SELECT sm.*, i.invoice_type, ii.unit_price, ii.quantity
				 FROM stock_movements sm
				 JOIN invoices i ON sm.invoice_id = i.id
				 LEFT JOIN invoice_items ii ON sm.invoice_id = ii.invoice_id AND sm.product_id = ii.product_id
				 WHERE sm.product_id = @product_id 
				 AND CAST(i.invoice_date AS DATE) >= @startDate 
				 AND CAST(i.invoice_date AS DATE) <= @endDate
				 ORDER BY i.invoice_date ASC, sm.created_at ASC`,
				[
					{ product_id: productId },
					{ startDate: invoiceDate },
					{ endDate: today }
				]
			);

			const movements = movementsResult.recordset;
			console.log(`Product ${productId}: Found ${movements.length} movements from ${invoiceDate} to ${today}`);

			// Group movements by date
			const movementsByDate = {};
			for (const movement of movements) {
				const movementDate = toLocalDateString(movement.invoice_date);
				if (!movementsByDate[movementDate]) {
					movementsByDate[movementDate] = [];
				}
				movementsByDate[movementDate].push(movement);
			}

			// Get all dates from invoiceDate to today (including both endpoints)
			const allDates = [];
			let currentDate = new Date(invoiceDate + 'T00:00:00Z'); // Parse as UTC to avoid timezone issues
			const todayDate = new Date(today + 'T00:00:00Z');
			
			console.log(`Product ${productId} date range setup:`, {
				invoiceDate,
				today,
				currentDate: currentDate.toISOString(),
				todayDate: todayDate.toISOString(),
				currentDateMs: currentDate.getTime(),
				todayDateMs: todayDate.getTime(),
				willLoop: currentDate.getTime() <= todayDate.getTime()
			});
			
			while (currentDate.getTime() <= todayDate.getTime()) {
				const dateStr = toLocalDateString(currentDate);
				allDates.push(dateStr);
				console.log(`  Adding date to process: ${dateStr}`);
				currentDate.setUTCDate(currentDate.getUTCDate() + 1);
			}
			
			console.log(`Product ${productId}: Processing ${allDates.length} dates total:`, allDates);

			// Process each date and update daily_stock
			for (const dateStr of allDates) {
				const dayMovements = movementsByDate[dateStr] || [];
				let dayStartQty = runningQty;
				let dayStartCost = runningAvgCost;

				console.log(`  Date ${dateStr}: ${dayMovements.length} movements, starting qty=${runningQty}`);

				// Apply all movements for this day
				for (const movement of dayMovements) {
					const change = movement.quantity_change;
					
					// Update average cost for BUY transactions
					if (movement.invoice_type === 'buy' && movement.unit_price) {
						const buyQty = movement.quantity;
						const buyCost = movement.unit_price;
						const denominator = runningQty + buyQty;
						if (denominator > 0) {
							runningAvgCost = ((runningAvgCost * runningQty) + (buyCost * buyQty)) / denominator;
						} else {
							runningAvgCost = buyCost;
						}
					}
					
					runningQty += change;
					
					// Update the stock_movement record with correct quantities
					await query(
						'UPDATE stock_movements SET quantity_before = @qtyBefore, quantity_after = @qtyAfter WHERE id = @movementId',
						[
							{ qtyBefore: dayStartQty },
							{ qtyAfter: runningQty },
							{ movementId: movement.id }
						]
					);
					
					console.log(`    Movement ID ${movement.id}: change=${change}, before=${dayStartQty}, after=${runningQty}`);
					dayStartQty = runningQty; // Next movement in same day starts from this quantity
				}

				// Update or insert daily_stock for this date
				const updateResult = await query(
					`IF EXISTS (SELECT 1 FROM daily_stock WHERE product_id = @product_id AND date = @date)
					 BEGIN
					   UPDATE daily_stock SET available_qty = @qty, avg_cost = @avgCost, updated_at = @updated_at WHERE product_id = @product_id AND date = @date
					   SELECT 'UPDATED' as action
					 END
					 ELSE
					 BEGIN
					   INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) VALUES (@product_id, @qty, @avgCost, @date, @created_at, @updated_at)
					   SELECT 'INSERTED' as action
					 END`,
					[
						{ product_id: productId },
						{ date: dateStr },
						{ qty: runningQty },
						{ avgCost: runningAvgCost },
						{ updated_at: nowIso() },
						{ created_at: nowIso() }
					]
				);
				
				console.log(`  Daily stock ${dateStr}: action=${updateResult.recordset[0]?.action}, qty=${runningQty}, avgCost=${runningAvgCost}`);
			}
		}

		res.json({ id: String(id), invoice_date: oldInvoice.invoice_date });
	} catch (err) {
		console.error('Update invoice error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/invoices', async (req, res) => {
	try {
		const { invoice_type, customer_id, supplier_id, total_amount, is_paid, items } = req.body;
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
			'INSERT INTO invoices (invoice_type, customer_id, supplier_id, total_amount, is_paid, invoice_date, created_at) OUTPUT INSERTED.id VALUES (@invoice_type, @customer_id, @supplier_id, @total_amount, @is_paid, @invoice_date, @created_at)',
			[
				{ invoice_type },
				{ customer_id: customer_id ? parseInt(customer_id) : null },
				{ supplier_id: supplier_id ? parseInt(supplier_id) : null },
				{ total_amount },
				{ is_paid: is_paid ? 1 : 0 },
				{ invoice_date },
				{ created_at: nowIso() },
			]
		);
		const invoiceId = invoiceResult.recordset[0].id;
		console.log('Created invoice ID:', invoiceId);

		// Create invoice items and update stock
		for (const item of items) {
			console.log(`Processing item: product_id=${item.product_id}, quantity=${item.quantity}`);
			
			await query(
				'INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price, price_type, is_private_price, private_price_amount, private_price_note) OUTPUT INSERTED.id VALUES (@invoice_id, @product_id, @quantity, @unit_price, @total_price, @price_type, @is_private_price, @private_price_amount, @private_price_note)',
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
				'SELECT TOP 1 available_qty, avg_cost FROM daily_stock WHERE product_id = @product_id AND date <= @date ORDER BY date DESC, updated_at DESC', 
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

			// Update or insert daily_stock for today
			await query(
				`IF EXISTS (SELECT 1 FROM daily_stock WHERE product_id = @product_id AND date = @date)
				 UPDATE daily_stock SET available_qty = @qtyAfter, avg_cost = CASE WHEN @is_buy = 1 THEN @newAvgCost ELSE avg_cost END, updated_at = @updated_at WHERE product_id = @product_id AND date = @date
				 ELSE
				 INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) VALUES (@product_id, @qtyAfter, @initialAvgCost, @date, @created_at, @updated_at)`,
				[
					{ product_id: parseInt(item.product_id) },
					{ date: today },
					{ qtyAfter },
					{ is_buy: invoice_type === 'buy' ? 1 : 0 },
					{ newAvgCost },
					{ updated_at: nowIso() },
					{ initialAvgCost: invoice_type === 'buy' ? newAvgCost : (prevAvgCost || 0) },
					{ created_at: nowIso() },
				]
			);

			// Record stock movement with today's date
			const movementResult = await query(
				'INSERT INTO stock_movements (product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, created_at) OUTPUT INSERTED.id VALUES (@product_id, @invoice_id, @invoice_date, @qtyBefore, @change, @qtyAfter, @created_at)',
				[
					{ product_id: parseInt(item.product_id) },
					{ invoice_id: invoiceId },
					{ invoice_date }, // This is nowIso() which includes today's date
					{ qtyBefore },
					{ change },
					{ qtyAfter },
					{ created_at: nowIso() },
				]
			);
			
			const movementId = movementResult.recordset[0]?.id;
			console.log(`  Created stock_movement ID=${movementId}, invoice_date=${invoice_date}, qtyBefore=${qtyBefore}, change=${change}, qtyAfter=${qtyAfter}`);

			// For BUY invoices, record product cost
			// Note: product_costs table removed; avg_cost is maintained in daily_stock
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
		const invoiceResult = await query('SELECT * FROM invoices WHERE id = @id', [{ id }]);
		if (invoiceResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Invoice not found' });
		}
		
		const invoice = invoiceResult.recordset[0];
		
		// Get payments
		const paymentsResult = await query(
			'SELECT * FROM invoice_payments WHERE invoice_id = @invoice_id ORDER BY payment_date DESC',
			[{ invoice_id: id }]
		);
		const payments = paymentsResult.recordset;
		
		// Get invoice items with product details
		const itemsResult = await query(
			`SELECT ii.*, p.name as product_name, p.barcode as product_barcode
			 FROM invoice_items ii
			 LEFT JOIN products p ON ii.product_id = p.id
			 WHERE ii.invoice_id = @invoice_id
			 ORDER BY ii.id`,
			[{ invoice_id: id }]
		);
		const invoice_items = itemsResult.recordset;
		
		// Get customer/supplier details
		const customersResult = await query('SELECT * FROM customers WHERE id = @id', [{ id: invoice.customer_id || 0 }]);
		const suppliersResult = await query('SELECT * FROM suppliers WHERE id = @id', [{ id: invoice.supplier_id || 0 }]);
		
		const amountPaid = invoice.amount_paid || 0;
		const totalAmount = invoice.total_amount || 0;
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
			'SELECT * FROM invoice_payments WHERE invoice_id = @invoice_id ORDER BY payment_date DESC',
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
		const invoiceResult = await query('SELECT * FROM invoices WHERE id = @id', [{ id }]);
		if (invoiceResult.recordset.length === 0) {
			return res.status(404).json({ error: 'Invoice not found' });
		}
		
		const invoice = invoiceResult.recordset[0];
		const currentAmountPaid = invoice.amount_paid || 0;
		const totalAmount = invoice.total_amount || 0;
		const remainingBalance = totalAmount - currentAmountPaid;
		
		// Validate payment doesn't exceed remaining balance (use epsilon for floating point comparison)
		const epsilon = 0.01;
		if (payment_amount > remainingBalance + epsilon) {
			return res.status(400).json({ 
				error: `Payment amount (${payment_amount}) exceeds remaining balance (${remainingBalance.toFixed(2)})` 
			});
		}
		
		const payment_date = nowIso();
		const newAmountPaid = currentAmountPaid + payment_amount;
		
		// Determine new payment status
		let newPaymentStatus = 'pending';
		if (newAmountPaid >= totalAmount) {
			newPaymentStatus = 'paid';
		} else if (newAmountPaid > 0) {
			newPaymentStatus = 'partial';
		}
		
		// Insert payment record
		const paymentResult = await query(
			'INSERT INTO invoice_payments (invoice_id, payment_amount, payment_date, payment_method, notes, created_at) OUTPUT INSERTED.id VALUES (@invoice_id, @payment_amount, @payment_date, @payment_method, @notes, @created_at)',
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
			'UPDATE invoices SET amount_paid = @amount_paid, payment_status = @payment_status, is_paid = @is_paid WHERE id = @id',
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
			'SELECT * FROM daily_stock WHERE date = @today AND available_qty < @threshold ORDER BY available_qty ASC', 
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
		
		const stock = await query('SELECT * FROM daily_stock WHERE date = @date ORDER BY updated_at DESC', [{ date: today }]);
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
		const movements = await query(`SELECT TOP ${limit} * FROM stock_movements ORDER BY invoice_date DESC`, []);
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

        if (product_id) { 
            sql += ' AND ds.product_id = @product_id'; 
            params.push({ product_id: parseInt(product_id) }); 
        }
        
        // If no date filters provided, default to today only (live/current costs)
        if (!start_date && !end_date) {
            sql += ' AND ds.date = @today';
            params.push({ today });
        } else {
            // If date filters are provided, use them
            if (start_date) { 
                sql += ' AND ds.date >= @start_date'; 
                params.push({ start_date }); 
            }
            if (end_date) { 
                sql += ' AND ds.date <= @end_date'; 
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
		
		if (product_id) {
			sql += ' AND pp.product_id = @product_id';
			params.push({ product_id });
		}
		if (start_date) {
			sql += ' AND pp.effective_date >= @start_date';
			params.push({ start_date });
		}
		if (end_date) {
			sql += ' AND pp.effective_date <= @end_date';
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
			 WHERE pp.product_id = @productId
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
			`SELECT TOP 1 pp.*
			 FROM product_prices pp
			 WHERE pp.product_id = @productId
			 ORDER BY pp.effective_date DESC, pp.created_at DESC`,
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
			 OUTPUT INSERTED.id VALUES (@product_id, @wholesale_price, @retail_price, @effective_date, @created_at)`,
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
		
		if (wholesale_price !== undefined) {
			updates.push('wholesale_price = @wholesale_price');
			params.push({ wholesale_price });
		}
		if (retail_price !== undefined) {
			updates.push('retail_price = @retail_price');
			params.push({ retail_price });
		}
		if (effective_date !== undefined) {
			updates.push('effective_date = @effective_date');
			params.push({ effective_date });
		}
		
		if (updates.length === 0) {
			return res.json({ id });
		}
		
		await query(`UPDATE product_prices SET ${updates.join(', ')} WHERE id = @id`, params);
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
		await query('DELETE FROM product_prices WHERE id = @id', [{ id }]);
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
				'SELECT p.id, p.name, p.sku, p.barcode, p.description, c.name as category_name, p.created_at FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC',
				[]
			);
		} catch (joinErr) {
			// If join fails (categories table doesn't exist), query without category
			result = await query(
				'SELECT p.id, p.name, p.sku, p.barcode, p.description, NULL as category_name, p.created_at FROM products p ORDER BY p.created_at DESC',
				[]
			);
		}
		const csv = toCSV(result.recordset, ['id', 'name', 'sku', 'barcode', 'description', 'category_name', 'created_at']);
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
			 WHERE ds.date = @today
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

