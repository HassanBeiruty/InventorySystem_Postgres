# Production Setup Guide

## Setting First User as Admin

If you need to set the first user as admin in production, you have two options:

### Option 1: Use the Setup Endpoint (Recommended)

Call this endpoint once after deployment:

```bash
POST https://your-backend-url.onrender.com/api/admin/setup-first-admin
```

**No authentication required** - This endpoint is safe because:
- It only works if NO admin exists
- It sets the first user (lowest ID) as admin
- Can be called multiple times safely (idempotent)

**Using curl:**
```bash
curl -X POST https://your-backend-url.onrender.com/api/admin/setup-first-admin
```

**Using Postman:**
- Method: POST
- URL: `https://your-backend-url.onrender.com/api/admin/setup-first-admin`
- No headers needed

### Option 2: Direct SQL (If you have database access)

If you have direct access to your PostgreSQL database:

```sql
-- Add is_admin column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Set first user as admin
UPDATE users 
SET is_admin = true 
WHERE id = (SELECT MIN(id) FROM users);
```

## After Setup

1. The first user (lowest ID) will be set as admin
2. That user can then manage other users through Settings → User Management
3. The setup endpoint can be called again safely if needed

## Important Notes

- The setup endpoint only works if no admin exists
- Once an admin exists, you must use the Settings page to manage admin status
- The endpoint automatically adds the `is_admin` column if it doesn't exist

