# Render Environment Variables Setup - EXACT VALUES

## Copy these EXACT values to your Render backend service:

### Option 1: Use Individual Variables (Current Setup)

Go to Render Dashboard → invoicesystem-api → Environment → Add/Update these:

```
NODE_ENV=production
PORT=10000
PG_HOST=dpg-d4cfopili9vc73bvptig-a
PG_PORT=5432
PG_DATABASE=invoicesystem_why3
PG_USER=invoicesystem_user
PG_PASSWORD=9e5WdemTWkYf7ybAjG11HbFBTYzZFx2s
PG_SSL=true
JWT_SECRET=<your-jwt-secret>
FRONTEND_URL=https://inventory-system-postgres.vercel.app
```

### Option 2: Use Internal Database URL (RECOMMENDED - EASIEST)

**Copy the Internal Database URL from your Render database page and add:**

```
DATABASE_URL=postgresql://invoicesystem_user:9e5WdemTWkYf7ybAjG11HbFBTYzZFx2s@dpg-d4cfopili9vc73bvptig-a:5432/invoicesystem_why3
```

**Plus these other variables:**
```
NODE_ENV=production
PORT=10000
JWT_SECRET=<your-jwt-secret>
FRONTEND_URL=https://inventory-system-postgres.vercel.app
```

## ⚠️ CRITICAL CHECKLIST:

1. ✅ **No spaces** before or after `=`
2. ✅ **No quotes** around values
3. ✅ **Database name** is `invoicesystem_why3` (not `invoicesystem`)
4. ✅ **Password** is exactly: `9e5WdemTWkYf7ybAjG11HbFBTYzZFx2s`
5. ✅ **PG_SSL=true** (required!)
6. ✅ **Hostname** is `dpg-d4cfopili9vc73bvptig-a` (internal hostname)

## Steps:

1. Go to Render Dashboard
2. Click on `invoicesystem-api` service
3. Click "Environment" tab
4. **DELETE** all existing PG_* variables
5. **ADD** the variables above (copy-paste exactly)
6. Click "Save Changes"
7. Wait for auto-redeploy (2-5 minutes)
8. Check logs for: `[DB] ✅ Connected to PostgreSQL successfully!`

## If Still Not Working:

1. **Delete ALL environment variables** related to database
2. **Add ONLY** `DATABASE_URL` with the Internal Database URL from Render
3. Save and redeploy
4. Check logs

## Verify in Logs:

After redeploy, you should see:
```
[DB] Connecting to: { host: 'DATABASE_URL', ... }
[DB] ✅ Connected to PostgreSQL successfully!
```

If you see errors, check the exact error message in Render logs.

