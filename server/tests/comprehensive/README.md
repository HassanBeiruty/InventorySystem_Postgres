# Comprehensive Test Suite

This directory contains a comprehensive automated test suite for the Inventory System. The tests are organized into sections to allow running them independently and avoid restarting with connection problems.

## Features

- **Section-based organization**: Tests are split into logical sections that can run independently
- **Performance monitoring**: All tests track response times and flag slow requests
- **Comprehensive coverage**: Tests cover all API endpoints and features
- **Local testing only**: Tests are designed to run locally, not in production

## Test Sections

1. **01-auth.test.js** - Authentication (signup, signin, logout, get current user)
2. **02-customers.test.js** - Customer management (CRUD)
3. **03-suppliers.test.js** - Supplier management (CRUD)
4. **04-categories.test.js** - Category management (CRUD + delete)
5. **05-products.test.js** - Product management (CRUD + delete)
6. **06-invoices.test.js** - Invoice management (create, list, get, update, delete, stats)
7. **07-payments.test.js** - Invoice payments (create, list)
8. **08-exchange-rates.test.js** - Exchange rate management (admin only)
9. **09-inventory.test.js** - Inventory management (low stock, daily, today, history)
10. **10-stock-movements.test.js** - Stock movements (recent)
11. **11-product-prices.test.js** - Product prices (CRUD)
12. **12-export.test.js** - CSV export (products, invoices, customers, suppliers, inventory)
13. **13-admin.test.js** - Admin endpoints (health check, user management)
14. **14-performance.test.js** - Performance benchmarks and summary

## Running Tests

### Run All Tests

```bash
# From server directory
npm run test:comprehensive

# Or using the test runner directly
node tests/comprehensive/00-test-runner.js all
```

### Run a Specific Section

```bash
# Run only authentication tests
node tests/comprehensive/00-test-runner.js auth

# Run only invoice tests
node tests/comprehensive/00-test-runner.js invoices

# Available sections:
# - auth
# - customers
# - suppliers
# - categories
# - products
# - invoices
# - payments
# - exchange-rates
# - inventory
# - stock-movements
# - product-prices
# - export
# - admin
# - performance
```

### Run with Jest Directly

```bash
# Run all comprehensive tests
npx jest tests/comprehensive

# Run a specific test file
npx jest tests/comprehensive/01-auth.test.js

# Run with coverage
npx jest tests/comprehensive --coverage
```

## Performance Monitoring

All tests automatically track:
- Response times for each request
- Average, min, and max response times
- Requests categorized by speed (fast, acceptable, slow, very-slow, timeout)
- Warnings for slow requests (>1000ms)
- Errors for timeout requests (>5000ms)

Performance thresholds:
- **Fast**: < 200ms
- **Acceptable**: < 500ms
- **Slow**: < 1000ms (warning)
- **Very Slow**: < 5000ms (warning)
- **Timeout**: > 5000ms (error)

## Test Helpers

### PerformanceMonitor
Tracks and reports performance metrics for all test requests.

### TestDataGenerator
Generates unique test data for all entity types.

### ApiClient
Helper for making authenticated API requests with automatic token management.

## Notes

- Tests run against your local database
- Tests create test data that may persist (cleanup is optional)
- Each section can run independently to avoid connection issues
- Performance reports are printed after each section completes
- All tests include performance assertions to ensure requests complete within acceptable time

## Troubleshooting

### Connection Issues
If you experience connection problems:
1. Run tests in sections instead of all at once
2. Add delays between sections using the test runner
3. Check your database connection settings

### Slow Tests
If tests are slow:
1. Check database performance
2. Review the performance summary for specific slow endpoints
3. Consider optimizing slow queries

### Test Failures
If tests fail:
1. Check that the database is running and accessible
2. Verify environment variables are set correctly
3. Ensure the database schema is initialized
4. Check the test output for specific error messages

