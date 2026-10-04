/**
 * Ranked product search for the invoice form: words match in any order, and an exact
 * barcode / SKU / ID (what a scanner types) always comes first.
 */
import { normalizeBarcodeOrSkuForSearch } from "./barcodeSkuUtils";

export interface SearchableProduct {
  id: number | string;
  name?: string | null;
  barcode?: string | null;
  sku?: string | null;
}

/** How a product matched, best first. */
export const MATCH_RANK = {
  exactCode: 0,
  nameStart: 1,
  wordStart: 2,
  nameContains: 3,
  codeContains: 4,
} as const;
export type MatchRank = (typeof MATCH_RANK)[keyof typeof MATCH_RANK];

export interface ProductSearchEntry<P extends SearchableProduct = SearchableProduct> {
  product: P;
  id: string;
  name: string;
  nameLower: string;
  /** Normalized barcode / SKU (uppercase, no spaces), "" when missing. */
  barcode: string;
  sku: string;
}

export interface ProductSearchResult<P extends SearchableProduct = SearchableProduct> {
  entry: ProductSearchEntry<P>;
  /** null when the query is empty (every product, in name order). */
  rank: MatchRank | null;
}

/** Normalize once per product list, sorted by name for browsing. */
export function buildProductSearchIndex<P extends SearchableProduct>(products: P[]): ProductSearchEntry<P>[] {
  return products
    .map((product) => {
      const name = product.name || "";
      return {
        product,
        id: String(product.id),
        name,
        nameLower: name.toLowerCase(),
        barcode: normalizeBarcodeOrSkuForSearch(product.barcode != null ? String(product.barcode) : null),
        sku: normalizeBarcodeOrSkuForSearch(product.sku != null ? String(product.sku) : null),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const queryWords = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

export const matchesAllWords = (textLower: string, words: string[]) => words.every((word) => textLower.includes(word));

const WORD_CHAR = /[\p{L}\p{N}]/u;
const startsAWord = (textLower: string, word: string) => {
  for (let at = textLower.indexOf(word); at !== -1; at = textLower.indexOf(word, at + 1)) {
    if (at === 0 || !WORD_CHAR.test(textLower[at - 1])) return true;
  }
  return false;
};

/** How well a name matches the query words (all must be in it), or null. Needs at least one word. */
export function rankName(nameLower: string, words: string[]): MatchRank | null {
  if (!words.length || !matchesAllWords(nameLower, words)) return null;
  if (nameLower.startsWith(words[0])) return MATCH_RANK.nameStart;
  if (words.every((word) => startsAWord(nameLower, word))) return MATCH_RANK.wordStart;
  return MATCH_RANK.nameContains;
}

function rankEntry(entry: ProductSearchEntry, raw: string, words: string[], code: string): MatchRank | null {
  if (entry.id === raw || (code && (entry.barcode === code || entry.sku === code))) return MATCH_RANK.exactCode;
  const byName = rankName(entry.nameLower, words);
  if (byName !== null) return byName;
  if (words.length === 1 && code && (entry.barcode.includes(code) || entry.sku.includes(code) || entry.id.includes(raw))) {
    return MATCH_RANK.codeContains;
  }
  return null;
}

/** Matching products, best match first; ties keep name order. */
export function searchProducts<P extends SearchableProduct>(
  index: ProductSearchEntry<P>[],
  query: string,
): ProductSearchResult<P>[] {
  const raw = query.trim();
  if (!raw) return index.map((entry) => ({ entry, rank: null }));

  const words = queryWords(raw);
  const code = normalizeBarcodeOrSkuForSearch(raw);
  const results: ProductSearchResult<P>[] = [];
  for (const entry of index) {
    const rank = rankEntry(entry, raw, words, code);
    if (rank !== null) results.push({ entry, rank });
  }
  // Array.prototype.sort is stable, so equal ranks stay in name order
  return results.sort((a, b) => (a.rank as number) - (b.rank as number));
}

/** Splits `text` into plain and matched parts for highlighting the query words. */
export function highlightParts(text: string, words: string[]): Array<{ text: string; match: boolean }> {
  if (!words.length) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const ranges = words
    .map((word) => [lower.indexOf(word), lower.indexOf(word) + word.length] as const)
    .filter(([start]) => start >= 0)
    .sort((a, b) => a[0] - b[0]);

  const parts: Array<{ text: string; match: boolean }> = [];
  let pos = 0;
  for (const [start, end] of ranges) {
    if (start < pos) continue; // overlaps an earlier word
    if (start > pos) parts.push({ text: text.slice(pos, start), match: false });
    parts.push({ text: text.slice(start, end), match: true });
    pos = end;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), match: false });
  return parts;
}
