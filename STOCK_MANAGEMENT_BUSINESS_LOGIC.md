# Stock Management System — Business Logic Specification

> **Purpose:** This document is a complete, implementation-ready specification of the stock
> management business logic (tables, movements, costing, stored procedures, jobs, payments,
> and reports). Use it as a prompt/blueprint to implement the same system on any other
> stack (SQL Server, MySQL, another ORM, another language). It is written to be
> technology-agnostic where possible; reference SQL is PostgreSQL.

---

## 1. Core Concepts

The system is an **invoice-driven perpetual inventory system** with **Weighted Average Cost (WAC)** valuation:

1. **Every stock change is caused by an invoice.** There are only two invoice types:
   `buy` (purchase from a supplier → stock IN) and `sell` (sale to a customer → stock OUT).
   There are no standalone stock adjustments — stock is a pure function of the invoice history.
2. **Stock is a ledger, not a counter.** Each invoice line writes an immutable-style
   `stock_movements` row storing `quantity_before`, `quantity_change`, `quantity_after`,
   `unit_cost`, and `avg_cost_after`. The current position is always the latest movement.
3. **A daily snapshot table (`daily_stock`)** stores one row per product per calendar date
   with the end-of-day quantity and average cost. This makes historical reporting
   ("what was my stock and its value on date X?") an O(1) lookup instead of replaying the ledger.
4. **Editing/deleting a past invoice triggers a forward recalculation** of all later
   movements and snapshots for the affected products (ledger replay from the edit point).
5. **Payments are decoupled from invoices** (partial payments, multi-currency), and the
   invoice carries a derived `payment_status` (`pending` / `partial` / `paid`).

Money is stored in a base currency (USD). All amounts are `DECIMAL(18,2)`; exchange rates are `DECIMAL(18,6)`.

---

## 2. Data Model

### 2.1 Master data

```sql
categories (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL UNIQUE,
  description   VARCHAR(500),
  created_at    TIMESTAMP NOT NULL
)

products (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  barcode       VARCHAR(100),          -- nullable, indexed (also a normalized functional index: REPLACE(barcode,' ',''))
  sku           VARCHAR(100),          -- nullable, indexed (same normalized index trick)
  category_id   INT REFERENCES categories(id),
  description   VARCHAR(1000),
  shelf         VARCHAR(100),          -- physical location
  created_at    TIMESTAMP NOT NULL
)

product_prices (                        -- list-price history (selling prices, NOT cost)
  id              SERIAL PRIMARY KEY,
  product_id      INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  wholesale_price DECIMAL(18,2) NOT NULL,
  retail_price    DECIMAL(18,2) NOT NULL,
  effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMP NOT NULL
)
-- "Current price" = latest row by (effective_date DESC, created_at DESC) per product.

customers (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  phone        VARCHAR(50),
  address      VARCHAR(255),
  credit_limit DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL
)

suppliers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  phone      VARCHAR(50),
  address    VARCHAR(255),
  created_at TIMESTAMP NOT NULL
)
```

### 2.2 Transactions

```sql
invoices (
  id             SERIAL PRIMARY KEY,
  invoice_type   VARCHAR(10) NOT NULL CHECK (invoice_type IN ('buy','sell')),
  customer_id    INT REFERENCES customers(id),   -- set for sell
  supplier_id    INT REFERENCES suppliers(id),   -- set for buy
  total_amount   DECIMAL(18,2) NOT NULL,         -- in base currency (USD)
  amount_paid    DECIMAL(18,2) NOT NULL DEFAULT 0,      -- derived: SUM of payment USD equivalents
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (payment_status IN ('pending','partial','paid')),  -- derived
  invoice_date   TIMESTAMP NOT NULL,
  due_date       DATE,                            -- optional credit terms; drives "overdue"
  created_at     TIMESTAMP NOT NULL
)

invoice_items (
  id                   SERIAL PRIMARY KEY,
  invoice_id           INT NOT NULL REFERENCES invoices(id),
  product_id           INT NOT NULL REFERENCES products(id),
  quantity             INT NOT NULL,
  unit_price           DECIMAL(18,2) NOT NULL,   -- base list price used on the line
  total_price          DECIMAL(18,2) NOT NULL,   -- quantity * effective unit price
  price_type           VARCHAR(20) NOT NULL CHECK (price_type IN ('retail','wholesale')),
  is_private_price     BOOLEAN NOT NULL DEFAULT FALSE,   -- "special deal" override (sell only)
  private_price_amount DECIMAL(18,2),            -- the actual negotiated unit price
  private_price_note   VARCHAR(255)
)

invoice_payments (
  id                       SERIAL PRIMARY KEY,
  invoice_id               INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  paid_amount              DECIMAL(18,2) NOT NULL,   -- in the paid currency
  currency_code            VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency_code IN ('USD','LBP','EUR')),
  exchange_rate_on_payment DECIMAL(18,6) NOT NULL DEFAULT 1.0,  -- 1 USD = X currency, frozen at payment time
  usd_equivalent_amount    DECIMAL(18,2) NOT NULL DEFAULT 0,    -- paid_amount / exchange_rate (or = paid_amount for USD)
  payment_date             TIMESTAMP NOT NULL,
  payment_method           VARCHAR(50),
  notes                    VARCHAR(500),
  created_at               TIMESTAMP NOT NULL
)

exchange_rates (
  id            SERIAL PRIMARY KEY,
  currency_code VARCHAR(3) NOT NULL CHECK (currency_code IN ('USD','LBP','EUR')),
  rate_to_usd   DECIMAL(18,6) NOT NULL,   -- 1 USD = rate_to_usd units of currency
  effective_date DATE NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP NOT NULL,
  updated_at    TIMESTAMP NOT NULL,
  UNIQUE (currency_code, effective_date)
)
```

### 2.3 Stock state

```sql
stock_movements (                       -- the LEDGER: one row per invoice line
  id              SERIAL PRIMARY KEY,
  product_id      INT NOT NULL REFERENCES products(id),
  invoice_id      INT NOT NULL REFERENCES invoices(id),
  invoice_date    TIMESTAMP NOT NULL,   -- denormalized copy of invoices.invoice_date
  quantity_before INT NOT NULL,
  quantity_change INT NOT NULL,         -- +qty for buy, -qty for sell
  quantity_after  INT NOT NULL,         -- quantity_before + quantity_change
  unit_cost       DECIMAL(18,2),        -- buy: purchase cost/unit; sell: effective sold price (display only)
  avg_cost_after  DECIMAL(18,2),        -- running WAC after this movement
  created_at      TIMESTAMP NOT NULL
)
-- Key indexes: (product_id), (invoice_id), (product_id, invoice_id), (product_id, invoice_id, invoice_date)

daily_stock (                           -- the SNAPSHOT: one row per product per date
  id            SERIAL PRIMARY KEY,
  product_id    INT NOT NULL REFERENCES products(id),
  available_qty INT NOT NULL DEFAULT 0,
  avg_cost      DECIMAL(18,2) NOT NULL DEFAULT 0,
  date          DATE NOT NULL,
  created_at    TIMESTAMP NOT NULL,
  updated_at    TIMESTAMP NOT NULL,
  UNIQUE (product_id, date)             -- the upsert key; essential
)
```

### 2.4 Packages (bundles)

```sql
product_package_items (
  id                   SERIAL PRIMARY KEY,
  package_product_id   INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE (package_product_id, component_product_id),
  CHECK (package_product_id <> component_product_id)
)
```

A "package" is a normal product that has component rows. **Expansion happens in the UI at
sell time only**: when a package product is added to a *sell* invoice, one extra line is
appended per component product. The package and its components then flow through the
system as ordinary invoice lines (each gets its own stock movement). Buy invoices never
expand packages. There is no quantity-per-component (1 each) and no server-side expansion.

---

## 3. Costing: Weighted Average Cost (WAC)

The single most important formula in the system. Applied **per product**, at the moment a
movement is recorded:

```
BUY  (quantity_change > 0):
    new_avg_cost = (qty_before * prev_avg_cost + buy_qty * buy_unit_cost)
                   / (qty_before + buy_qty)
    -- if (qty_before + buy_qty) == 0, fall back to buy_unit_cost

SELL (quantity_change < 0):
    new_avg_cost = prev_avg_cost        -- sells NEVER change the average cost
```

Rules:
- `prev_avg_cost` and `qty_before` come from the latest known position of the product
  (latest `daily_stock` row with `date <= today`, ordered by `date DESC, updated_at DESC`).
- On a **sell**, `stock_movements.unit_cost` stores the *effective sold price*
  (private price if set, else `unit_price`). This is display/audit only — it is **never**
  used in WAC or profit math.
- On a **buy**, `stock_movements.unit_cost` stores the purchase cost and *is* the WAC input.
- `avg_cost_after` on a sell row therefore equals the WAC **at the moment of sale**, which
  is exactly the per-unit cost used later by the profit report (COGS).
- **Negative stock is allowed.** There is no hard block on selling more than available
  (the UI may warn). WAC math still runs; guard divisions with `NULLIF(denominator, 0)`.

---

## 4. Invoice Lifecycle & Stock Movement Flow

### 4.1 CREATE invoice (application logic, single DB transaction)

```
BEGIN TRANSACTION
1. INSERT invoices row (invoice_date = now).
2. Batch-fetch latest stock position for all products on the invoice:
     SELECT product_id, available_qty, avg_cost FROM daily_stock
     WHERE product_id = ANY(ids) AND date <= today
     ORDER BY product_id, date DESC, updated_at DESC
   → keep first row per product (missing product ⇒ qty 0, avg_cost 0).
3. For each line item:
     change      = (sell ? -qty : +qty)
     qty_after   = qty_before + change
     new_avg     = WAC formula (section 3)
     unit_cost   = is_private_price ? private_price_amount : unit_price
     queue: invoice_items INSERT, stock_movements INSERT,
            daily_stock UPSERT (product_id, today) → (qty_after, new_avg)
4. Execute the three batch statements (items, movements, daily_stock upsert
   ON CONFLICT (product_id, date) DO UPDATE).
5. Payment shortcuts:
     paid_directly = true  → INSERT full-amount USD payment (method 'direct'),
                             set invoices.amount_paid = total, payment_status = 'paid'.
     partial_paid_amount>0 → must be strictly < total_amount (else abort);
                             INSERT partial USD payment, status = 'partial'.
COMMIT (ROLLBACK on any error)
```

Validation: a product may appear **only once per invoice** (duplicate lines would map onto
the same stock movement). The server rejects duplicates with a 400 before writing anything;
the UI enforces the same rule.

### 4.2 EDIT invoice (single DB transaction)

Editing may change quantities/prices of existing lines or remove lines — it can **never add
a new product** to the invoice (create a new invoice for that). The whole flow is one
`BEGIN … COMMIT`; any failure rolls back items, header, and all recalculations together.

1. Validate before any write:
   - items non-empty; no duplicate products (400).
   - Lock the invoice row (`SELECT … FOR UPDATE`) so concurrent edits of the same
     invoice cannot interleave.
   - Every product in the new items must already have a `stock_movements` row for this
     invoice. If not:
     - product was never on this invoice → 400 "adding products on edit is not supported";
     - product is on the invoice but its movement is missing → 409 "ledger inconsistent —
       run Recompute Positions / contact admin". Never auto-create the missing movement:
       that would silently paper over the underlying corruption.
2. Delete old `invoice_items`, update the invoice header, insert new items.
   (`invoice_date` is **not** changed on edit.)
3. For each product removed from the invoice → call
   `recalculate_stock_after_invoice(invoice_id, product_id, 'DELETE')`.
4. For each product present in new items → call
   `recalculate_stock_after_invoice(invoice_id, product_id, 'EDIT', new_change, new_unit_cost)`
   where `new_change` is signed (negative for sell) and `new_unit_cost` is the effective
   price (private override respected).
5. COMMIT; on any error ROLLBACK and return the error to the user.

### 4.3 DELETE invoice (single DB transaction)

1. **Refuse if the invoice has any payments** (HTTP 400: "remove payments first").
2. For each distinct product on the invoice → call
   `recalculate_stock_after_invoice(invoice_id, product_id, 'DELETE')`
   (this deletes its movement rows and replays the ledger).
3. Delete `invoice_items`, `invoice_payments`, then the `invoices` row.

### 4.4 The recalculation stored procedure (ledger replay)

`recalculate_stock_after_invoice(p_invoice_id, p_product_id, p_action, p_new_qty, p_new_unit_cost)`

```
1. Apply the action:
   DELETE → DELETE FROM stock_movements WHERE product_id AND invoice_id match.
   EDIT   → UPDATE that movement's quantity_change and unit_cost
            (error if no row matched).

2. Find the last correct state BEFORE this invoice:
   SELECT quantity_after, avg_cost_after FROM stock_movements
   WHERE product_id = p AND invoice_id < p_invoice_id
   ORDER BY invoice_id DESC, id DESC LIMIT 1;
   (defaults 0/0 — ordering key is invoice_id, i.e. insertion order, not timestamps)

3. Replay forward: loop over all movements of the product with
   invoice_id >= p_invoice_id ORDER BY invoice_id, id and recompute
   quantity_before / quantity_after / avg_cost_after row by row:
     qty_after = qty_before + change
     if change > 0 AND unit_cost IS NOT NULL:
         avg_after = (qty_before*avg_before + change*unit_cost) / NULLIF(qty_after,0)
     else:
         avg_after = avg_before          -- sells keep the running average

4. Rebuild snapshots: delete daily_stock rows for this product from the
   invoice's date onward, then re-insert one row per date = the LAST movement
   of that date (ROW_NUMBER() PARTITION BY date ORDER BY invoice_date DESC,
   invoice_id DESC, id DESC), upserting on (product_id, date).

5. Call sp_recompute_positions(product_id) to fill any date gaps up to today.
```

---

## 5. Daily Snapshot & Gap Filling (Jobs)

### 5.1 `sp_daily_stock_snapshot()` — carry-forward snapshot

For every product: find its latest `daily_stock` row with `date <= yesterday`
(prefer exactly yesterday), default (0, 0) if none, and **insert** a row for today with
that quantity/avg_cost — skip if today's row already exists. Movements later the same day
will then upsert over it. Uses `CURRENT_DATE`, so the **session timezone matters**.

### 5.2 `sp_recompute_positions(product_id | NULL)` — gap repair

Idempotent self-healing routine (NULL = all products):
1. Detect **gaps**: consecutive `daily_stock` dates more than 1 day apart, plus the
   "end-of-data gap" from each product's max date to today.
2. If none → exit. Otherwise take the span [earliest gap start … today] per product.
3. Copy existing rows in the span aside, delete the span, generate every calendar date
   in it (`generate_series`), and re-insert: each date takes the existing row's values
   if present, else **carries forward the last known** (qty, avg_cost); default (0,0).
4. Upsert everything back on (product_id, date).

This guarantees `daily_stock` is a *dense* series — every product has a row for every
date — which is what makes "stock value on date X" and history charts trivially correct.

### 5.3 Scheduling (three redundant options; enable at least one)

| Mechanism | Schedule | Command |
|---|---|---|
| **App-level cron** (node-cron, primary for cloud DBs) | daily 00:00 (business timezone, e.g. Asia/Beirut) | `SET TIMEZONE='Asia/Beirut'; SELECT sp_recompute_positions(NULL);` |
| pg_cron (if the extension exists) | daily 00:05 | `SELECT sp_recompute_positions(NULL);` |
| pgAgent (self-hosted pgAdmin setups) | daily 00:05 | `SELECT sp_daily_stock_snapshot();` |

Also expose manual admin endpoints: `POST /admin/recompute-positions` (optional
product_id) and `POST /admin/daily-stock-snapshot`.

**Timezone is a first-class concern:** the snapshot keys on `CURRENT_DATE`. If the server
runs UTC but the business day is UTC+3, set the session/job timezone explicitly or rows
land on the wrong date. After the job, verify `COUNT(*) FROM daily_stock WHERE date = CURRENT_DATE`
≈ product count and log a warning if 0.

---

## 6. Payments & Multi-Currency

- Invoice totals are always in the base currency (USD). Payments may be USD, LBP, or EUR.
- Rate convention: **1 USD = X units of currency** (e.g. 1 USD = 89,500 LBP).
  `usd_equivalent = paid_amount / exchange_rate` (identity for USD). The rate used is
  **frozen on the payment row** (`exchange_rate_on_payment`) — never recomputed later.
- `exchange_rates` keeps a dated history per currency; "current rate" = latest active row.
- **Validation on record/update:** amount > 0; rate > 0; currency whitelisted;
  `usd_equivalent ≤ remaining_balance + 0.01` (epsilon for float comparison).
  When editing a payment, compute remaining balance *excluding* the edited row.
- **Derived status**, recomputed from scratch after every payment insert/update/delete:

```
amount_paid = SUM(usd_equivalent_amount) over the invoice's payments
status      = paid    if amount_paid >= total_amount
              partial if amount_paid > 0
              pending otherwise
remaining_balance = total_amount - amount_paid
```

- Overdue list: `due_date IS NOT NULL AND due_date < today AND payment_status != 'paid'`.
- Deleting an invoice with payments is forbidden; delete payments first (audit safety).

---

## 7. Private (Negotiated) Prices

A sell line can override its list price:
- `is_private_price = true`, `private_price_amount` = actual unit price, optional note.
- The **effective price** everywhere (movement `unit_cost` display, revenue, profit) is
  `COALESCE(private_price_amount, unit_price)` when the flag is set.
- Buys are never private.
- Costing is unaffected (sells don't touch WAC) — private price only changes revenue.

---

## 8. Reports & Calculations

### 8.1 Net profit — `get_net_profit(start_date, end_date)`

COGS uses the WAC **at the moment of sale**, taken from the sale's own movement row
(`avg_cost_after`), which is correct regardless of same-day buy/sell ordering:

```sql
SELECT
  SUM(qty * (effective_price - COALESCE(sm.avg_cost_after, 0)))  AS net_profit,
  SUM(qty *  effective_price)                                    AS total_revenue,
  SUM(qty *  COALESCE(sm.avg_cost_after, 0))                     AS total_cost
FROM invoices i
JOIN invoice_items item ON item.invoice_id = i.id
LEFT JOIN LATERAL (              -- the movement written when this line was saved
  SELECT avg_cost_after FROM stock_movements
  WHERE invoice_id = i.id AND product_id = item.product_id
  ORDER BY id ASC LIMIT 1
) sm ON true
WHERE i.invoice_date::date BETWEEN start_date AND end_date
  AND i.invoice_type = 'sell';
-- effective_price = CASE WHEN item.private_price_amount IS NOT NULL
--                        THEN item.private_price_amount ELSE item.unit_price END
```

### 8.2 Other standard calculations

| Metric | Formula |
|---|---|
| Stock value on date D | `SUM(available_qty * avg_cost)` over `daily_stock WHERE date = D` |
| Current stock per product | today's `daily_stock` row (dense series ⇒ always exists) |
| Low stock | `daily_stock WHERE date = today AND available_qty < threshold` |
| Supplier purchases | sum of buy invoices per supplier over a date range |
| Customer sales | sum of sell invoices per customer over a date range |
| Current sell prices | latest `product_prices` row per product (`LEFT JOIN LATERAL ... ORDER BY effective_date DESC, created_at DESC LIMIT 1`) |

---

## 9. Invariants (assert these when porting)

1. For every movement: `quantity_after = quantity_before + quantity_change`.
2. Movements of a product, ordered by `(invoice_id, id)`, chain perfectly:
   row N's `quantity_after` = row N+1's `quantity_before` (same for avg cost).
3. `daily_stock(product, date)` = the last movement of that product on that date;
   dates with no movement carry the previous day forward.
4. The series `daily_stock` per product is dense from its first date through today.
5. Only buys change `avg_cost`; a product's avg_cost is unaffected by any sell.
6. `invoices.amount_paid` = `SUM(invoice_payments.usd_equivalent_amount)` and
   `payment_status` follows the paid/partial/pending rule — always recompute, never increment blindly.
7. An invoice with payments cannot be deleted.
8. Every `invoice_items` row has exactly one matching `stock_movements` row (per product per
   invoice); a product appears at most once per invoice.
9. All multi-statement mutations (create/edit/delete invoice, package replace) run in a single
   DB transaction with rollback on error. Edit additionally locks the invoice row (`FOR UPDATE`).
10. An edit never adds a product to an invoice; a missing movement for an edited line is a
    hard error (409), never silently repaired.

## 10. Known Design Trade-offs (be deliberate about these)

- **Replay order is `invoice_id`, not `invoice_date`** — chronology is insertion order.
  Backdating an invoice's date does not reorder the ledger. If the target system needs
  true date-ordered replay, change the ordering key in the recalc SP consistently
  (steps 2 and 3) — and accept heavier recalcs.
- **Negative stock is permitted** (warn in UI). Add a hard guard if the target business
  forbids it.
- **Concurrency:** invoice *creation* reads the position then writes; two simultaneous
  invoices for the same product can race. Mitigate with serializable transactions,
  `SELECT ... FOR UPDATE` on the product's latest position, or a per-product advisory lock.
  (Invoice *edit* is already protected: it locks the invoice row with `FOR UPDATE`.)
- One `daily_stock` row per (product, date) means intra-day history lives only in
  `stock_movements`.
- Package expansion is client-side and sell-only; components are fixed at qty 1 each.

## 11. Porting Checklist

1. Create master tables → transaction tables → stock tables (FK order), with the
   unique keys `daily_stock(product_id, date)` and `exchange_rates(currency, date)`.
2. Implement WAC (section 3) in the invoice-creation path with batched inserts +
   the daily_stock upsert, all in one transaction.
3. Implement the three routines: `recalculate_stock_after_invoice`,
   `sp_daily_stock_snapshot`, `sp_recompute_positions` (section 4.4 / 5).
4. Wire edit/delete invoice flows to the recalc routine per affected product.
5. Schedule the midnight job in the business timezone + manual admin triggers.
6. Implement payments with frozen exchange rates, epsilon balance validation, and
   full status recomputation on every change.
7. Implement `get_net_profit` using per-sale `avg_cost_after` as COGS.
8. Add indexes: every FK, `daily_stock(date)`, `stock_movements(product_id, invoice_id)`,
   `invoices(invoice_date/type/status/due_date)`, normalized barcode/SKU functional indexes.
9. Verify the invariants in section 9 with tests (create → edit → backdated edit →
   delete → replay; multi-currency partial payments; gap fill after downtime).
