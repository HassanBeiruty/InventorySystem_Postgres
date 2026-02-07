// Seed script: reset invoices and positions only (no main entities).
// Truncates invoice-related tables and restarts identity so IDs start from 1.
// Does NOT create or delete: users, categories, products, customers, suppliers, product_prices.
require('dotenv').config();
const path = require('path');
const dotenvPath = path.resolve(__dirname, '../.env');
require('dotenv').config({ path: dotenvPath });
const { clearInvoicesAndPositionsOnly } = require('./clear_data');

async function main() {
	console.log('🌱 Seed (invoices reset only) – no main entities\n');
	await clearInvoicesAndPositionsOnly();
	console.log('✅ Done. Main entities unchanged; invoice/position IDs reset from 1.\n');
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error('❌ Failed:', err);
		process.exit(1);
	});
