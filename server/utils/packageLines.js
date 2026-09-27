/**
 * Consistency guard for sell-invoice lines that came from a named package.
 *
 * A package line is an ordinary invoice line with a private price; the package_* columns only
 * record which package it came from. Stock, stock movements, average cost and profit never read
 * them. This check only makes sure a saved package agrees with itself: every line of one package
 * carries the same package name/qty/price, uses the private price, and together the lines add
 * up to exactly package price x package qty.
 */

function hasPackage(item) {
	return item.package_id !== undefined && item.package_id !== null && item.package_id !== '';
}

/** Money to integer cents without the floating-point drift of x * 100. */
function toCents(n) {
	return Math.round((Number(n) + Number.EPSILON) * 100);
}

/**
 * @param {'buy'|'sell'} invoiceType
 * @param {object[]} items  Invoice lines as sent by the client.
 * @returns {string|null}   An error message for a 400 response, or null when the lines are valid.
 */
function validatePackageLines(invoiceType, items) {
	const packaged = (items || []).filter(hasPackage);
	if (packaged.length === 0) return null;

	if (invoiceType !== 'sell') {
		return 'Packages can only be sold on sell invoices';
	}

	const groups = new Map();
	for (const item of packaged) {
		const packageId = Number(item.package_id);
		if (!Number.isInteger(packageId) || packageId <= 0) {
			return 'An invoice line has an invalid package id';
		}
		if (!groups.has(packageId)) groups.set(packageId, []);
		groups.get(packageId).push(item);
	}

	for (const [packageId, lines] of groups) {
		const name = String(lines[0].package_name ?? '').trim();
		const qty = Number(lines[0].package_qty);
		const price = Number(lines[0].package_price);

		if (!name) return `Package ${packageId} is missing its name`;
		if (!Number.isInteger(qty) || qty < 1) return `Package "${name}" needs a quantity of at least 1`;
		if (!Number.isFinite(price) || price <= 0) return `Package "${name}" needs a price above 0`;

		const disagree = lines.some((line) =>
			String(line.package_name ?? '').trim() !== name
			|| Number(line.package_qty) !== qty
			|| toCents(line.package_price) !== toCents(price));
		if (disagree) {
			return `The lines of package "${name}" disagree on its name, quantity or price`;
		}

		let linesCents = 0;
		for (const line of lines) {
			if (!line.is_private_price) {
				return `The lines of package "${name}" must use the package's private price`;
			}
			const lineQty = Number(line.quantity);
			if (!Number.isInteger(lineQty) || lineQty < qty || lineQty % qty !== 0) {
				return `Each line quantity of package "${name}" must be a multiple of the package quantity (${qty})`;
			}
			linesCents += toCents(line.total_price);
		}

		const expectedCents = toCents(price) * qty;
		if (linesCents !== expectedCents) {
			return `The lines of package "${name}" add up to ${(linesCents / 100).toFixed(2)}, `
				+ `but the package total is ${(expectedCents / 100).toFixed(2)} (${qty} x ${price.toFixed(2)})`;
		}
	}

	return null;
}

/**
 * The authoritative name for every package on the invoice: the invoice's own earlier snapshot
 * when editing, otherwise the packages table. Names come back from the database already
 * escaped, so re-using them avoids escaping a client echo of the name a second time.
 *
 * @param {{ query: Function }} db  A pg client or pool.
 * @param {object[]} items          Invoice lines as sent by the client.
 * @param {object[]} previousItems  The invoice's saved lines (edit only).
 * @returns {Promise<Map<number, string>>}
 */
async function resolvePackageNames(db, items, previousItems = []) {
	const names = new Map();
	const ids = [...new Set(items.filter(hasPackage).map((item) => Number(item.package_id)))];
	if (ids.length === 0) return names;

	for (const prev of previousItems) {
		const id = Number(prev.package_id);
		if (ids.includes(id) && prev.package_name && !names.has(id)) names.set(id, prev.package_name);
	}
	const missing = ids.filter((id) => !names.has(id));
	if (missing.length > 0) {
		const result = await db.query('SELECT id, name FROM packages WHERE id = ANY($1::int[])', [missing]);
		for (const row of result.rows) names.set(row.id, row.name);
	}
	return names;
}

/**
 * Stamp each package line with its authoritative package name and the matching private price
 * note ("Package: <name>"). Ordinary lines are left untouched. Mutates the lines in place.
 */
function normalizePackageLines(items, names) {
	for (const item of items) {
		if (!hasPackage(item)) continue;
		const name = names.get(Number(item.package_id));
		if (!name) continue; // Package deleted and no snapshot: keep what the client sent
		item.package_name = name;
		item.private_price_note = `Package: ${name}`;
	}
}

/**
 * The package snapshot columns for one invoice line, in insert order:
 * [package_id, package_name, package_qty, package_price]. All null for an ordinary line.
 */
function packageColumnValues(item) {
	if (!hasPackage(item)) return [null, null, null, null];
	return [
		Number(item.package_id),
		String(item.package_name).trim(),
		Number(item.package_qty),
		Number(item.package_price),
	];
}

module.exports = {
	validatePackageLines,
	resolvePackageNames,
	normalizePackageLines,
	packageColumnValues,
};
