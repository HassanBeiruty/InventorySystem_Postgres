const { sanitizeInput } = require('../../middleware/security');

function run(req) {
	let called = false;
	sanitizeInput(req, {}, () => { called = true; });
	return called;
}

describe('sanitizeInput', () => {
	test('stores body text exactly as typed (no HTML entities)', () => {
		const req = {
			query: {},
			body: {
				name: "O'Neil & Sons 1/2",
				address: 'Bldg 3/B, "Main" St',
				items: [{ private_price_note: "Package: Tom's Kit" }],
			},
		};
		expect(run(req)).toBe(true);
		expect(req.body.name).toBe("O'Neil & Sons 1/2");
		expect(req.body.address).toBe('Bldg 3/B, "Main" St');
		expect(req.body.items[0].private_price_note).toBe("Package: Tom's Kit");
	});

	test('still strips HTML tags from query parameters', () => {
		const req = { query: { search: 'kit<script>alert(1)</script>' }, body: {} };
		expect(run(req)).toBe(true);
		expect(req.query.search).not.toMatch(/<script>/i);
	});
});
