# Automated Test Suite

This test suite simulates a real user interacting with the inventory system, testing all functionality and measuring performance.

## Features

- **Complete User Flow Testing**: Simulates end-to-end user interactions
- **Performance Monitoring**: Tracks response times for all API requests
- **Comprehensive Coverage**: Tests all major features:
  - Authentication (signup, signin, logout)
  - Category management
  - Product management
  - Customer/Supplier management
  - Product pricing
  - Invoice creation and management
  - Payment processing
  - Inventory tracking
  - Stock movements

## Running Tests

### Run All Tests
```bash
cd server
npm test
```

### Run User Flow Tests Only
```bash
npm run test:user-flow
```

### Run with Coverage Report
```bash
npm run test:coverage
```

### Watch Mode (for development)
```bash
npm run test:watch
```

## Test Reports

After running tests, you'll find:
- **HTML Report**: `server/test-reports/test-report.html` - Detailed test results with performance metrics
- **Coverage Report**: `server/coverage/` - Code coverage information
- **Console Output**: Performance summary printed to console

## Performance Benchmarks

The test suite measures:
- **Response Time**: Time taken for each API request
- **Average Performance**: Overall system performance
- **Slowest/Fastest Requests**: Identify bottlenecks

Expected performance:
- Average response time: < 1000ms
- Maximum response time: < 5000ms

## Test Structure

```
tests/
├── setup.js              # Test configuration and utilities
├── helpers/
│   └── testUtils.js      # Helper functions for testing
└── integration/
    └── user-flow.test.js # Main user flow test suite
```

## Environment Setup

Create a `.env.test` file for test-specific configuration:

```env
NODE_ENV=test
PORT=5051
JWT_SECRET=test-secret-key-for-testing-only
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=invoicesystem_test
PG_USER=postgres
PG_PASSWORD=your_password
PG_SSL=false
```

## Notes

- Tests automatically clean up created resources after completion
- Tests use a separate test database (recommended) or can use the main database
- All tests are designed to be idempotent and can be run multiple times

