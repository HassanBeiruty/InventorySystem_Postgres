# Quick Start Guide - Comprehensive Tests

## Prerequisites

1. Database is running and accessible
2. Environment variables are set (`.env` file in `server/` directory)
3. Database schema is initialized

## Quick Commands

### Run All Tests
```bash
cd server
npm run test:comprehensive
```

### Run a Specific Section
```bash
cd server
npm run test:comprehensive:section auth
npm run test:comprehensive:section invoices
npm run test:comprehensive:section performance
```

### Run Tests with Jest Directly
```bash
cd server
npx jest tests/comprehensive/01-auth.test.js
npx jest tests/comprehensive --verbose
```

## Test Sections Overview

| Section | File | Description |
|---------|------|-------------|
| 1 | `01-auth.test.js` | Authentication tests |
| 2 | `02-customers.test.js` | Customer management |
| 3 | `03-suppliers.test.js` | Supplier management |
| 4 | `04-categories.test.js` | Category management |
| 5 | `05-products.test.js` | Product management |
| 6 | `06-invoices.test.js` | Invoice management |
| 7 | `07-payments.test.js` | Payment processing |
| 8 | `08-exchange-rates.test.js` | Exchange rates |
| 9 | `09-inventory.test.js` | Inventory tracking |
| 10 | `10-stock-movements.test.js` | Stock movements |
| 11 | `11-product-prices.test.js` | Product pricing |
| 12 | `12-export.test.js` | CSV exports |
| 13 | `13-admin.test.js` | Admin functions |
| 14 | `14-performance.test.js` | Performance benchmarks |

## What Gets Tested

✅ All API endpoints  
✅ Request validation  
✅ Error handling  
✅ Response times  
✅ Data integrity  
✅ Authentication & authorization  

## Performance Expectations

- **Fast requests**: < 200ms
- **Acceptable**: < 500ms
- **Slow (warning)**: < 1000ms
- **Very slow (warning)**: < 5000ms
- **Timeout (error)**: > 5000ms

## Troubleshooting

**Connection issues?**
- Run sections individually instead of all at once
- Check database connection settings
- Verify database is running

**Tests failing?**
- Check database is initialized
- Verify environment variables
- Review error messages in test output

**Slow performance?**
- Check database performance
- Review performance summary for slow endpoints
- Consider database optimization

