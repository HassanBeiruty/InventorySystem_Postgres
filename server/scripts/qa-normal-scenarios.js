/**
 * MANUAL QA #2 — 25 NORMAL business scenarios (no database needed).
 *
 * Same faithful model as qa-simulate-edit-flow.js:
 *   - recalculate_stock_after_invoice / sp_recompute_positions: line-by-line SQL ports
 *   - create/edit/delete invoice + record payment: transcriptions of the api.js handlers
 *   - get_net_profit: port of the SQL report function
 *
 * Run:  node scripts/qa-normal-scenarios.js
 */

const TODAY = '2026-07-06';

// ═══════════════════ in-memory database ═══════════════════
let DB;
function resetDB() {
	DB = { invoices: [], invoice_items: [], stock_movements: [], daily_stock: [], invoice_payments: [], seq: 100 };
}
const nextId = () => DB.seq++;

let txSnapshot = null;
const BEGIN = () => { txSnapshot = structuredClone(DB); };
const COMMIT = () => { txSnapshot = null; };
const ROLLBACK = () => { if (txSnapshot) { DB = txSnapshot; txSnapshot = null; } };

function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

// ═══════════ sp_recompute_positions (SQL port) ═══════════
function spRecomputePositions(productId) {
	const productIds = productId != null ? [productId] : [...new Set(DB.daily_stock.map(r => r.product_id))];
	for (const pid of productIds) {
		const rows = DB.daily_stock.filter(r => r.product_id === pid).sort((a, b) => a.date < b.date ? -1 : 1);
		if (!rows.length) continue;
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
function recalculateStockAfterInvoice(pInvoiceId, pProductId, action, pNewQty = null, pNewUnitCost = null) {
	if (action === 'DELETE') {
		DB.stock_movements = DB.stock_movements.filter(m => !(m.product_id === pProductId && m.invoice_id === pInvoiceId));
	} else if (action === 'EDIT') {
		const rows = DB.stock_movements.filter(m => m.product_id === pProductId && m.invoice_id === pInvoiceId);
		if (!rows.length) throw new Error('No matching stock movement found for EDIT');
		rows.forEach(m => { m.change = pNewQty; m.unit_cost = pNewUnitCost; });
	}
	const invoiceDate = DB.invoices.find(i => i.id === pInvoiceId)?.invoice_date?.slice(0, 10);
	const prior = DB.stock_movements.filter(m => m.product_id === pProductId && m.invoice_id < pInvoiceId)
		.sort((a, b) => b.invoice_id - a.invoice_id || b.id - a.id)[0];
	let qtyBefore = prior ? prior.after : 0;
	let avgBefore = prior ? prior.avg_after : 0;
	const replay = DB.stock_movements.filter(m => m.product_id === pProductId && m.invoice_id >= pInvoiceId)
		.sort((a, b) => a.invoice_id - b.invoice_id || a.id - b.id);
	for (const m of replay) {
		const qtyAfter = qtyBefore + m.change;
		let avgAfter;
		if (m.change > 0 && m.unit_cost !== null) {
			avgAfter = qtyAfter === 0 ? null : ((qtyBefore * avgBefore) + (m.change * m.unit_cost)) / qtyAfter;
		} else {
			avgAfter = avgBefore;
		}
		m.before = qtyBefore; m.after = qtyAfter; m.avg_after = avgAfter;
		qtyBefore = qtyAfter; avgBefore = avgAfter;
	}
	DB.daily_stock = DB.daily_stock.filter(r => !(r.product_id === pProductId && r.date >= invoiceDate));
	const byDate = new Map();
	for (const m of DB.stock_movements.filter(m => m.product_id === pProductId && m.invoice_date.slice(0, 10) >= invoiceDate)) {
		const d = m.invoice_date.slice(0, 10);
		const cur = byDate.get(d);
		if (!cur || m.invoice_id > cur.invoice_id || (m.invoice_id === cur.invoice_id && m.id > cur.id)) byDate.set(d, m);
	}
	for (const [d, m] of byDate) DB.daily_stock.push({ product_id: pProductId, date: d, qty: m.after, avg: m.avg_after });
	spRecomputePositions(pProductId);
}

// ═══════════ POST /invoices (transcription, incl. duplicate guard + payment fields) ═══════════
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
		DB.invoices.push({ id: invoiceId, invoice_type, total_amount, invoice_date: TODAY + ' 12:00:00', due_date: null, amount_paid: 0, payment_status: 'pending' });
		for (const item of items) {
			const productId = parseInt(item.product_id);
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
	} catch (err) { ROLLBACK(); return { status: 500, error: err.message }; }
}

// ═══════════ PUT /invoices/:id (transcription of the NEW handler) ═══════════
function putInvoice(id, body) {
	try {
		if (isNaN(id) || id <= 0) return { status: 400, error: 'Invalid invoice ID' };
		const { invoice_type, total_amount, due_date, items } = body;
		if (!Array.isArray(items) || items.length === 0) return { status: 400, error: 'At least one item is required' };
		const newProductIdList = items.map(item => parseInt(item.product_id));
		if (new Set(newProductIdList).size !== newProductIdList.length) {
			return { status: 400, error: 'The same product cannot be added more than once to an invoice' };
		}
		BEGIN();
		const oldInvoice = DB.invoices.find(i => i.id === id);
		if (!oldInvoice) { ROLLBACK(); return { status: 404, error: 'Invoice not found' }; }
		const oldItems = DB.invoice_items.filter(it => it.invoice_id === id);
		const movementProductIds = new Set(DB.stock_movements.filter(m => m.invoice_id === id).map(m => m.product_id));
		const oldProductIds = new Set(oldItems.map(item => item.product_id));
		for (const productId of newProductIdList) {
			if (!movementProductIds.has(productId)) {
				ROLLBACK();
				if (oldProductIds.has(productId)) return { status: 409, error: 'Stock ledger inconsistent' };
				return { status: 400, error: 'Adding new products while editing is not supported' };
			}
		}
		DB.invoice_items = DB.invoice_items.filter(it => it.invoice_id !== id);
		oldInvoice.invoice_type = invoice_type; oldInvoice.total_amount = total_amount; oldInvoice.due_date = due_date || null;
		for (const item of items) {
			DB.invoice_items.push({ id: nextId(), invoice_id: id, product_id: parseInt(item.product_id),
				quantity: item.quantity, unit_price: item.unit_price, total_price: item.total_price,
				is_private_price: !!item.is_private_price, private_price_amount: item.is_private_price ? item.private_price_amount : null });
		}
		const newProductIds = new Set(newProductIdList);
		const removedProductIds = new Set(oldItems.map(item => item.product_id).filter(pid => !newProductIds.has(pid)));
		for (const productId of removedProductIds) recalculateStockAfterInvoice(id, productId, 'DELETE', null, null);
		for (const item of items) {
			const change = invoice_type === 'sell' ? -item.quantity : item.quantity;
			const unitCost = parseFloat(item.is_private_price ? item.private_price_amount : item.unit_price);
			recalculateStockAfterInvoice(id, parseInt(item.product_id), 'EDIT', change, unitCost);
		}
		COMMIT();
		return { status: 200, id: String(id) };
	} catch (err) { ROLLBACK(); return { status: 500, error: err.message }; }
}

// ═══════════ DELETE /invoices/:id (transcription) ═══════════
function deleteInvoice(id) {
	try {
		BEGIN();
		if (!DB.invoices.find(i => i.id === id)) { ROLLBACK(); return { status: 404, error: 'Invoice not found' }; }
		if (DB.invoice_payments.filter(p => p.invoice_id === id).length > 0) {
			ROLLBACK(); return { status: 400, error: 'Cannot delete invoice with existing payments' };
		}
		const affectedProducts = [...new Set(DB.invoice_items.filter(it => it.invoice_id === id).map(it => it.product_id))];
		for (const productId of affectedProducts) recalculateStockAfterInvoice(id, productId, 'DELETE', null, null);
		DB.invoice_items = DB.invoice_items.filter(it => it.invoice_id !== id);
		DB.invoice_payments = DB.invoice_payments.filter(p => p.invoice_id !== id);
		DB.invoices = DB.invoices.filter(i => i.id !== id);
		COMMIT();
		return { status: 200, id };
	} catch (err) { ROLLBACK(); return { status: 500, error: err.message }; }
}

// ═══════════ POST /invoices/:id/payments (transcription) ═══════════
function recordPayment(invoiceId, { paid_amount, currency_code, exchange_rate_on_payment, payment_method }) {
	if (!paid_amount || paid_amount <= 0) return { status: 400, error: 'paid_amount must be greater than 0' };
	const currency = String(currency_code || '').toUpperCase();
	if (!['USD', 'LBP', 'EUR'].includes(currency)) return { status: 400, error: 'Invalid currency_code' };
	if (!exchange_rate_on_payment || exchange_rate_on_payment <= 0) return { status: 400, error: 'exchange_rate_on_payment must be greater than 0' };
	const invoice = DB.invoices.find(i => i.id === invoiceId);
	if (!invoice) return { status: 404, error: 'Invoice not found' };
	const paidAmount = parseFloat(String(paid_amount));
	const exchangeRate = parseFloat(String(exchange_rate_on_payment));
	const usdEquivalentAmount = currency === 'USD' ? paidAmount : paidAmount / exchangeRate;
	const currentAmountPaid = DB.invoice_payments.filter(p => p.invoice_id === invoiceId)
		.reduce((s, p) => s + p.usd_equivalent_amount, 0);
	const totalAmount = parseFloat(String(invoice.total_amount || 0));
	const remainingBalance = totalAmount - currentAmountPaid;
	const epsilon = 0.01;
	if (usdEquivalentAmount > remainingBalance + epsilon) {
		return { status: 400, error: `Payment USD equivalent (${usdEquivalentAmount.toFixed(2)}) exceeds remaining balance (${remainingBalance.toFixed(2)})` };
	}
	const newAmountPaid = currentAmountPaid + usdEquivalentAmount;
	let newPaymentStatus = 'pending';
	if (newAmountPaid >= totalAmount) newPaymentStatus = 'paid';
	else if (newAmountPaid > 0) newPaymentStatus = 'partial';
	DB.invoice_payments.push({ id: nextId(), invoice_id: invoiceId, paid_amount: paidAmount, currency_code: currency,
		exchange_rate_on_payment: exchangeRate, usd_equivalent_amount: usdEquivalentAmount, payment_method: payment_method || null });
	invoice.amount_paid = newAmountPaid; invoice.payment_status = newPaymentStatus;
	return { status: 200, amount_paid: newAmountPaid, remaining_balance: totalAmount - newAmountPaid, payment_status: newPaymentStatus };
}

// ═══════════ get_net_profit (SQL port) ═══════════
function getNetProfit(startDate, endDate) {
	let net_profit = 0, total_revenue = 0, total_cost = 0;
	for (const inv of DB.invoices.filter(i => i.invoice_type === 'sell'
		&& i.invoice_date.slice(0, 10) >= startDate && i.invoice_date.slice(0, 10) <= endDate)) {
		for (const item of DB.invoice_items.filter(it => it.invoice_id === inv.id)) {
			const sm = DB.stock_movements.filter(m => m.invoice_id === inv.id && m.product_id === item.product_id)
				.sort((a, b) => a.id - b.id)[0];
			const avgCost = sm ? (sm.avg_after ?? 0) : 0;
			const eff = item.private_price_amount != null ? item.private_price_amount : item.unit_price;
			total_revenue += item.quantity * eff;
			total_cost += item.quantity * avgCost;
			net_profit += item.quantity * (eff - avgCost);
		}
	}
	return { net_profit, total_revenue, total_cost };
}

// ═══════════ historical seeding (as the create endpoint wrote it back then) ═══════════
function seedInvoiceMulti({ type, date, lines }) {
	const invoiceId = nextId();
	const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
	DB.invoices.push({ id: invoiceId, invoice_type: type, total_amount: total, invoice_date: date + ' 12:00:00', due_date: null, amount_paid: 0, payment_status: 'pending' });
	for (const l of lines) {
		const change = type === 'sell' ? -l.qty : l.qty;
		const after = l.before + change;
		let avgAfter = l.avgBefore;
		if (type === 'buy') { const denom = l.before + l.qty; avgAfter = denom > 0 ? ((l.avgBefore * l.before) + (l.unitPrice * l.qty)) / denom : l.unitPrice; }
		DB.invoice_items.push({ id: nextId(), invoice_id: invoiceId, product_id: l.productId, quantity: l.qty, unit_price: l.unitPrice, total_price: l.qty * l.unitPrice, is_private_price: false, private_price_amount: null });
		DB.stock_movements.push({ id: nextId(), product_id: l.productId, invoice_id: invoiceId, invoice_date: date + ' 12:00:00', before: l.before, change, after, unit_cost: l.unitPrice, avg_after: avgAfter });
		const ex = DB.daily_stock.find(r => r.product_id === l.productId && r.date === date);
		if (ex) { ex.qty = after; ex.avg = avgAfter; } else DB.daily_stock.push({ product_id: l.productId, date, qty: after, avg: avgAfter });
	}
	return invoiceId;
}
const seed = (o) => seedInvoiceMulti({ type: o.type, date: o.date, lines: [{ productId: o.productId, qty: o.qty, unitPrice: o.unitPrice, before: o.before, avgBefore: o.avgBefore }] });

// ═══════════ checks ═══════════
const results = [];
function check(label, actual, expected) {
	const r6 = (v) => typeof v === 'number' ? Number(v.toFixed(6)) : Array.isArray(v) ? v.map(r6) : v;
	const pass = JSON.stringify(r6(actual)) === JSON.stringify(r6(expected));
	results.push({ label, pass, actual: r6(actual), expected: r6(expected) });
	console.log(`  ${pass ? '✅' : '❌'} ${label}  (expected ${JSON.stringify(r6(expected))}, got ${JSON.stringify(r6(actual))})`);
}
function movementsOf(pid) {
	return DB.stock_movements.filter(m => m.product_id === pid).sort((a, b) => a.invoice_id - b.invoice_id || a.id - b.id)
		.map(m => [m.before, m.change, m.after, m.avg_after]);
}
function chainOk(pid) {
	const rows = DB.stock_movements.filter(m => m.product_id === pid).sort((a, b) => a.invoice_id - b.invoice_id || a.id - b.id);
	for (let i = 1; i < rows.length; i++) if (rows[i].before !== rows[i - 1].after) return false;
	return true;
}
function dailyToday(pid) { const r = DB.daily_stock.find(x => x.product_id === pid && x.date === TODAY); return r ? [r.qty, r.avg] : null; }
function dailyOn(pid, d) { const r = DB.daily_stock.find(x => x.product_id === pid && x.date === d); return r ? [r.qty, r.avg] : null; }
function dailyDense(pid, from) {
	const rows = DB.daily_stock.filter(r => r.product_id === pid).sort((a, b) => a.date < b.date ? -1 : 1);
	let n = 0; for (let d = from; d <= TODAY; d = addDays(d, 1)) n++;
	if (rows.length !== n) return false;
	const seen = new Set(); for (const r of rows) { if (seen.has(r.date)) return false; seen.add(r.date); }
	return true;
}
const P = 1, P2 = 2;

// ═══════════════════════ 25 NORMAL SCENARIOS ═══════════════════════

console.log('\n──── T1: simple buy creates stock ────'); resetDB();
let r = createInvoice({ invoice_type: 'buy', total_amount: 100, items: [{ product_id: P, quantity: 20, unit_price: 5, total_price: 100 }] });
check('T1 status', r.status, 200);
check('T1 movement', movementsOf(P), [[0, 20, 20, 5]]);
check('T1 today stock', dailyToday(P), [20, 5]);

console.log('\n──── T2: simple sell reduces stock, avg cost unchanged ────');
r = createInvoice({ invoice_type: 'sell', total_amount: 96, items: [{ product_id: P, quantity: 8, unit_price: 12, total_price: 96 }] });
check('T2 status', r.status, 200);
check('T2 movements', movementsOf(P), [[0, 20, 20, 5], [20, -8, 12, 5]]);
check('T2 sell movement records sell price as unit_cost', DB.stock_movements.filter(m => m.product_id === P).pop().unit_cost, 12);
check('T2 today stock', dailyToday(P), [12, 5]);

console.log('\n──── T3: two buys at different prices → weighted average ────'); resetDB();
createInvoice({ invoice_type: 'buy', total_amount: 1000, items: [{ product_id: P, quantity: 100, unit_price: 10, total_price: 1000 }] });
createInvoice({ invoice_type: 'buy', total_amount: 800, items: [{ product_id: P, quantity: 50, unit_price: 16, total_price: 800 }] });
check('T3 WAC = (100*10 + 50*16)/150 = 12', dailyToday(P), [150, 12]);

console.log('\n──── T4: sell entire stock down to exactly 0, avg preserved ────');
createInvoice({ invoice_type: 'sell', total_amount: 3000, items: [{ product_id: P, quantity: 150, unit_price: 20, total_price: 3000 }] });
check('T4 stock zero, avg stays 12', dailyToday(P), [0, 12]);
check('T4 chain', chainOk(P), true);

console.log('\n──── T5: buy again after zero → avg = new purchase price ────');
createInvoice({ invoice_type: 'buy', total_amount: 400, items: [{ product_id: P, quantity: 20, unit_price: 20, total_price: 400 }] });
check('T5 restock avg = 20', dailyToday(P), [20, 20]);

console.log('\n──── T6: multi-product buy invoice ────'); resetDB();
r = createInvoice({ invoice_type: 'buy', total_amount: 82, items: [
	{ product_id: P, quantity: 10, unit_price: 5, total_price: 50 },
	{ product_id: P2, quantity: 4, unit_price: 8, total_price: 32 }] });
check('T6 status', r.status, 200);
check('T6 product 1', dailyToday(P), [10, 5]);
check('T6 product 2', dailyToday(P2), [4, 8]);

console.log('\n──── T7: multi-product sell invoice ────');
r = createInvoice({ invoice_type: 'sell', total_amount: 42, items: [
	{ product_id: P, quantity: 3, unit_price: 10, total_price: 30 },
	{ product_id: P2, quantity: 1, unit_price: 12, total_price: 12 }] });
check('T7 status', r.status, 200);
check('T7 product 1', dailyToday(P), [7, 5]);
check('T7 product 2', dailyToday(P2), [3, 8]);

console.log('\n──── T8: products have independent ledgers ────'); resetDB();
createInvoice({ invoice_type: 'buy', total_amount: 50, items: [{ product_id: P, quantity: 10, unit_price: 5, total_price: 50 }] });
createInvoice({ invoice_type: 'sell', total_amount: 20, items: [{ product_id: P, quantity: 2, unit_price: 10, total_price: 20 }] });
const p1Before = JSON.stringify(movementsOf(P));
createInvoice({ invoice_type: 'buy', total_amount: 90, items: [{ product_id: P2, quantity: 9, unit_price: 10, total_price: 90 }] });
check('T8 P1 ledger untouched by P2 activity', JSON.stringify(movementsOf(P)) === p1Before, true);
check('T8 P2 stock', dailyToday(P2), [9, 10]);

console.log('\n──── T9: edit old sell quantity UP (10 → 12) ────'); resetDB();
let buyId = seed({ type: 'buy', productId: P, date: '2026-06-01', qty: 100, unitPrice: 10, before: 0, avgBefore: 0 });
let sellA = seed({ type: 'sell', productId: P, date: '2026-06-10', qty: 10, unitPrice: 25, before: 100, avgBefore: 10 });
spRecomputePositions(null);
r = putInvoice(sellA, { invoice_type: 'sell', total_amount: 300, items: [{ product_id: P, quantity: 12, unit_price: 25, total_price: 300 }] });
check('T9 status', r.status, 200);
check('T9 movements', movementsOf(P), [[0, 100, 100, 10], [100, -12, 88, 10]]);
check('T9 today', dailyToday(P), [88, 10]);
check('T9 daily dense since 06-01', dailyDense(P, '2026-06-01'), true);

console.log('\n──── T10: edit old sell quantity DOWN (10 → 6) ────'); resetDB();
buyId = seed({ type: 'buy', productId: P, date: '2026-06-01', qty: 100, unitPrice: 10, before: 0, avgBefore: 0 });
sellA = seed({ type: 'sell', productId: P, date: '2026-06-10', qty: 10, unitPrice: 25, before: 100, avgBefore: 10 });
spRecomputePositions(null);
r = putInvoice(sellA, { invoice_type: 'sell', total_amount: 150, items: [{ product_id: P, quantity: 6, unit_price: 25, total_price: 150 }] });
check('T10 status', r.status, 200);
check('T10 movements', movementsOf(P), [[0, 100, 100, 10], [100, -6, 94, 10]]);
check('T10 today', dailyToday(P), [94, 10]);

console.log('\n──── T11: edit old buy quantity (100 → 80) ────'); resetDB();
buyId = seed({ type: 'buy', productId: P, date: '2026-06-01', qty: 100, unitPrice: 10, before: 0, avgBefore: 0 });
seed({ type: 'sell', productId: P, date: '2026-06-10', qty: 20, unitPrice: 25, before: 100, avgBefore: 10 });
spRecomputePositions(null);
r = putInvoice(buyId, { invoice_type: 'buy', total_amount: 800, items: [{ product_id: P, quantity: 80, unit_price: 10, total_price: 800 }] });
check('T11 status', r.status, 200);
check('T11 movements', movementsOf(P), [[0, 80, 80, 10], [80, -20, 60, 10]]);
check('T11 today', dailyToday(P), [60, 10]);

console.log('\n──── T12: edit old buy PRICE only (10 → 11), qty unchanged ────'); resetDB();
buyId = seed({ type: 'buy', productId: P, date: '2026-06-01', qty: 100, unitPrice: 10, before: 0, avgBefore: 0 });
seed({ type: 'sell', productId: P, date: '2026-06-10', qty: 20, unitPrice: 25, before: 100, avgBefore: 10 });
spRecomputePositions(null);
r = putInvoice(buyId, { invoice_type: 'buy', total_amount: 1100, items: [{ product_id: P, quantity: 100, unit_price: 11, total_price: 1100 }] });
check('T12 status', r.status, 200);
check('T12 movements re-averaged to 11', movementsOf(P), [[0, 100, 100, 11], [100, -20, 80, 11]]);
check('T12 today', dailyToday(P), [80, 11]);

console.log('\n──── T13: edit removes ONE line from a two-product sell ────'); resetDB();
seedInvoiceMulti({ type: 'buy', date: '2026-06-01', lines: [
	{ productId: P, qty: 50, unitPrice: 10, before: 0, avgBefore: 0 },
	{ productId: P2, qty: 30, unitPrice: 6, before: 0, avgBefore: 0 }] });
const sellM = seedInvoiceMulti({ type: 'sell', date: '2026-06-05', lines: [
	{ productId: P, qty: 5, unitPrice: 25, before: 50, avgBefore: 10 },
	{ productId: P2, qty: 3, unitPrice: 12, before: 30, avgBefore: 6 }] });
spRecomputePositions(null);
r = putInvoice(sellM, { invoice_type: 'sell', total_amount: 125, items: [{ product_id: P, quantity: 5, unit_price: 25, total_price: 125 }] });
check('T13 status', r.status, 200);
check('T13 P1 unchanged', dailyToday(P), [45, 10]);
check('T13 P2 restored to full stock', dailyToday(P2), [30, 6]);
check('T13 P2 movement for the sell removed', DB.stock_movements.filter(m => m.invoice_id === sellM && m.product_id === P2).length, 0);
check('T13 invoice now has 1 line', DB.invoice_items.filter(i => i.invoice_id === sellM).length, 1);

console.log('\n──── T14: delete the MIDDLE sell of three ────'); resetDB();
seed({ type: 'buy', productId: P, date: '2026-06-01', qty: 100, unitPrice: 10, before: 0, avgBefore: 0 });
seed({ type: 'sell', productId: P, date: '2026-06-05', qty: 10, unitPrice: 25, before: 100, avgBefore: 10 });
const midSell = seed({ type: 'sell', productId: P, date: '2026-06-10', qty: 15, unitPrice: 25, before: 90, avgBefore: 10 });
seed({ type: 'sell', productId: P, date: '2026-06-15', qty: 5, unitPrice: 25, before: 75, avgBefore: 10 });
spRecomputePositions(null);
r = deleteInvoice(midSell);
check('T14 status', r.status, 200);
check('T14 movements', movementsOf(P), [[0, 100, 100, 10], [100, -10, 90, 10], [90, -5, 85, 10]]);
check('T14 daily on 06-12 (was 75, now 90)', dailyOn(P, '2026-06-12'), [90, 10]);
check('T14 today', dailyToday(P), [85, 10]);

console.log('\n──── T15: delete the LATEST invoice ────'); resetDB();
seed({ type: 'buy', productId: P, date: '2026-06-01', qty: 100, unitPrice: 10, before: 0, avgBefore: 0 });
seed({ type: 'sell', productId: P, date: '2026-06-05', qty: 10, unitPrice: 25, before: 100, avgBefore: 10 });
seed({ type: 'sell', productId: P, date: '2026-06-10', qty: 15, unitPrice: 25, before: 90, avgBefore: 10 });
const lastSell = seed({ type: 'sell', productId: P, date: '2026-06-15', qty: 5, unitPrice: 25, before: 75, avgBefore: 10 });
spRecomputePositions(null);
r = deleteInvoice(lastSell);
check('T15 status', r.status, 200);
check('T15 movements', movementsOf(P), [[0, 100, 100, 10], [100, -10, 90, 10], [90, -15, 75, 10]]);
check('T15 today back to 75', dailyToday(P), [75, 10]);

console.log('\n──── T16: delete a MIDDLE buy → later avg recomputed ────'); resetDB();
seed({ type: 'buy', productId: P, date: '2026-06-01', qty: 100, unitPrice: 10, before: 0, avgBefore: 0 });
const buy2 = seed({ type: 'buy', productId: P, date: '2026-06-05', qty: 50, unitPrice: 16, before: 100, avgBefore: 10 }); // avg -> 12
seed({ type: 'sell', productId: P, date: '2026-06-10', qty: 30, unitPrice: 25, before: 150, avgBefore: 12 });
spRecomputePositions(null);
r = deleteInvoice(buy2);
check('T16 status', r.status, 200);
check('T16 movements (avg back to 10)', movementsOf(P), [[0, 100, 100, 10], [100, -30, 70, 10]]);
check('T16 today', dailyToday(P), [70, 10]);

console.log('\n──── T17: private-price sell (special deal for a customer) ────'); resetDB();
createInvoice({ invoice_type: 'buy', total_amount: 100, items: [{ product_id: P, quantity: 10, unit_price: 10, total_price: 100 }] });
r = createInvoice({ invoice_type: 'sell', total_amount: 36, items: [
	{ product_id: P, quantity: 2, unit_price: 25, total_price: 36, is_private_price: true, private_price_amount: 18 }] });
check('T17 status', r.status, 200);
const privMv = DB.stock_movements.filter(m => m.product_id === P).pop();
check('T17 movement stores the private price', privMv.unit_cost, 18);
check('T17 avg cost NOT affected by private price', privMv.avg_after, 10);
check('T17 today', dailyToday(P), [8, 10]);

console.log('\n──── T18: edit a normal sell into a private-price sell ────'); resetDB();
seed({ type: 'buy', productId: P, date: '2026-06-01', qty: 10, unitPrice: 10, before: 0, avgBefore: 0 });
sellA = seed({ type: 'sell', productId: P, date: '2026-06-05', qty: 2, unitPrice: 25, before: 10, avgBefore: 10 });
spRecomputePositions(null);
r = putInvoice(sellA, { invoice_type: 'sell', total_amount: 36, items: [
	{ product_id: P, quantity: 2, unit_price: 25, total_price: 36, is_private_price: true, private_price_amount: 18 }] });
check('T18 status', r.status, 200);
const editedMv = DB.stock_movements.find(m => m.invoice_id === sellA);
check('T18 movement now stores private price', editedMv.unit_cost, 18);
check('T18 qty unchanged, avg unchanged', [editedMv.after, editedMv.avg_after], [8, 10]);
check('T18 item saved with private amount', DB.invoice_items.find(i => i.invoice_id === sellA).private_price_amount, 18);

console.log('\n──── T19: several movements the same day → daily = last state ────'); resetDB();
createInvoice({ invoice_type: 'buy', total_amount: 100, items: [{ product_id: P, quantity: 20, unit_price: 5, total_price: 100 }] });
createInvoice({ invoice_type: 'sell', total_amount: 30, items: [{ product_id: P, quantity: 3, unit_price: 10, total_price: 30 }] });
createInvoice({ invoice_type: 'sell', total_amount: 40, items: [{ product_id: P, quantity: 4, unit_price: 10, total_price: 40 }] });
check('T19 movements chain 20→17→13', movementsOf(P), [[0, 20, 20, 5], [20, -3, 17, 5], [17, -4, 13, 5]]);
check('T19 single daily row = end-of-day state', dailyToday(P), [13, 5]);
check('T19 exactly one row for today', DB.daily_stock.filter(x => x.product_id === P).length, 1);

console.log('\n──── T20: quiet product — snapshot carried forward day after day ────'); resetDB();
seed({ type: 'buy', productId: P, date: '2026-06-20', qty: 10, unitPrice: 7, before: 0, avgBefore: 0 });
spRecomputePositions(null);
check('T20 dense from 06-20 to today', dailyDense(P, '2026-06-20'), true);
check('T20 mid-gap day carries 10 @ 7', dailyOn(P, '2026-06-28'), [10, 7]);
check('T20 today carries 10 @ 7', dailyToday(P), [10, 7]);

console.log('\n──── T21: edit the OLDEST invoice of a long history (buys + sells) ────'); resetDB();
buyId = seed({ type: 'buy', productId: P, date: '2026-06-01', qty: 100, unitPrice: 10, before: 0, avgBefore: 0 });
seed({ type: 'sell', productId: P, date: '2026-06-03', qty: 10, unitPrice: 25, before: 100, avgBefore: 10 });
seed({ type: 'sell', productId: P, date: '2026-06-08', qty: 20, unitPrice: 25, before: 90, avgBefore: 10 });
seed({ type: 'buy', productId: P, date: '2026-06-12', qty: 50, unitPrice: 13, before: 70, avgBefore: 10 }); // avg -> 11.25
seed({ type: 'sell', productId: P, date: '2026-06-20', qty: 30, unitPrice: 25, before: 120, avgBefore: 11.25 });
spRecomputePositions(null);
r = putInvoice(buyId, { invoice_type: 'buy', total_amount: 800, items: [{ product_id: P, quantity: 100, unit_price: 8, total_price: 800 }] });
const avg2 = ((70 * 8) + (50 * 13)) / 120; // second buy re-averaged on the new base cost
check('T21 status', r.status, 200);
check('T21 movements', movementsOf(P), [
	[0, 100, 100, 8], [100, -10, 90, 8], [90, -20, 70, 8], [70, 50, 120, avg2], [120, -30, 90, avg2]]);
check('T21 today', dailyToday(P), [90, avg2]);
check('T21 chain', chainOk(P), true);

console.log('\n──── T22: net profit report — normal sells ────'); resetDB();
createInvoice({ invoice_type: 'buy', total_amount: 100, items: [{ product_id: P, quantity: 10, unit_price: 10, total_price: 100 }] });
createInvoice({ invoice_type: 'sell', total_amount: 100, items: [{ product_id: P, quantity: 4, unit_price: 25, total_price: 100 }] });
let profit = getNetProfit(TODAY, TODAY);
check('T22 revenue', profit.total_revenue, 100);
check('T22 cost (4 × avg 10)', profit.total_cost, 40);
check('T22 net profit', profit.net_profit, 60);

console.log('\n──── T23: net profit includes private-price sells at the real sold price ────');
createInvoice({ invoice_type: 'sell', total_amount: 40, items: [
	{ product_id: P, quantity: 2, unit_price: 25, total_price: 40, is_private_price: true, private_price_amount: 20 }] });
profit = getNetProfit(TODAY, TODAY);
check('T23 revenue 100 + (2×20)', profit.total_revenue, 140);
check('T23 cost 40 + (2×10)', profit.total_cost, 60);
check('T23 net profit', profit.net_profit, 80);

console.log('\n──── T24: payments — pending → partial → paid ────'); resetDB();
createInvoice({ invoice_type: 'buy', total_amount: 500, items: [{ product_id: P, quantity: 50, unit_price: 10, total_price: 500 }] });
r = createInvoice({ invoice_type: 'sell', total_amount: 100, items: [{ product_id: P, quantity: 4, unit_price: 25, total_price: 100 }] });
const invId = r.id;
check('T24 starts pending', DB.invoices.find(i => i.id === invId).payment_status, 'pending');
r = recordPayment(invId, { paid_amount: 40, currency_code: 'USD', exchange_rate_on_payment: 1 });
check('T24 after $40 → partial', [r.status, r.payment_status, r.amount_paid], [200, 'partial', 40]);
r = recordPayment(invId, { paid_amount: 60, currency_code: 'USD', exchange_rate_on_payment: 1 });
check('T24 after $60 more → paid', [r.status, r.payment_status, r.amount_paid], [200, 'paid', 100]);
check('T24 remaining balance 0', r.remaining_balance, 0);

console.log('\n──── T25: payment in LBP converts to USD; overpayment refused ────'); resetDB();
createInvoice({ invoice_type: 'buy', total_amount: 500, items: [{ product_id: P, quantity: 50, unit_price: 10, total_price: 500 }] });
r = createInvoice({ invoice_type: 'sell', total_amount: 100, items: [{ product_id: P, quantity: 4, unit_price: 25, total_price: 100 }] });
const invId2 = r.id;
r = recordPayment(invId2, { paid_amount: 895000, currency_code: 'LBP', exchange_rate_on_payment: 89500 });
check('T25 895,000 LBP @ 89,500 = $10', [r.status, r.amount_paid, r.payment_status], [200, 10, 'partial']);
r = recordPayment(invId2, { paid_amount: 95, currency_code: 'USD', exchange_rate_on_payment: 1 });
check('T25 overpayment ($95 > $90 remaining) refused', r.status, 400);
r = recordPayment(invId2, { paid_amount: 90, currency_code: 'USD', exchange_rate_on_payment: 1 });
check('T25 exact remaining $90 accepted → paid', [r.status, r.payment_status], [200, 'paid']);

// ═══════════════ summary ═══════════════
const failed = results.filter(x => !x.pass);
console.log('\n════════════════════════ QA SUMMARY (normal scenarios) ════════════════════════');
console.log(`Total checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}`);
if (failed.length) {
	console.log('\nFAILED:');
	failed.forEach(f => console.log(`  ❌ ${f.label}\n     expected: ${JSON.stringify(f.expected)}\n     got:      ${JSON.stringify(f.actual)}`));
}
process.exitCode = failed.length ? 1 : 0;
