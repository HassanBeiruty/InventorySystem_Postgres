/**
 * Recalculation scenario test (edit + delete of an old invoice).
 *
 * Scenario (all inside ONE transaction, ROLLED BACK at the end — the real data
 * in the database is never modified):
 *
 *   2026-03-20  BUY  100 units @ $17.50   -> stock 100, avg 17.50
 *   2026-03-25  SELL  10 units @ $25.00   -> stock  90, avg 17.50
 *   2026-04-10  SELL  15 units @ $25.00   -> stock  75, avg 17.50
 *   2026-05-05  SELL   5 units @ $25.00   -> stock  70, avg 17.50
 *
 * TEST A: the buy price was wrong — edit the March 20 buy from $17.50 to $10.00
 *         and verify every later movement and every daily_stock row up to today.
 *
 * TEST B: delete the FIRST (oldest) sell (March 25, 10 units) and verify the
 *         whole chain and daily_stock again (final stock must become 80).
 *
 * Run from the server folder:  node scripts/test-recalc-scenario.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool } = require('../db');

// ---------- tiny assertion helper ----------
const results = [];
function check(label, actual, expected) {
	const a = typeof actual === 'number' ? Number(actual.toFixed(4)) : actual;
	const e = typeof expected === 'number' ? Number(expected.toFixed(4)) : expected;
	const pass = a === e;
	results.push({ label, pass, actual: a, expected: e });
	console.log(`  ${pass ? '✅' : '❌'} ${label}  (expected ${e}, got ${a})`);
	return pass;
}

function num(v) { return v === null || v === undefined ? null : parseFloat(String(v)); }

// Build the expected daily series between two dates from qty segments and
// compare it to what daily_stock actually contains.
async function verifyDailySeries(client, productId, stageName, segments, expectedAvg, todayStr) {
	const res = await client.query(
		`SELECT to_char(date, 'YYYY-MM-DD') AS d, available_qty, avg_cost
		 FROM daily_stock WHERE product_id = $1 ORDER BY date ASC`,
		[productId]
	);
	const rows = res.rows;

	// expected qty for a date = qty of the last segment whose start <= date
	const qtyFor = (d) => {
		let q = null;
		for (const seg of segments) if (d >= seg.from) q = seg.qty;
		return q;
	};

	// dense series: first segment start .. today, one row per day
	const first = segments[0].from;
	const expectedDates = [];
	for (let dt = new Date(first + 'T00:00:00Z'); ; dt.setUTCDate(dt.getUTCDate() + 1)) {
		const d = dt.toISOString().slice(0, 10);
		if (d > todayStr) break;
		expectedDates.push(d);
	}

	check(`${stageName}: daily_stock row count (dense ${first} → ${todayStr})`, rows.length, expectedDates.length);

	let qtyErrors = 0, avgErrors = 0, dateErrors = 0;
	for (let i = 0; i < Math.min(rows.length, expectedDates.length); i++) {
		if (rows[i].d !== expectedDates[i]) dateErrors++;
		if (num(rows[i].available_qty) !== qtyFor(rows[i].d)) qtyErrors++;
		if (num(rows[i].avg_cost) !== expectedAvg) avgErrors++;
	}
	check(`${stageName}: no missing/duplicate dates`, dateErrors, 0);
	check(`${stageName}: every date has the correct quantity`, qtyErrors, 0);
	check(`${stageName}: every date has avg_cost = ${expectedAvg}`, avgErrors, 0);

	// print a compact segment view of what the DB actually holds
	let view = [];
	for (const r of rows) {
		const last = view[view.length - 1];
		if (last && num(r.available_qty) === last.qty && num(r.avg_cost) === last.avg) last.to = r.d;
		else view.push({ from: r.d, to: r.d, qty: num(r.available_qty), avg: num(r.avg_cost) });
	}
	console.log(`  daily_stock as stored:`);
	view.forEach(s => console.log(`     ${s.from} → ${s.to}   qty=${s.qty}  avg=${s.avg}`));

	// spot-check today explicitly
	const today = rows[rows.length - 1];
	check(`${stageName}: TODAY (${todayStr}) quantity`, num(today?.available_qty), segments[segments.length - 1].qty);
	check(`${stageName}: TODAY (${todayStr}) avg_cost`, num(today?.avg_cost), expectedAvg);
}

async function verifyMovements(client, productId, stageName, expected) {
	const res = await client.query(
		`SELECT invoice_id, quantity_before, quantity_change, quantity_after, unit_cost, avg_cost_after
		 FROM stock_movements WHERE product_id = $1 ORDER BY invoice_id ASC, id ASC`,
		[productId]
	);
	const rows = res.rows;
	check(`${stageName}: movement count`, rows.length, expected.length);

	console.log(`  stock_movements as stored:`);
	rows.forEach(r => console.log(
		`     inv=${r.invoice_id}  before=${r.quantity_before}  change=${r.quantity_change}  after=${r.quantity_after}  unit_cost=${num(r.unit_cost)}  avg_after=${num(r.avg_cost_after)}`
	));

	for (let i = 0; i < Math.min(rows.length, expected.length); i++) {
		const [b, c, a, avg] = expected[i];
		check(`${stageName}: movement #${i + 1} quantity_before`, num(rows[i].quantity_before), b);
		check(`${stageName}: movement #${i + 1} quantity_change`, num(rows[i].quantity_change), c);
		check(`${stageName}: movement #${i + 1} quantity_after`, num(rows[i].quantity_after), a);
		check(`${stageName}: movement #${i + 1} avg_cost_after`, num(rows[i].avg_cost_after), avg);
	}

	// ledger chain invariant: row N after == row N+1 before
	let chainBreaks = 0;
	for (let i = 1; i < rows.length; i++) {
		if (num(rows[i].quantity_before) !== num(rows[i - 1].quantity_after)) chainBreaks++;
	}
	check(`${stageName}: ledger chain is continuous (afterₙ = beforeₙ₊₁)`, chainBreaks, 0);
}

// ---------- seeding helpers (mimic exactly what the create-invoice API writes) ----------
async function seedInvoice(client, { type, productId, ts, qty, unitPrice, before, avgBefore }) {
	const change = type === 'sell' ? -qty : qty;
	const after = before + change;
	let avgAfter = avgBefore;
	if (type === 'buy') {
		const denom = before + qty;
		avgAfter = denom > 0 ? ((avgBefore * before) + (unitPrice * qty)) / denom : unitPrice;
	}
	const inv = await client.query(
		`INSERT INTO invoices (invoice_type, customer_id, supplier_id, total_amount, invoice_date, created_at)
		 VALUES ($1, NULL, NULL, $2, $3::timestamp, $3::timestamp) RETURNING id`,
		[type, qty * unitPrice, ts]
	);
	const invoiceId = inv.rows[0].id;
	await client.query(
		`INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price, total_price, price_type, is_private_price)
		 VALUES ($1, $2, $3, $4, $5, 'retail', FALSE)`,
		[invoiceId, productId, qty, unitPrice, qty * unitPrice]
	);
	await client.query(
		`INSERT INTO stock_movements (product_id, invoice_id, invoice_date, quantity_before, quantity_change, quantity_after, unit_cost, avg_cost_after, created_at)
		 VALUES ($1, $2, $3::timestamp, $4, $5, $6, $7, $8, $3::timestamp)`,
		[productId, invoiceId, ts, before, change, after, unitPrice, avgAfter]
	);
	await client.query(
		`INSERT INTO daily_stock (product_id, available_qty, avg_cost, date, created_at, updated_at)
		 VALUES ($1, $2, $3, $4::date, $5::timestamp, $5::timestamp)
		 ON CONFLICT (product_id, date) DO UPDATE SET available_qty = EXCLUDED.available_qty, avg_cost = EXCLUDED.avg_cost, updated_at = EXCLUDED.updated_at`,
		[productId, after, avgAfter, ts.slice(0, 10), ts]
	);
	return { invoiceId, after, avgAfter };
}

// ---------- main ----------
(async () => {
	const pool = getPool();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		console.log('\n🔒 Transaction started — everything below is ROLLED BACK at the end.\n');

		const todayStr = (await client.query(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d`)).rows[0].d;
		console.log(`DB CURRENT_DATE (Asia/Beirut): ${todayStr}`);

		// ----- seed the scenario -----
		const prod = await client.query(
			`INSERT INTO products (name, created_at) VALUES ('TEST RECALC PRODUCT (rollback)', NOW()) RETURNING id`
		);
		const productId = prod.rows[0].id;
		console.log(`Seeded product id=${productId}`);

		const buy = await seedInvoice(client, { type: 'buy', productId, ts: '2026-03-20 10:00:00', qty: 100, unitPrice: 17.5, before: 0, avgBefore: 0 });
		const sell1 = await seedInvoice(client, { type: 'sell', productId, ts: '2026-03-25 11:00:00', qty: 10, unitPrice: 25, before: 100, avgBefore: 17.5 });
		const sell2 = await seedInvoice(client, { type: 'sell', productId, ts: '2026-04-10 12:00:00', qty: 15, unitPrice: 25, before: 90, avgBefore: 17.5 });
		const sell3 = await seedInvoice(client, { type: 'sell', productId, ts: '2026-05-05 13:00:00', qty: 5, unitPrice: 25, before: 75, avgBefore: 17.5 });
		console.log(`Seeded invoices: buy=${buy.invoiceId}, sells=${sell1.invoiceId}, ${sell2.invoiceId}, ${sell3.invoiceId}`);

		// simulate the nightly jobs having filled every date since March
		await client.query('SELECT sp_recompute_positions($1)', [productId]);

		console.log('\n================ BASELINE (before any fix) ================');
		await verifyMovements(client, productId, 'baseline', [
			[0, 100, 100, 17.5],
			[100, -10, 90, 17.5],
			[90, -15, 75, 17.5],
			[75, -5, 70, 17.5],
		]);
		await verifyDailySeries(client, productId, 'baseline', [
			{ from: '2026-03-20', qty: 100 },
			{ from: '2026-03-25', qty: 90 },
			{ from: '2026-04-10', qty: 75 },
			{ from: '2026-05-05', qty: 70 },
		], 17.5, todayStr);

		// ----- TEST A: edit the March 20 BUY from $17.50 to $10.00 -----
		// (exactly what PUT /invoices/:id does for this line)
		console.log('\n================ TEST A: edit buy 17.50 → 10.00 ================');
		await client.query(
			`UPDATE invoice_items SET unit_price = 10, total_price = 1000 WHERE invoice_id = $1 AND product_id = $2`,
			[buy.invoiceId, productId]
		);
		await client.query(
			`SELECT recalculate_stock_after_invoice($1, $2, 'EDIT', $3, $4)`,
			[buy.invoiceId, productId, 100, 10]
		);

		await verifyMovements(client, productId, 'after EDIT', [
			[0, 100, 100, 10],   // buy re-averaged: (0*0 + 100*10)/100 = 10
			[100, -10, 90, 10],  // sells keep the (new) running average
			[90, -15, 75, 10],
			[75, -5, 70, 10],
		]);
		await verifyDailySeries(client, productId, 'after EDIT', [
			{ from: '2026-03-20', qty: 100 },
			{ from: '2026-03-25', qty: 90 },
			{ from: '2026-04-10', qty: 75 },
			{ from: '2026-05-05', qty: 70 },
		], 10, todayStr);

		// ----- TEST B: delete the FIRST sell (March 25, 10 units) -----
		// (exactly what DELETE /invoices/:id does: SP first, then items, then invoice)
		console.log('\n================ TEST B: delete the oldest sell (Mar 25) ================');
		await client.query(
			`SELECT recalculate_stock_after_invoice($1, $2, 'DELETE', NULL, NULL)`,
			[sell1.invoiceId, productId]
		);
		await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [sell1.invoiceId]);
		await client.query('DELETE FROM invoices WHERE id = $1', [sell1.invoiceId]);

		await verifyMovements(client, productId, 'after DELETE', [
			[0, 100, 100, 10],
			[100, -15, 85, 10],  // Apr 10 sell now starts from 100, not 90
			[85, -5, 80, 10],    // May 5 sell → final stock 80
		]);
		await verifyDailySeries(client, productId, 'after DELETE', [
			{ from: '2026-03-20', qty: 100 },  // Mar 25 must now show 100 (sell removed)
			{ from: '2026-04-10', qty: 85 },
			{ from: '2026-05-05', qty: 80 },
		], 10, todayStr);

		// ----- summary -----
		const failed = results.filter(r => !r.pass);
		console.log('\n============================ SUMMARY ============================');
		console.log(`Total checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}`);
		if (failed.length) {
			console.log('\nFailed checks:');
			failed.forEach(f => console.log(`  ❌ ${f.label} — expected ${f.expected}, got ${f.actual}`));
		}

		await client.query('ROLLBACK');
		console.log('\n🔓 ROLLBACK done — no data was persisted.');
		process.exitCode = failed.length ? 1 : 0;
	} catch (err) {
		try { await client.query('ROLLBACK'); console.log('🔓 ROLLBACK done after error.'); } catch (e) {}
		console.error('\n💥 Test crashed:', err.message);
		process.exitCode = 1;
	} finally {
		client.release();
		await pool.end();
	}
})();
