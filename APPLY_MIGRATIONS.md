# How to Apply Database Migrations to Production

## Quick Method: Restart Render Service (Recommended)

The database migrations run automatically when your backend server starts. Simply restart your Render service:

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Open your backend service** (e.g., `invoicesystem-api`)
3. **Click "Manual Deploy"** → **"Deploy latest commit"**
   - OR click the **restart button** (circular arrow icon)
4. **Wait for deployment** (2-3 minutes)
5. **Check the logs** - You should see:
   ```
   Starting SQL schema initialization...
   ✓ Table 'exchange_rates' created/verified
   ✓ Columns for 'invoice_payments_multi_currency' added/verified
   ✓ SQL init completed: X/X tables created
   ```

The migrations are **idempotent** - they can be run multiple times safely. If tables/columns already exist, they'll be skipped.

## What Gets Applied

### New Tables:
- **exchange_rates** - For managing currency exchange rates

### Updated Tables:
- **invoice_payments** - Adds multi-currency support:
  - `paid_amount` (renamed from `payment_amount`)
  - `currency_code` (USD, LBP, EUR)
  - `exchange_rate_on_payment`
  - `usd_equivalent_amount`

### Data Migration:
- Existing payments are automatically migrated:
  - `currency_code` = 'USD'
  - `exchange_rate_on_payment` = 1.0
  - `usd_equivalent_amount` = `paid_amount`

## Verify Migrations Applied

After restart, check the Render logs. You should see messages like:
- `✓ Table 'exchange_rates' created/verified`
- `✓ Columns for 'invoice_payments_multi_currency' added/verified`

## Alternative: Manual Migration Script

If you prefer to run migrations manually, you can use the script:

1. **Connect to Render Shell**:
   - Go to your Render service
   - Click "Shell" tab
   - Or use SSH if configured

2. **Run the migration script**:
   ```bash
   cd server
   node scripts/apply-migrations-prod.js
   ```

## Troubleshooting

### If migrations fail:
1. Check Render logs for specific error messages
2. Verify database connection is working
3. Ensure environment variables are set correctly
4. Check if database user has CREATE TABLE permissions

### If tables already exist:
- This is normal! The migrations are idempotent and will skip existing objects
- You'll see messages like: `⚠ Table 'exchange_rates' already exists (skipped)`

## Next Steps After Migration

1. **Add Exchange Rates**:
   - Go to your app → Exchange Rates page
   - Add rates for LBP and EUR (e.g., 1 USD = 89500 LBP)

2. **Test Multi-Currency Payments**:
   - Create a test invoice
   - Try recording a payment in different currencies
   - Verify USD equivalent calculations are correct

