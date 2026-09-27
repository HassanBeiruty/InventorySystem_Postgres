/** One line of the invoice form (buy or sell). */
export interface InvoiceFormItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  price_type: 'retail' | 'wholesale';
  total_price: number;
  is_private_price: boolean;
  private_price_amount: number;
  private_price_note: string;
  barcode?: string;
  /**
   * Package snapshot. Set only on sell lines that came from a package; the line itself stays an
   * ordinary private-price line.
   */
  package_id?: string;
  package_name?: string;
  /** Number of packages sold. */
  package_qty?: number;
  /** Price of ONE package (what the unit prices actually add up to). */
  package_price?: number;
  /** Units of this product in one package. Form-only, never saved. */
  package_unit_qty?: number;
}
