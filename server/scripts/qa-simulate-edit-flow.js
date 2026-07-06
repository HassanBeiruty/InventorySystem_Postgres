/**
 * MANUAL QA — no database needed.
 *
 * In-memory model of the system where:
 *   - recalculate_stock_after_invoice / sp_recompute_positions are exact line-by-line
 *     ports of the SQL in server/sql/runInit.js
 *   - putInvoice / deleteInvoice / createInvoice are exact line-by-line transcriptions
 *     of the (newly modified) handlers in server/routes/api.js
 *   - BEGIN/COMMIT/ROLLBACK are modeled with full-database snapshots, so atomicity
 *     is actually exercised, not assumed.
 *
 * QA cases (production push checklist):
 *   1. Edit old buy 17.50 → 10.00: replay + daily_stock correct to today
 *   2. Delete oldest sell: replay + daily_stock correct to today
 *   3. Edit that ADDS a new product  → 400, database byte-identical (rollback)
 *   4. Edit with duplicate products  → 400, database byte-identical
 *   5. Edit with corrupted ledger (movement missing) → 409, database byte-identical
 *   6. Create with duplicate products → 400, nothing created
 *   7. Normal create still works after the change (regression)
 *   8. Delete invoice with payments still refused (regression)
 *   9. CRASH INJECTION: recalc throws mid-loop during edit → 500, database byte-identical
 *
 * Run:  node scripts/qa-simulate-edit-flow.js
 */

const TODAY = '2026-07-06';

// ═══════════════════════ in-memory database ═══════════════════════
let DB = {
	invoices: [],        // {id, invoice_type, total_amount, invoice_date, due_date}
	invoice_items: [],   // {id, invoice_id, product_id, quantity, unit_price, total_price, is_private_price, private_price_amount}
	stock_movements: [], // {id, product_id, invoice_id, invoice_date, before, change, after, unit_cost, avg_after}
	daily_stock: [],     // {product_id, date, qty, avg}
	invoice_payments: [],// {invoice_id, usd_equivalent_amount}
	seq: 1,
};
const nextId = () => DB.seq++;

// transaction = snapshot/restore of the WHOLE database
let txSnapshot = null;
const BEGIN = () => { txSnapshot = structuredClone(DB); };
const COMMIT = () => { txSnapshot = null; };
const ROLLBACK = () => { if (txSnapshot) { DB = txSnapshot; txSnapshot = null; } };

function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

// ═══════════ sp_recompute_positions (SQL port: gap detect + carry-forward) ═══════════
function spRecomputePositions(productId) {
	const productIds = productId != null ? [productId] : [...new Set(DB.daily_stock.map(r => r.product_id))];
	for (const pid of productIds) {
		const rows = DB.daily_stock.filter(r => r.product_id === pid).sort((a, b) => a.date < b.date ? -1 : 1);
		if (!rows.length) continue;
		// gaps between consecutive dates + end-of-data gap up to today; span = MIN(gap_start)..today
		let spanStart = null;
		for (let i = 0; i < rows.length - 1; i++) {
			if (addDays(rows[i].date, 1) < rows[i + 1].date) { spanStart = spanStart ?? rows[i].date; }
		}
		if (rows[rows.length - 1].date < TODAY && (spanStart === null || rows[rows.length - 1].date < spanStart)) {
			spanStart = spanStart ?? rows[rows.length - 1].date;
		}
		if (spanStart === null) continue;
		const existing = new Map(rows.filter(r => r.date >= spanStart).map(r => [r.date, r]));
		DB.daily_stock = DB.daily_stock.filter(r => !(r.product_id === pid && r.date >= spanStart));
		let last = existing.get(spanStart) ?? { qty: 0, avg: 0 };
		for (let d = spanStart; d <= TODAY; d = addDays(d, 1)) {
			if (existing.has(d)) last = existing.get(d);
			DB.daily_stock.push({ product_id: pid, date: d, qty: last.qty, avg: last.avg });
		}
	}
}

// ═══════════ recalculate_stock_after_invoice (SQL port) ═══════════
// Kept overridable so the crash-injection test can wrap it (like a DB fault mid-transaction).
let recalculateStockAfterInvoice = recalcImpl;
function recalcImpl(pInvoiceId, pProductId, action, pNewQty = null, pNewUnitCost = null) {
	// step 1: apply the action
	if (action === 'DELETE') {
		DB.stock_movements = DB.stock_movements.filter(m => !(m.product_id === pProductId && m.invoice_id === pInvoiceId));
	} else if (action === 'EDIT') {
		const rows = DB.stock_movements.filter(m => m.product_id === pProductId && m.invoice_id === pInvoiceId);
		if (!rows.length) throw new Error('No matching stock movement found for EDIT');
		rows.forEach(m => { m.change = pNewQty; m.unit_cost = pNewUnitCost; });
	}
	// step 2: invoice date + last correct state BEFORE this invoice
	const invoiceDate = DB.invoices.find(i => i.id === pInvoiceId)?.invoice_date?.slice(0, 10);
	const prior = DB.stock_movements.filter(m => m.product_id === pProductId && m.invoice_id < pInvoiceId)
		.sort((a, b) => b.invoice_id - a.invoice_id || b.id - a.id)[0];
	let qtyBefore = prior ? prior.after : 0;
	let avgBefore = prior ? prior.avg_after : 0;
	// step 3: replay all movements with invoice_id >= p (ORDER BY invoice_id, id)
	const replay = DB.stock_movements.filter(m => m.product_id === pProductId && m.invoice_id >= pInvoiceId)
		.sort((a, b) => a.invoice_id - b.invoice_id || a.id - b.id);
	for (const m of replay) {
		const qtyAfter = qtyBefore + m.change;
		let avgAfter;
		if (m.change > 0 && m.unit_cost !== null) {
			avgAfter = qtyAfter === 0 ? null : ((qtyBefore * avgBefore) + (m.change * m.unit_cost)) / qtyAfter; // NULLIF(qty_after,0)
		} else {
			avgAfter = avgBefore;
		}
		m.before = qtyBefore; m.after = qtyAfter; m.avg_after = avgAfter;
		qtyBefore = qtyAfter; avgBefore = avgAfter;
	}
	// step 4: rebuild daily_stock from the invoice's date onward (last movement per date)
	DB.daily_stock = DB.daily_stock.filter(r => !(r.product_id === pProductId && r.date >= invoiceDate));
	const byDate = new Map();
	for (const m of DB.stock_movements.filter(m => m.product_id === pProductId && m.invoice_date.slice(0, 10) >= invoiceDate)) {
		const d = m.invoice_date.slice(0, 10);
		const cur = byDate.get(d);
		if (!cur || m.invoice_id > cur.invoice_id || (m.invoice_id === cur.invoice_id && m.id > cur.id)) byDate.set(d, m);
	}
	for (const [d, m] of byDate) DB.daily_stock.push({ product_id: pProductId, date: d, qty: m.after, avg: m.avg_after });
	// step 5: fill gaps to today
	spRecomputePositions(pProductId);
}

// ═══════════ PUT /invoices/:id — transcription of the NEW handler ═══════════
function putInvoice(id, body) {
	try {
		if (isNaN(id) || id <= 0) return { status: 400, error: 'Invalid invoice ID' };
		const { invoice_type, total_amount, due_date, items } = body;
		if (!Array.isArray(items) || items.length === 0) return { status: 400, error: 'At least one item is required' };
		// duplicate-product rule
		const newProductIdList = items.map(item => parseInt(item.product_id));
		if (new Set(newProductIdList).size !== newProductIdList.length) {
			return { status: 400, error: 'The same product cannot be added more than once to an invoice' };
		}
		BEGIN();
		const oldInvoice = DB.invoices.find(i => i.id === id); // SELECT ... FOR UPDATE
		if (!oldInvoice) { ROLLBACK(); return { status: 404, error: 'Invoice not found' }; }
		const oldItems = DB.invoice_items.filter(it => it.invoice_id === id);
		// every edited product must already have a movement on this invoice
		const movementProductIds = new Set(DB.stock_movements.filter(m => m.invoice_id === id).map(m => m.product_id));
		const oldProductIds = new Set(oldItems.map(item => item.product_id));
		for (const productId of newProductIdList) {
			if (!movementProductIds.has(productId)) {
				ROLLBACK();
				if (oldProductIds.has(productId)) {
					return { status: 409, error: `Stock movement record is missing for product ${productId} on this invoice. The stock ledger is inconsistent - run "Recompute Positions"...` };
				}
				return { status: 400, error: `Product ${productId} is not part of this invoice. Adding new products while editing is not supported...` };
			}
		}
		// delete old items, update header, insert new items
		DB.invoice_items = DB.invoice_items.filter(it => it.invoice_id !== id);
		oldInvoice.invoice_type = invoice_type; oldInvoice.total_amount = total_amount; oldInvoice.due_date = due_date || null;
		for (const item of items) {
			DB.invoice_items.push({ id: nextId(), invoice_id: id, product_id: parseInt(item.product_id),
				quantity: item.quantity, unit_price: item.unit_price, total_price: item.total_price,
				is_private_price: !!item.is_private_price, private_price_amount: item.is_private_price ? item.private_price_amount : null });
		}
		// recalc: removed products first, then every product still on the invoice
		const newProductIds = new Set(newProductIdList);
		const removedProductIds = new Set(oldItems.map(item => item.product_id).filter(pid => !newProductIds.has(pid)));
		for (const productId of removedProductIds) {
			recalculateStockAfterInvoice(id, productId, 'DELETE', null, null);
		}
		for (const item of items) {
			const change = invoice_type === 'sell' ? -item.quantity : item.quantity;
			const unitCost = parseFloat(item.is_private_price ? item.private_price_amount : item.unit_price);
			recalculateStockAfterInvoice(id, parseInt(item.product_id), 'EDIT', change, unitCost);
		}
		COMMIT();
		return { status: 200, id: String(id) };
	} catch (err) {
		ROLLBACK();
		return { status: 500, error: err.message };
	}
}

// ═══════════ DELETE /invoices/:id — transcription of the existing handler ═══════════
function deleteInvoice(id) {
	try {
		BEGIN();
		if (!DB.invoices.find(i => i.id === id)) { ROLLBACK(); return { status: 404, error: 'Invoice not found' }; }
		const paymentCount = DB.invoice_payments.filter(p => p.invoice_id === id).length;
		if (paymentCount > 0) { ROLLBACK(); return { status: 400, error: 'Cannot delete invoice with existing payments...' }; }
		const affectedProducts = [...new Set(DB.invoice_items.filter(it => it.invoice_id === id).map(it => it.product_id))];
		for (const productId of affectedProducts) {
			recalculateStockAfterInvoice(id, productId, 'DELETE', null, null);
		}
		DB.invoice_items = DB.invoice_items.filter(it => it.invoice_id !== id);
		DB.invoice_payments = DB.invoice_payments.filter(p => p.invoice_id !== id);
		DB.invoices = DB.invoices.filter(i => i.id !== id);
		COMMIT();
		return { status: 200, id };
	} catch (err) {
		ROLLBACK();
		return { status: 500, error: err.message };
	}
}

// ═══════════ POST /invoices — transcription incl. the new duplicate guard ═══════════
function createInvoice(body) {
	try {
		BEGIN();
		const { invoice_type, total_amount, items } = body;
		const uniqueProductIds = new Set(items.map(item => parseInt(item.product_id)));
		if (uniqueProductIds.size !== items.length) {
			ROLLBACK();
			return { status: 400, error: 'The same product cannot be added more than once to an invoice' };
		}
		const invoiceId = nextId();
		DB.invoices.push({ id: invoiceId, invoice_type, total_amount, invoice_date: TODAY + ' 12:00:00', due_date: null });
		for (const item of items) {
			const productId = parseInt(item.product_id);
			// latest daily_stock with date <= today
			const stock = DB.daily_stock.filter(r => r.product_id === productId && r.date <= TODAY)
				.sort((a, b) => a.date < b.date ? 1 : -1)[0] || { qty: 0, avg: 0 };
			const qtyBefore = stock.qty, prevAvg = stock.avg;
			const change = invoice_type === 'sell' ? -item.quantity : item.quantity;
			const qtyAfter = qtyBefore + change;
			let newAvg = prevAvg || 0;
			if (invoice_type === 'buy') {
				const denom = qtyBefore + item.quantity;
				newAvg = denom > 0 ? ((prevAvg * qtyBefore) + (item.unit_price * item.quantity)) / denom : item.unit_price;
			}
			const unitCost = parseFloat(item.is_private_price ? item.private_price_amount : item.unit_price);
			DB.invoice_items.push({ id: nextId(), invoice_id: invoiceId, product_id: productId,
				quantity: item.quantity, unit_price: item.unit_price, total_price: item.total_price,
				is_private_price: !!item.is_private_price, private_price_amount: item.is_private_price ? item.private_price_amount : null });
			DB.stock_movements.push({ id: nextId(), product_id: productId, invoice_id: invoiceId,
				invoice_date: TODAY + ' 12:00:00', before: qtyBefore, change, after: qtyAfter, unit_cost: unitCost, avg_after: newAvg });
			const existing = DB.daily_stock.find(r => r.product_id === productId && r.date === TODAY);
			if (existing) { existing.qty = qtyAfter; existing.avg = newAvg; }
			else DB.daily_stock.push({ product_id: productId, date: TODAY, qty: qtyAfter, avg: newAvg });
		}
		COMMIT();
		return { status: 200, id: invoiceId };
	} catch (err) {
		ROLLBACK();
		return { status: 500, error: err.message };
	}
}

// ═══════════════════════ QA checks ═══════════════════════
const results = [];
function check(label, actual, expected) {
	const pass = JSON.stringify(actual) === JSON.stringify(expected);
	results.push({ label, pass, actual, expected });
	console.log(`  ${pass ? '✅' : '❌'} ${label}  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}
const dbFingerprint = () => JSON.stringify({ ...DB, seq: 0 }); // seq excluded: id counter may advance on failed attempts

function verifyMovements(stage, productId, expected) {
	const rows = DB.stock_movements.filter(m => m.product_id === productId).sort((a, b) => a.invoice_id - b.invoice_id || a.id - b.id);
	check(`${stage}: movement count`, rows.length, expected.length);
	rows.forEach((r, i) => { if (expected[i]) check(`${stage}: mv#${i + 1} [before,change,after,avg]`, [r.before, r.change, r.after, r.avg_after], expected[i]); });
	let breaks = 0;
	for (let i = 1; i < rows.length; i++) if (rows[i].before !== rows[i - 1].after) breaks++;
	check(`${stage}: ledger chain continuous`, breaks, 0);
}
function verifyDaily(stage, productId, segments, expectedAvg) {
	const rows = DB.daily_stock.filter(r => r.product_id === productId).sort((a, b) => a.date < b.date ? -1 : 1);
	const qtyFor = (d) => { let q = null; for (const s of segments) if (d >= s.from) q = s.qty; return q; };
	let expectedCount = 0;
	for (let d = segments[0].from; d <= TODAY; d = addDays(d, 1)) expectedCount++;
	check(`${stage}: daily rows dense ${segments[0].from} → ${TODAY}`, rows.length, expectedCount);
	let qtyErr = 0, avgErr = 0, dup = 0; const seen = new Set();
	for (const r of rows) {
		if (seen.has(r.date)) dup++; seen.add(r.date);
		if (r.qty !== qtyFor(r.date)) qtyErr++;
		if (r.avg !== expectedAvg) avgErr++;
	}
	check(`${stage}: no duplicate dates`, dup, 0);
	check(`${stage}: every date correct qty`, qtyErr, 0);
	check(`${stage}: every date avg=${expectedAvg}`, avgErr, 0);
	const t = rows[rows.length - 1];
	check(`${stage}: TODAY qty/avg`, [t?.qty, t?.avg], [segments[segments.length - 1].qty, expectedAvg]);
}

// seed one historical invoice exactly as the create endpoint wrote it back then
function seed({ type, productId, date, qty, unitPrice, before, avgBefore }) {
	const change = type === 'sell' ? -qty : qty;
	const after = before + change;
	let avgAfter = avgBefore;
	if (type === 'buy') { const denom = before + qty; avgAfter = denom > 0 ? ((avgBefore * before) + (unitPrice * qty)) / denom : unitPrice; }
	const invoiceId = nextId();
	DB.invoices.push({ id: invoiceId, invoice_type: type, total_amount: qty * unitPrice, invoice_date: date + ' 12:00:00', due_date: null });
	DB.invoice_items.push({ id: nextId(), invoice_id: invoiceId, product_id: productId, quantity: qty, unit_price: unitPrice, total_price: qty * unitPrice, is_private_price: false, private_price_amount: null });
	DB.stock_movements.push({ id: nextId(), product_id: productId, invoice_id: invoiceId, invoice_date: date + ' 12:00:00', before, change, after, unit_cost: unitPrice, avg_after: avgAfter });
	DB.daily_stock.push({ product_id: productId, date, qty: after, avg: avgAfter });
	return invoiceId;
}

// ═══════════════════════ RUN ═══════════════════════
const P = 1, P2 = 2; // product ids (products table itself is irrelevant to the flow)
DB.seq = 100;
const buyId = seed({ type: 'buy', productId: P, date: '2026-03-20', qty: 100, unitPrice: 17.5, before: 0, avgBefore: 0 });
const sell1 = seed({ type: 'sell', productId: P, date: '2026-03-25', qty: 10, unitPrice: 25, before: 100, avgBefore: 17.5 });
const sell2 = seed({ type: 'sell', productId: P, date: '2026-04-10', qty: 15, unitPrice: 25, before: 90, avgBefore: 17.5 });
const sell3 = seed({ type: 'sell', productId: P, date: '2026-05-05', qty: 5, unitPrice: 25, before: 75, avgBefore: 17.5 });
spRecomputePositions(null); // nightly jobs have been running since March
console.log(`Seeded: buy=${buyId} sells=${sell1},${sell2},${sell3}  today=${TODAY}`);

console.log('\n════ QA 1: PUT edit — fix buy price 17.50 → 10.00 ════');
const r1 = putInvoice(buyId, { invoice_type: 'buy', total_amount: 1000,
	items: [{ product_id: P, quantity: 100, unit_price: 10, total_price: 1000, is_private_price: false }] });
check('QA1: HTTP status', r1.status, 200);
verifyMovements('QA1', P, [[0, 100, 100, 10], [100, -10, 90, 10], [90, -15, 75, 10], [75, -5, 70, 10]]);
verifyDaily('QA1', P, [{ from: '2026-03-20', qty: 100 }, { from: '2026-03-25', qty: 90 }, { from: '2026-04-10', qty: 75 }, { from: '2026-05-05', qty: 70 }], 10);
check('QA1: invoice_items line updated to new price', DB.invoice_items.find(i => i.invoice_id === buyId)?.unit_price, 10);

console.log('\n════ QA 2: DELETE — remove the oldest sell (Mar-25) ════');
const r2 = deleteInvoice(sell1);
check('QA2: HTTP status', r2.status, 200);
verifyMovements('QA2', P, [[0, 100, 100, 10], [100, -15, 85, 10], [85, -5, 80, 10]]);
verifyDaily('QA2', P, [{ from: '2026-03-20', qty: 100 }, { from: '2026-04-10', qty: 85 }, { from: '2026-05-05', qty: 80 }], 10);
check('QA2: invoice removed', DB.invoices.some(i => i.id === sell1), false);
check('QA2: its items removed', DB.invoice_items.some(i => i.invoice_id === sell1), false);

console.log('\n════ QA 3: edit that ADDS a new product → 400 + rollback ════');
let fp = dbFingerprint();
const r3 = putInvoice(sell2, { invoice_type: 'sell', total_amount: 500, items: [
	{ product_id: P, quantity: 15, unit_price: 25, total_price: 375, is_private_price: false },
	{ product_id: P2, quantity: 5, unit_price: 25, total_price: 125, is_private_price: false }] });
check('QA3: HTTP status 400', r3.status, 400);
check('QA3: error says not supported', r3.error.includes('not supported'), true);
check('QA3: DATABASE UNCHANGED (atomic)', dbFingerprint() === fp, true);

console.log('\n════ QA 4: edit with duplicate product lines → 400 + rollback ════');
fp = dbFingerprint();
const r4 = putInvoice(sell2, { invoice_type: 'sell', total_amount: 750, items: [
	{ product_id: P, quantity: 15, unit_price: 25, total_price: 375, is_private_price: false },
	{ product_id: P, quantity: 15, unit_price: 25, total_price: 375, is_private_price: false }] });
check('QA4: HTTP status 400', r4.status, 400);
check('QA4: DATABASE UNCHANGED', dbFingerprint() === fp, true);

console.log('\n════ QA 5: corrupted ledger (movement missing) → 409 + rollback ════');
const savedIdx = DB.stock_movements.findIndex(m => m.invoice_id === sell3 && m.product_id === P);
const savedMv = DB.stock_movements.splice(savedIdx, 1)[0]; // simulate corruption
fp = dbFingerprint();
const r5 = putInvoice(sell3, { invoice_type: 'sell', total_amount: 125,
	items: [{ product_id: P, quantity: 5, unit_price: 25, total_price: 125, is_private_price: false }] });
check('QA5: HTTP status 409', r5.status, 409);
check('QA5: error says inconsistent', r5.error.includes('inconsistent'), true);
check('QA5: DATABASE UNCHANGED (items NOT replaced)', dbFingerprint() === fp, true);
DB.stock_movements.splice(savedIdx, 0, savedMv); // restore

console.log('\n════ QA 6: create with duplicate products → 400, nothing created ════');
const invCount = DB.invoices.length;
const r6 = createInvoice({ invoice_type: 'sell', total_amount: 50, items: [
	{ product_id: P, quantity: 1, unit_price: 25, total_price: 25, is_private_price: false },
	{ product_id: P, quantity: 1, unit_price: 25, total_price: 25, is_private_price: false }] });
check('QA6: HTTP status 400', r6.status, 400);
check('QA6: no invoice created', DB.invoices.length, invCount);

console.log('\n════ QA 7: normal create still works (regression) ════');
const r7 = createInvoice({ invoice_type: 'sell', total_amount: 250,
	items: [{ product_id: P, quantity: 10, unit_price: 25, total_price: 250, is_private_price: false }] });
check('QA7: HTTP status', r7.status, 200);
const newMv = DB.stock_movements.find(m => m.invoice_id === r7.id);
check('QA7: movement written (80 → 70, avg 10)', [newMv?.before, newMv?.after, newMv?.avg_after], [80, 70, 10]);
check('QA7: today daily_stock updated', (() => { const t = DB.daily_stock.find(r => r.product_id === P && r.date === TODAY); return [t?.qty, t?.avg]; })(), [70, 10]);

console.log('\n════ QA 8: delete invoice with payments still refused (regression) ════');
DB.invoice_payments.push({ invoice_id: r7.id, usd_equivalent_amount: 100 });
fp = dbFingerprint();
const r8 = deleteInvoice(r7.id);
check('QA8: HTTP status 400', r8.status, 400);
check('QA8: DATABASE UNCHANGED', dbFingerprint() === fp, true);
DB.invoice_payments = [];

console.log('\n════ QA 9: CRASH INJECTION — recalc throws mid-edit → 500 + rollback ════');
// buy invoice + a second product on it so the edit runs recalc twice; the 2nd call explodes
const buy2 = (() => {
	const id = nextId();
	DB.invoices.push({ id, invoice_type: 'buy', total_amount: 300, invoice_date: TODAY + ' 13:00:00', due_date: null });
	for (const [pid, qty, price] of [[P, 10, 10], [P2, 10, 20]]) {
		DB.invoice_items.push({ id: nextId(), invoice_id: id, product_id: pid, quantity: qty, unit_price: price, total_price: qty * price, is_private_price: false, private_price_amount: null });
		const stock = DB.daily_stock.filter(r => r.product_id === pid && r.date <= TODAY).sort((a, b) => a.date < b.date ? 1 : -1)[0] || { qty: 0, avg: 0 };
		const denom = stock.qty + qty;
		const newAvg = denom > 0 ? ((stock.avg * stock.qty) + (price * qty)) / denom : price;
		DB.stock_movements.push({ id: nextId(), product_id: pid, invoice_id: id, invoice_date: TODAY + ' 13:00:00', before: stock.qty, change: qty, after: stock.qty + qty, unit_cost: price, avg_after: newAvg });
		const ex = DB.daily_stock.find(r => r.product_id === pid && r.date === TODAY);
		if (ex) { ex.qty = stock.qty + qty; ex.avg = newAvg; } else DB.daily_stock.push({ product_id: pid, date: TODAY, qty: stock.qty + qty, avg: newAvg });
	}
	return id;
})();
fp = dbFingerprint();
let callCount = 0;
recalculateStockAfterInvoice = (...args) => { // fault: DB error on the SECOND product's recalc
	if (++callCount === 2) throw new Error('simulated database failure during recalculation');
	return recalcImpl(...args);
};
const r9 = putInvoice(buy2, { invoice_type: 'buy', total_amount: 350, items: [
	{ product_id: P, quantity: 10, unit_price: 15, total_price: 150, is_private_price: false },
	{ product_id: P2, quantity: 10, unit_price: 20, total_price: 200, is_private_price: false }] });
recalculateStockAfterInvoice = recalcImpl; // remove fault
check('QA9: HTTP status 500', r9.status, 500);
check('QA9: first product recalc DID run before the crash', callCount, 2);
check('QA9: DATABASE UNCHANGED — items, movements, daily_stock all rolled back', dbFingerprint() === fp, true);

// ═══════════════════════ summary ═══════════════════════
const failed = results.filter(r => !r.pass);
console.log('\n════════════════════════ QA SUMMARY ════════════════════════');
console.log(`Total checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}`);
if (failed.length) {
	console.log('\nFAILED:');
	failed.forEach(f => console.log(`  ❌ ${f.label}\n     expected: ${JSON.stringify(f.expected)}\n     got:      ${JSON.stringify(f.actual)}`));
}
process.exitCode = failed.length ? 1 : 0;
