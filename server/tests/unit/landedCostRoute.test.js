/**
 * HTTP-level tests for POST /api/tools/landed-cost.
 *
 * Covers the seams the pure-module tests cannot reach: the admin gate, multer's file
 * handling, and whether the form fields survive the sanitizeInput middleware.
 *
 * The database is mocked, so these run without a live Postgres.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');

// requireAdmin reads users.is_admin; everything else on this route is DB-free.
let mockIsAdmin = true;
jest.mock('../../db', () => ({
	query: jest.fn(async () => ({ recordset: [{ is_admin: mockIsAdmin }] })),
	getPool: jest.fn(async () => ({ connect: jest.fn() }))
}));

const apiRouter = require('../../routes/api');

const JWT_SECRET = process.env.JWT_SECRET;

function makeApp() {
	const app = express();
	app.use('/api', apiRouter);
	return app;
}

function token(userId = 1) {
	return jwt.sign({ userId, email: 'admin@example.com' }, JWT_SECRET, { expiresIn: '1h' });
}

/** A small supplier invoice as an xlsx buffer. */
function sourceFile(rows = [['LR090505', 20, 188], ['LR037089', 50, 5.5], ['LR018273', 8, 105]]) {
	const sheetRows = rows.map(([barcode, quantity, unit_price]) => ({
		invoice_type: 'buy',
		invoice_date: new Date(2026, 8, 26),
		entity_name: 'Shanghai Baiteng Auto Parts Co.,Ltd.',
		due_date: new Date(2026, 8, 26),
		paid_directly: 'TRUE',
		product_barcode: barcode,
		quantity,
		unit_price
	}));
	const ws = XLSX.utils.json_to_sheet(sheetRows);
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, 'invoices');
	return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const ENDPOINT = '/api/tools/landed-cost';

beforeEach(() => {
	mockIsAdmin = true;
});

describe('POST /api/tools/landed-cost - access control', () => {
	it('rejects an unauthenticated request', async () => {
		const res = await request(makeApp())
			.post(ENDPOINT)
			.attach('file', sourceFile(), 'invoice.xlsx')
			.field('rate', '6.7')
			.field('tax', '1000');

		expect(res.status).toBe(401);
	});

	it('rejects an invalid token', async () => {
		const res = await request(makeApp())
			.post(ENDPOINT)
			.set('Authorization', 'Bearer not-a-real-token')
			.attach('file', sourceFile(), 'invoice.xlsx')
			.field('rate', '6.7')
			.field('tax', '1000');

		expect(res.status).toBe(401);
	});

	it('rejects a non-admin user', async () => {
		mockIsAdmin = false;
		const res = await request(makeApp())
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.attach('file', sourceFile(), 'invoice.xlsx')
			.field('rate', '6.7')
			.field('tax', '1000');

		expect(res.status).toBe(403);
		expect(res.body.error).toMatch(/Admin access required/);
	});

	it('allows an admin user', async () => {
		const res = await request(makeApp())
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.attach('file', sourceFile(), 'invoice.xlsx')
			.field('rate', '6.7')
			.field('tax', '1000');

		expect(res.status).toBe(200);
	});
});

describe('POST /api/tools/landed-cost - preview', () => {
	it('returns lines and a summary', async () => {
		const res = await request(makeApp())
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.attach('file', sourceFile(), 'invoice.xlsx')
			.field('rate', '6.7')
			.field('tax', '1000')
			.field('format', 'json');

		expect(res.status).toBe(200);
		expect(res.body.lines).toHaveLength(3);
		expect(res.body.summary.lineCount).toBe(3);
		expect(res.body.summary.goodsUsd).toBeCloseTo((20 * 188 + 50 * 5.5 + 8 * 105) / 6.7, 2);
		expect(res.body.summary.taxUsd).toBe(1000);
	});

	it('does not leak the raw sheet row into the response', async () => {
		const res = await request(makeApp())
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.attach('file', sourceFile(), 'invoice.xlsx')
			.field('rate', '6.7')
			.field('tax', '1000')
			.field('format', 'json');

		expect(res.body.lines[0].raw).toBeUndefined();
	});

	it('accepts a decimal rate through the sanitize middleware intact', async () => {
		// sanitizeInput runs validator.escape over string body fields; make sure a rate
		// like 6.7 still parses afterwards.
		const res = await request(makeApp())
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.attach('file', sourceFile(), 'invoice.xlsx')
			.field('rate', '7.1234')
			.field('tax', '137.77')
			.field('format', 'json');

		expect(res.status).toBe(200);
		expect(res.body.summary.rate).toBe(7.1234);
		expect(res.body.summary.taxUsd).toBe(137.77);
	});

	it('honours a tax given in the source currency', async () => {
		const res = await request(makeApp())
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.attach('file', sourceFile(), 'invoice.xlsx')
			.field('rate', '6.7')
			.field('tax', '6700')
			.field('taxInSourceCurrency', 'true')
			.field('format', 'json');

		expect(res.status).toBe(200);
		expect(res.body.summary.taxUsd).toBe(1000);
	});
});

describe('POST /api/tools/landed-cost - validation', () => {
	it('rejects a missing file', async () => {
		const res = await request(makeApp())
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.field('rate', '6.7')
			.field('tax', '1000');

		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/No file uploaded/);
	});

	it('rejects a rate of zero', async () => {
		const res = await request(makeApp())
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.attach('file', sourceFile(), 'invoice.xlsx')
			.field('rate', '0')
			.field('tax', '1000');

		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/rate must be a number greater than 0/);
	});

	it('rejects a negative tax', async () => {
		const res = await request(makeApp())
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.attach('file', sourceFile(), 'invoice.xlsx')
			.field('rate', '6.7')
			.field('tax', '-5');

		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/Total tax must be a number of 0 or more/);
	});

	it('reports which required columns are missing', async () => {
		const ws = XLSX.utils.json_to_sheet([{ invoice_type: 'buy', entity_name: 'X' }]);
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, 'invoices');
		const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

		const res = await request(makeApp())
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.attach('file', buffer, 'invoice.xlsx')
			.field('rate', '6.7')
			.field('tax', '1000');

		expect(res.status).toBe(400);
		expect(res.body.requiredColumns).toEqual(['product_barcode', 'quantity', 'unit_price']);
		expect(res.body.availableColumns).toContain('invoice_type');
	});

	it('rejects a non-Excel file', async () => {
		const res = await request(makeApp())
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.attach('file', Buffer.from('not a spreadsheet'), 'notes.txt')
			.field('rate', '6.7')
			.field('tax', '1000');

		expect(res.status).toBeGreaterThanOrEqual(400);
	});
});

describe('POST /api/tools/landed-cost - xlsx download', () => {
	it('returns a spreadsheet with an attachment filename', async () => {
		const res = await request(makeApp())
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.attach('file', sourceFile(), 'invoice.xlsx')
			.field('rate', '6.7')
			.field('tax', '1000')
			.field('format', 'xlsx')
			.buffer()
			.parse((res, cb) => {
				const chunks = [];
				res.on('data', (c) => chunks.push(c));
				res.on('end', () => cb(null, Buffer.concat(chunks)));
			});

		expect(res.status).toBe(200);
		expect(res.headers['content-type']).toMatch(/spreadsheetml/);
		expect(res.headers['content-disposition']).toMatch(/attachment; filename="invoice_landed_cost_/);

		const wb = XLSX.read(res.body, { type: 'buffer' });
		expect(wb.SheetNames[0]).toBe('invoices');
		expect(wb.SheetNames).toContain('calculation');

		const rows = XLSX.utils.sheet_to_json(wb.Sheets['invoices'], { raw: false, defval: '' });
		expect(rows).toHaveLength(3);
		for (const row of rows) {
			expect(Number.isNaN(parseFloat(String(row.unit_price)))).toBe(false);
			expect(String(row.invoice_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	it('produces a file whose total matches the preview', async () => {
		const app = makeApp();

		const preview = await request(app)
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.attach('file', sourceFile(), 'invoice.xlsx')
			.field('rate', '6.7')
			.field('tax', '1000')
			.field('format', 'json');

		const download = await request(app)
			.post(ENDPOINT)
			.set('Authorization', `Bearer ${token()}`)
			.attach('file', sourceFile(), 'invoice.xlsx')
			.field('rate', '6.7')
			.field('tax', '1000')
			.field('format', 'xlsx')
			.buffer()
			.parse((res, cb) => {
				const chunks = [];
				res.on('data', (c) => chunks.push(c));
				res.on('end', () => cb(null, Buffer.concat(chunks)));
			});

		const wb = XLSX.read(download.body, { type: 'buffer' });
		const rows = XLSX.utils.sheet_to_json(wb.Sheets['invoices'], { raw: false, defval: '' });

		const total = rows.reduce(
			(sum, r) => sum + Math.round(parseFloat(r.quantity) * parseFloat(r.unit_price) * 100) / 100,
			0
		);
		expect(Math.round(total * 100) / 100).toBe(preview.body.summary.importableTotalUsd);
	});
});
