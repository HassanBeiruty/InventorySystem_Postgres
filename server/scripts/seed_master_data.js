// Seed script to populate database with master data (categories, products, prices, exchange rates)
// This script clears invoices but keeps master data
require('dotenv').config();
const { query } = require('../db');

// Helper to get current time in Lebanon timezone
function lebanonTime() {
	const now = new Date();
	
	// Use Intl.DateTimeFormat to get Lebanon timezone components
	const formatter = new Intl.DateTimeFormat('en-CA', {
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
	const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
	
	const pad = (n) => String(n).padStart(2, "0");
	return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
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

async function seedMasterData() {
	console.log('🌱 Starting master data seeding...\n');
	
	try {
		// Clear invoices and related data (but keep master data)
		console.log('🗑️  Clearing invoices and related data...');
		await query('DELETE FROM stock_movements', []);
		await query('DELETE FROM daily_stock', []);
		await query('DELETE FROM invoice_payments', []);
		await query('DELETE FROM invoice_items', []);
		await query('DELETE FROM invoices', []);
		console.log('✅ Cleared invoices and related data\n');
		
		// Clear existing master data to start fresh
		console.log('🗑️  Clearing existing master data...');
		await query('DELETE FROM product_prices', []);
		await query('DELETE FROM products', []);
		await query('DELETE FROM categories', []);
		await query('DELETE FROM exchange_rates', []);
		await query('DELETE FROM customers', []);
		await query('DELETE FROM suppliers', []);
		console.log('✅ Cleared existing master data\n');
		
		const today = getTodayLocal();
		const timestamp = lebanonTime();
		
		// 1. Create Categories
		console.log('📁 Creating categories...');
		const categories = [
			{ name: 'Electronics', description: 'Electronic devices and components' },
			{ name: 'Food & Beverages', description: 'Food items and drinks' },
			{ name: 'Clothing', description: 'Apparel and accessories' },
			{ name: 'Home & Garden', description: 'Home improvement and garden supplies' },
			{ name: 'Sports & Outdoors', description: 'Sports equipment and outdoor gear' },
			{ name: 'Books & Media', description: 'Books, movies, and music' },
			{ name: 'Health & Beauty', description: 'Health and beauty products' },
			{ name: 'Automotive', description: 'Car parts and accessories' }
		];
		
		const categoryMap = new Map();
		for (const cat of categories) {
			const result = await query(
				'INSERT INTO categories (name, description, created_at) VALUES ($1, $2, $3) RETURNING id',
				[{ name: cat.name }, { description: cat.description || null }, { created_at: timestamp }]
			);
			categoryMap.set(cat.name, result.recordset[0].id);
			console.log(`  ✓ Created category: ${cat.name}`);
		}
		console.log(`✅ Created ${categories.length} categories\n`);
		
		// 2. Create Products
		console.log('📦 Creating products...');
		const products = [
			{ name: 'Laptop Computer', category: 'Electronics', barcode: 'LP001', sku: 'LAP-001', shelf: 'A1', description: 'High-performance laptop' },
			{ name: 'Wireless Mouse', category: 'Electronics', barcode: 'WM001', sku: 'MOU-001', shelf: 'A2', description: 'Ergonomic wireless mouse' },
			{ name: 'USB Keyboard', category: 'Electronics', barcode: 'KB001', sku: 'KEY-001', shelf: 'A2', description: 'Mechanical USB keyboard' },
			{ name: 'Smartphone', category: 'Electronics', barcode: 'SP001', sku: 'PHN-001', shelf: 'A3', description: 'Latest model smartphone' },
			{ name: 'Tablet', category: 'Electronics', barcode: 'TB001', sku: 'TAB-001', shelf: 'A3', description: '10-inch tablet' },
			{ name: 'Coffee Beans', category: 'Food & Beverages', barcode: 'CB001', sku: 'COF-001', shelf: 'B1', description: 'Premium coffee beans' },
			{ name: 'Bottled Water', category: 'Food & Beverages', barcode: 'BW001', sku: 'WAT-001', shelf: 'B2', description: '500ml bottled water' },
			{ name: 'Energy Drink', category: 'Food & Beverages', barcode: 'ED001', sku: 'NRG-001', shelf: 'B2', description: 'Energy drink can' },
			{ name: 'T-Shirt', category: 'Clothing', barcode: 'TS001', sku: 'TSH-001', shelf: 'C1', description: 'Cotton t-shirt' },
			{ name: 'Jeans', category: 'Clothing', barcode: 'JN001', sku: 'JEA-001', shelf: 'C1', description: 'Classic blue jeans' },
			{ name: 'Sneakers', category: 'Clothing', barcode: 'SN001', sku: 'SNK-001', shelf: 'C2', description: 'Running sneakers' },
			{ name: 'Garden Tools Set', category: 'Home & Garden', barcode: 'GT001', sku: 'GAR-001', shelf: 'D1', description: 'Complete garden tools set' },
			{ name: 'Plant Pot', category: 'Home & Garden', barcode: 'PP001', sku: 'POT-001', shelf: 'D2', description: 'Ceramic plant pot' },
			{ name: 'Basketball', category: 'Sports & Outdoors', barcode: 'BB001', sku: 'BAL-001', shelf: 'E1', description: 'Official size basketball' },
			{ name: 'Yoga Mat', category: 'Sports & Outdoors', barcode: 'YM001', sku: 'YOG-001', shelf: 'E2', description: 'Non-slip yoga mat' },
			{ name: 'Programming Book', category: 'Books & Media', barcode: 'PB001', sku: 'BOK-001', shelf: 'F1', description: 'Learn programming guide' },
			{ name: 'Shampoo', category: 'Health & Beauty', barcode: 'SH001', sku: 'BEA-001', shelf: 'G1', description: 'Hair care shampoo' },
			{ name: 'Car Battery', category: 'Automotive', barcode: 'CA001', sku: 'CAR-001', shelf: 'H1', description: '12V car battery' },
			{ name: 'Tire Set', category: 'Automotive', barcode: 'TR001', sku: 'TIR-001', shelf: 'H2', description: 'Set of 4 tires' },
			{ name: 'Monitor', category: 'Electronics', barcode: 'MN001', sku: 'MON-001', shelf: 'A4', description: '27-inch monitor' }
		];
		
		const productMap = new Map();
		for (const prod of products) {
			const categoryId = categoryMap.get(prod.category);
			const result = await query(
				'INSERT INTO products (name, barcode, category_id, description, sku, shelf, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
				[
					{ name: prod.name },
					{ barcode: prod.barcode || null },
					{ category_id: categoryId || null },
					{ description: prod.description || null },
					{ sku: prod.sku || null },
					{ shelf: prod.shelf || null },
					{ created_at: timestamp }
				]
			);
			productMap.set(prod.name, result.recordset[0].id);
			console.log(`  ✓ Created product: ${prod.name}`);
		}
		console.log(`✅ Created ${products.length} products\n`);
		
		// 3. Create Product Prices
		console.log('💰 Creating product prices...');
		const prices = [
			{ product: 'Laptop Computer', wholesale: 800, retail: 1200 },
			{ product: 'Wireless Mouse', wholesale: 15, retail: 25 },
			{ product: 'USB Keyboard', wholesale: 30, retail: 50 },
			{ product: 'Smartphone', wholesale: 500, retail: 800 },
			{ product: 'Tablet', wholesale: 300, retail: 500 },
			{ product: 'Coffee Beans', wholesale: 8, retail: 15 },
			{ product: 'Bottled Water', wholesale: 0.5, retail: 1 },
			{ product: 'Energy Drink', wholesale: 1.5, retail: 3 },
			{ product: 'T-Shirt', wholesale: 10, retail: 20 },
			{ product: 'Jeans', wholesale: 25, retail: 50 },
			{ product: 'Sneakers', wholesale: 40, retail: 80 },
			{ product: 'Garden Tools Set', wholesale: 50, retail: 100 },
			{ product: 'Plant Pot', wholesale: 5, retail: 10 },
			{ product: 'Basketball', wholesale: 20, retail: 40 },
			{ product: 'Yoga Mat', wholesale: 15, retail: 30 },
			{ product: 'Programming Book', wholesale: 25, retail: 50 },
			{ product: 'Shampoo', wholesale: 5, retail: 10 },
			{ product: 'Car Battery', wholesale: 80, retail: 150 },
			{ product: 'Tire Set', wholesale: 200, retail: 400 },
			{ product: 'Monitor', wholesale: 150, retail: 250 }
		];
		
		for (const price of prices) {
			const productId = productMap.get(price.product);
			if (productId) {
				await query(
					'INSERT INTO product_prices (product_id, wholesale_price, retail_price, effective_date, created_at) VALUES ($1, $2, $3, $4, $5)',
					[
						{ product_id: productId },
						{ wholesale_price: price.wholesale },
						{ retail_price: price.retail },
						{ effective_date: today },
						{ created_at: timestamp }
					]
				);
				console.log(`  ✓ Added prices for: ${price.product} (Wholesale: $${price.wholesale}, Retail: $${price.retail})`);
			}
		}
		console.log(`✅ Created prices for ${prices.length} products\n`);
		
		// 4. Create Exchange Rates
		console.log('💱 Creating exchange rates...');
		const exchangeRates = [
			{ currency_code: 'USD', rate_to_usd: 1.0, is_active: true },
			{ currency_code: 'LBP', rate_to_usd: 15000.0, is_active: true },
			{ currency_code: 'EUR', rate_to_usd: 0.92, is_active: true }
		];
		
		for (const rate of exchangeRates) {
			await query(
				'INSERT INTO exchange_rates (currency_code, rate_to_usd, effective_date, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)',
				[
					{ currency_code: rate.currency_code },
					{ rate_to_usd: rate.rate_to_usd },
					{ effective_date: today },
					{ is_active: rate.is_active ? 1 : 0 },
					{ created_at: timestamp }
				]
			);
			console.log(`  ✓ Created exchange rate: ${rate.currency_code} = ${rate.rate_to_usd} USD`);
		}
		console.log(`✅ Created ${exchangeRates.length} exchange rates\n`);
		
		// 5. Create Customers
		console.log('👥 Creating customers...');
		const customers = [
			{ name: 'John Doe', phone: '+961-1-1234567', address: 'Beirut, Lebanon', credit_limit: 5000 },
			{ name: 'Jane Smith', phone: '+961-3-9876543', address: 'Tripoli, Lebanon', credit_limit: 3000 },
			{ name: 'Mike Johnson', phone: '+961-70-1112222', address: 'Sidon, Lebanon', credit_limit: 2000 },
			{ name: 'Sarah Williams', phone: '+961-76-3334444', address: 'Tyre, Lebanon', credit_limit: 4000 }
		];
		
		for (const customer of customers) {
			await query(
				'INSERT INTO customers (name, phone, address, credit_limit, created_at) VALUES ($1, $2, $3, $4, $5)',
				[
					{ name: customer.name },
					{ phone: customer.phone || null },
					{ address: customer.address || null },
					{ credit_limit: customer.credit_limit || 0 },
					{ created_at: timestamp }
				]
			);
			console.log(`  ✓ Created customer: ${customer.name}`);
		}
		console.log(`✅ Created ${customers.length} customers\n`);
		
		// 6. Create Suppliers
		console.log('🏭 Creating suppliers...');
		const suppliers = [
			{ name: 'Tech Supplier Co.', phone: '+961-1-5556666', address: 'Beirut, Lebanon' },
			{ name: 'Food Distributors Ltd.', phone: '+961-3-7778888', address: 'Beirut, Lebanon' },
			{ name: 'Fashion Wholesale', phone: '+961-70-9990000', address: 'Beirut, Lebanon' },
			{ name: 'General Merchandise Inc.', phone: '+961-76-1112222', address: 'Beirut, Lebanon' }
		];
		
		for (const supplier of suppliers) {
			await query(
				'INSERT INTO suppliers (name, phone, address, created_at) VALUES ($1, $2, $3, $4)',
				[
					{ name: supplier.name },
					{ phone: supplier.phone || null },
					{ address: supplier.address || null },
					{ created_at: timestamp }
				]
			);
			console.log(`  ✓ Created supplier: ${supplier.name}`);
		}
		console.log(`✅ Created ${suppliers.length} suppliers\n`);
		
		// 7. Initialize daily stock for all products (with 0 quantity)
		console.log('📊 Initializing daily stock...');
		for (const [productName, productId] of productMap) {
			await query(
				'INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at) VALUES ($1, 0, 0, $2, $3, $3)',
				[
					{ product_id: productId },
					{ date: today },
					{ created_at: timestamp }
				]
			);
		}
		console.log(`✅ Initialized daily stock for ${productMap.size} products\n`);
		
		console.log('═══════════════════════════════════════════');
		console.log('🎉 Master data seeding completed successfully!');
		console.log('═══════════════════════════════════════════');
		console.log(`\nSummary:`);
		console.log(`  • Categories: ${categories.length}`);
		console.log(`  • Products: ${products.length}`);
		console.log(`  • Product Prices: ${prices.length}`);
		console.log(`  • Exchange Rates: ${exchangeRates.length}`);
		console.log(`  • Customers: ${customers.length}`);
		console.log(`  • Suppliers: ${suppliers.length}`);
		console.log(`  • Daily Stock Entries: ${productMap.size}`);
		console.log(`\n✅ All invoices have been cleared.`);
		console.log(`✅ Master data is ready for use.\n`);
		
	} catch (err) {
		console.error('\n❌ Error during seeding:', err);
		process.exit(1);
	}
}

// Export the function so it can be called from API
module.exports = { seedMasterData };

// Only run automatically if called directly (not required as module)
if (require.main === module) {
	seedMasterData()
		.then(() => {
			console.log('✅ Seeding completed successfully');
			process.exit(0);
		})
		.catch((err) => {
			console.error('❌ Seeding failed:', err);
			process.exit(1);
		});
}

