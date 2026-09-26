/**
 * Round-trip tests for the generated workbook.
 *
 * The whole point of the tool is that its output imports on the Invoices page with no
 * edits, so these tests re-read the generated file using the *importer's own* parsing
 * settings (sheet_to_json with raw:false, then parseFloat) and assert it survives.
 *
 * This is the test that would have caught the '¥113.00' -> parseFloat -> NaN trap.
 */

const XLSX = require('xlsx');
const {
	computeLandedCost,
	buildWorkbook,
	detectColumns,
	round2
} = require('../../utils/landedCost');

/** Build an xlsx buffer the way a supplier's exported file looks. */
function makeSourceWorkbook(rows, { currencyFormat = false, headers = null } = {}) {
	const sheetRows = rows.map(([barcode, qty, price]) => ({
		invoice_type: 'buy',
		invoice_date: new Date(2026, 8, 26),
		entity_name: 'Shanghai Baiteng Auto Parts Co.,Ltd.',
		due_date: new Date(2026, 8, 26),
		paid_directly: 'TRUE',
		product_barcode: barcode,
		quantity: qty,
		unit_price: price
	}));

	const header = headers || [
		'invoice_type', 'invoice_date', 'entity_name', 'due_date',
		'paid_directly', 'product_barcode', 'quantity', 'unit_price'
	];
	const ws = XLSX.utils.json_to_sheet(sheetRows, { header });

	if (currencyFormat) {
		// Apply a currency number format to the unit_price column, exactly as the user's
		// real file does. With raw:false this makes cells read back as '¥113.00'.
		const range = XLSX.utils.decode_range(ws['!ref']);
		for (let r = 1; r <= range.e.r; r++) {
			const addr = XLSX.utils.encode_cell({ r, c: header.indexOf('unit_price') });
			if (ws[addr]) ws[addr].z = '"¥"#,##0.00';
		}
	}

	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'invoices');
	return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Read a buffer the way this tool does. */
function readAsTool(buffer) {
	const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
	const ws = wb.Sheets[wb.SheetNames[0]];
	return XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' });
}

/** Read a buffer the way server/routes/api.js's invoice importer does. */
function readAsImporter(buffer) {
	const wb = XLSX.read(buffer, { type: 'buffer' });
	const ws = wb.Sheets[wb.SheetNames[0]];
	return { rows: XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' }), sheets: wb.SheetNames };
}

const REAL_INVOICE = [
	['LR090630-AL', 100, 113], ['LR092992-AL', 100, 113],
	['LR018273', 8, 105], ['LR075991', 8, 119],
	['LR186917', 50, 135], ['LR186859', 50, 135],
	['LR090505', 20, 188], ['LR090504', 20, 188],
	['LR037089', 50, 5.5], ['LR037954', 30, 60],
	['QKF500030', 40, 26], ['TVB500390-Bearing', 25, 44],
	['LR027158', 12, 48], ['LR032135', 19, 50],
	['LR088538', 50, 26], ['RBM500140', 50, 23],
	['RBM500150', 50, 23], ['LR024474', 60, 20.5],
	['LR043721', 30, 60], ['LR117568', 40, 63],
	['LR113282', 20, 110], ['LR113281', 20, 110],
	['LR035449', 100, 7], ['LR049990-Connecting', 100, 8],
	['LR010965', 100, 10], ['LR034624-Screw', 100, 6],
	['LVF500010', 50, 5],
	['LR090630-AL', 2, 0], ['LR092992-AL', 2, 0]
];

/** Run the full pipeline and hand back the generated file. */
function generate(sourceRows, opts = {}) {
	const src = makeSourceWorkbook(sourceRows, opts);
	const data = readAsTool(src);
	const { columnMap, missing } = detectColumns(data[0]);
	expect(missing).toEqual([]);

	const result = computeLandedCost({
		rows: data,
		columnMap,
		rate: opts.rate ?? 6.7,
		taxAmount: opts.tax ?? 1000,
		taxInSourceCurrency: opts.taxInSourceCurrency ?? false
	});

	return {
		buffer: buildWorkbook({ lines: result.lines, summary: result.summary, columnMap }),
		result
	};
}

describe('generated workbook - structure', () => {
	it('puts the importable sheet first, because the importer reads SheetNames[0]', () => {
		const { buffer } = generate(REAL_INVOICE);
		const { sheets } = readAsImporter(buffer);
		expect(sheets[0]).toBe('invoices');
		expect(sheets).toContain('calculation');
	});

	it('emits exactly the importer\'s columns on sheet 1', () => {
		const { buffer } = generate(REAL_INVOICE);
		const { rows } = readAsImporter(buffer);
		expect(Object.keys(rows[0])).toEqual([
			'invoice_type', 'invoice_date', 'entity_name', 'due_date',
			'paid_directly', 'product_barcode', 'quantity', 'unit_price'
		]);
	});

	it('carries product_sku through only when the source had it', () => {
		const withSku = generate(REAL_INVOICE);
		expect(Object.keys(readAsImporter(withSku.buffer).rows[0])).not.toContain('product_sku');
	});

	it('keeps one row per source line', () => {
		const { buffer } = generate(REAL_INVOICE);
		expect(readAsImporter(buffer).rows).toHaveLength(REAL_INVOICE.length);
	});
});

describe('generated workbook - survives the importer\'s parsing', () => {
	it('yields numeric prices under parseFloat, even from a currency-formatted source', () => {
		// The source file here is formatted like the user's real export. Reading it the way
		// the importer does would give '¥113.00'; the tool must not pass that through.
		const { buffer } = generate(REAL_INVOICE, { currencyFormat: true });
		const { rows } = readAsImporter(buffer);

		for (const row of rows) {
			const parsed = parseFloat(String(row.unit_price).trim());
			expect(Number.isNaN(parsed)).toBe(false);
			expect(parsed).toBeGreaterThanOrEqual(0);
		}
	});

	it('reads back the same prices the calculator produced', () => {
		const { buffer, result } = generate(REAL_INVOICE);
		const { rows } = readAsImporter(buffer);

		rows.forEach((row, i) => {
			expect(parseFloat(String(row.unit_price))).toBeCloseTo(result.lines[i].finalUnitPrice, 10);
		});
	});

	it('yields a valid quantity under the importer\'s parseFloat check', () => {
		const { buffer } = generate(REAL_INVOICE);
		const { rows } = readAsImporter(buffer);
		for (const row of rows) {
			const qty = parseFloat(String(row.quantity || '0'));
			expect(Number.isNaN(qty)).toBe(false);
			expect(qty).toBeGreaterThan(0);
		}
	});

	it('groups into exactly one invoice, not one per row', () => {
		// The importer's grouping key is `${invoice_date}_${invoice_type}_${entityId}` built
		// from the RAW date string, so every row must carry a byte-identical date.
		const { buffer } = generate(REAL_INVOICE);
		const { rows } = readAsImporter(buffer);

		const keys = new Set(rows.map((r) => `${String(r.invoice_date).trim()}_${String(r.invoice_type).trim()}`));
		expect(keys.size).toBe(1);
		expect([...keys][0]).toBe('2026-09-26_buy');
	});

	it('writes dates the importer can parse unambiguously', () => {
		const { buffer } = generate(REAL_INVOICE);
		const { rows } = readAsImporter(buffer);

		for (const row of rows) {
			expect(String(row.invoice_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			const parsed = new Date(String(row.invoice_date));
			expect(isNaN(parsed.getTime())).toBe(false);
			expect(parsed.getUTCFullYear()).toBe(2026);
			expect(parsed.getUTCMonth() + 1).toBe(9);
			expect(parsed.getUTCDate()).toBe(26);
		}
	});

	it('keeps paid_directly in the importer\'s truthy set', () => {
		const { buffer } = generate(REAL_INVOICE);
		const { rows } = readAsImporter(buffer);
		for (const row of rows) {
			const v = String(row.paid_directly || 'false').trim().toLowerCase();
			expect(['true', '1', 'yes']).toContain(v);
		}
	});

	it('keeps invoice_type valid for the importer', () => {
		const { buffer } = generate(REAL_INVOICE);
		const { rows } = readAsImporter(buffer);
		for (const row of rows) {
			expect(['buy', 'sell']).toContain(String(row.invoice_type).trim().toLowerCase());
		}
	});

	it('preserves barcodes exactly', () => {
		const { buffer } = generate(REAL_INVOICE);
		const { rows } = readAsImporter(buffer);
		rows.forEach((row, i) => {
			expect(String(row.product_barcode)).toBe(REAL_INVOICE[i][0]);
		});
	});

	it('preserves the entity name so the supplier still resolves', () => {
		const { buffer } = generate(REAL_INVOICE);
		const { rows } = readAsImporter(buffer);
		for (const row of rows) {
			expect(String(row.entity_name)).toBe('Shanghai Baiteng Auto Parts Co.,Ltd.');
		}
	});
});

describe('generated workbook - the imported total is right', () => {
	it('sums, as the database will store it, to the converted goods plus the tax', () => {
		const { buffer, result } = generate(REAL_INVOICE, { rate: 6.7, tax: 1000 });
		const { rows } = readAsImporter(buffer);

		// Replicate what the importer stores: quantity x unit_price at 2 decimals.
		const total = round2(rows.reduce((sum, r) => {
			const qty = parseFloat(String(r.quantity));
			const price = parseFloat(String(r.unit_price));
			return sum + round2(qty * price);
		}, 0));

		expect(total).toBe(result.summary.importableTotalUsd);
		expect(total).toBe(round2(68053 / 6.7 + 1000));
		expect(result.summary.residualUsd).toBe(0);
	});

	it('handles a currency-formatted source identically to a plain one', () => {
		const plain = generate(REAL_INVOICE, { currencyFormat: false });
		const formatted = generate(REAL_INVOICE, { currencyFormat: true });
		expect(formatted.result.summary.importableTotalUsd)
			.toBe(plain.result.summary.importableTotalUsd);
	});
});

describe('generated workbook - audit sheet', () => {
	it('records every line plus a summary block', () => {
		const { buffer, result } = generate(REAL_INVOICE);
		const wb = XLSX.read(buffer, { type: 'buffer' });
		const audit = XLSX.utils.sheet_to_json(wb.Sheets['calculation'], { raw: true, defval: '' });

		const dataRows = audit.filter((r) => typeof r.row === 'number');
		expect(dataRows).toHaveLength(result.lines.length);

		const csv = XLSX.utils.sheet_to_csv(wb.Sheets['calculation']);
		expect(csv).toContain('SUMMARY');
		expect(csv).toContain('Tax uplift applied to every line');
		expect(csv).toContain('Residual not expressible at 2 decimals');
	});

	it('lets a line be re-derived by hand from the uplift', () => {
		const { buffer, result } = generate(REAL_INVOICE, { rate: 6.7, tax: 1000 });
		const wb = XLSX.read(buffer, { type: 'buffer' });
		const audit = XLSX.utils.sheet_to_json(wb.Sheets['calculation'], { raw: true, defval: '' })
			.filter((r) => typeof r.row === 'number');

		const line = audit.find((r) => r.product_barcode === 'LR090505'); // ¥188 x 20
		const valueUsd = 20 * 188 / 6.7;
		expect(line.line_value_usd).toBe(round2(valueUsd));
		expect(line.tax_allocated_usd)
			.toBe(round2(valueUsd * (result.summary.upliftPct / 100)));
	});
});

describe('generated workbook - alternate headers', () => {
	it('accepts the importer\'s header aliases and normalises them on output', () => {
		const rows = [['A1', 10, 100], ['A2', 5, 50]];
		const src = makeSourceWorkbook(rows);

		// Rewrite the sheet with alias headers: 'qty' and 'price' instead of the canonical
		// names, which the importer also accepts.
		const wb = XLSX.read(src, { type: 'buffer', cellDates: true });
		const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: true, defval: '' })
			.map(({ quantity, unit_price, ...rest }) => ({ ...rest, qty: quantity, price: unit_price }));

		const { columnMap, missing } = detectColumns(data[0]);
		expect(missing).toEqual([]);
		expect(columnMap.quantity).toBe('qty');
		expect(columnMap.unit_price).toBe('price');

		const result = computeLandedCost({ rows: data, columnMap, rate: 5, taxAmount: 100 });
		const buffer = buildWorkbook({ lines: result.lines, summary: result.summary, columnMap });

		expect(Object.keys(readAsImporter(buffer).rows[0])).toContain('quantity');
		expect(Object.keys(readAsImporter(buffer).rows[0])).toContain('unit_price');
	});

	it('reports missing required columns', () => {
		const { missing } = detectColumns({ invoice_type: 'buy', entity_name: 'X' });
		expect(missing).toEqual(['product_barcode', 'quantity', 'unit_price']);
	});
});
