/**
 * Unit tests for the landed cost calculator.
 *
 * Pure module, no database. These guard the two things that must never silently break:
 * the fairness of the tax allocation, and the exactness of the money after rounding to the
 * 2 decimals that invoice_items.unit_price stores.
 */

const {
	toNumber,
	toIsoDate,
	round2,
	allocateByLargestRemainder,
	computeLandedCost
} = require('../../utils/landedCost');

/** The importer's canonical field -> header mapping, for a file using the standard headers. */
const COLUMN_MAP = {
	invoice_type: 'invoice_type',
	invoice_date: 'invoice_date',
	entity_name: 'entity_name',
	due_date: 'due_date',
	paid_directly: 'paid_directly',
	product_barcode: 'product_barcode',
	quantity: 'quantity',
	unit_price: 'unit_price'
};

/** Build a sheet row in the shape xlsx would hand us. */
function makeRow(barcode, quantity, unit_price, overrides = {}) {
	return {
		invoice_type: 'buy',
		invoice_date: '2026-09-26',
		entity_name: 'Shanghai Baiteng Auto Parts Co.,Ltd.',
		due_date: '2026-09-26',
		paid_directly: 'TRUE',
		product_barcode: barcode,
		quantity,
		unit_price,
		...overrides
	};
}

/**
 * The real invoice from the user's file: 29 lines, 68,053 CNY, including two zero-price
 * refund lines and several qty-100 lines where rounding drift is worst.
 */
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
].map(([barcode, qty, price]) => makeRow(barcode, qty, price));

describe('toNumber', () => {
	it('passes real numbers through', () => {
		expect(toNumber(113)).toBe(113);
		expect(toNumber(20.5)).toBe(20.5);
		expect(toNumber(0)).toBe(0);
	});

	it('strips currency symbols and separators', () => {
		// This is the exact shape the existing importer chokes on: parseFloat("¥113.00") is NaN.
		expect(toNumber('¥113.00')).toBe(113);
		expect(toNumber('$1,234.50')).toBe(1234.5);
		expect(toNumber('  20.50  ')).toBe(20.5);
		expect(toNumber('RMB 5.5')).toBe(5.5);
	});

	it('returns NaN for empty and unparseable values', () => {
		expect(toNumber('')).toBeNaN();
		expect(toNumber(null)).toBeNaN();
		expect(toNumber(undefined)).toBeNaN();
		expect(toNumber('abc')).toBeNaN();
		expect(toNumber('-')).toBeNaN();
		expect(toNumber(Infinity)).toBeNaN();
	});
});

describe('toIsoDate', () => {
	it('formats a Date using local parts, not UTC', () => {
		// A local-midnight date must not slip to the previous day via toISOString().
		expect(toIsoDate(new Date(2026, 8, 26))).toBe('2026-09-26');
	});

	it('converts an Excel serial number', () => {
		// 46291 is 2026-09-26 in Excel's 1900 system.
		expect(toIsoDate(46291)).toBe('2026-09-26');
	});

	it('passes an ISO string through untouched', () => {
		expect(toIsoDate('2026-09-26')).toBe('2026-09-26');
	});

	it('normalises a US-formatted string', () => {
		expect(toIsoDate('9/26/2026')).toBe('2026-09-26');
	});

	it('returns empty for blank input', () => {
		expect(toIsoDate('')).toBe('');
		expect(toIsoDate(null)).toBe('');
	});
});

describe('allocateByLargestRemainder', () => {
	it('sums to the total exactly', () => {
		const parts = allocateByLargestRemainder([1, 1, 1], 100);
		expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
	});

	it('handles a total that cannot divide evenly', () => {
		const parts = allocateByLargestRemainder([1, 1, 1], 10);
		expect(parts.reduce((a, b) => a + b, 0)).toBe(10);
		expect(parts.sort()).toEqual([3, 3, 4]);
	});

	it('gives zero-weight entries nothing', () => {
		const parts = allocateByLargestRemainder([10, 0, 10], 100);
		expect(parts[1]).toBe(0);
		expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
	});

	it('returns all zeros when every weight is zero', () => {
		expect(allocateByLargestRemainder([0, 0], 100)).toEqual([0, 0]);
	});
});

describe('computeLandedCost - validation', () => {
	const rows = [makeRow('A1', 10, 100)];

	it('rejects a rate of zero or less', () => {
		expect(() => computeLandedCost({ rows, columnMap: COLUMN_MAP, rate: 0, taxAmount: 100 }))
			.toThrow(/rate must be a number greater than 0/);
		expect(() => computeLandedCost({ rows, columnMap: COLUMN_MAP, rate: -6.7, taxAmount: 100 }))
			.toThrow(/rate must be a number greater than 0/);
	});

	it('rejects a non-numeric rate', () => {
		expect(() => computeLandedCost({ rows, columnMap: COLUMN_MAP, rate: 'abc', taxAmount: 100 }))
			.toThrow(/rate must be a number/);
	});

	it('rejects a negative tax', () => {
		expect(() => computeLandedCost({ rows, columnMap: COLUMN_MAP, rate: 6.7, taxAmount: -1 }))
			.toThrow(/Total tax must be a number of 0 or more/);
	});

	it('attaches a 400 status code to validation errors', () => {
		try {
			computeLandedCost({ rows, columnMap: COLUMN_MAP, rate: 0, taxAmount: 0 });
			throw new Error('should have thrown');
		} catch (e) {
			expect(e.statusCode).toBe(400);
		}
	});

	it('refuses to allocate tax over an invoice with no value', () => {
		expect(() => computeLandedCost({
			rows: [makeRow('A1', 5, 0), makeRow('A2', 5, 0)],
			columnMap: COLUMN_MAP,
			rate: 6.7,
			taxAmount: 500
		})).toThrow(/no value to allocate against/);
	});

	it('allows a zero-value invoice when there is no tax', () => {
		const { lines } = computeLandedCost({
			rows: [makeRow('A1', 5, 0)],
			columnMap: COLUMN_MAP,
			rate: 6.7,
			taxAmount: 0
		});
		expect(lines[0].finalUnitPrice).toBe(0);
	});

	it('throws when no row is usable', () => {
		expect(() => computeLandedCost({
			rows: [makeRow('A1', 'bad', 'bad')],
			columnMap: COLUMN_MAP,
			rate: 6.7,
			taxAmount: 100
		})).toThrow(/No valid rows/);
	});
});

describe('computeLandedCost - row errors', () => {
	it('reports bad rows with importer-style row numbers and keeps the good ones', () => {
		const rows = [
			makeRow('A1', 10, 100),   // row 2
			makeRow('A2', 0, 100),    // row 3 - zero quantity
			makeRow('A3', 10, -5),    // row 4 - negative price
			makeRow('', 10, 100),     // row 5 - no barcode
			makeRow('A5', 10, 100)    // row 6
		];

		const { lines, errors } = computeLandedCost({
			rows, columnMap: COLUMN_MAP, rate: 6.7, taxAmount: 100
		});

		expect(lines).toHaveLength(2);
		expect(errors).toHaveLength(3);
		expect(errors.map((e) => e.row)).toEqual([3, 4, 5]);
		expect(errors[0].error).toMatch(/Invalid quantity/);
		expect(errors[1].error).toMatch(/Invalid unit_price/);
		expect(errors[2].error).toMatch(/Missing product_barcode/);
	});

	it('silently skips blank spacer rows', () => {
		const rows = [
			makeRow('A1', 10, 100),
			makeRow('', '', ''),
			makeRow('A2', 10, 100)
		];
		const { lines, errors } = computeLandedCost({
			rows, columnMap: COLUMN_MAP, rate: 6.7, taxAmount: 0
		});
		expect(lines).toHaveLength(2);
		expect(errors).toHaveLength(0);
	});
});

describe('computeLandedCost - conversion', () => {
	it('divides by the rate', () => {
		const { lines, summary } = computeLandedCost({
			rows: [makeRow('A1', 10, 67)],
			columnMap: COLUMN_MAP,
			rate: 6.7,
			taxAmount: 0
		});
		expect(lines[0].usdUnitBeforeTax).toBeCloseTo(10, 10);
		expect(lines[0].finalUnitPrice).toBe(10);
		expect(summary.goodsUsd).toBe(100);
	});

	it('converts a tax given in the source currency', () => {
		const { summary } = computeLandedCost({
			rows: [makeRow('A1', 10, 67)],
			columnMap: COLUMN_MAP,
			rate: 6.7,
			taxAmount: 670,
			taxInSourceCurrency: true
		});
		expect(summary.taxUsd).toBe(100);
		expect(summary.upliftPct).toBeCloseTo(100, 6);
	});

	it('parses currency-formatted price cells', () => {
		const { summary } = computeLandedCost({
			rows: [makeRow('A1', 10, '¥113.00')],
			columnMap: COLUMN_MAP,
			rate: 6.7,
			taxAmount: 0
		});
		expect(summary.sourceGoodsTotal).toBe(1130);
	});
});

describe('computeLandedCost - fairness', () => {
	it('gives every line the same tax percentage of its own value', () => {
		const { lines } = computeLandedCost({
			rows: REAL_INVOICE, columnMap: COLUMN_MAP, rate: 6.7, taxAmount: 1000
		});

		const paying = lines.filter((l) => l.lineValueUsd > 0);
		const ratios = paying.map((l) => l.taxAllocatedUsd / l.lineValueUsd);
		for (const r of ratios) {
			expect(r).toBeCloseTo(ratios[0], 10);
		}
	});

	it('taxes an expensive item more per unit than a cheap one', () => {
		// This is the whole point: the flat tax/itemCount split the user rejected would
		// have given these two lines the same dollar amount.
		const { lines } = computeLandedCost({
			rows: REAL_INVOICE, columnMap: COLUMN_MAP, rate: 6.7, taxAmount: 1000
		});

		const expensive = lines.find((l) => l.barcode === 'LR090505');  // ¥188, qty 20
		const cheap = lines.find((l) => l.barcode === 'LR037089');      // ¥5.50, qty 50

		const expensivePerUnit = expensive.taxAllocatedUsd / expensive.quantity;
		const cheapPerUnit = cheap.taxAllocatedUsd / cheap.quantity;

		expect(expensivePerUnit).toBeGreaterThan(cheapPerUnit);
		expect(expensivePerUnit / cheapPerUnit).toBeCloseTo(188 / 5.5, 6);
	});

	it('distributes exactly the tax amount, no more and no less', () => {
		const { lines, summary } = computeLandedCost({
			rows: REAL_INVOICE, columnMap: COLUMN_MAP, rate: 6.7, taxAmount: 1000
		});
		const allocated = lines.reduce((sum, l) => sum + l.taxAllocatedUsd, 0);
		expect(allocated).toBeCloseTo(1000, 6);
		expect(summary.taxUsd).toBe(1000);
	});

	it('leaves zero-price refund lines at zero cost', () => {
		const { lines, summary } = computeLandedCost({
			rows: REAL_INVOICE, columnMap: COLUMN_MAP, rate: 6.7, taxAmount: 1000
		});
		const free = lines.filter((l) => l.sourceUnitPrice === 0);
		expect(free).toHaveLength(2);
		for (const l of free) {
			expect(l.finalUnitPrice).toBe(0);
			expect(l.taxAllocatedUsd).toBe(0);
			expect(l.nudged).toBe(false);
		}
		expect(summary.zeroPriceLineCount).toBe(2);
	});
});

describe('computeLandedCost - money exactness', () => {
	it('matches the target total on the real invoice', () => {
		const { summary } = computeLandedCost({
			rows: REAL_INVOICE, columnMap: COLUMN_MAP, rate: 6.7, taxAmount: 1000
		});

		expect(summary.sourceGoodsTotal).toBe(68053);
		expect(summary.importableTotalUsd).toBe(summary.targetGrandTotalUsd);
		expect(summary.residualUsd).toBe(0);
	});

	it('keeps the sum of line totals equal to the reported importable total', () => {
		const { lines, summary } = computeLandedCost({
			rows: REAL_INVOICE, columnMap: COLUMN_MAP, rate: 6.7, taxAmount: 1000
		});
		const sum = round2(lines.reduce((a, l) => a + l.finalUnitPrice * l.quantity, 0));
		expect(sum).toBe(summary.importableTotalUsd);
	});

	it('never moves a unit price more than 1.5 cents from its exact target', () => {
		const { lines } = computeLandedCost({
			rows: REAL_INVOICE, columnMap: COLUMN_MAP, rate: 6.7, taxAmount: 1000
		});
		for (const l of lines) {
			const exactUnit = l.targetLineUsd / l.quantity;
			expect(Math.abs(l.finalUnitPrice - exactUnit)).toBeLessThanOrEqual(0.015 + 1e-9);
		}
	});

	it('emits prices that are exactly 2 decimals', () => {
		const { lines } = computeLandedCost({
			rows: REAL_INVOICE, columnMap: COLUMN_MAP, rate: 6.7, taxAmount: 1000
		});
		for (const l of lines) {
			expect(Math.round(l.finalUnitPrice * 100)).toBeCloseTo(l.finalUnitPrice * 100, 9);
			expect(l.finalUnitPrice).toBeGreaterThanOrEqual(0);
		}
	});

	it('stays exact across a wide range of rates and tax amounts', () => {
		for (const rate of [1, 6.7, 7.1, 7.2345, 0.5]) {
			for (const tax of [0, 1, 137.77, 1000, 9999.99]) {
				const { summary } = computeLandedCost({
					rows: REAL_INVOICE, columnMap: COLUMN_MAP, rate, taxAmount: tax
				});
				// The residual is whatever 2dp unit prices cannot express. With this many
				// distinct quantities it should always close completely.
				expect(Math.abs(summary.residualUsd)).toBeLessThanOrEqual(0.01);
			}
		}
	});

	it('always reports the residual honestly on randomly generated invoices', () => {
		// The residual cannot always be driven to zero: an invoice of 3 lines with
		// quantities 56/69/82 can only move its total in those steps, so some targets are
		// simply not expressible in 2-decimal unit prices. What must ALWAYS hold is that
		// the reported importable total equals the target minus the reported residual --
		// the tool may be unable to close a gap, but it must never hide one.
		for (let seed = 0; seed < 200; seed++) {
			const rows = [];
			const lineCount = 3 + (seed % 25);
			for (let i = 0; i < lineCount; i++) {
				const qty = 1 + ((seed * 7 + i * 13) % 120);
				const price = ((seed * 31 + i * 17) % 20000) / 100;
				rows.push(makeRow(`P${i}`, qty, price));
			}
			const tax = ((seed * 997) % 500000) / 100;

			const { summary, lines } = computeLandedCost({
				rows, columnMap: COLUMN_MAP, rate: 6.7 + (seed % 5) * 0.11, taxAmount: tax
			});

			expect(lines.every((l) => l.finalUnitPrice >= 0)).toBe(true);

			// Recomputed independently of the module's own summing.
			const sum = round2(lines.reduce((a, l) => a + l.finalUnitPrice * l.quantity, 0));
			expect(sum).toBe(summary.importableTotalUsd);
			expect(round2(summary.targetGrandTotalUsd - summary.residualUsd))
				.toBe(summary.importableTotalUsd);

			// Distortion stays bounded even when the residual cannot close.
			for (const l of lines) {
				const exactUnit = l.targetLineUsd / l.quantity;
				expect(Math.abs(l.finalUnitPrice - exactUnit)).toBeLessThanOrEqual(0.015 + 1e-9);
			}
		}
	});

	it('closes completely on realistic invoices that include small-quantity lines', () => {
		// A residual only survives when every line has a large quantity. Real shipments
		// carry a mix, which always gives the search a fine enough step to land exactly.
		for (let seed = 0; seed < 200; seed++) {
			const rows = [];
			const lineCount = 8 + (seed % 20);
			for (let i = 0; i < lineCount; i++) {
				// Mix in quantities of 1-5 the way a real parts invoice does.
				const qty = i % 4 === 0
					? 1 + ((seed + i) % 5)
					: 1 + ((seed * 7 + i * 13) % 120);
				const price = ((seed * 31 + i * 17) % 20000) / 100;
				rows.push(makeRow(`P${i}`, qty, price));
			}
			const tax = ((seed * 997) % 500000) / 100;

			const { summary } = computeLandedCost({
				rows, columnMap: COLUMN_MAP, rate: 6.7 + (seed % 5) * 0.11, taxAmount: tax
			});

			expect(summary.residualUsd).toBe(0);
		}
	});

	it('reports a residual it cannot close rather than hiding it', () => {
		// One line, qty 3: the total can only move in 3-cent steps, so some targets are
		// unreachable. The module must surface that instead of silently absorbing it.
		const { summary } = computeLandedCost({
			rows: [makeRow('A1', 3, 100)],
			columnMap: COLUMN_MAP,
			rate: 3,
			taxAmount: 0.01
		});
		expect(summary.importableTotalUsd).toBe(
			round2(summary.targetGrandTotalUsd - summary.residualUsd)
		);
	});

	it('does not nudge fractional quantities', () => {
		const { lines } = computeLandedCost({
			rows: [makeRow('A1', 2.5, 100), makeRow('A2', 10, 100)],
			columnMap: COLUMN_MAP,
			rate: 6.7,
			taxAmount: 13.33
		});
		expect(lines[0].nudged).toBe(false);
	});
});

describe('computeLandedCost - summary', () => {
	it('reports the uplift that explains the whole result', () => {
		const { summary, lines } = computeLandedCost({
			rows: REAL_INVOICE, columnMap: COLUMN_MAP, rate: 6.7, taxAmount: 1000
		});

		expect(summary.goodsUsd).toBe(round2(68053 / 6.7));
		expect(summary.upliftPct).toBeCloseTo((1000 / (68053 / 6.7)) * 100, 6);
		expect(summary.lineCount).toBe(29);
		expect(summary.errorCount).toBe(0);

		// Applying the uplift by hand reproduces any line's target.
		const l = lines.find((x) => x.barcode === 'LR018273'); // qty 8, ¥105
		const byHand = (8 * 105 / 6.7) * (1 + summary.upliftPct / 100);
		expect(l.landedLineUsd).toBeCloseTo(byHand, 6);
	});

	it('shares add up to 100 percent', () => {
		const { lines } = computeLandedCost({
			rows: REAL_INVOICE, columnMap: COLUMN_MAP, rate: 6.7, taxAmount: 1000
		});
		const total = lines.reduce((a, l) => a + l.sharePct, 0);
		expect(total).toBeCloseTo(100, 6);
	});
});
