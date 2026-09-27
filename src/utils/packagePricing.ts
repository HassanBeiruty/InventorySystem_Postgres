/**
 * Split one package's price across its products, in whole cents.
 *
 * Each product's share follows its retail value inside the package (retail price x quantity
 * per package), so every product keeps a realistic share for profit reports. The result is a
 * unit price per product such that sum(unit price x quantity per package) equals the package
 * price exactly. Selling N packages multiplies every line quantity by N, so the invoice total
 * is then exactly N x package price.
 *
 * Same method as the landed-cost tool: largest-remainder allocation, then a +/-1 cent search
 * to absorb the rounding left over when a product has a quantity above 1.
 */

export interface PackagePriceLine {
  /** List price of one unit (retail). 0 when the product has no price. */
  listUnitPrice: number;
  /** How many units of this product one package contains (integer >= 1). */
  qtyPerPackage: number;
}

export interface PackagePriceSplit {
  /** Unit price for each line, in the same order as the input. */
  unitPrices: number[];
  /**
   * The package price the unit prices actually add up to. Equals the requested price except in
   * the rare case where every product has a quantity above 1 and the cents cannot divide evenly
   * (for example 3 units at $10.00 can only reach $9.99 or $10.02).
   */
  achievedPrice: number;
}

const toCents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);

/**
 * Distribute a whole-cent total in proportion to the weights. Floors every share, then gives the
 * leftover cents to the largest discarded fractions (ties by position). The parts always sum to
 * the total exactly.
 */
export function allocateByLargestRemainder(weights: number[], totalCents: number): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (w / weightSum) * totalCents);
  const floored = exact.map((v) => Math.floor(v));
  let remaining = totalCents - floored.reduce((a, b) => a + b, 0);

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
 * Move some unit prices by exactly one cent so that sum(unit x qty) hits the target. Moving a
 * unit price by 1 cent moves the total by `qty` cents, so this is a signed subset-sum: an exact
 * DP over reachable offsets that keeps every line as close as possible to its own target.
 * Lines priced at 0 stay at 0. Mutates `unitCents`; returns the residual it could not close.
 */
function closeResidual(qty: number[], unitCents: number[], targetCents: number[], residualCents: number): number {
  if (residualCents === 0) return 0;

  const eligible = qty.map((_, i) => i).filter((i) => unitCents[i] > 0);
  if (eligible.length === 0) return residualCents;
  eligible.sort((a, b) => qty[a] - qty[b]);

  const window = Math.abs(residualCents) + 4 * qty[eligible[eligible.length - 1]];
  const size = 2 * window + 1;
  let cost = new Float64Array(size).fill(Infinity);
  cost[window] = 0;
  const choices: Int8Array[] = [];
  let lo = window;
  let hi = window;

  for (const i of eligible) {
    const q = qty[i];
    const base = Math.abs(unitCents[i] * q - targetCents[i]);
    const costUp = Math.abs((unitCents[i] + 1) * q - targetCents[i]) - base;
    const costDown = unitCents[i] - 1 >= 0 ? Math.abs((unitCents[i] - 1) * q - targetCents[i]) - base : Infinity;

    const next = new Float64Array(size).fill(Infinity);
    const choice = new Int8Array(size);
    for (let o = lo; o <= hi; o++) {
      const c = cost[o];
      if (c === Infinity) continue;
      if (c < next[o]) { next[o] = c; choice[o] = 0; }
      if (o + q < size && c + costUp < next[o + q]) { next[o + q] = c + costUp; choice[o + q] = 1; }
      if (o - q >= 0 && costDown !== Infinity && c + costDown < next[o - q]) { next[o - q] = c + costDown; choice[o - q] = -1; }
    }
    cost = next;
    choices.push(choice);
    lo = Math.max(0, lo - q);
    hi = Math.min(size - 1, hi + q);
  }

  const goal = window + residualCents;
  if (goal < 0 || goal >= size || cost[goal] === Infinity) return residualCents;

  let offset = goal;
  for (let k = eligible.length - 1; k >= 0; k--) {
    const d = choices[k][offset];
    if (d !== 0) {
      const i = eligible[k];
      unitCents[i] += d;
      offset -= d * qty[i];
    }
  }
  return 0;
}

export function distributePackagePrice(lines: PackagePriceLine[], packagePrice: number): PackagePriceSplit {
  if (lines.length === 0) return { unitPrices: [], achievedPrice: 0 };

  const targetCents = toCents(packagePrice);
  const qty = lines.map((l) => Math.max(1, Math.round(l.qtyPerPackage)));
  let weights = lines.map((l, i) => toCents(Math.max(0, l.listUnitPrice)) * qty[i]);
  // No product has a price: fall back to an even split per unit
  if (weights.every((w) => w === 0)) weights = qty.slice();

  const lineTargets = allocateByLargestRemainder(weights, targetCents);
  const unitCents = lineTargets.map((c, i) => Math.round(c / qty[i]));
  const reached = unitCents.reduce((sum, u, i) => sum + u * qty[i], 0);
  closeResidual(qty, unitCents, lineTargets, targetCents - reached);

  const achievedCents = unitCents.reduce((sum, u, i) => sum + u * qty[i], 0);
  return {
    unitPrices: unitCents.map((c) => c / 100),
    achievedPrice: achievedCents / 100,
  };
}
