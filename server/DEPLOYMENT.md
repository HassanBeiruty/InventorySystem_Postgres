# Production Deployment Guide

## ✅ Pre-Deployment Checklist

### 1. Environment Variables
Ensure these are set in your production `.env` file:

```env
# Database
PG_HOST=your-db-host
PG_PORT=5432
PG_DATABASE=your-db-name
PG_USER=your-db-user
PG_PASSWORD=your-db-password
PG_SSL=true  # Set to true for cloud databases

# Security
JWT_SECRET=your-strong-random-secret-key-minimum-32-characters
NODE_ENV=production

# Server
PORT=5050  # Optional, defaults to 5050
```

### 2. Clear Old Users (Already Done)
The users table has been cleared. All old users with weak password hashes have been removed.

To clear again in the future:
```bash
npm run clear-users
```

### 3. Create First Admin User
After deployment, create your first admin user:

**Using API:**
```bash
POST /api/auth/signup
{
  "email": "admin@yourcompany.com",
  "password": "YourStrongPassword123!"
}
```

**Note:** The first user created automatically becomes an admin.

### 4. Verify Deployment
1. Test signup: Create first admin user
2. Test signin: Sign in with new credentials
3. Test admin access: Verify you can access admin endpoints
4. Test CRUD operations: Create a category, product, invoice

## 🔒 Security Features

- ✅ **Password Hashing**: bcrypt with 10 salt rounds
- ✅ **JWT Authentication**: Tokens expire after 7 days
- ✅ **Rate Limiting**: 
  - Auth endpoints: 5 requests/15 min
  - General API: 100 requests/15 min
- ✅ **Helmet**: Security headers enabled
- ✅ **Input Validation**: express-validator on all endpoints
- ✅ **SQL Injection Protection**: All queries use parameterized queries

## 🚀 Performance Optimizations

- ✅ Batched SQL inserts for invoice items
- ✅ Transactions for invoice operations
- ✅ Optimized database parameter passing
- ✅ Stored procedures for stock recalculation

## 📝 Available Scripts

```bash
# Run tests
npm test

# Clear users table
npm run clear-users

# Start production server
npm start

# Development mode
npm run dev
```

## 🐛 Troubleshooting

### Database Connection Issues
- Verify database credentials in `.env`
- Check if database allows connections from your server IP
- For cloud databases, ensure SSL is enabled

### JWT Secret Warning
If you see JWT_SECRET warnings:
- Set `JWT_SECRET` in your `.env` file
- Use a strong, random string (at least 32 characters)
- Never commit `.env` to version control

### User Signin Fails
- Ensure user was created after clearing old users
- Verify password is correct
- Check that passwordHash column exists (should be `passwordhash` in lowercase)

## 📊 Monitoring

Monitor these in production:
- Error logs (console.error statements)
- Database connection pool
- API response times
- Rate limit violations
- Daily stock snapshot job (if enabled)

## 🔄 Updates

When updating the codebase:
1. Pull latest changes
2. Run `npm install` to update dependencies
3. Run `npm test` to verify everything works
4. Restart the server
5. Monitor logs for errors

