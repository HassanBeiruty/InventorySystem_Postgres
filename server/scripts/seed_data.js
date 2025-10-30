// Seed script to populate database with demo data using auto-increment IDs
require('dotenv').config();
const { query } = require('../db');

function nowIso() {
	return new Date().toISOString();
}

function randomDate(start, end) {
	return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seedData() {
	console.log('🌱 Starting database seeding with demo data...\n');
	
	try {
		// Check if tables exist (verify migration was run)
		console.log('🔍 Verifying database schema...');
		const tables = ['users', 'products', 'customers', 'suppliers', 'invoices', 'invoice_items', 'daily_stock', 'stock_movements', 'product_prices'];
		for (const table of tables) {
			try {
				const result = await query(`SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tableName`, [{ tableName: table }]);
				if (result.recordset[0].cnt === 0) {
					console.error(`\n❌ ERROR: Table '${table}' does not exist!`);
					console.error('   Please run the migration script first:');
					console.error('   node server/scripts/migrate_to_int_ids.js\n');
					process.exit(1);
				}
			} catch (err) {
				console.error(`\n❌ ERROR: Could not verify table '${table}':`, err.message);
				console.error('   Please run the migration script first:');
				console.error('   node server/scripts/migrate_to_int_ids.js\n');
				process.exit(1);
			}
		}
		console.log('✅ Database schema verified\n');
		
		// Clear existing data (in reverse order of dependencies)
		console.log('🗑️  Clearing existing data...');
		await query('DELETE FROM stock_movements', []);
		await query('DELETE FROM daily_stock', []);
		await query('DELETE FROM invoice_items', []);
		await query('DELETE FROM invoices', []);
		await query('DELETE FROM product_prices', []);
		await query('DELETE FROM products', []);
		await query('DELETE FROM customers', []);
		await query('DELETE FROM suppliers', []);
		await query('DELETE FROM users WHERE email != @demo_email', [{ demo_email: 'demo@example.com' }]);
		console.log('✅ Existing data cleared\n');

		// 1. Create Demo User
		console.log('👤 Creating demo user...');
		const passwordHash = '123456'; // simple hash for demo
		await query(
			'IF NOT EXISTS (SELECT 1 FROM users WHERE email = @email) INSERT INTO users (email, passwordHash, created_at) VALUES (@email, @passwordHash, @created_at)',
			[{ email: 'demo@example.com' }, { passwordHash }, { created_at: nowIso() }]
		);
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
				'INSERT INTO products (name, barcode, created_at) OUTPUT INSERTED.id VALUES (@name, @barcode, @created_at)',
				[{ name: p.name }, { barcode: p.barcode }, { created_at: nowIso() }]
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
					'INSERT INTO product_prices (product_id, wholesale_price, retail_price, effective_date, created_at) VALUES (@product_id, @wholesale_price, @retail_price, @effective_date, @created_at)',
					[
						{ product_id: product.id },
						{ wholesale_price: price.wholesale },
						{ retail_price: price.retail },
						{ effective_date: new Date().toISOString().split('T')[0] },
						{ created_at: nowIso() }
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
				'INSERT INTO customers (name, phone, address, credit_limit, created_at) OUTPUT INSERTED.id VALUES (@name, @phone, @address, @credit_limit, @created_at)',
				[{ name: c.name }, { phone: c.phone }, { address: c.address }, { credit_limit: c.credit }, { created_at: nowIso() }]
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
				'INSERT INTO suppliers (name, phone, address, created_at) OUTPUT INSERTED.id VALUES (@name, @phone, @address, @created_at)',
				[{ name: s.name }, { phone: s.phone }, { address: s.address }, { created_at: nowIso() }]
			);
			supplierIds.push({ id: result.recordset[0].id, ...s });
		}
		console.log(`✅ Created ${suppliers.length} suppliers\n`);

		// 6. Create BUY Invoices (purchases from suppliers)
		console.log('📥 Creating buy invoices...');
		const today = new Date();
		const buyInvoices = [];
		const stockByProduct = new Map();

		// Create 8 buy invoices over the past 30 days
		for (let i = 0; i < 8; i++) {
			const invoiceDate = randomDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000), today);
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
				'INSERT INTO invoices (invoice_type, supplier_id, total_amount, is_paid, invoice_date, created_at) OUTPUT INSERTED.id VALUES (@invoice_type, @supplier_id, @total_amount, @is_paid, @invoice_date, @created_at)',
				[
					{ invoice_type: 'buy' },
					{ supplier_id: supplier.id },
					{ total_amount: parseFloat(totalAmount.toFixed(2)) },
					{ is_paid: Math.random() > 0.3 ? 1 : 0 },
					{ invoice_date: invoiceDate.toISOString() },
					{ created_at: nowIso() }
				]
			);
			const invoiceId = invResult.recordset[0].id;

			// Create invoice items
			for (const item of items) {
				await query(
					'INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price, price_type, is_private_price, private_price_amount, private_price_note) OUTPUT INSERTED.id VALUES (@invoice_id, @product_id, @quantity, @unit_price, @total_price, @price_type, @is_private_price, @private_price_amount, @private_price_note)',
					[
						{ invoice_id: invoiceId },
						{ product_id: item.product_id },
						{ quantity: item.quantity },
						{ unit_price: item.cost },
						{ total_price: item.total },
						{ price_type: 'wholesale' },
						{ is_private_price: 0 },
						{ private_price_amount: null },
						{ private_price_note: null }
					]
				);
			}

			buyInvoices.push({ id: invoiceId, items });
		}
		console.log(`✅ Created ${buyInvoices.length} buy invoices\n`);

		// 7. Initialize Daily Stock from buy invoices
		console.log('📊 Initializing daily stock...');
		const todayStr = today.toISOString().split('T')[0];
		for (const [productId, stock] of stockByProduct) {
			const avgCost = stock.totalCost / stock.qty;
			await query(
				'INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) VALUES (@product_id, @available_qty, @avg_cost, @date, @created_at, @updated_at)',
				[
					{ product_id: productId },
					{ available_qty: stock.qty },
					{ avg_cost: parseFloat(avgCost.toFixed(2)) },
					{ date: todayStr },
					{ created_at: nowIso() },
					{ updated_at: nowIso() }
				]
			);
		}
		console.log(`✅ Initialized stock for ${stockByProduct.size} products\n`);

		// 8. Create SELL Invoices (sales to customers)
		console.log('💰 Creating sell invoices...');
		const sellInvoices = [];

		// Create 15 sell invoices
		for (let i = 0; i < 15; i++) {
			const invoiceDate = randomDate(new Date(today.getTime() - 25 * 24 * 60 * 60 * 1000), today);
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
					'INSERT INTO invoices (invoice_type, customer_id, total_amount, is_paid, invoice_date, created_at) OUTPUT INSERTED.id VALUES (@invoice_type, @customer_id, @total_amount, @is_paid, @invoice_date, @created_at)',
					[
						{ invoice_type: 'sell' },
						{ customer_id: customer.id },
						{ total_amount: parseFloat(totalAmount.toFixed(2)) },
						{ is_paid: Math.random() > 0.2 ? 1 : 0 },
						{ invoice_date: invoiceDate.toISOString() },
						{ created_at: nowIso() }
					]
				);
				const invoiceId = invResult.recordset[0].id;

				// Create invoice items
				for (const item of items) {
					await query(
						'INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price, price_type, is_private_price, private_price_amount, private_price_note) OUTPUT INSERTED.id VALUES (@invoice_id, @product_id, @quantity, @unit_price, @total_price, @price_type, @is_private_price, @private_price_amount, @private_price_note)',
						[
							{ invoice_id: invoiceId },
							{ product_id: item.product_id },
							{ quantity: item.quantity },
							{ unit_price: item.unit_price },
							{ total_price: item.total },
							{ price_type: item.price_type },
							{ is_private_price: item.is_private ? 1 : 0 },
							{ private_price_amount: item.is_private ? item.unit_price : null },
							{ private_price_note: item.is_private ? item.private_note : null }
						]
					);

					// Record stock movement
					const stock = stockByProduct.get(item.product_id);
					const qtyBefore = stock.qty + item.quantity;
					const qtyAfter = stock.qty;
					await query(
						'INSERT INTO stock_movements (product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, created_at) VALUES (@product_id, @invoice_id, @invoice_date, @quantity_before, @quantity_change, @quantity_after, @created_at)',
						[
							{ product_id: item.product_id },
							{ invoice_id: invoiceId },
							{ invoice_date: invoiceDate.toISOString() },
							{ quantity_before: qtyBefore },
							{ quantity_change: -item.quantity },
							{ quantity_after: qtyAfter },
							{ created_at: nowIso() }
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
			const avgCost = stock.totalCost / (stock.qty + buyInvoices.reduce((sum, inv) => {
				return sum + inv.items.filter(it => it.product_id === productId).reduce((s, i) => s + i.quantity, 0);
			}, 0));
			await query(
				'UPDATE daily_stock SET available_qty = @qty, avg_cost = @avg_cost, updated_at = @updated_at WHERE product_id = @product_id AND date = @date',
				[
					{ qty: stock.qty },
					{ avg_cost: parseFloat(avgCost.toFixed(2)) },
					{ updated_at: nowIso() },
					{ product_id: productId },
					{ date: todayStr }
				]
			);
		}
		console.log(`✅ Updated stock positions\n`);

		// 10. Create stock movements for buy invoices
		console.log('📝 Creating stock movements for buy invoices...');
		let movementCount = 0;
		for (const inv of buyInvoices) {
			for (const item of inv.items) {
				const stock = stockByProduct.get(item.product_id);
				const qtyBefore = (stock.qty || 0) - item.quantity;
				await query(
					'INSERT INTO stock_movements (product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, created_at) VALUES (@product_id, @invoice_id, @invoice_date, @quantity_before, @quantity_change, @quantity_after, @created_at)',
					[
						{ product_id: item.product_id },
						{ invoice_id: inv.id },
						{ invoice_date: new Date().toISOString() },
						{ quantity_before: qtyBefore },
						{ quantity_change: item.quantity },
						{ quantity_after: stock.qty },
						{ created_at: nowIso() }
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
