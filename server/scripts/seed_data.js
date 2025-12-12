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

// Export the seed function so it can be called from API endpoint
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
		await query('DELETE FROM categories', []);
		await query('DELETE FROM customers', []);
		await query('DELETE FROM suppliers', []);
		// Clear ALL users - next signup will become admin
		await query('DELETE FROM users', []);
		console.log('✅ Existing data cleared\n');
		console.log('ℹ️  All users cleared. Next user to sign up will automatically become admin.\n');

		// 1. Create Demo User (first user becomes admin automatically)
		console.log('👤 Creating demo user...');
		const bcrypt = require('bcrypt');
		const passwordHash = await bcrypt.hash('Hassan123', 10); // Use bcrypt for secure password hashing (min 8 chars)
		
		// Check if users table is empty (first user becomes admin)
		const userCountResult = await query('SELECT COUNT(*) as count FROM users', []);
		const userCount = parseInt(userCountResult.recordset[0]?.count || 0);
		const isFirstUser = userCount === 0;
		
		console.log(`   User count before creation: ${userCount}, isFirstUser: ${isFirstUser}`);
		
		const userCheck = await query('SELECT id FROM users WHERE email = $1', ['hassanalbeiruty@gmail.com']);
		if (userCheck.recordset.length === 0) {
			// Force admin to true for first user - use explicit true boolean
			const adminValue = isFirstUser ? true : false;
			const insertResult = await query(
				'INSERT INTO users (email, passwordhash, is_admin, created_at) VALUES ($1, $2, $3, $4) RETURNING id, is_admin',
				['hassanalbeiruty@gmail.com', passwordHash, adminValue, nowIso()]
			);
			
			const createdUser = insertResult.recordset[0];
			const isAdminSet = createdUser.is_admin === true || createdUser.is_admin === 1;
			
			if (isFirstUser) {
				console.log(`✅ Demo user created and set as admin (first user) - Admin status: ${isAdminSet}`);
				// Double-check and force admin if needed
				if (!isAdminSet) {
					await query('UPDATE users SET is_admin = true WHERE id = $1', [createdUser.id]);
					console.log('   ⚠️  Admin status was not set correctly, fixed manually');
				}
			} else {
				console.log('✅ Demo user created');
			}
		} else {
			console.log('✅ Demo user already exists');
			// Always update existing user to admin and reset password
			const existingUserId = userCheck.recordset[0].id;
			await query('UPDATE users SET is_admin = true, passwordhash = $1 WHERE id = $2', [passwordHash, existingUserId]);
			console.log('   ⚠️  Updated existing user to admin and reset password');
		}
		console.log('');

		// 2. Create Categories
		console.log('📁 Creating categories...');
		const categories = [
			{ name: 'Electronics', description: 'Electronic devices and gadgets' },
			{ name: 'Computers & Laptops', description: 'Desktop computers, laptops, and accessories' },
			{ name: 'Mobile Phones', description: 'Smartphones and mobile accessories' },
			{ name: 'Audio Equipment', description: 'Headphones, speakers, and audio devices' },
			{ name: 'Tablets', description: 'Tablet computers and accessories' },
			{ name: 'Wearables', description: 'Smart watches and fitness trackers' },
			{ name: 'Computer Accessories', description: 'Keyboards, mice, monitors, and peripherals' },
			{ name: 'Networking', description: 'Routers, switches, and networking equipment' },
			{ name: 'Storage', description: 'Hard drives, SSDs, and storage devices' },
			{ name: 'Gaming', description: 'Gaming consoles, controllers, and accessories' },
		];

		const categoryIds = [];
		for (const cat of categories) {
			const result = await query(
				'INSERT INTO categories (name, description, created_at) VALUES ($1, $2, $3) RETURNING id',
				[cat.name, cat.description || null, nowIso()]
			);
			const categoryId = result.recordset[0].id;
			categoryIds.push({ id: categoryId, name: cat.name });
		}
		console.log(`✅ Created ${categories.length} categories\n`);

		// 3. Create Products with complete data
		console.log('📦 Creating products...');
		const products = [
			{ name: 'Laptop Dell XPS 15', barcode: 'LPT-DELL-XPS15-001', sku: 'DELL-XPS15-256GB', shelf: 'A1-B2', category: 'Computers & Laptops', description: '15.6" FHD Display, Intel i7, 16GB RAM, 512GB SSD' },
			{ name: 'iPhone 15 Pro', barcode: 'PHN-APPLE-15PRO-128', sku: 'IPH15PRO-128GB', shelf: 'B1-C3', category: 'Mobile Phones', description: '6.1" Super Retina XDR, A17 Pro, 128GB Storage' },
			{ name: 'Samsung Galaxy S24 Ultra', barcode: 'PHN-SAMSUNG-S24U-256', sku: 'SGS24U-256GB', shelf: 'B1-C4', category: 'Mobile Phones', description: '6.8" Dynamic AMOLED, Snapdragon 8 Gen 3, 256GB' },
			{ name: 'Sony WH-1000XM5 Headphones', barcode: 'AUD-SONY-WH1000XM5', sku: 'SONY-WH1000XM5', shelf: 'C1-D2', category: 'Audio Equipment', description: 'Industry-leading noise cancellation, 30hr battery' },
			{ name: 'iPad Air 11" M2', barcode: 'TAB-APPLE-IPADAIR11-128', sku: 'IPADAIR11-128GB', shelf: 'A2-B3', category: 'Tablets', description: '11" Liquid Retina, M2 Chip, 128GB, Wi-Fi' },
			{ name: 'MacBook Air M2 13"', barcode: 'LPT-APPLE-MBA13-M2-256', sku: 'MBA13-M2-256GB', shelf: 'A1-B1', category: 'Computers & Laptops', description: '13.6" Liquid Retina, M2 Chip, 8GB RAM, 256GB SSD' },
			{ name: 'Apple Watch Series 9', barcode: 'WTH-APPLE-AW9-45MM', sku: 'AW9-45MM-GPS', shelf: 'D1-E2', category: 'Wearables', description: '45mm GPS, Aluminum Case, Sport Band' },
			{ name: 'AirPods Pro 2nd Gen', barcode: 'AUD-APPLE-AIRPODSPRO2', sku: 'AIRPODSPRO2', shelf: 'C1-D1', category: 'Audio Equipment', description: 'Active Noise Cancellation, Spatial Audio, MagSafe Case' },
			{ name: 'Dell UltraSharp 27" Monitor', barcode: 'MON-DELL-U2723DE', sku: 'DELL-U2723DE', shelf: 'E1-F2', category: 'Computer Accessories', description: '27" 4K UHD, USB-C Hub, IPS Panel' },
			{ name: 'Logitech MX Master 3S', barcode: 'ACC-LOGI-MXMASTER3S', sku: 'LOGI-MXMASTER3S', shelf: 'F1-G2', category: 'Computer Accessories', description: 'Wireless Mouse, Darkfield Tracking, 70-day Battery' },
			{ name: 'Mechanical Keyboard RGB', barcode: 'ACC-KEYBOARD-RGB-MECH', sku: 'KB-RGB-MECH-87', shelf: 'F1-G3', category: 'Computer Accessories', description: '87-key Mechanical, RGB Backlight, Blue Switches' },
			{ name: 'Webcam Logitech C920 HD Pro', barcode: 'ACC-LOGI-C920', sku: 'LOGI-C920', shelf: 'F1-G4', category: 'Computer Accessories', description: '1080p HD, Auto Light Correction, Stereo Audio' },
			{ name: 'Samsung 980 PRO 1TB SSD', barcode: 'STRG-SAMSUNG-980PRO-1TB', sku: 'SSD-980PRO-1TB', shelf: 'G1-H2', category: 'Storage', description: 'NVMe M.2 SSD, 7000MB/s Read, 5000MB/s Write' },
			{ name: 'PlayStation 5 Console', barcode: 'GAME-SONY-PS5-DISC', sku: 'PS5-DISC-825GB', shelf: 'H1-I2', category: 'Gaming', description: 'PlayStation 5 Disc Edition, 825GB SSD, DualSense Controller' },
			{ name: 'Xbox Series X', barcode: 'GAME-MICROSOFT-XSX-1TB', sku: 'XSX-1TB', shelf: 'H1-I3', category: 'Gaming', description: 'Xbox Series X, 1TB SSD, 4K Gaming, Backward Compatible' },
			{ name: 'Nintendo Switch OLED', barcode: 'GAME-NINTENDO-SWOLED', sku: 'NSW-OLED-64GB', shelf: 'H1-I4', category: 'Gaming', description: '7" OLED Screen, 64GB Storage, Joy-Con Controllers' },
			{ name: 'ASUS ROG Strix Gaming Laptop', barcode: 'LPT-ASUS-ROG-16', sku: 'ASUS-ROG16-RTX4080', shelf: 'A1-B4', category: 'Computers & Laptops', description: '16" QHD, Intel i9, RTX 4080, 32GB RAM, 1TB SSD' },
			{ name: 'Google Pixel 8 Pro', barcode: 'PHN-GOOGLE-P8PRO-128', sku: 'PIXEL8PRO-128GB', shelf: 'B1-C5', category: 'Mobile Phones', description: '6.7" LTPO OLED, Tensor G3, 128GB, 5G' },
			{ name: 'OnePlus 12', barcode: 'PHN-ONEPLUS-12-256', sku: 'OP12-256GB', shelf: 'B1-C6', category: 'Mobile Phones', description: '6.82" AMOLED, Snapdragon 8 Gen 3, 256GB' },
			{ name: 'Bose QuietComfort 45', barcode: 'AUD-BOSE-QC45', sku: 'BOSE-QC45', shelf: 'C1-D3', category: 'Audio Equipment', description: 'Noise Cancelling Headphones, 24hr Battery' },
			{ name: 'JBL Flip 6 Bluetooth Speaker', barcode: 'AUD-JBL-FLIP6', sku: 'JBL-FLIP6', shelf: 'C1-D4', category: 'Audio Equipment', description: 'Portable Bluetooth Speaker, IPX7 Waterproof, 12hr Playtime' },
			{ name: 'iPad Pro 12.9" M2', barcode: 'TAB-APPLE-IPADPRO12-256', sku: 'IPADPRO12-256GB', shelf: 'A2-B4', category: 'Tablets', description: '12.9" Liquid Retina XDR, M2 Chip, 256GB, Wi-Fi' },
			{ name: 'Samsung Galaxy Tab S9', barcode: 'TAB-SAMSUNG-S9-128', sku: 'GALTABS9-128GB', shelf: 'A2-B5', category: 'Tablets', description: '11" Dynamic AMOLED, Snapdragon 8 Gen 2, 128GB' },
			{ name: 'TP-Link Archer AX3000 Router', barcode: 'NET-TPLINK-AX3000', sku: 'TPLINK-AX3000', shelf: 'I1-J2', category: 'Networking', description: 'Wi-Fi 6 Router, Dual Band, 3000Mbps, MU-MIMO' },
			{ name: 'Netgear Nighthawk AX12', barcode: 'NET-NETGEAR-AX12', sku: 'NETGEAR-AX12', shelf: 'I1-J3', category: 'Networking', description: 'Wi-Fi 6 Router, 12-Stream, 6000Mbps, Gaming Optimized' },
		];

		const productIds = [];
		for (const p of products) {
			const category = categoryIds.find(c => c.name === p.category);
			const result = await query(
				'INSERT INTO products (name, barcode, sku, shelf, category_id, description, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
				[p.name, p.barcode, p.sku || null, p.shelf || null, category ? category.id : null, p.description || null, nowIso()]
			);
			const productId = result.recordset[0].id;
			productIds.push({ id: productId, name: p.name, category_id: category ? category.id : null });
		}
		console.log(`✅ Created ${products.length} products\n`);

		// 4. Create Product Prices
		console.log('💰 Creating product prices...');
		const prices = [
			{ product_name: 'Laptop Dell XPS 15', wholesale: 850, retail: 1200 },
			{ product_name: 'iPhone 15 Pro', wholesale: 950, retail: 1300 },
			{ product_name: 'Samsung Galaxy S24 Ultra', wholesale: 900, retail: 1200 },
			{ product_name: 'Sony WH-1000XM5 Headphones', wholesale: 280, retail: 400 },
			{ product_name: 'iPad Air 11" M2', wholesale: 450, retail: 650 },
			{ product_name: 'MacBook Air M2 13"', wholesale: 950, retail: 1350 },
			{ product_name: 'Apple Watch Series 9', wholesale: 320, retail: 450 },
			{ product_name: 'AirPods Pro 2nd Gen', wholesale: 180, retail: 250 },
			{ product_name: 'Dell UltraSharp 27" Monitor', wholesale: 220, retail: 320 },
			{ product_name: 'Logitech MX Master 3S', wholesale: 70, retail: 100 },
			{ product_name: 'Mechanical Keyboard RGB', wholesale: 85, retail: 130 },
			{ product_name: 'Webcam Logitech C920 HD Pro', wholesale: 55, retail: 80 },
			{ product_name: 'Samsung 980 PRO 1TB SSD', wholesale: 90, retail: 130 },
			{ product_name: 'PlayStation 5 Console', wholesale: 400, retail: 550 },
			{ product_name: 'Xbox Series X', wholesale: 380, retail: 520 },
			{ product_name: 'Nintendo Switch OLED', wholesale: 280, retail: 380 },
			{ product_name: 'ASUS ROG Strix Gaming Laptop', wholesale: 1800, retail: 2500 },
			{ product_name: 'Google Pixel 8 Pro', wholesale: 700, retail: 950 },
			{ product_name: 'OnePlus 12', wholesale: 650, retail: 850 },
			{ product_name: 'Bose QuietComfort 45', wholesale: 250, retail: 350 },
			{ product_name: 'JBL Flip 6 Bluetooth Speaker', wholesale: 90, retail: 130 },
			{ product_name: 'iPad Pro 12.9" M2', wholesale: 900, retail: 1200 },
			{ product_name: 'Samsung Galaxy Tab S9', wholesale: 600, retail: 800 },
			{ product_name: 'TP-Link Archer AX3000 Router', wholesale: 120, retail: 180 },
			{ product_name: 'Netgear Nighthawk AX12', wholesale: 350, retail: 500 },
		];

		let priceCount = 0;
		for (const price of prices) {
			const product = productIds.find(p => p.name === price.product_name);
			if (product) {
				await query(
					'INSERT INTO product_prices (product_id, wholesale_price, retail_price, effective_date, created_at) VALUES ($1, $2, $3, $4, $5)',
					[product.id, price.wholesale, price.retail, getTodayLocal(), nowIso()]
				);
				priceCount++;
			}
		}
		console.log(`✅ Created ${priceCount} product prices\n`);

		// 5. Create Customers
		console.log('👥 Creating customers...');
		const customers = [
			{ name: 'John Smith', phone: '+1-555-0101', address: '123 Main St, New York, NY 10001, USA', credit: 5000 },
			{ name: 'Sarah Johnson', phone: '+1-555-0102', address: '456 Oak Ave, Los Angeles, CA 90001, USA', credit: 3000 },
			{ name: 'Mike Brown', phone: '+1-555-0103', address: '789 Pine Rd, Chicago, IL 60601, USA', credit: 7500 },
			{ name: 'Emily Davis', phone: '+1-555-0104', address: '321 Elm St, Houston, TX 77001, USA', credit: 4000 },
			{ name: 'Tech Solutions Inc', phone: '+1-555-0105', address: '555 Business Blvd, Boston, MA 02101, USA', credit: 15000 },
			{ name: 'Global Trading Co', phone: '+1-555-0106', address: '777 Commerce Way, Seattle, WA 98101, USA', credit: 20000 },
			{ name: 'Digital Retail Group', phone: '+1-555-0107', address: '888 Market St, San Francisco, CA 94102, USA', credit: 12000 },
			{ name: 'Electronics Plus LLC', phone: '+1-555-0108', address: '999 Tech Drive, Austin, TX 78701, USA', credit: 8000 },
			{ name: 'Smart Devices Corp', phone: '+1-555-0109', address: '111 Innovation Blvd, Portland, OR 97201, USA', credit: 10000 },
			{ name: 'Mobile World Enterprises', phone: '+1-555-0110', address: '222 Wireless Ave, Miami, FL 33101, USA', credit: 6000 },
		];

		const customerIds = [];
		for (const c of customers) {
			const result = await query(
				'INSERT INTO customers (name, phone, address, credit_limit, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
				[c.name, c.phone || null, c.address || null, c.credit, nowIso()]
			);
			customerIds.push({ id: result.recordset[0].id, name: c.name });
		}
		console.log(`✅ Created ${customers.length} customers\n`);

		// 6. Create Suppliers
		console.log('🏭 Creating suppliers...');
		const suppliers = [
			{ name: 'Tech Wholesale Ltd', phone: '+1-555-1001', address: '100 Industry Park, Dallas, TX 75201, USA' },
			{ name: 'Global Electronics Supply', phone: '+1-555-1002', address: '200 Import Dr, Miami, FL 33101, USA' },
			{ name: 'Premium Gadgets Distributor', phone: '+1-555-1003', address: '300 Trade Center, Atlanta, GA 30301, USA' },
			{ name: 'Direct Import Solutions', phone: '+1-555-1004', address: '400 Wholesale Way, Denver, CO 80201, USA' },
			{ name: 'Asian Electronics Import Co', phone: '+86-21-1234-5678', address: '500 Export Zone, Shanghai, China' },
			{ name: 'European Tech Distributors', phone: '+44-20-1234-5678', address: '600 Commerce Square, London, UK' },
			{ name: 'Middle East Electronics', phone: '+971-4-123-4567', address: '700 Business Bay, Dubai, UAE' },
			{ name: 'North American Tech Supply', phone: '+1-555-1008', address: '800 Distribution Center, Toronto, Canada' },
		];

		const supplierIds = [];
		for (const s of suppliers) {
			const result = await query(
				'INSERT INTO suppliers (name, phone, address, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
				[s.name, s.phone || null, s.address || null, nowIso()]
			);
			supplierIds.push({ id: result.recordset[0].id, name: s.name });
		}
		console.log(`✅ Created ${suppliers.length} suppliers\n`);

		// Summary - No invoices created as requested
		console.log('═══════════════════════════════════════════');
		console.log('🎉 Database seeding completed successfully!');
		console.log('═══════════════════════════════════════════');
		console.log(`📁 Categories:       ${categories.length}`);
		console.log(`📦 Products:        ${products.length}`);
		console.log(`💰 Product Prices:  ${priceCount}`);
		console.log(`👥 Customers:       ${customers.length}`);
		console.log(`🏭 Suppliers:       ${suppliers.length}`);
		console.log('═══════════════════════════════════════════\n');
		console.log('🔐 Demo Login Credentials:');
		console.log('   Email: hassanalbeiruty@gmail.com');
		console.log('   Password: Hassan123');
		console.log('   Note: First user created is automatically set as admin\n');

	} catch (error) {
		console.error('❌ Seeding failed:', error);
		throw error;
	}
}

// Export the function for use in API endpoint
module.exports = { seedData };

// Only run directly if called from command line (not when required as module)
if (require.main === module) {
	seedData()
		.then(() => {
			console.log('✅ Database seeded successfully! You can now login and explore the system.\n');
			process.exit(0);
		})
		.catch((error) => {
			console.error('💥 Seeding failed:', error);
			process.exit(1);
		});
}
