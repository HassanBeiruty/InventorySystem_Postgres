const express = require('express');
const { query } = require('../db');
const router = express.Router();

// generateId() removed - using auto-increment INT IDs now

function nowIso() {
	return new Date().toISOString();
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

// ===== PRODUCTS =====
router.get('/products', async (req, res) => {
	try {
		const result = await query('SELECT * FROM products ORDER BY created_at DESC', []);
		res.json(result.recordset);
	} catch (err) {
		console.error('List products error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/products', async (req, res) => {
	try {
		const { name, barcode } = req.body;
		const result = await query(
			'INSERT INTO products (name, barcode, created_at) OUTPUT INSERTED.id VALUES (@name, @barcode, @created_at)',
			[{ name }, { barcode: barcode || null }, { created_at: nowIso() }]
		);
		const id = result.recordset[0].id;
		// Ensure daily stock entry
		const today = new Date().toISOString().split('T')[0];
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
		const { name, barcode } = req.body;
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

// ===== PRODUCT SUPPLIERS =====
router.get('/products/:productId/suppliers', async (req, res) => {
	try {
		const productId = parseInt(req.params.productId);
		const result = await query(
			`SELECT ps.*, s.name as supplier_name, s.phone, s.address
			 FROM product_suppliers ps
			 JOIN suppliers s ON ps.supplier_id = s.id
			 WHERE ps.product_id = @productId
			 ORDER BY ps.is_preferred DESC, ps.created_at DESC`,
			[{ productId }]
		);
		res.json(result.recordset.map(row => ({
			...row,
			is_preferred: !!row.is_preferred
		})));
	} catch (err) {
		console.error('Get product suppliers error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/products/:productId/suppliers', async (req, res) => {
	try {
		const productId = parseInt(req.params.productId);
		const { supplier_id, supplier_price, is_preferred, notes } = req.body;
		
		// If this is set as preferred, unset all others for this product
		if (is_preferred) {
			await query(
				'UPDATE product_suppliers SET is_preferred = 0 WHERE product_id = @productId',
				[{ productId }]
			);
		}
		
		const result = await query(
			`INSERT INTO product_suppliers (product_id, supplier_id, supplier_price, is_preferred, notes, created_at, updated_at)
			 OUTPUT INSERTED.id VALUES (@product_id, @supplier_id, @supplier_price, @is_preferred, @notes, @created_at, @updated_at)`,
			[
				{ product_id: productId },
				{ supplier_id },
				{ supplier_price: supplier_price || null },
				{ is_preferred: is_preferred ? 1 : 0 },
				{ notes: notes || null },
				{ created_at: nowIso() },
				{ updated_at: nowIso() }
			]
		);
		const id = result.recordset[0].id;
		res.json({ id });
	} catch (err) {
		console.error('Add product supplier error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.put('/product-suppliers/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const { supplier_price, is_preferred, notes } = req.body;
		
		// Get the product_id for this relationship
		const existing = await query('SELECT product_id FROM product_suppliers WHERE id = @id', [{ id }]);
		if (existing.recordset.length === 0) {
			return res.status(404).json({ error: 'Product-supplier relationship not found' });
		}
		
		const productId = existing.recordset[0].product_id;
		
		// If this is set as preferred, unset all others for this product
		if (is_preferred) {
			await query(
				'UPDATE product_suppliers SET is_preferred = 0 WHERE product_id = @productId AND id != @id',
				[{ productId }, { id }]
			);
		}
		
		const updates = [];
		const params = [{ id }];
		
		if (supplier_price !== undefined) {
			updates.push('supplier_price = @supplier_price');
			params.push({ supplier_price: supplier_price || null });
		}
		if (is_preferred !== undefined) {
			updates.push('is_preferred = @is_preferred');
			params.push({ is_preferred: is_preferred ? 1 : 0 });
		}
		if (notes !== undefined) {
			updates.push('notes = @notes');
			params.push({ notes: notes || null });
		}
		
		if (updates.length > 0) {
			updates.push('updated_at = @updated_at');
			params.push({ updated_at: nowIso() });
			await query(`UPDATE product_suppliers SET ${updates.join(', ')} WHERE id = @id`, params);
		}
		
		res.json({ id });
	} catch (err) {
		console.error('Update product supplier error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.delete('/product-suppliers/:id', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		await query('DELETE FROM product_suppliers WHERE id = @id', [{ id }]);
		res.json({ success: true });
	} catch (err) {
		console.error('Delete product supplier error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get products with their suppliers
router.get('/products-with-suppliers', async (req, res) => {
	try {
		const products = await query('SELECT * FROM products ORDER BY created_at DESC', []);
		const productSuppliers = await query(
			`SELECT ps.*, s.name as supplier_name
			 FROM product_suppliers ps
			 JOIN suppliers s ON ps.supplier_id = s.id
			 ORDER BY ps.is_preferred DESC`,
			[]
		);
		
		const idToProductSuppliers = new Map();
		productSuppliers.recordset.forEach(ps => {
			if (!idToProductSuppliers.has(ps.product_id)) {
				idToProductSuppliers.set(ps.product_id, []);
			}
			idToProductSuppliers.get(ps.product_id).push({
				...ps,
				is_preferred: !!ps.is_preferred
			});
		});
		
		const result = products.recordset.map(product => ({
			...product,
			suppliers: idToProductSuppliers.get(product.id) || []
		}));
		
		res.json(result);
	} catch (err) {
		console.error('List products with suppliers error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== PRODUCT COSTS =====
// Get all costs for a product
router.get('/products/:id/costs', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const result = await query(
			`SELECT pc.*, s.name as supplier_name, p.name as product_name
			 FROM product_costs pc
			 LEFT JOIN suppliers s ON pc.supplier_id = s.id
			 LEFT JOIN products p ON pc.product_id = p.id
			 WHERE pc.product_id = @productId
			 ORDER BY pc.purchase_date DESC`,
			[{ productId: id }]
		);
		res.json(result.recordset);
	} catch (err) {
		console.error('Get product costs error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get average cost for a product (weighted average)
router.get('/products/:id/average-cost', async (req, res) => {
	try {
		const id = parseInt(req.params.id);
		const result = await query(
			`SELECT 
				SUM(cost * quantity) as total_cost,
				SUM(quantity) as total_qty
			 FROM product_costs
			 WHERE product_id = @productId`,
			[{ productId: id }]
		);
		
		const row = result.recordset[0];
		const avgCost = row && row.total_qty > 0 
			? parseFloat(row.total_cost) / parseFloat(row.total_qty)
			: 0;
		
		res.json({ 
			average_cost: avgCost,
			total_quantity: row ? parseInt(row.total_qty) || 0 : 0,
			total_cost: row ? parseFloat(row.total_cost) || 0 : 0
		});
	} catch (err) {
		console.error('Get average cost error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Get all product costs with filters
router.get('/product-costs', async (req, res) => {
	try {
		const { product_id, supplier_id, start_date, end_date } = req.query;
		let sql = `
			SELECT pc.*, 
				   s.name as supplier_name,
				   p.name as product_name,
				   p.barcode
			FROM product_costs pc
			LEFT JOIN suppliers s ON pc.supplier_id = s.id
			LEFT JOIN products p ON pc.product_id = p.id
			WHERE 1=1
		`;
		const params = [];
		
		if (product_id) {
			sql += ' AND pc.product_id = @product_id';
			params.push({ product_id });
		}
		if (supplier_id) {
			sql += ' AND pc.supplier_id = @supplier_id';
			params.push({ supplier_id });
		}
		if (start_date) {
			sql += ' AND pc.purchase_date >= @start_date';
			params.push({ start_date });
		}
		if (end_date) {
			sql += ' AND pc.purchase_date <= @end_date';
			params.push({ end_date });
		}
		
		sql += ' ORDER BY pc.purchase_date DESC';
		
		const result = await query(sql, params);
		res.json(result.recordset);
	} catch (err) {
		console.error('List product costs error:', err);
		res.status(500).json({ error: err.message });
	}
});

// Create product cost record (usually auto-created by invoice)
// Product costs routes removed - product_costs table deleted, using daily_stock.avg_cost instead

// ===== INVOICES =====
router.get('/invoices', async (req, res) => {
	try {
		const invoices = await query('SELECT * FROM invoices ORDER BY created_at DESC', []);
		const customers = await query('SELECT * FROM customers', []);
		const suppliers = await query('SELECT * FROM suppliers', []);
		const idToCustomer = new Map(customers.recordset.map((c) => [c.id, c]));
		const idToSupplier = new Map(suppliers.recordset.map((s) => [s.id, s]));
		const result = invoices.recordset.map((inv) => ({
			...inv,
			is_paid: !!inv.is_paid, // Convert BIT to boolean
			customers: inv.customer_id ? idToCustomer.get(inv.customer_id) : undefined,
			suppliers: inv.supplier_id ? idToSupplier.get(inv.supplier_id) : undefined,
		}));
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
		const idToCustomer = new Map(customers.recordset.map((c) => [c.id, c]));
		const idToSupplier = new Map(suppliers.recordset.map((s) => [s.id, s]));
		const result = invoices.recordset.map((inv) => ({
			...inv,
			is_paid: !!inv.is_paid,
			customers: inv.customer_id ? idToCustomer.get(inv.customer_id) : undefined,
			suppliers: inv.supplier_id ? idToSupplier.get(inv.supplier_id) : undefined,
		}));
		res.json(result);
	} catch (err) {
		console.error('Recent invoices error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.get('/invoices/stats', async (req, res) => {
	try {
		const [invoices, products, customers, suppliers] = await Promise.all([
			query('SELECT * FROM invoices', []),
			query('SELECT * FROM products', []),
			query('SELECT * FROM customers', []),
			query('SELECT * FROM suppliers', []),
		]);
		const revenue = invoices.recordset
			.filter((inv) => inv.invoice_type === 'sell')
			.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);
		res.json({
			invoicesCount: invoices.recordset.length,
			productsCount: products.recordset.length,
			customersCount: customers.recordset.length,
			suppliersCount: suppliers.recordset.length,
			revenue,
		});
	} catch (err) {
		console.error('Invoice stats error:', err);
		res.status(500).json({ error: err.message });
	}
});

router.post('/invoices', async (req, res) => {
	try {
		const { invoice_type, customer_id, supplier_id, total_amount, is_paid, items } = req.body;
		const invoice_date = nowIso();
		const today = new Date().toISOString().split('T')[0];

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

		// Create invoice items and update stock
		for (const item of items) {
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

			// Update stock with avg cost maintenance
			let stockBefore = await query('SELECT TOP 1 available_qty, avg_cost FROM daily_stock WHERE product_id = @product_id AND date = @date ORDER BY updated_at DESC', [
				{ product_id: parseInt(item.product_id) },
				{ date: today },
			]);
			let qtyBefore = stockBefore.recordset[0]?.available_qty;
			let prevAvgCost = stockBefore.recordset[0]?.avg_cost;
			// If today's snapshot doesn't exist yet, use the latest previous day's snapshot
			if (qtyBefore === undefined) {
				const prevSnap = await query('SELECT TOP 1 available_qty, avg_cost, date FROM daily_stock WHERE product_id = @product_id AND date < @date ORDER BY date DESC', [
					{ product_id: parseInt(item.product_id) },
					{ date: today },
				]);
				qtyBefore = prevSnap.recordset[0]?.available_qty || 0;
				prevAvgCost = prevSnap.recordset[0]?.avg_cost || 0;
			}
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

			// Record stock movement
			await query(
				'INSERT INTO stock_movements (product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, created_at) OUTPUT INSERTED.id VALUES (@product_id, @invoice_id, @invoice_date, @qtyBefore, @change, @qtyAfter, @created_at)',
				[
					{ product_id: parseInt(item.product_id) },
					{ invoice_id: invoiceId },
					{ invoice_date },
					{ qtyBefore },
					{ change },
					{ qtyAfter },
					{ created_at: nowIso() },
				]
			);

			// For BUY invoices, record product cost
			// Note: product_costs table removed; avg_cost is maintained in daily_stock
		}

		res.json({ id: invoiceId, invoice_date });
	} catch (err) {
		console.error('Create invoice error:', err);
		res.status(500).json({ error: err.message });
	}
});

// ===== INVENTORY =====
router.get('/inventory/low-stock/:threshold', async (req, res) => {
	try {
		const threshold = parseInt(req.params.threshold) || 10;
		const stock = await query('SELECT * FROM daily_stock WHERE available_qty < @threshold ORDER BY available_qty ASC', [{ threshold }]);
		const products = await query('SELECT * FROM products', []);
		const idToProduct = new Map(products.recordset.map((p) => [p.id, p]));
		const result = stock.recordset.map((d) => ({
			...d,
			products: idToProduct.get(d.product_id),
		}));
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
		const today = new Date().toISOString().split('T')[0];
		const stock = await query('SELECT * FROM daily_stock WHERE date = @date ORDER BY updated_at DESC', [{ date: today }]);
		const products = await query('SELECT * FROM products', []);
		const idToProduct = new Map(products.recordset.map((p) => [p.id, p]));
		const result = stock.recordset.map((d) => ({
			...d,
			products: idToProduct.get(d.product_id),
		}));
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
router.get('/daily-stock/avg-costs', async (req, res) => {
    try {
        const { product_id, start_date, end_date } = req.query;
        let sql = `
            SELECT ds.product_id,
                   ds.date,
                   ds.available_qty,
                   ds.avg_cost,
                   p.name as product_name,
                   p.barcode
            FROM daily_stock ds
            LEFT JOIN products p ON p.id = ds.product_id
            WHERE 1=1
        `;
        const params = [];

        if (product_id) { sql += ' AND ds.product_id = @product_id'; params.push({ product_id }); }
        if (start_date) { sql += ' AND ds.date >= @start_date'; params.push({ start_date }); }
        if (end_date) { sql += ' AND ds.date <= @end_date'; params.push({ end_date }); }

        sql += ' ORDER BY ds.date DESC, ds.updated_at DESC';

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
				{ effective_date: effective_date || new Date().toISOString().split('T')[0] },
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

module.exports = router;

