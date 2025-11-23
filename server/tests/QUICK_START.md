# Quick Start - Automated Testing

## Setup (One Time)

1. **Install dependencies** (already done):
   ```bash
   cd server
   npm install
   ```

2. **Create test environment file** (optional):
   ```bash
   cp .env .env.test
   # Edit .env.test if you want separate test database
   ```

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

### Run with Coverage
```bash
npm run test:coverage
```

## What Gets Tested

The test suite simulates a complete user journey:

1. ✅ **Authentication** - Signup, Signin, Get Current User
2. ✅ **Categories** - Create, List, Update
3. ✅ **Products** - Create, List, Update
4. ✅ **Customers** - Create, List
5. ✅ **Suppliers** - Create, List
6. ✅ **Product Prices** - Create, List
7. ✅ **Invoices** - Create Buy Invoice, List, Get Details
8. ✅ **Payments** - Record Payment
9. ✅ **Inventory** - Today's Stock, Stock Movements, Low Stock

## Performance Metrics

After tests complete, you'll see:
- ⏱️ Response time for each request
- 📊 Average performance
- 🚀 Fastest/Slowest requests
- ✅ Success/Failure status

## Test Reports

- **HTML Report**: `server/test-reports/test-report.html`
- **Coverage Report**: `server/coverage/index.html`
- **Console Output**: Performance summary

## Troubleshooting

**Tests fail to connect?**
- Make sure your server is running: `npm run dev` (in another terminal)
- Or set `API_URL` environment variable: `API_URL=http://localhost:5050 npm test`

**Database errors?**
- Ensure PostgreSQL is running
- Check `.env` or `.env.test` has correct database credentials

**Port already in use?**
- Change `PORT` in `.env.test` to a different port (e.g., 5051)

