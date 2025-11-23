# Production Deployment Checklist

## Pre-Deployment

### 1. Environment Variables
- [ ] Set `JWT_SECRET` to a strong, random secret key (at least 32 characters)
- [ ] Set `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD` for production database
- [ ] Set `PG_SSL=true` if using a cloud database (Render, AWS RDS, etc.)
- [ ] Set `NODE_ENV=production`
- [ ] Set `PORT` if different from default (5050)

### 2. Database Setup
- [ ] Run database initialization: The schema will auto-initialize on first startup
- [ ] Clear old users with weak password hashes:
  ```bash
  npm run clear-users
  ```
- [ ] Create new admin user through the signup endpoint (first user becomes admin)

### 3. Security
- [ ] Verify `JWT_SECRET` is set and not using default value
- [ ] Verify rate limiting is enabled (already configured)
- [ ] Verify Helmet security headers are enabled (already configured)
- [ ] Verify CORS is configured for your frontend domain
- [ ] Verify all passwords are hashed with bcrypt (already implemented)

### 4. Code Review
- [ ] All console.error statements are intentional (for error logging)
- [ ] JWT_SECRET warning is intentional (security check)
- [ ] No hardcoded secrets or credentials
- [ ] All API endpoints have proper validation (express-validator)
- [ ] All database queries use parameterized queries (SQL injection protection)

### 5. Testing
- [ ] Run test suite: `npm test`
- [ ] Verify all tests pass
- [ ] Test signup/signin flow manually
- [ ] Test invoice creation with transactions
- [ ] Test stock recalculation

## Post-Deployment

### 1. Initial Setup
1. Clear users table:
   ```bash
   npm run clear-users
   ```

2. Create first admin user:
   - Use the `/api/auth/signup` endpoint
   - First user automatically becomes admin
   - Use a strong password (will be hashed with bcrypt)

3. Verify:
   - Sign in with new credentials
   - Check that user is admin
   - Test creating categories, products, invoices

### 2. Monitoring
- [ ] Monitor error logs
- [ ] Monitor database connection
- [ ] Monitor API response times
- [ ] Check daily stock snapshot job is running (if enabled)

### 3. Backup
- [ ] Set up database backups
- [ ] Test backup restoration process
- [ ] Document backup schedule

## Security Notes

- **Password Hashing**: All passwords are now hashed with bcrypt (10 salt rounds)
- **JWT Tokens**: Tokens expire after 7 days
- **Rate Limiting**: 
  - Auth endpoints: 5 requests per 15 minutes
  - General API: 100 requests per 15 minutes
- **SQL Injection**: All queries use parameterized queries
- **Input Validation**: All endpoints use express-validator

## Performance Optimizations

- ✅ Batched SQL inserts for invoice items
- ✅ Transactions for invoice create/update/delete
- ✅ Optimized database parameter passing (plain arrays)
- ✅ Stored procedures for stock recalculation

## Known Issues

None at this time.

