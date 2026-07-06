/**
 * END-TO-END QA of the invoice edit/delete flow against the REAL server + REAL
 * stored procedures, on the scratch database `inventory_qa_test` (never the real DB).
 *
 * Prerequisites: server running with PG_DATABASE=inventory_qa_test (schema auto-init).
 *   $env:PG_DATABASE='inventory_qa_test'; $env:PORT='4123'; node index.js
 * Then:  node scripts/qa-invoice-edit-delete.js
 *
 * Coverage:
 *   1. Happy path: edit an old buy invoice (17.50 -> 10.00), full replay to today
 *   2. Happy path: delete the oldest sell, full replay to today
 *   3. Rollback: edit that adds a NEW product  -> 400, database byte-identical
 *   4. Rollback: edit with duplicate products  -> 400, database byte-identical
 *   5. Rollback: edit with corrupted ledger (movement missing) -> 409, database byte-identical
 *   6. Create with duplicate products -> 400, nothing created
 *   7. Create endpoint still works normally after the validation change
 *   8. Delete invoice with payments still refused (regression check)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
process.env.PG_DATABASE = 'inventory_qa_test'; // hard override - QA db only

const { Pool } = require('pg');
const pool = new Pool({
	host: process.env.PG_HOST || 'localhost',
	port: parseInt(process.env.PG_PORT || '5432'),
	database: 'inventory_qa_test',
	user: process.env.PG_USER || 'postgres',
	password: process.env.PG_PASSWORD || '',
});

const API = process.env.QA_API_URL || 'http://localhost:4123/api';

// ---------- helpers ----------
const results = [];
function check(label, actual, expected) {
	const pass = JSON.stringify(actual) === JSON.stringify(expected);
	results.push({ label, pass, actual, expected });
	console.log(`  ${pass ? '✅' : '❌'} ${label}  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

async function api(method, url, body) {
	const res = await fetch(`${API}${url}`, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	});
	let json = null;
	try { json = await res.json(); } catch (e) {}
	return { status: res.status, body: json };
}

function num(v) { return v === null || v === undefined ? null : parseFloat(String(v)); }

// full deterministic snapshot of everything the edit flow can touch
async function dbSnapshot(productIds) {
	const movements = await pool.query(
		`SELECT product_id, invoice_id, quantity_before, quantity_change, quantity_after, unit_cost, avg_cost_after
		 FROM stock_movements WHERE product_id = ANY($1) ORDER BY product_id, invoice_id, id`, [productIds]);
	const daily = await pool.query(
		`SELECT product_id, to_char(date,'YYYY-MM-DD') AS date, available_qty, avg_cost
		 FROM daily_stock WHERE product_id = ANY($1) ORDER BY product_id, date`, [productIds]);
	const items = await pool.query(
		`SELECT invoice_id, product_id, quantity, unit_price, total_price
		 FROM invoice_items WHERE product_id = ANY($1) ORDER BY invoice_id, product_id, id`, [productIds]);
	const invoices = await pool.query(
		`SELECT id, invoice_type, total_amount FROM invoices
		 WHERE id IN (SELECT DISTINCT invoice_id FROM invoice_items WHERE product_id = ANY($1)) ORDER BY id`, [productIds]);
	return JSON.stringify({ m: movements.rows, d: daily.rows, i: items.rows, v: invoices.rows });
}

async function getMovements(productId) {
	const r = await pool.query(
		`SELECT invoice_id, quantity_before, quantity_change, quantity_after, unit_cost, avg_cost_after
		 FROM stock_movements WHERE product_id = $1 ORDER BY invoice_id, id`, [productId]);
	return r.rows;
}

async function verifyMovements(stage, productId, expected) {
	const rows = await getMovements(productId);
	check(`${stage}: movement count`, rows.length, expected.length);
	rows.forEach((r, i) => {
		if (!expected[i]) return;
		const [b, c, a, avg] = expected[i];
		check(`${stage}: mv#${i + 1} before/change/after/avg`,
			[num(r.quantity_before), num(r.quantity_change), num(r.quantity_after), num(r.avg_cost_after)],
			[b, c, a, avg]);
	});
	let breaks = 0;
	for (let i = 1; i < rows.length; i++) if (num(rows[i].quantity_before) !== num(rows[i - 1].quantity_after)) breaks++;
	check(`${stage}: ledger chain continuous`, breaks, 0);
}

async function verifyDaily(stage, productId, segments, expectedAvg, todayStr) {
	const r = await pool.query(
		`SELECT to_char(date,'YYYY-MM-DD') AS d, available_qty, avg_cost
		 FROM daily_stock WHERE product_id = $1 ORDER BY date`, [productId]);
	const rows = r.rows;
	const qtyFor = (d) => { let q = null; for (const s of segments) if (d >= s.from) q = s.qty; return q; };
	// dense from first segment date to today
	let expectedCount = 0;
	for (let dt = new Date(segments[0].from + 'T00:00:00Z'); dt.toISOString().slice(0, 10) <= todayStr; dt.setUTCDate(dt.getUTCDate() + 1)) expectedCount++;
	check(`${stage}: daily rows dense ${segments[0].from} → ${todayStr}`, rows.length, expectedCount);
	let qtyErr = 0, avgErr = 0, dupErr = 0;
	const seen = new Set();
	for (const row of rows) {
		if (seen.has(row.d)) dupErr++; seen.add(row.d);
		if (num(row.available_qty) !== qtyFor(row.d)) qtyErr++;
		if (num(row.avg_cost) !== expectedAvg) avgErr++;
	}
	check(`${stage}: no duplicate dates`, dupErr, 0);
	check(`${stage}: every date correct qty`, qtyErr, 0);
	check(`${stage}: every date avg=${expectedAvg}`, avgErr, 0);
	const today = rows[rows.length - 1];
	check(`${stage}: TODAY qty/avg`, [num(today?.available_qty), num(today?.avg_cost)], [segments[segments.length - 1].qty, expectedAvg]);
}

// seed one historical invoice exactly the way the create endpoint would have written it back then
async function seedInvoice({ type, productId, ts, qty, unitPrice, before, avgBefore }) {
	const change = type === 'sell' ? -qty : qty;
	const after = before + change;
	let avgAfter = avgBefore;
	if (type === 'buy') {
		const denom = before + qty;
		avgAfter = denom > 0 ? ((avgBefore * before) + (unitPrice * qty)) / denom : unitPrice;
	}
	const inv = await pool.query(
		`INSERT INTO invoices (invoice_type, total_amount, invoice_date, created_at) VALUES ($1,$2,$3::timestamp,$3::timestamp) RETURNING id`,
		[type, qty * unitPrice, ts]);
	const invoiceId = inv.rows[0].id;
	await pool.query(
		`INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price, price_type, is_private_price)
		 VALUES ($1,$2,$3,$4,$5,'retail',FALSE)`, [invoiceId, productId, qty, unitPrice, qty * unitPrice]);
	await pool.query(
		`INSERT INTO stock_movements (product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, unit_cost, avg_cost_after, created_at)
		 VALUES ($1,$2,$3::timestamp,$4,$5,$6,$7,$8,$3::timestamp)`,
		[productId, invoiceId, ts, before, change, after, unitPrice, avgAfter]);
	await pool.query(
		`INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at)
		 VALUES ($1,$2,$3,$4::date,$5::timestamp,$5::timestamp)
		 ON CONFLICT (product_id, date) DO UPDATE SET available_qty=EXCLUDED.available_qty, avg_cost=EXCLUDED.avg_cost, updated_at=EXCLUDED.updated_at`,
		[productId, after, avgAfter, ts.slice(0, 10), ts]);
	return invoiceId;
}

// ---------- main ----------
(async () => {
	try {
		// sanity: make sure the server under test uses the QA database
		const health = await api('GET', '/health');
		if (health.body?.db?.db !== 'inventory_qa_test') {
			throw new Error(`Server is NOT on the QA database (got: ${JSON.stringify(health.body?.db)}). Aborting.`);
		}
		console.log(`✔ Server under test confirmed on database: inventory_qa_test\n`);

		const todayStr = (await pool.query(`SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') AS d`)).rows[0].d;

		// ============ SEED: the user's exact scenario ============
		const prod = await pool.query(`INSERT INTO products (name, created_at) VALUES ('QA MAIN PRODUCT', NOW()) RETURNING id`);
		const P = prod.rows[0].id;
		const prod2 = await pool.query(`INSERT INTO products (name, created_at) VALUES ('QA OTHER PRODUCT', NOW()) RETURNING id`);
		const P2 = prod2.rows[0].id;

		const buyId = await seedInvoice({ type: 'buy', productId: P, ts: '2026-03-20 10:00:00', qty: 100, unitPrice: 17.5, before: 0, avgBefore: 0 });
		const sell1 = await seedInvoice({ type: 'sell', productId: P, ts: '2026-03-25 11:00:00', qty: 10, unitPrice: 25, before: 100, avgBefore: 17.5 });
		const sell2 = await seedInvoice({ type: 'sell', productId: P, ts: '2026-04-10 12:00:00', qty: 15, unitPrice: 25, before: 90, avgBefore: 17.5 });
		const sell3 = await seedInvoice({ type: 'sell', productId: P, ts: '2026-05-05 13:00:00', qty: 5, unitPrice: 25, before: 75, avgBefore: 17.5 });
		await pool.query('SELECT sp_recompute_positions($1)', [P]); // nightly jobs since March
		console.log(`Seeded: product=${P}, buy=${buyId}, sells=${sell1},${sell2},${sell3}  (today=${todayStr})\n`);

		// ============ TEST 1: EDIT the old buy via the REAL endpoint ============
		console.log('════ TEST 1: PUT /invoices/:id — fix buy price 17.50 → 10.00 ════');
		const editRes = await api('PUT', `/invoices/${buyId}`, {
			invoice_type: 'buy',
			total_amount: 1000,
			items: [{ product_id: P, quantity: 100, unit_price: 10, total_price: 1000, price_type: 'retail', is_private_price: false }],
		});
		check('edit buy: HTTP status', editRes.status, 200);
		await verifyMovements('after edit', P, [
			[0, 100, 100, 10], [100, -10, 90, 10], [90, -15, 75, 10], [75, -5, 70, 10],
		]);
		await verifyDaily('after edit', P, [
			{ from: '2026-03-20', qty: 100 }, { from: '2026-03-25', qty: 90 },
			{ from: '2026-04-10', qty: 75 }, { from: '2026-05-05', qty: 70 },
		], 10, todayStr);
		const itemCheck = await pool.query('SELECT quantity, unit_price FROM invoice_items WHERE invoice_id = $1', [buyId]);
		check('after edit: invoice item price updated', num(itemCheck.rows[0]?.unit_price), 10);

		// ============ TEST 2: DELETE the oldest sell via the REAL endpoint ============
		console.log('\n════ TEST 2: DELETE /invoices/:id — remove the Mar-25 sell ════');
		const delRes = await api('DELETE', `/invoices/${sell1}`);
		check('delete sell: HTTP status', delRes.status, 200);
		await verifyMovements('after delete', P, [
			[0, 100, 100, 10], [100, -15, 85, 10], [85, -5, 80, 10],
		]);
		await verifyDaily('after delete', P, [
			{ from: '2026-03-20', qty: 100 }, { from: '2026-04-10', qty: 85 }, { from: '2026-05-05', qty: 80 },
		], 10, todayStr);
		const invGone = await pool.query('SELECT COUNT(*)::int AS c FROM invoices WHERE id = $1', [sell1]);
		check('after delete: invoice removed', invGone.rows[0].c, 0);

		// ============ TEST 3: edit that ADDS a new product → 400 + full rollback ============
		console.log('\n════ TEST 3: edit adding a NEW product must fail atomically ════');
		const before3 = await dbSnapshot([P, P2]);
		const addRes = await api('PUT', `/invoices/${sell2}`, {
			invoice_type: 'sell',
			total_amount: 500,
			items: [
				{ product_id: P, quantity: 15, unit_price: 25, total_price: 375, price_type: 'retail', is_private_price: false },
				{ product_id: P2, quantity: 5, unit_price: 25, total_price: 125, price_type: 'retail', is_private_price: false },
			],
		});
		check('add-product edit: HTTP status is 400', addRes.status, 400);
		check('add-product edit: error mentions not supported', String(addRes.body?.error || '').includes('not supported'), true);
		check('add-product edit: DATABASE UNCHANGED (full rollback)', (await dbSnapshot([P, P2])) === before3, true);

		// ============ TEST 4: edit with duplicate product lines → 400 + unchanged ============
		console.log('\n════ TEST 4: edit with duplicate product lines must fail ════');
		const before4 = await dbSnapshot([P, P2]);
		const dupRes = await api('PUT', `/invoices/${sell2}`, {
			invoice_type: 'sell',
			total_amount: 750,
			items: [
				{ product_id: P, quantity: 15, unit_price: 25, total_price: 375, price_type: 'retail', is_private_price: false },
				{ product_id: P, quantity: 15, unit_price: 25, total_price: 375, price_type: 'retail', is_private_price: false },
			],
		});
		check('duplicate edit: HTTP status is 400', dupRes.status, 400);
		check('duplicate edit: DATABASE UNCHANGED', (await dbSnapshot([P, P2])) === before4, true);

		// ============ TEST 5: corrupted ledger (movement missing) → 409 + unchanged ============
		console.log('\n════ TEST 5: missing movement (corrupted ledger) must fail with 409 ════');
		const savedMovement = (await pool.query(
			`SELECT * FROM stock_movements WHERE invoice_id = $1 AND product_id = $2`, [sell3, P])).rows[0];
		await pool.query('DELETE FROM stock_movements WHERE id = $1', [savedMovement.id]); // simulate corruption
		const before5 = await dbSnapshot([P, P2]);
		const corruptRes = await api('PUT', `/invoices/${sell3}`, {
			invoice_type: 'sell',
			total_amount: 125,
			items: [{ product_id: P, quantity: 5, unit_price: 25, total_price: 125, price_type: 'retail', is_private_price: false }],
		});
		check('corrupted edit: HTTP status is 409', corruptRes.status, 409);
		check('corrupted edit: error mentions inconsistent', String(corruptRes.body?.error || '').toLowerCase().includes('inconsistent'), true);
		check('corrupted edit: DATABASE UNCHANGED', (await dbSnapshot([P, P2])) === before5, true);
		// restore the movement (undo simulated corruption)
		await pool.query(
			`INSERT INTO stock_movements (id, product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, unit_cost, avg_cost_after, created_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			[savedMovement.id, savedMovement.product_id, savedMovement.invoice_id, savedMovement.invoice_date,
			 savedMovement.quantity_before, savedMovement.quantity_change, savedMovement.quantity_after,
			 savedMovement.unit_cost, savedMovement.avg_cost_after, savedMovement.created_at]);

		// ============ TEST 6: create with duplicate products → 400, nothing created ============
		console.log('\n════ TEST 6: create invoice with duplicate products must fail ════');
		const invCountBefore = (await pool.query('SELECT COUNT(*)::int AS c FROM invoices')).rows[0].c;
		const dupCreate = await api('POST', '/invoices', {
			invoice_type: 'sell',
			total_amount: 50,
			items: [
				{ product_id: P, quantity: 1, unit_price: 25, total_price: 25, price_type: 'retail', is_private_price: false },
				{ product_id: P, quantity: 1, unit_price: 25, total_price: 25, price_type: 'retail', is_private_price: false },
			],
		});
		check('duplicate create: HTTP status is 400', dupCreate.status, 400);
		check('duplicate create: no invoice created', (await pool.query('SELECT COUNT(*)::int AS c FROM invoices')).rows[0].c, invCountBefore);

		// ============ TEST 7: normal create still works (regression) ============
		console.log('\n════ TEST 7: normal create invoice still works ════');
		const createRes = await api('POST', '/invoices', {
			invoice_type: 'sell',
			total_amount: 250,
			items: [{ product_id: P, quantity: 10, unit_price: 25, total_price: 250, price_type: 'retail', is_private_price: false }],
		});
		check('create: HTTP status', createRes.status, 200);
		const newInvId = createRes.body?.id;
		const newMv = (await pool.query('SELECT * FROM stock_movements WHERE invoice_id = $1', [newInvId])).rows[0];
		check('create: movement written (80 → 70)', [num(newMv?.quantity_before), num(newMv?.quantity_after), num(newMv?.avg_cost_after)], [80, 70, 10]);
		const todayRow = (await pool.query(
			`SELECT available_qty, avg_cost FROM daily_stock WHERE product_id = $1 AND date = CURRENT_DATE`, [P])).rows[0];
		check('create: today daily_stock updated', [num(todayRow?.available_qty), num(todayRow?.avg_cost)], [70, 10]);

		// ============ TEST 8: delete invoice with payments still refused (regression) ============
		console.log('\n════ TEST 8: delete with payments still refused ════');
		await pool.query(
			`INSERT INTO invoice_payments (invoice_id, paid_amount, currency_code, exchange_rate_on_payment, usd_equivalent_amount, payment_date, created_at)
			 VALUES ($1, 100, 'USD', 1.0, 100, NOW(), NOW())`, [newInvId]);
		const delPaid = await api('DELETE', `/invoices/${newInvId}`);
		check('delete with payments: HTTP status is 400', delPaid.status, 400);
		check('delete with payments: invoice still exists', (await pool.query('SELECT COUNT(*)::int AS c FROM invoices WHERE id = $1', [newInvId])).rows[0].c, 1);

		// ============ summary ============
		const failed = results.filter(r => !r.pass);
		console.log('\n════════════════════════ QA SUMMARY ════════════════════════');
		console.log(`Total checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}`);
		if (failed.length) {
			console.log('\nFAILED CHECKS:');
			failed.forEach(f => console.log(`  ❌ ${f.label}\n     expected: ${JSON.stringify(f.expected)}\n     got:      ${JSON.stringify(f.actual)}`));
		}
		process.exitCode = failed.length ? 1 : 0;
	} catch (err) {
		console.error('\n💥 QA run crashed:', err.message);
		process.exitCode = 1;
	} finally {
		await pool.end();
	}
})();
