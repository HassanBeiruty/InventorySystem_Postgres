# Invoice Import Template Guide

## File Format
- File type: Excel (.xlsx or .xls) or CSV (.csv)
- One row per invoice item
- Rows with the same `invoice_date` + `entity_name` will be grouped into one invoice

## Required Columns

### Invoice-Level (applies to all items in the same invoice)

| Column | Required | Description | Example |
|--------|----------|-------------|---------|
| `invoice_type` | ✅ Yes | Must be `buy` or `sell` | `sell`, `buy` |
| `invoice_date` | ✅ Yes | Invoice date (YYYY-MM-DD) | `2025-01-15` |
| `entity_name` | ✅ Yes | Customer name (for sell) or Supplier name (for buy) | `John Smith` or `ABC Suppliers` |
| `due_date` | ❌ Optional | Due date (YYYY-MM-DD) | `2025-02-15` |
| `paid_directly` | ❌ Optional | `true` or `false` (default: `false`) | `true` |

### Item-Level (per row)

| Column | Required | Description | Example | Notes |
|--------|----------|-------------|---------|-------|
| `product_barcode` | ✅ Yes* | Product barcode | `BAR001` | *Required if `product_sku` is empty |
| `product_sku` | ✅ Yes* | Product SKU/OEM | `SKU123` | *Required if `product_barcode` is empty |
| `quantity` | ✅ Yes | Quantity sold/purchased | `5` | Must be > 0 |
| `unit_price` | ✅ Yes | **Sell**: Number (private price) OR `"retail"`/`"wholesale"` (use product_prices)<br>**Buy**: Purchase cost (number) | `25.50` or `retail` | **For sell**: Number = private price, "retail"/"wholesale" = use product_prices<br>**For buy**: Always a number (cost) |
| `private_price_note` | ❌ Optional | Note for private price | `Special discount` | Optional note (only used when unit_price is a number for sell) |

## Important Notes

### For SELL Invoices:
- `unit_price` can be:
  - **A number** (e.g., `28.50`) → Treated as **private price** (custom price)
  - **"retail"** → Uses retail price from `product_prices` table
  - **"wholesale"** → Uses wholesale price from `product_prices` table
  - **Empty** → **ERROR** (not allowed)
- `entity_name` is required (customer name)
- `supplier_name` should be empty

### For BUY Invoices:
- `unit_price` = **Purchase cost** (must be a number, e.g., `15.00`)
- `entity_name` is required (supplier name)
- `customer_name` should be empty

## Column Name Variations Accepted

The system accepts multiple column name variations (case-insensitive):
- `invoice_type` / `type` / `invoice type`
- `invoice_date` / `invoice date` / `date`
- `entity_name` / `entity name` / `entity` / `customer_name` / `customer name` / `customer` / `supplier_name` / `supplier name` / `supplier`
- `product_barcode` / `product barcode` / `barcode` / `bar_code`
- `product_sku` / `product sku` / `sku` / `oem` / `oem_no` / `oem no`
- `quantity` / `qty` / `qty.` / `amount`
- `unit_price` / `unit price` / `price` / `unitprice`

## Example Data

### Example 1: Sell Invoice with Private Price (Number)
```
invoice_type,invoice_date,entity_name,product_barcode,quantity,unit_price,private_price_note
sell,2025-01-15,John Smith,BAR001,5,28.50,Special discount
```
**Result**: Creates 1 invoice for "John Smith" with item at private price $28.50.

### Example 2: Sell Invoice Using Product Prices
```
invoice_type,invoice_date,entity_name,product_barcode,quantity,unit_price
sell,2025-01-15,John Smith,BAR001,5,retail
sell,2025-01-15,John Smith,BAR002,3,wholesale
```
**Result**: Creates 1 invoice for "John Smith" with:
- Item 1: Uses retail price from product_prices table
- Item 2: Uses wholesale price from product_prices table

### Example 3: Buy Invoice (Purchase)
```
invoice_type,invoice_date,entity_name,product_barcode,quantity,unit_price
buy,2025-01-10,ABC Suppliers,BAR001,20,15.00
buy,2025-01-10,ABC Suppliers,SKU123,15,30.00
```
**Result**: Creates 1 purchase invoice from "ABC Suppliers" with 2 items.
**Note**: `unit_price` here is the **cost** you paid (15.00 and 30.00 per unit).

## Validation Rules

1. **Products**: `product_barcode` or `product_sku` must exist in the system (checks both columns)
2. **Entities**: `entity_name` must exist as customer (for sell) or supplier (for buy)
4. **Dates**: Must be valid date format (YYYY-MM-DD)
5. **Quantities**: Must be positive numbers
6. **Prices**: Must be non-negative numbers

## Common Errors

- ❌ `Product not found: BAR001` → Product with this barcode/SKU doesn't exist
- ❌ `Customer not found: John Smith` → Customer/Supplier name doesn't match exactly (case-sensitive)
- ❌ `Invalid invoice_date format: 15/01/2025` → Use YYYY-MM-DD format
- ❌ `Invalid quantity: -5` → Quantity must be positive

## Tips

1. **Grouping**: All rows with the same `invoice_date` + `customer_name` (or `supplier_name`) will be combined into one invoice
2. **Cost vs Price**: Remember - for **buy** invoices, `unit_price` is your **cost**. For **sell** invoices, `unit_price` is the **selling price**
3. **Check Before Import**: Use the preview feature to verify all invoices and items before importing
4. **Selective Import**: You can uncheck invoices in the preview if you don't want to import them
