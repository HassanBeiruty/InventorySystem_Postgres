// Seed script to populate database with demo data using auto-increment IDs
require('dotenv').config();
const { query } = require('../db');

// Helper to get current time in Lebanon timezone (Asia/Beirut)
function nowIso() {
	const now = new Date();
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Beirut',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
	
	const parts = formatter.formatToParts(now);
	const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
	const month = parseInt(parts.find(p => p.type === 'month')?.value || '0');
	const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
	const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
	const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
	const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
	const ms = now.getMilliseconds();
	
	// Return as ISO string (without Z, as it's local Lebanon time)
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

// Helper to get today's date in Lebanon timezone (YYYY-MM-DD)
function getTodayLocal() {
	const now = new Date();
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Beirut',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});
	return formatter.format(now);
}

// Helper to format date as ISO string for PostgreSQL TIMESTAMP
function dateToIso(date) {
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Beirut',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
	
	const parts = formatter.formatToParts(date);
	const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
	const month = parseInt(parts.find(p => p.type === 'month')?.value || '0');
	const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
	const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
	const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
	const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');
	
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.000`;
}

function randomDate(start, end) {
	return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seedData() {
	console.log('🌱 Starting database seeding with demo data...\n');
	
	try {
		// Check if tables exist (verify migration was run)
		console.log('🔍 Verifying database schema...');
		const tables = ['users', 'products', 'customers', 'suppliers', 'invoices', 'invoice_items', 'daily_stock', 'stock_movements', 'product_prices', 'invoice_payments'];
		for (const table of tables) {
			try {
				const result = await query(`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, [{ table_name: table }]);
				if (parseInt(result.recordset[0].cnt) === 0) {
					console.error(`\n❌ ERROR: Table '${table}' does not exist!`);
					console.error('   Please ensure the database schema is initialized.');
					console.error('   The schema initializes automatically on server startup.\n');
					process.exit(1);
				}
			} catch (err) {
				console.error(`\n❌ ERROR: Could not verify table '${table}':`, err.message);
				console.error('   Please ensure the database schema is initialized.');
				console.error('   The schema initializes automatically on server startup.\n');
				process.exit(1);
			}
		}
		console.log('✅ Database schema verified\n');
		
		// Clear existing data (in reverse order of dependencies)
		console.log('🗑️  Clearing existing data...');
		await query('DELETE FROM stock_movements', []);
		await query('DELETE FROM daily_stock', []);
		await query('DELETE FROM invoice_payments', []);
		await query('DELETE FROM invoice_items', []);
		await query('DELETE FROM invoices', []);
		await query('DELETE FROM product_prices', []);
		await query('DELETE FROM products', []);
		await query('DELETE FROM customers', []);
		await query('DELETE FROM suppliers', []);
		await query('DELETE FROM users WHERE email != $1', [{ email: 'demo@example.com' }]);
		console.log('✅ Existing data cleared\n');

		// 1. Create Demo User
		console.log('👤 Creating demo user...');
		const passwordHash = '123456'; // simple hash for demo
		const userCheck = await query('SELECT id FROM users WHERE email = $1', [{ email: 'demo@example.com' }]);
		if (userCheck.recordset.length === 0) {
			await query(
				'INSERT INTO users (email, passwordHash, created_at) VALUES ($1, $2, $3)',
				[{ email: 'demo@example.com', passwordHash, created_at: nowIso() }]
			);
		}
		console.log('✅ Demo user created\n');

		// 2. Create Products
		console.log('📦 Creating products...');
		const products = [
			{ name: 'Laptop Dell XPS 15', barcode: 'LPT-001' },
			{ name: 'iPhone 15 Pro', barcode: 'PHN-002' },
			{ name: 'Samsung Galaxy S24', barcode: 'PHN-003' },
			{ name: 'Sony WH-1000XM5 Headphones', barcode: 'AUD-004' },
			{ name: 'iPad Air', barcode: 'TAB-005' },
			{ name: 'MacBook Air M2', barcode: 'LPT-006' },
			{ name: 'Apple Watch Series 9', barcode: 'WTH-007' },
			{ name: 'AirPods Pro', barcode: 'AUD-008' },
			{ name: 'Dell Monitor 27"', barcode: 'MON-009' },
			{ name: 'Logitech MX Master 3', barcode: 'ACC-010' },
			{ name: 'Mechanical Keyboard RGB', barcode: 'ACC-011' },
			{ name: 'Webcam Logitech C920', barcode: 'ACC-012' },
		];

		const productIds = [];
		for (const p of products) {
			const result = await query(
				'INSERT INTO products (name, barcode, created_at) VALUES ($1, $2, $3) RETURNING id',
				[{ name: p.name, barcode: p.barcode, created_at: nowIso() }]
			);
			const productId = result.recordset[0].id;
			productIds.push({ id: productId, ...p });
		}
		console.log(`✅ Created ${products.length} products\n`);

		// 3. Create Product Prices
		console.log('💰 Creating product prices...');
		const prices = [
			{ product_name: 'Laptop Dell XPS 15', wholesale: 850, retail: 1200 },
			{ product_name: 'iPhone 15 Pro', wholesale: 950, retail: 1300 },
			{ product_name: 'Samsung Galaxy S24', wholesale: 750, retail: 1000 },
			{ product_name: 'Sony WH-1000XM5 Headphones', wholesale: 280, retail: 400 },
			{ product_name: 'iPad Air', wholesale: 450, retail: 650 },
			{ product_name: 'MacBook Air M2', wholesale: 950, retail: 1350 },
			{ product_name: 'Apple Watch Series 9', wholesale: 320, retail: 450 },
			{ product_name: 'AirPods Pro', wholesale: 180, retail: 250 },
			{ product_name: 'Dell Monitor 27"', wholesale: 220, retail: 320 },
			{ product_name: 'Logitech MX Master 3', wholesale: 70, retail: 100 },
			{ product_name: 'Mechanical Keyboard RGB', wholesale: 85, retail: 130 },
			{ product_name: 'Webcam Logitech C920', wholesale: 55, retail: 80 },
		];

		for (const price of prices) {
			const product = productIds.find(p => p.name === price.product_name);
			if (product) {
				await query(
					'INSERT INTO product_prices (product_id, wholesale_price, retail_price, effective_date, created_at) VALUES ($1, $2, $3, $4, $5)',
					[
						{ product_id: product.id, wholesale_price: price.wholesale, retail_price: price.retail, effective_date: getTodayLocal(), created_at: nowIso() }
					]
				);
			}
		}
		console.log(`✅ Created ${prices.length} product prices\n`);

		// 4. Create Customers
		console.log('👥 Creating customers...');
		const customers = [
			{ name: 'John Smith', phone: '555-0101', address: '123 Main St, New York, NY', credit: 5000 },
			{ name: 'Sarah Johnson', phone: '555-0102', address: '456 Oak Ave, Los Angeles, CA', credit: 3000 },
			{ name: 'Mike Brown', phone: '555-0103', address: '789 Pine Rd, Chicago, IL', credit: 7500 },
			{ name: 'Emily Davis', phone: '555-0104', address: '321 Elm St, Houston, TX', credit: 4000 },
			{ name: 'Tech Solutions Inc', phone: '555-0105', address: '555 Business Blvd, Boston, MA', credit: 15000 },
			{ name: 'Global Trading Co', phone: '555-0106', address: '777 Commerce Way, Seattle, WA', credit: 20000 },
		];

		const customerIds = [];
		for (const c of customers) {
			const result = await query(
				'INSERT INTO customers (name, phone, address, credit_limit, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
				[{ name: c.name, phone: c.phone, address: c.address, credit_limit: c.credit, created_at: nowIso() }]
			);
			customerIds.push({ id: result.recordset[0].id, ...c });
		}
		console.log(`✅ Created ${customers.length} customers\n`);

		// 5. Create Suppliers
		console.log('🏭 Creating suppliers...');
		const suppliers = [
			{ name: 'Tech Wholesale Ltd', phone: '555-1001', address: '100 Industry Park, Dallas, TX' },
			{ name: 'Global Electronics Supply', phone: '555-1002', address: '200 Import Dr, Miami, FL' },
			{ name: 'Premium Gadgets Distributor', phone: '555-1003', address: '300 Trade Center, Atlanta, GA' },
			{ name: 'Direct Import Solutions', phone: '555-1004', address: '400 Wholesale Way, Denver, CO' },
		];

		const supplierIds = [];
		for (const s of suppliers) {
			const result = await query(
				'INSERT INTO suppliers (name, phone, address, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
				[{ name: s.name, phone: s.phone, address: s.address, created_at: nowIso() }]
			);
			supplierIds.push({ id: result.recordset[0].id, ...s });
		}
		console.log(`✅ Created ${suppliers.length} suppliers\n`);

		// 6. Create BUY Invoices (purchases from suppliers)
		console.log('📥 Creating buy invoices...');
		// Get today in Lebanon timezone
		const todayStr = getTodayLocal();
		const today = new Date(todayStr + 'T00:00:00');
		const buyInvoices = [];
		const stockByProduct = new Map();

		// Create buy invoice dates: 8 invoices over the past 30 days (earlier dates first)
		const buyInvoiceDates = [];
		for (let i = 0; i < 8; i++) {
			// Start from 30 days ago and work forward
			const daysAgo = 30 - (i * 4); // Spread over 30 days
			const invoiceDate = new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000);
			buyInvoiceDates.push(invoiceDate);
		}
		// Sort by date to ensure chronological order
		buyInvoiceDates.sort((a, b) => a.getTime() - b.getTime());

		// Create 8 buy invoices with dates before sell invoices
		for (let i = 0; i < 8; i++) {
			const invoiceDate = buyInvoiceDates[i];
			const supplier = supplierIds[Math.floor(Math.random() * supplierIds.length)];
			
			// Random 2-4 items per invoice
			const itemCount = 2 + Math.floor(Math.random() * 3);
			const items = [];
			let totalAmount = 0;

			for (let j = 0; j < itemCount; j++) {
				const product = productIds[Math.floor(Math.random() * productIds.length)];
				const quantity = 5 + Math.floor(Math.random() * 20); // 5-24 units
				const price = prices.find(p => p.product_name === product.name);
				const cost = price ? price.wholesale * (0.7 + Math.random() * 0.2) : 100; // Cost is 70-90% of wholesale
				const itemTotal = cost * quantity;
				totalAmount += itemTotal;

				// Track stock
				const currentStock = stockByProduct.get(product.id) || { qty: 0, totalCost: 0 };
				stockByProduct.set(product.id, {
					qty: currentStock.qty + quantity,
					totalCost: currentStock.totalCost + itemTotal
				});

				items.push({
					product_id: product.id,
					quantity,
					cost: parseFloat(cost.toFixed(2)),
					total: parseFloat(itemTotal.toFixed(2))
				});
			}

			// Create invoice
			const invResult = await query(
				'INSERT INTO invoices (invoice_type, supplier_id, total_amount, is_paid, invoice_date, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
				[
					{ invoice_type: 'buy', supplier_id: supplier.id, total_amount: parseFloat(totalAmount.toFixed(2)), is_paid: Math.random() > 0.3 ? 1 : 0, invoice_date: dateToIso(invoiceDate), created_at: nowIso() }
				]
			);
			const invoiceId = invResult.recordset[0].id;

			// Create invoice items
			for (const item of items) {
				await query(
					'INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price, price_type, is_private_price, private_price_amount, private_price_note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
					[
						{ invoice_id: invoiceId, product_id: item.product_id, quantity: item.quantity, unit_price: item.cost, total_price: item.total, price_type: 'wholesale', is_private_price: 0, private_price_amount: null, private_price_note: null }
					]
				);
			}

			buyInvoices.push({ id: invoiceId, date: invoiceDate, items });
		}
		console.log(`✅ Created ${buyInvoices.length} buy invoices\n`);

		// 7. Initialize Daily Stock from buy invoices
		console.log('📊 Initializing daily stock...');
		for (const [productId, stock] of stockByProduct) {
			const avgCost = stock.totalCost / stock.qty;
			await query(
				'INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
				[
					{ product_id: productId, available_qty: stock.qty, avg_cost: parseFloat(avgCost.toFixed(2)), date: todayStr, created_at: nowIso(), updated_at: nowIso() }
				]
			);
		}
		console.log(`✅ Initialized stock for ${stockByProduct.size} products\n`);

		// 8. Create SELL Invoices (sales to customers)
		// IMPORTANT: Sell invoices must be created AFTER buy invoices chronologically
		console.log('💰 Creating sell invoices...');
		const sellInvoices = [];
		
		// Get the latest buy invoice date to ensure sell invoices come after
		const latestBuyDate = buyInvoices.length > 0 
			? Math.max(...buyInvoices.map(inv => inv.date.getTime()))
			: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).getTime();
		
		// Create sell invoice dates: 15 invoices, all AFTER the latest buy invoice
		const sellInvoiceDates = [];
		for (let i = 0; i < 15; i++) {
			// Start from 1 day after the latest buy invoice, up to today
			const daysAfterLatestBuy = 1 + (i * 2); // Spread over ~30 days
			const invoiceDate = new Date(latestBuyDate + daysAfterLatestBuy * 24 * 60 * 60 * 1000);
			// Don't go beyond today
			if (invoiceDate.getTime() <= today.getTime()) {
				sellInvoiceDates.push(invoiceDate);
			}
		}
		// Sort by date
		sellInvoiceDates.sort((a, b) => a.getTime() - b.getTime());

		// Create sell invoices with dates after buy invoices
		for (let i = 0; i < Math.min(15, sellInvoiceDates.length); i++) {
			const invoiceDate = sellInvoiceDates[i];
			const customer = customerIds[Math.floor(Math.random() * customerIds.length)];
			
			const itemCount = 1 + Math.floor(Math.random() * 4); // 1-4 items
			const items = [];
			let totalAmount = 0;

			for (let j = 0; j < itemCount; j++) {
				// Only sell products we have in stock
				const availableProducts = Array.from(stockByProduct.entries())
					.filter(([_, stock]) => stock.qty > 0)
					.map(([id]) => productIds.find(p => p.id === id));
				
				if (availableProducts.length === 0) break;

				const product = availableProducts[Math.floor(Math.random() * availableProducts.length)];
				const currentStock = stockByProduct.get(product.id);
				const quantity = 1 + Math.floor(Math.random() * Math.min(3, currentStock.qty)); // 1-3 units
				
				// Random pricing strategy
				const priceStrategy = Math.random();
				const priceInfo = prices.find(p => p.product_name === product.name);
				let unitPrice, priceType, isPrivate = false, privateNote = null;
				
				if (priceStrategy < 0.7) {
					// 70% retail price
					unitPrice = priceInfo ? priceInfo.retail : 100;
					priceType = 'retail';
				} else if (priceStrategy < 0.9) {
					// 20% wholesale price
					unitPrice = priceInfo ? priceInfo.wholesale : 80;
					priceType = 'wholesale';
				} else {
					// 10% custom private price
					unitPrice = priceInfo ? priceInfo.retail * (1.1 + Math.random() * 0.2) : 120;
					priceType = 'retail';
					isPrivate = true;
					privateNote = 'VIP customer discount';
				}

				const itemTotal = unitPrice * quantity;
				totalAmount += itemTotal;

				items.push({
					product_id: product.id,
					quantity,
					unit_price: parseFloat(unitPrice.toFixed(2)),
					total: parseFloat(itemTotal.toFixed(2)),
					price_type: priceType,
					is_private: isPrivate,
					private_note: privateNote
				});

				// Update stock
				const newQty = currentStock.qty - quantity;
				stockByProduct.set(product.id, { ...currentStock, qty: newQty });
			}

			if (items.length > 0) {
				// Create invoice
				const invResult = await query(
					'INSERT INTO invoices (invoice_type, customer_id, total_amount, is_paid, invoice_date, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
					[
						{ invoice_type: 'sell', customer_id: customer.id, total_amount: parseFloat(totalAmount.toFixed(2)), is_paid: Math.random() > 0.2 ? 1 : 0, invoice_date: dateToIso(invoiceDate), created_at: nowIso() }
					]
				);
				const invoiceId = invResult.recordset[0].id;

				// Create invoice items
				for (const item of items) {
					await query(
						'INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price, price_type, is_private_price, private_price_amount, private_price_note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
						[
							{ invoice_id: invoiceId, product_id: item.product_id, quantity: item.quantity, unit_price: item.unit_price, total_price: item.total, price_type: item.price_type, is_private_price: item.is_private ? 1 : 0, private_price_amount: item.is_private ? item.unit_price : null, private_price_note: item.is_private ? item.private_note : null }
						]
					);

					// Record stock movement
					const stock = stockByProduct.get(item.product_id);
					const qtyBefore = stock.qty + item.quantity;
					const qtyAfter = stock.qty;
					await query(
						'INSERT INTO stock_movements (product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
						[
							{ product_id: item.product_id, invoice_id: invoiceId, invoice_date: dateToIso(invoiceDate), quantity_before: qtyBefore, quantity_change: -item.quantity, quantity_after: qtyAfter, created_at: nowIso() }
						]
					);
				}

				sellInvoices.push({ id: invoiceId, items });
			}
		}
		console.log(`✅ Created ${sellInvoices.length} sell invoices\n`);

		// 9. Update final daily stock
		console.log('📊 Updating final stock positions...');
		for (const [productId, stock] of stockByProduct) {
			const totalQty = stock.qty + buyInvoices.reduce((sum, inv) => {
				return sum + inv.items.filter(it => it.product_id === productId).reduce((s, i) => s + i.quantity, 0);
			}, 0);
			const avgCost = totalQty > 0 ? stock.totalCost / totalQty : 0;
			await query(
				'UPDATE daily_stock SET available_qty = $1, avg_cost = $2, updated_at = $3 WHERE product_id = $4 AND date = $5',
				[
					{ qty: stock.qty, avg_cost: parseFloat(avgCost.toFixed(2)), updated_at: nowIso(), product_id: productId, date: todayStr }
				]
			);
		}
		console.log(`✅ Updated stock positions\n`);

		// 10. Create stock movements for buy invoices (in chronological order)
		console.log('📝 Creating stock movements for buy invoices...');
		let movementCount = 0;
		// Sort buy invoices by date to process them chronologically
		const sortedBuyInvoices = [...buyInvoices].sort((a, b) => a.date.getTime() - b.date.getTime());
		for (const inv of sortedBuyInvoices) {
			for (const item of inv.items) {
				const stock = stockByProduct.get(item.product_id);
				const qtyBefore = (stock.qty || 0) - item.quantity;
				await query(
					'INSERT INTO stock_movements (product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
					[
						{ product_id: item.product_id, invoice_id: inv.id, invoice_date: dateToIso(inv.date), quantity_before: qtyBefore, quantity_change: item.quantity, quantity_after: stock.qty, created_at: nowIso() }
					]
				);
				movementCount++;
			}
		}
		console.log(`✅ Created ${movementCount} stock movements\n`);

		// Summary
		console.log('═══════════════════════════════════════════');
		console.log('🎉 Database seeding completed successfully!');
		console.log('═══════════════════════════════════════════');
		console.log(`📦 Products:        ${products.length}`);
		console.log(`💰 Product Prices:  ${prices.length}`);
		console.log(`👥 Customers:       ${customers.length}`);
		console.log(`🏭 Suppliers:       ${suppliers.length}`);
		console.log(`📥 Buy Invoices:    ${buyInvoices.length}`);
		console.log(`💰 Sell Invoices:   ${sellInvoices.length}`);
		console.log(`📊 Stock Records:   ${stockByProduct.size}`);
		console.log(`📝 Movements:       ${movementCount}`);
		console.log('═══════════════════════════════════════════\n');
		console.log('🔐 Demo Login Credentials:');
		console.log('   Email: demo@example.com');
		console.log('   Password: demo123\n');

	} catch (error) {
		console.error('❌ Seeding failed:', error);
		throw error;
	}
}

// Run seeding
seedData()
	.then(() => {
		console.log('✅ Database seeded successfully! You can now login and explore the system.\n');
		process.exit(0);
	})
	.catch((error) => {
		console.error('💥 Seeding failed:', error);
		process.exit(1);
	});
