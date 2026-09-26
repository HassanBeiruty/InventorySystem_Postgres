/**
 * Landed cost calculation.
 *
 * Takes supplier invoice rows priced in a foreign currency plus a single lump-sum tax
 * amount, and produces a USD unit price per line that already carries that line's fair
 * share of the tax.
 *
 * The tax is distributed pro-rata by line extended value (quantity x unit price), which is
 * algebraically a uniform uplift: every line is multiplied by (1 + tax / goodsValue). A
 * $188 part and a $5.50 part therefore absorb the same tax *percentage of their own value*,
 * not the same dollar amount.
 *
 * invoice_items.unit_price is DECIMAL(18,2), so the final unit price must survive rounding
 * to 2 decimals. On a qty-100 line half a cent of rounding is $0.50 of drift, so the
 * rounding stage below is load-bearing: per-line targets are allocated with the
 * largest-remainder method, then a capped greedy pass nudges unit prices by a single cent
 * to close whatever residual the rounding introduced. Anything that cannot be closed is
 * reported rather than hidden.
 */

const XLSX = require('xlsx');

/**
 * Safety bound on the residual-closing search, so a nonsense input cannot exhaust memory.
 * One byte per cell, freed as soon as the request finishes. 20M covers invoices of a few
 * thousand lines; past that the search is skipped and the residual reported as-is.
 */
const MAX_DP_CELLS = 20000000;

/**
 * Parse a value that should be a number.
 *
 * Excel cells read with { raw: true } come back as real numbers, but a cell can still hold
 * text if the source file was typed by hand or exported by another system. Currency symbols
 * and thousands separators are stripped so "¥113.00" and "1,234.50" both parse.
 *
 * @returns {number} NaN when the value is empty or unparseable.
 */
function toNumber(value) {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : NaN;
	}
	if (value === null || value === undefined) return NaN;

	const cleaned = String(value).replace(/[^\d.\-]/g, '');
	if (!cleaned || cleaned === '-' || cleaned === '.') return NaN;

	const parsed = parseFloat(cleaned);
	return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Normalise a date cell to YYYY-MM-DD.
 *
 * The invoice importer groups rows into invoices using the raw date string, so every row of
 * one shipment must emit a byte-identical date or the import splits into many invoices. ISO
 * also removes the 9/26/2026 vs 26/9/2026 ambiguity when the importer calls new Date(str).
 *
 * @returns {string} YYYY-MM-DD, or the original trimmed string when it cannot be recognised.
 */
function toIsoDate(value) {
	if (value === null || value === undefined || value === '') return '';

	if (value instanceof Date && !isNaN(value.getTime())) {
		// Use local getters: xlsx with cellDates builds dates in local time, so toISOString
		// would shift the day backwards for any timezone east of UTC.
		const y = value.getFullYear();
		const m = String(value.getMonth() + 1).padStart(2, '0');
		const d = String(value.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	// Excel serial date (days since 1899-12-30).
	if (typeof value === 'number' && Number.isFinite(value)) {
		const parts = XLSX.SSF.parse_date_code(value);
		if (parts) {
			const m = String(parts.m).padStart(2, '0');
			const d = String(parts.d).padStart(2, '0');
			return `${parts.y}-${m}-${d}`;
		}
	}

	const str = String(value).trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

	const parsed = new Date(str);
	if (!isNaN(parsed.getTime())) {
		const y = parsed.getFullYear();
		const m = String(parsed.getMonth() + 1).padStart(2, '0');
		const d = String(parsed.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	return str;
}

/**
 * Header aliases accepted for each canonical field.
 *
 * Kept identical to the invoice importer's own mapping (server/routes/api.js) so a file
 * this tool accepts is a file the importer accepts.
 */
const COLUMN_MAPPINGS = {
	invoice_type: ['invoice_type', 'type', 'invoice type'],
	invoice_date: ['invoice_date', 'invoice date', 'date'],
	entity_name: ['entity_name', 'entity name', 'entity'],
	customer_name: ['customer_name', 'customer name', 'customer'],
	supplier_name: ['supplier_name', 'supplier name', 'supplier'],
	due_date: ['due_date', 'due date'],
	paid_directly: ['paid_directly', 'paid directly', 'paid'],
	product_barcode: ['product_barcode', 'product barcode', 'barcode', 'bar_code'],
	product_sku: ['product_sku', 'product sku', 'sku', 'oem', 'oem_no', 'oem no'],
	quantity: ['quantity', 'qty', 'qty.', 'amount'],
	unit_price: ['unit_price', 'unit price', 'price', 'unitprice']
};

function normalizeKey(key) {
	if (!key) return '';
	return String(key).trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Work out which sheet header holds each canonical field.
 *
 * @param {object} sampleRow A row from sheet_to_json; its keys are the sheet headers.
 * @returns {{ columnMap: object, available: string[], missing: string[] }}
 */
function detectColumns(sampleRow) {
	const headers = Object.keys(sampleRow || {});
	const columnMap = {};

	for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
		const normalisedAliases = aliases.map(normalizeKey);
		const hit = headers.find((h) => normalisedAliases.includes(normalizeKey(h)));
		if (hit) columnMap[field] = hit;
	}

	// What this tool needs to do its job. entity_name/invoice_type/dates are carried
	// through untouched, so they are the importer's problem, not ours.
	const missing = [];
	if (!columnMap.product_barcode && !columnMap.product_sku) missing.push('product_barcode');
	if (!columnMap.quantity) missing.push('quantity');
	if (!columnMap.unit_price) missing.push('unit_price');

	return { columnMap, available: headers, missing };
}

/** Round to 2 decimals without the floating-point surprises of toFixed on .005 boundaries. */
function round2(n) {
	return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Distribute a whole-cent total across lines in proportion to their exact values.
 *
 * Largest-remainder (Hare quota): floor every share, then hand the leftover cents one at a
 * time to the lines with the largest discarded fraction. Guarantees the parts sum to the
 * total exactly.
 *
 * @param {number[]} weights  Non-negative exact line values.
 * @param {number} totalCents Integer total to distribute.
 * @returns {number[]} Integer cents, summing exactly to totalCents.
 */
function allocateByLargestRemainder(weights, totalCents) {
	const weightSum = weights.reduce((a, b) => a + b, 0);
	if (weightSum <= 0) return weights.map(() => 0);

	const exact = weights.map((w) => (w / weightSum) * totalCents);
	const floored = exact.map((v) => Math.floor(v));
	let remaining = totalCents - floored.reduce((a, b) => a + b, 0);

	// Order by discarded fraction, descending. Index breaks ties so the result is stable.
	const order = exact
		.map((v, i) => ({ i, frac: v - Math.floor(v) }))
		.sort((a, b) => b.frac - a.frac || a.i - b.i);

	for (let k = 0; remaining > 0 && k < order.length; k++) {
		floored[order[k].i] += 1;
		remaining -= 1;
	}

	return floored;
}

/**
 * Nudge unit prices by a single cent to close the rounding residual.
 *
 * Moving a line's unit price by 1 cent moves the invoice total by (1 cent x quantity), so
 * closing a residual means choosing d_i in {-1, 0, +1} per line such that
 * sum(d_i * quantity_i) == residual. That is a signed subset-sum, and greedy does not solve
 * it: on a real 29-line invoice the residual was 3 cents while the smallest priced line had
 * quantity 8, so no single nudge fits. The answer there is +12 +8 +8 -25 = 3, which only a
 * search finds.
 *
 * So: exact DP over the reachable offsets, minimising the total distortion of line totals
 * away from their targets. Capping d_i at one cent bounds any unit price to within 1.5 cents
 * of its exact target. Lines are visited smallest-quantity-first to keep partial sums near
 * zero and the window tight.
 *
 * The cap stays at one cent deliberately. Measured over 400 synthetic invoices, widening it
 * to +/-3 cents only cut the unclosed cases from 63 to 26, and +/-5 cents to 16, while the
 * worst residual barely moved (117 -> 102 cents) because the hard cases are unreachable at
 * any width: a 3-line invoice with quantities 56/69/82 can only move its total in those
 * steps. Paying 5 cents of per-unit distortion to rescue a minority of cases is a bad trade.
 *
 * A residual therefore only survives when every line carries a large quantity. Real invoices
 * mix in small quantities and close exactly. When one does survive it is reported in the
 * summary and surfaced in the UI -- never silently absorbed into a price.
 *
 * @returns {{ residualCents: number, nudged: Set<number> }} Whatever could not be closed.
 */
function closeResidual(lines, unitCents, targetCents, residualCents) {
	const nudged = new Set();
	if (residualCents === 0) return { residualCents: 0, nudged };

	const eligible = [];
	for (let i = 0; i < lines.length; i++) {
		// Free lines stay free: a refund/sample row must not acquire a cent of cost.
		if (unitCents[i] <= 0) continue;
		// Fractional quantities make the cent arithmetic inexact; leave them alone.
		if (!Number.isInteger(lines[i].quantity)) continue;
		eligible.push(i);
	}
	if (eligible.length === 0) return { residualCents, nudged };

	eligible.sort((a, b) => lines[a].quantity - lines[b].quantity);

	const maxQty = lines[eligible[eligible.length - 1]].quantity;
	// Wide enough to hold the partial sums of a solution that overshoots before correcting.
	const window = Math.abs(residualCents) + 4 * maxQty;
	const size = 2 * window + 1;
	if (!Number.isFinite(size) || eligible.length * size > MAX_DP_CELLS) {
		return { residualCents, nudged }; // Too large to solve; report it rather than guess.
	}

	const INF = Infinity;
	let cost = new Float64Array(size).fill(INF);
	cost[window] = 0; // offset 0 reached at zero cost
	const choices = [];

	// After k lines only offsets within +/- sum(quantities so far) are reachable, so track
	// the live band and scan only that. Early lines touch a handful of cells instead of the
	// whole window.
	let lo = window;
	let hi = window;

	for (let k = 0; k < eligible.length; k++) {
		const i = eligible[k];
		const q = lines[i].quantity;
		const base = Math.abs(unitCents[i] * q - targetCents[i]);
		// Extra distortion this line takes on if nudged. Never negative: unitCents is
		// already the nearest whole cent, so moving away can only cost.
		const costUp = Math.abs((unitCents[i] + 1) * q - targetCents[i]) - base;
		const costDown = unitCents[i] - 1 >= 0
			? Math.abs((unitCents[i] - 1) * q - targetCents[i]) - base
			: INF;

		const nextLo = Math.max(0, lo - q);
		const nextHi = Math.min(size - 1, hi + q);

		const next = new Float64Array(size).fill(INF);
		const choice = new Int8Array(size);

		for (let o = lo; o <= hi; o++) {
			const c = cost[o];
			if (c === INF) continue;

			if (c < next[o]) { next[o] = c; choice[o] = 0; }

			const up = o + q;
			if (up < size && costUp !== INF && c + costUp < next[up]) {
				next[up] = c + costUp;
				choice[up] = 1;
			}

			const down = o - q;
			if (down >= 0 && costDown !== INF && c + costDown < next[down]) {
				next[down] = c + costDown;
				choice[down] = -1;
			}
		}

		cost = next;
		choices.push(choice);
		lo = nextLo;
		hi = nextHi;
	}

	const goal = window + residualCents;
	if (goal < 0 || goal >= size || cost[goal] === INF) {
		// The residual is not expressible from the available quantities.
		return { residualCents, nudged };
	}

	// Walk the choices back, applying each nudge.
	let offset = goal;
	for (let k = eligible.length - 1; k >= 0; k--) {
		const d = choices[k][offset];
		if (d !== 0) {
			const i = eligible[k];
			unitCents[i] += d;
			nudged.add(i);
			offset -= d * lines[i].quantity;
		}
	}

	return { residualCents: 0, nudged };
}

/**
 * Compute landed unit costs for a set of invoice rows.
 *
 * @param {object[]} rows      Raw sheet rows (keys are the original headers).
 * @param {object} columnMap   Canonical field name -> actual header key in the rows.
 * @param {number} rate        Source units per 1 USD. usd = sourcePrice / rate.
 * @param {number} taxAmount   Lump-sum tax to distribute.
 * @param {boolean} taxInSourceCurrency  True when taxAmount is in the source currency.
 * @returns {{ lines, summary, errors }}
 */
function computeLandedCost({ rows, columnMap, rate, taxAmount, taxInSourceCurrency = false }) {
	const errors = [];

	const parsedRate = toNumber(rate);
	if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
		const err = new Error('Exchange rate must be a number greater than 0');
		err.statusCode = 400;
		throw err;
	}

	const parsedTax = toNumber(taxAmount);
	if (!Number.isFinite(parsedTax) || parsedTax < 0) {
		const err = new Error('Total tax must be a number of 0 or more');
		err.statusCode = 400;
		throw err;
	}

	const taxUsd = taxInSourceCurrency ? parsedTax / parsedRate : parsedTax;

	// --- Pass 1: parse and convert -------------------------------------------------------
	const lines = [];

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const rowNum = i + 2; // 1-based, plus the header row. Matches the importer's numbering.

		const barcode = String(row[columnMap.product_barcode] ?? '').trim();
		const sku = columnMap.product_sku ? String(row[columnMap.product_sku] ?? '').trim() : '';

		// Skip blank spacer rows rather than reporting them as errors.
		const isBlank = !barcode && !sku &&
			String(row[columnMap.quantity] ?? '').trim() === '' &&
			String(row[columnMap.unit_price] ?? '').trim() === '';
		if (isBlank) continue;

		if (!barcode && !sku) {
			errors.push({ row: rowNum, error: 'Missing product_barcode' });
			continue;
		}

		const quantity = toNumber(row[columnMap.quantity]);
		if (!Number.isFinite(quantity) || quantity <= 0) {
			errors.push({ row: rowNum, error: `Invalid quantity: ${row[columnMap.quantity]}` });
			continue;
		}

		const sourceUnitPrice = toNumber(row[columnMap.unit_price]);
		if (!Number.isFinite(sourceUnitPrice) || sourceUnitPrice < 0) {
			errors.push({ row: rowNum, error: `Invalid unit_price: ${row[columnMap.unit_price]}` });
			continue;
		}

		const usdUnitBeforeTax = sourceUnitPrice / parsedRate;
		const lineValueUsd = quantity * usdUnitBeforeTax;

		lines.push({
			row: rowNum,
			raw: row,
			barcode,
			sku,
			quantity,
			sourceUnitPrice,
			sourceLineTotal: quantity * sourceUnitPrice,
			usdUnitBeforeTax,
			lineValueUsd
		});
	}

	if (lines.length === 0) {
		const err = new Error('No valid rows found in the file');
		err.statusCode = 400;
		err.details = errors;
		throw err;
	}

	// --- Pass 2: allocate ----------------------------------------------------------------
	const goodsUsd = lines.reduce((sum, l) => sum + l.lineValueUsd, 0);
	const sourceGoodsTotal = lines.reduce((sum, l) => sum + l.sourceLineTotal, 0);

	if (goodsUsd <= 0 && taxUsd > 0) {
		const err = new Error(
			'Cannot distribute tax: every line has a price of 0, so there is no value to allocate against'
		);
		err.statusCode = 400;
		throw err;
	}

	// Pro-rata by line value == a uniform uplift on every line. This single number explains
	// the whole result, so it is surfaced in the UI.
	const upliftRatio = goodsUsd > 0 ? taxUsd / goodsUsd : 0;

	const targetGrandTotalCents = Math.round((goodsUsd + taxUsd) * 100);
	const landedExact = lines.map((l) => l.lineValueUsd * (1 + upliftRatio));
	const targetCents = allocateByLargestRemainder(landedExact, targetGrandTotalCents);

	// --- Pass 3: round to the 2 decimals the database will store -------------------------
	const unitCents = lines.map((l, i) => Math.round(targetCents[i] / l.quantity));

	const actualBefore = lines.reduce((sum, l, i) => sum + unitCents[i] * l.quantity, 0);
	const { residualCents, nudged } = closeResidual(
		lines,
		unitCents,
		targetCents,
		targetGrandTotalCents - actualBefore
	);

	// --- Pass 4: build the result --------------------------------------------------------
	const resultLines = lines.map((l, i) => {
		const finalUnitPrice = unitCents[i] / 100;
		const lineTotalUsd = round2(finalUnitPrice * l.quantity);
		const taxAllocatedUsd = l.lineValueUsd * upliftRatio;

		return {
			row: l.row,
			raw: l.raw,
			barcode: l.barcode,
			sku: l.sku,
			quantity: l.quantity,
			sourceUnitPrice: l.sourceUnitPrice,
			sourceLineTotal: round2(l.sourceLineTotal),
			usdUnitBeforeTax: l.usdUnitBeforeTax,
			lineValueUsd: l.lineValueUsd,
			sharePct: goodsUsd > 0 ? (l.lineValueUsd / goodsUsd) * 100 : 0,
			taxAllocatedUsd,
			landedLineUsd: landedExact[i],
			targetLineUsd: targetCents[i] / 100,
			finalUnitPrice,
			lineTotalUsd,
			deltaVsTarget: round2(lineTotalUsd - targetCents[i] / 100),
			nudged: nudged.has(i)
		};
	});

	const importableTotalUsd = round2(
		resultLines.reduce((sum, l) => sum + l.lineTotalUsd, 0)
	);

	return {
		lines: resultLines,
		errors,
		summary: {
			rate: parsedRate,
			taxInput: parsedTax,
			taxInSourceCurrency: !!taxInSourceCurrency,
			taxUsd: round2(taxUsd),
			lineCount: resultLines.length,
			totalQuantity: resultLines.reduce((sum, l) => sum + l.quantity, 0),
			sourceGoodsTotal: round2(sourceGoodsTotal),
			goodsUsd: round2(goodsUsd),
			upliftPct: upliftRatio * 100,
			targetGrandTotalUsd: targetGrandTotalCents / 100,
			importableTotalUsd,
			residualUsd: round2(residualCents / 100),
			nudgedCount: nudged.size,
			zeroPriceLineCount: resultLines.filter((l) => l.sourceUnitPrice === 0).length,
			errorCount: errors.length
		}
	};
}

/**
 * Build the output workbook.
 *
 * Sheet 1 is named "invoices" and holds exactly the importer's columns, because the importer
 * reads workbook.SheetNames[0]. Prices are written as real numbers, not formatted text: the
 * importer runs parseFloat over the value, and parseFloat('¥113.00') is NaN.
 *
 * Sheet 2 is the audit trail, so the landed cost on any line can be defended without
 * re-running the tool.
 *
 * @returns {Buffer} xlsx file contents.
 */
function buildWorkbook({ lines, summary, columnMap }) {
	const hasSku = !!columnMap.product_sku;

	const importHeader = [
		'invoice_type', 'invoice_date', 'entity_name', 'due_date',
		'paid_directly', 'product_barcode',
		...(hasSku ? ['product_sku'] : []),
		'quantity', 'unit_price'
	];

	const importRows = lines.map((l) => {
		const src = l.raw;
		const row = {
			invoice_type: String(src[columnMap.invoice_type] ?? '').trim().toLowerCase() || 'buy',
			// Normalised to YYYY-MM-DD: the importer groups rows into one invoice by the raw
			// date string, so these must be byte-identical across the shipment.
			invoice_date: toIsoDate(src[columnMap.invoice_date]),
			entity_name: String(src[columnMap.entity_name] ?? '').trim(),
			due_date: toIsoDate(src[columnMap.due_date]),
			paid_directly: String(src[columnMap.paid_directly] ?? '').trim(),
			product_barcode: l.barcode,
			quantity: l.quantity,
			unit_price: l.finalUnitPrice
		};
		if (hasSku) row.product_sku = l.sku;
		return row;
	});

	const importSheet = XLSX.utils.json_to_sheet(importRows, { header: importHeader });

	const auditRows = lines.map((l) => ({
		row: l.row,
		product_barcode: l.barcode,
		quantity: l.quantity,
		source_unit_price: round2(l.sourceUnitPrice),
		source_line_total: l.sourceLineTotal,
		usd_unit_before_tax: Math.round(l.usdUnitBeforeTax * 1e6) / 1e6,
		line_value_usd: round2(l.lineValueUsd),
		share_pct: Math.round(l.sharePct * 1e6) / 1e6,
		tax_allocated_usd: round2(l.taxAllocatedUsd),
		landed_line_usd: round2(l.landedLineUsd),
		target_line_usd: l.targetLineUsd,
		final_unit_price_usd: l.finalUnitPrice,
		line_total_usd: l.lineTotalUsd,
		delta_vs_target: l.deltaVsTarget,
		nudged: l.nudged ? 'yes' : ''
	}));

	const auditSheet = XLSX.utils.json_to_sheet(auditRows, {
		header: [
			'row', 'product_barcode', 'quantity', 'source_unit_price', 'source_line_total',
			'usd_unit_before_tax', 'line_value_usd', 'share_pct', 'tax_allocated_usd',
			'landed_line_usd', 'target_line_usd', 'final_unit_price_usd', 'line_total_usd',
			'delta_vs_target', 'nudged'
		]
	});

	// Summary block under the audit table, separated by a blank row.
	XLSX.utils.sheet_add_aoa(auditSheet, [
		[],
		['SUMMARY'],
		['Exchange rate (source per 1 USD)', summary.rate],
		['Goods total (source currency)', summary.sourceGoodsTotal],
		['Goods total (USD)', summary.goodsUsd],
		['Tax entered', summary.taxInput],
		['Tax currency', summary.taxInSourceCurrency ? 'source currency' : 'USD'],
		['Tax (USD)', summary.taxUsd],
		['Tax uplift applied to every line (%)', Math.round(summary.upliftPct * 1e6) / 1e6],
		['Target grand total (USD)', summary.targetGrandTotalUsd],
		['Importable grand total (USD)', summary.importableTotalUsd],
		['Residual not expressible at 2 decimals (USD)', summary.residualUsd],
		['Lines', summary.lineCount],
		['Lines adjusted by 1 cent to close rounding', summary.nudgedCount],
		['Zero-price lines left at 0.00', summary.zeroPriceLineCount]
	], { origin: -1 });

	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, importSheet, 'invoices');
	XLSX.utils.book_append_sheet(workbook, auditSheet, 'calculation');

	return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
	toNumber,
	toIsoDate,
	round2,
	normalizeKey,
	detectColumns,
	allocateByLargestRemainder,
	computeLandedCost,
	buildWorkbook,
	COLUMN_MAPPINGS
};
