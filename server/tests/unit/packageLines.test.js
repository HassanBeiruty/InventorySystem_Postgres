const {
	validatePackageLines,
	resolvePackageNames,
	normalizePackageLines,
	packageColumnValues,
} = require('../../utils/packageLines');

// Security Camera Kit: 2 cameras + 1 NVR per package, $100.00 per package, sold x2.
function kitLines(overrides = {}) {
	const pkg = { package_id: 7, package_name: 'Security Camera Kit', package_qty: 2, package_price: 100 };
	return [
		{ product_id: '1', quantity: 4, unit_price: 45, is_private_price: true, private_price_amount: 30, total_price: 120, ...pkg, ...overrides },
		{ product_id: '2', quantity: 2, unit_price: 60, is_private_price: true, private_price_amount: 40, total_price: 80, ...pkg },
	];
}

const plainLine = { product_id: '9', quantity: 3, unit_price: 4.5, is_private_price: false, private_price_amount: null, total_price: 13.5 };

describe('validatePackageLines', () => {
	test('accepts an invoice without packages', () => {
		expect(validatePackageLines('sell', [plainLine])).toBeNull();
		expect(validatePackageLines('buy', [plainLine])).toBeNull();
	});

	test('accepts a consistent package next to ordinary lines', () => {
		expect(validatePackageLines('sell', [...kitLines(), plainLine])).toBeNull();
	});

	test('accepts totals that carry floating-point noise', () => {
		const pkg = { package_id: 3, package_name: 'Router Pack', package_qty: 1, package_price: 55 };
		const lines = [
			{ quantity: 1, is_private_price: true, total_price: 43.28, ...pkg },
			{ quantity: 1, is_private_price: true, total_price: 7.2, ...pkg },
			{ quantity: 2, is_private_price: true, total_price: 2.26 * 2, ...pkg }, // 4.5200000000000005
		];
		expect(validatePackageLines('sell', lines)).toBeNull();
	});

	test('rejects package lines on a buy invoice', () => {
		expect(validatePackageLines('buy', kitLines())).toMatch(/only be sold on sell invoices/);
	});

	test('rejects lines that do not add up to price x qty', () => {
		const lines = kitLines();
		lines[1].total_price = 79.99;
		expect(validatePackageLines('sell', lines)).toMatch(/add up to 199\.99, but the package total is 200\.00/);
	});

	test('rejects lines that disagree on the package qty or price', () => {
		expect(validatePackageLines('sell', kitLines({ package_qty: 3 }))).toMatch(/disagree/);
		expect(validatePackageLines('sell', kitLines({ package_price: 90 }))).toMatch(/disagree/);
		expect(validatePackageLines('sell', kitLines({ package_name: 'Other' }))).toMatch(/disagree/);
	});

	test('rejects a line quantity that is not a multiple of the package qty', () => {
		expect(validatePackageLines('sell', kitLines({ quantity: 3, total_price: 90 }))).toMatch(/multiple of the package quantity \(2\)/);
	});

	test('rejects a package line without the private price', () => {
		expect(validatePackageLines('sell', kitLines({ is_private_price: false }))).toMatch(/private price/);
	});

	test('rejects a missing name, zero qty or zero price', () => {
		expect(validatePackageLines('sell', kitLines({ package_name: '  ' }))).toMatch(/missing its name/);
		expect(validatePackageLines('sell', [{ ...kitLines()[0], package_qty: 0 }])).toMatch(/quantity of at least 1/);
		expect(validatePackageLines('sell', [{ ...kitLines()[0], package_price: 0 }])).toMatch(/price above 0/);
	});

	test('rejects an invalid package id', () => {
		expect(validatePackageLines('sell', kitLines({ package_id: 'abc' }))).toMatch(/invalid package id/);
	});

	test('checks each package separately', () => {
		const other = { package_id: 8, package_name: 'Cable Bundle', package_qty: 1, package_price: 9 };
		const lines = [
			...kitLines(),
			{ quantity: 1, is_private_price: true, total_price: 5, ...other },
			{ quantity: 1, is_private_price: true, total_price: 4, ...other },
		];
		expect(validatePackageLines('sell', lines)).toBeNull();
		lines[3].total_price = 3;
		expect(validatePackageLines('sell', lines)).toMatch(/Cable Bundle/);
	});
});

describe('package snapshot helpers', () => {
	const fakeDb = (rows) => ({
		calls: [],
		async query(sql, params) {
			this.calls.push(params);
			return { rows: rows.filter((r) => params[0].includes(r.id)) };
		},
	});

	test('resolvePackageNames reads names from the packages table', async () => {
		const db = fakeDb([{ id: 7, name: 'Security Camera Kit' }]);
		const names = await resolvePackageNames(db, [...kitLines(), plainLine]);
		expect(names.get(7)).toBe('Security Camera Kit');
		expect(db.calls).toEqual([[[7]]]);
	});

	test('resolvePackageNames prefers the invoice snapshot when editing', async () => {
		const db = fakeDb([{ id: 7, name: 'Renamed Kit' }]);
		const names = await resolvePackageNames(db, kitLines(), [{ package_id: 7, package_name: 'Security Camera Kit' }]);
		expect(names.get(7)).toBe('Security Camera Kit');
		expect(db.calls).toEqual([]);
	});

	test('resolvePackageNames skips the database when there are no packages', async () => {
		const db = fakeDb([]);
		expect((await resolvePackageNames(db, [plainLine])).size).toBe(0);
		expect(db.calls).toEqual([]);
	});

	test('normalizePackageLines stamps name and note on package lines only', () => {
		const lines = [...kitLines({ package_name: 'client echo', private_price_note: 'anything' }), { ...plainLine, private_price_note: 'keep' }];
		normalizePackageLines(lines, new Map([[7, 'Security Camera Kit']]));
		expect(lines[0].package_name).toBe('Security Camera Kit');
		expect(lines[0].private_price_note).toBe('Package: Security Camera Kit');
		expect(lines[2].private_price_note).toBe('keep');
	});

	test('packageColumnValues returns the 4 snapshot columns, or nulls', () => {
		expect(packageColumnValues(kitLines()[0])).toEqual([7, 'Security Camera Kit', 2, 100]);
		expect(packageColumnValues(plainLine)).toEqual([null, null, null, null]);
	});
});
