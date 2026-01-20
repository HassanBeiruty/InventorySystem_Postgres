import React from "react";

interface ProductNameWithCodeProps {
  product: {
    name?: string;
    product_name?: string;
    barcode?: string | null;
    product_barcode?: string | null;
    sku?: string | null;
    product_sku?: string | null;
    products?: {
      name?: string;
      barcode?: string | null;
      sku?: string | null;
    };
  };
  showId?: boolean;
  id?: number | string;
  product_id?: number | string;
  className?: string;
  nameClassName?: string;
  codeClassName?: string;
}

/**
 * Displays product name with barcode (or SKU if barcode is null) inline
 * Handles different product data structures across the application
 */
export const ProductNameWithCode: React.FC<ProductNameWithCodeProps> = ({
  product,
  showId = false,
  id,
  product_id,
  className = "",
  nameClassName = "",
  codeClassName = "text-muted-foreground text-xs font-mono ml-1.5",
}) => {
  // Extract name from different possible property names
  const productName = product.name || product.product_name || product.products?.name || "";

  // Extract barcode and SKU from different possible property names
  // Handle null, undefined, and empty strings properly
  const barcode = product.barcode || product.product_barcode || product.products?.barcode || null;
  const sku = product.sku || product.product_sku || product.products?.sku || null;

  // Normalize to null if empty string
  const normalizedBarcode = (barcode && barcode.toString().trim()) || null;
  const normalizedSku = (sku && sku.toString().trim()) || null;

  // Use barcode if available, otherwise use SKU
  const code = normalizedBarcode || normalizedSku;
  
  // Extract ID if needed
  const displayId = id || product_id;

  return (
    <span className={className}>
      {showId && displayId && (
        <span className="text-muted-foreground text-xs">#{displayId} </span>
      )}
      <span className={nameClassName}>{productName}</span>
      {code && <span className={codeClassName}> - {code}</span>}
    </span>
  );
};

export default ProductNameWithCode;
