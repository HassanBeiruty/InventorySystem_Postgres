/**
 * PURE SIMULATION — no database needed.
 *
 * This ports, line by line, the exact logic of:
 *   1. the invoice-creation WAC math (server/routes/api.js POST /invoices)
 *   2. recalculate_stock_after_invoice(...)  (server/sql/runInit.js)
 *   3. the daily_stock rebuild + sp_recompute_positions gap fill
 *
 * Scenario:
 *   2026-03-20  BUY  100 @ $17.50   -> 100 on hand, avg 17.50
 *   2026-03-25  SELL  10 @ $25      ->  90
 *   2026-04-10  SELL  15 @ $25      ->  75
 *   2026-05-05  SELL   5 @ $25      ->  70   (today = 2026-07-04)
 *
 * TEST A: edit the buy: unit cost 17.50 → 10.00, replay everything to today.
 * TEST B: then delete the FIRST sell (Mar 25), replay again. Final stock must be 80.
 *
 * Run:  node scripts/simulate-recalc-scenario.js
 */

const TODAY = '2026-07-04';

// ---------------- in-memory "tables" ----------------
let movements = [];   // {id, invoice_id, invoice_date, before, change, after, unit_cost, avg_after}
let daily = new Map(); // 'YYYY-MM-DD' -> {qty, avg}
let nextMovementId = 1;

function addDays(dateStr, n) {
	const d = new Date(dateStr + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

// ---------------- 1. invoice creation (mirrors POST /invoices JS) ----------------
function createInvoice({ invoiceId, type, date, qty, unitPrice }) {
	// latest daily_stock with date <= today  (creation reads the snapshot, not the ledger)
	const known = [...daily.keys()].sort();
	const latest = known.length ? daily.get(known[known.length - 1]) : { qty: 0, avg: 0 };
	const qtyBefore = latest.qty, prevAvg = latest.avg;

	const change = type === 'sell' ? -qty : qty;
	const qtyAfter = qtyBefore + change;

	let newAvg = prevAvg || 0;
	if (type === 'buy') {
		const denom = qtyBefore + qty;
		// NOTE: the JS creation path falls back to buyCost when denom <= 0
		newAvg = denom > 0 ? ((prevAvg * qtyBefore) + (unitPrice * qty)) / denom : unitPrice;
	}

	movements.push({ id: nextMovementId++, invoice_id: invoiceId, invoice_date: date,
		before: qtyBefore, change, after: qtyAfter, unit_cost: unitPrice, avg_after: newAvg });
	daily.set(date, { qty: qtyAfter, avg: newAvg });     // upsert (product_id, date)
}

// ---------------- 3. sp_recompute_positions (gap detection + carry-forward fill) ----------------
function recomputePositions() {
	const dates = [...daily.keys()].sort();
	if (!dates.length) return;
	// gaps = holes between consecutive dates + end-of-data gap up to TODAY
	let spanStart = null;
	for (let i = 0; i < dates.length - 1; i++) {
		if (addDays(dates[i], 1) < dates[i + 1] || addDays(dates[i], 1) === dates[i + 1] && false) {}
		if ((new Date(dates[i + 1]) - new Date(dates[i])) / 86400000 > 1) { spanStart = spanStart ?? dates[i]; break; }
	}
	if (dates[dates.length - 1] < TODAY) spanStart = spanStart ?? dates[dates.length - 1];
	// find the EARLIEST gap start (SQL takes MIN over all gaps)
	for (let i = 0; i < dates.length - 1; i++) {
		if ((new Date(dates[i + 1]) - new Date(dates[i])) / 86400000 > 1) { spanStart = spanStart === null ? dates[i] : (dates[i] < spanStart ? dates[i] : spanStart); }
	}
	if (spanStart === null) return; // no gaps

	// carry-forward fill from spanStart to TODAY, keeping existing rows
	let last = daily.get(spanStart) ?? { qty: 0, avg: 0 };
	for (let d = spanStart; d <= TODAY; d = addDays(d, 1)) {
		if (daily.has(d)) last = daily.get(d);
		else daily.set(d, { ...last });
	}
}

// ---------------- 2. recalculate_stock_after_invoice (exact SQL port) ----------------
function recalculateStockAfterInvoice(pInvoiceId, action, pNewQty = null, pNewUnitCost = null, invoiceDate) {
	// --- step 1: apply the action
	if (action === 'DELETE') {
		movements = movements.filter(m => m.invoice_id !== pInvoiceId);
	} else if (action === 'EDIT') {
		const rows = movements.filter(m => m.invoice_id === pInvoiceId);
		if (!rows.length) throw new Error('No matching stock movement found for EDIT');
		rows.forEach(m => { m.change = pNewQty; m.unit_cost = pNewUnitCost; });
	}

	// --- step 2: last correct state BEFORE this invoice (ORDER BY invoice_id DESC, id DESC)
	const prior = movements.filter(m => m.invoice_id < pInvoiceId)
		.sort((a, b) => b.invoice_id - a.invoice_id || b.id - a.id)[0];
	let qtyBefore = prior ? prior.after : 0;
	let avgBefore = prior ? prior.avg_after : 0;

	// --- step 3: replay all movements with invoice_id >= p (ORDER BY invoice_id, id)
	const replay = movements.filter(m => m.invoice_id >= pInvoiceId)
		.sort((a, b) => a.invoice_id - b.invoice_id || a.id - b.id);
	for (const m of replay) {
		const qtyAfter = qtyBefore + m.change;
		let avgAfter;
		if (m.change > 0 && m.unit_cost !== null) {
			// SQL: (before*avgBefore + change*cost) / NULLIF(qtyAfter, 0)
			avgAfter = qtyAfter === 0 ? null : ((qtyBefore * avgBefore) + (m.change * m.unit_cost)) / qtyAfter;
		} else {
			avgAfter = avgBefore;
		}
		m.before = qtyBefore; m.after = qtyAfter; m.avg_after = avgAfter;
		qtyBefore = qtyAfter; avgBefore = avgAfter;
	}

	// --- step 4: rebuild daily_stock from the invoice's date onward
	for (const d of [...daily.keys()]) if (d >= invoiceDate) daily.delete(d);
	// last movement per date (ORDER BY invoice_date DESC, invoice_id DESC, id DESC), date >= invoiceDate
	const byDate = new Map();
	for (const m of movements.filter(m => m.invoice_date >= invoiceDate)) {
		const cur = byDate.get(m.invoice_date);
		if (!cur || m.invoice_id > cur.invoice_id || (m.invoice_id === cur.invoice_id && m.id > cur.id)) byDate.set(m.invoice_date, m);
	}
	for (const [d, m] of byDate) daily.set(d, { qty: m.after, avg: m.avg_after });

	// --- step 5: fill gaps to today
	recomputePositions();
}

// ---------------- printing + checks ----------------
let failed = 0, total = 0;
function check(label, actual, expected) {
	total++;
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failed++;
	console.log(`  ${ok ? '✅' : '❌'} ${label}  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function printMovements(title) {
	console.log(`\n  ${title} — stock_movements ledger:`);
	console.log('  ┌──────────┬────────────┬────────┬────────┬───────┬───────────┬───────────┐');
	console.log('  │ invoice  │ date       │ before │ change │ after │ unit_cost │ avg_after │');
	console.log('  ├──────────┼────────────┼────────┼────────┼───────┼───────────┼───────────┤');
	for (const m of movements.sort((a, b) => a.invoice_id - b.invoice_id || a.id - b.id)) {
		console.log(`  │ ${String(m.invoice_id).padEnd(8)} │ ${m.invoice_date} │ ${String(m.before).padStart(6)} │ ${String(m.change).padStart(6)} │ ${String(m.after).padStart(5)} │ ${String(m.unit_cost).padStart(9)} │ ${String(m.avg_after).padStart(9)} │`);
	}
	console.log('  └──────────┴────────────┴────────┴────────┴───────┴───────────┴───────────┘');
}

function printDailySegments(title) {
	const dates = [...daily.keys()].sort();
	const segs = [];
	for (const d of dates) {
		const { qty, avg } = daily.get(d);
		const last = segs[segs.length - 1];
		if (last && last.qty === qty && last.avg === avg && addDays(last.to, 1) === d) last.to = d;
		else segs.push({ from: d, to: d, qty, avg });
	}
	console.log(`\n  ${title} — daily_stock (${dates.length} rows, shown as ranges):`);
	segs.forEach(s => console.log(`     ${s.from} → ${s.to}   qty=${s.qty}  avg=${s.avg}`));
	return { dates, segs };
}

function verifyDaily(stage, expectedSegs, expectedAvg) {
	const { dates } = printDailySegments(stage);
	// dense series check
	const first = expectedSegs[0].from;
	let expectedCount = 0;
	for (let d = first; d <= TODAY; d = addDays(d, 1)) expectedCount++;
	check(`${stage}: daily rows are dense ${first} → ${TODAY}`, dates.length, expectedCount);

	const qtyFor = (d) => { let q = null; for (const s of expectedSegs) if (d >= s.from) q = s.qty; return q; };
	let qtyErr = 0, avgErr = 0;
	for (const d of dates) {
		const row = daily.get(d);
		if (row.qty !== qtyFor(d)) qtyErr++;
		if (row.avg !== expectedAvg) avgErr++;
	}
	check(`${stage}: every date has correct qty`, qtyErr, 0);
	check(`${stage}: every date has avg=${expectedAvg}`, avgErr, 0);
	const todayRow = daily.get(TODAY);
	check(`${stage}: TODAY qty`, todayRow?.qty, expectedSegs[expectedSegs.length - 1].qty);
	check(`${stage}: TODAY avg`, todayRow?.avg, expectedAvg);
}

function verifyChain(stage) {
	const sorted = movements.sort((a, b) => a.invoice_id - b.invoice_id || a.id - b.id);
	let breaks = 0;
	for (let i = 1; i < sorted.length; i++) if (sorted[i].before !== sorted[i - 1].after) breaks++;
	check(`${stage}: ledger chain continuous (afterₙ = beforeₙ₊₁)`, breaks, 0);
}

// ==================== RUN THE SCENARIO ====================
console.log('════════════════ SEED: the original history ════════════════');
createInvoice({ invoiceId: 501, type: 'buy',  date: '2026-03-20', qty: 100, unitPrice: 17.5 });
createInvoice({ invoiceId: 502, type: 'sell', date: '2026-03-25', qty: 10,  unitPrice: 25 });
createInvoice({ invoiceId: 503, type: 'sell', date: '2026-04-10', qty: 15,  unitPrice: 25 });
createInvoice({ invoiceId: 504, type: 'sell', date: '2026-05-05', qty: 5,   unitPrice: 25 });
recomputePositions(); // nightly jobs have been filling every date since March

printMovements('BASELINE');
verifyChain('baseline');
verifyDaily('BASELINE', [
	{ from: '2026-03-20', qty: 100 },
	{ from: '2026-03-25', qty: 90 },
	{ from: '2026-04-10', qty: 75 },
	{ from: '2026-05-05', qty: 70 },
], 17.5);

console.log('\n════════════ TEST A: edit Mar-20 BUY  17.50 → 10.00 ════════════');
console.log('  (app calls: recalculate_stock_after_invoice(501, product, \'EDIT\', +100, 10))');
recalculateStockAfterInvoice(501, 'EDIT', 100, 10, '2026-03-20');

printMovements('AFTER EDIT');
verifyChain('after EDIT');
check('after EDIT: buy avg_after re-averaged to', movements.find(m => m.invoice_id === 501).avg_after, 10);
check('after EDIT: Mar-25 sell keeps qty chain', movements.find(m => m.invoice_id === 502).after, 90);
check('after EDIT: Apr-10 sell avg follows new cost', movements.find(m => m.invoice_id === 503).avg_after, 10);
check('after EDIT: final movement qty', movements.find(m => m.invoice_id === 504).after, 70);
verifyDaily('AFTER EDIT', [
	{ from: '2026-03-20', qty: 100 },
	{ from: '2026-03-25', qty: 90 },
	{ from: '2026-04-10', qty: 75 },
	{ from: '2026-05-05', qty: 70 },
], 10);

console.log('\n════════════ TEST B: delete the FIRST sell (Mar-25, 10 units) ════════════');
console.log('  (app calls: recalculate_stock_after_invoice(502, product, \'DELETE\'), then deletes items+invoice)');
recalculateStockAfterInvoice(502, 'DELETE', null, null, '2026-03-25');

printMovements('AFTER DELETE');
verifyChain('after DELETE');
check('after DELETE: movement count', movements.length, 3);
check('after DELETE: Apr-10 sell now starts from 100', movements.find(m => m.invoice_id === 503).before, 100);
check('after DELETE: Apr-10 sell after', movements.find(m => m.invoice_id === 503).after, 85);
check('after DELETE: May-05 sell after (final stock)', movements.find(m => m.invoice_id === 504).after, 80);
check('after DELETE: avg cost still 10 everywhere', movements.every(m => m.avg_after === 10), true);
verifyDaily('AFTER DELETE', [
	{ from: '2026-03-20', qty: 100 },   // Mar-25 .. Apr-09 must now show 100 (sell removed)
	{ from: '2026-04-10', qty: 85 },
	{ from: '2026-05-05', qty: 80 },
], 10);

console.log('\n════════════════════════ SUMMARY ════════════════════════');
console.log(`Total checks: ${total}   Passed: ${total - failed}   Failed: ${failed}`);
process.exitCode = failed ? 1 : 0;
