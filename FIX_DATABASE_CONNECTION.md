# Fix Database Connection - Password Authentication Error

## Problem
Password authentication failed for user "invoicesystem_user"

## Solution

Based on your Render database connection details, update your backend environment variables:

### Step 1: Go to Render Dashboard

1. Go to https://dashboard.render.com
2. Click on your **invoicesystem-api** web service
3. Go to **Environment** tab

### Step 2: Update Environment Variables

Make sure these variables are set **exactly** as shown (copy from your database connection page):

```
PG_HOST=dpg-d4cfopili9vc73bvptig-a
PG_PORT=5432
PG_DATABASE=invoicesystem_why3
PG_USER=invoicesystem_user
PG_PASSWORD=9e5WdemTWkYf7ybAjG11HbFBTYzZFx2s
PG_SSL=true
```

**Important Notes:**
- ⚠️ **Database name** must be `invoicesystem_why3` (not `invoicesystem`)
- ⚠️ **No spaces** before or after the `=` sign
- ⚠️ **No quotes** around the values
- ⚠️ **Copy password exactly** from Render database page

### Step 3: Verify All Variables

Check that you have ALL these variables set:

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

### Step 4: Save and Redeploy

1. Click **"Save Changes"** at the bottom
2. Render will automatically redeploy
3. Wait 2-5 minutes for deployment
4. Check logs to verify connection

### Step 5: Check Logs

After redeploy, check the logs:
1. Go to **Logs** tab in Render
2. Look for: `[DB] ✅ Connected to PostgreSQL successfully!`
3. If you see errors, check the exact error message

## Common Issues

### Issue 1: Wrong Database Name
❌ `PG_DATABASE=invoicesystem`  
✅ `PG_DATABASE=invoicesystem_why3`

### Issue 2: Extra Spaces
❌ `PG_PASSWORD = 9e5WdemTWkYf7ybAjG11HbFBTYzZFx2s`  
✅ `PG_PASSWORD=9e5WdemTWkYf7ybAjG11HbFBTYzZFx2s`

### Issue 3: Quotes Around Values
❌ `PG_PASSWORD="9e5WdemTWkYf7ybAjG11HbFBTYzZFx2s"`  
✅ `PG_PASSWORD=9e5WdemTWkYf7ybAjG11HbFBTYzZFx2s`

### Issue 4: Wrong Hostname
❌ Using external URL  
✅ Use internal hostname: `dpg-d4cfopili9vc73bvptig-a`

### Issue 5: SSL Not Enabled
❌ `PG_SSL=false`  
✅ `PG_SSL=true` (required for Render PostgreSQL)

## Alternative: Use Internal Database URL

If the above doesn't work, you can use the Internal Database URL directly:

1. Copy the **Internal Database URL** from your database page
2. Add a new environment variable:
   ```
   DATABASE_URL=postgresql://invoicesystem_user:9e5WdemTWkYf7ybAjG11HbFBTYzZFx2s@dpg-d4cfopili9vc73bvptig-a:5432/invoicesystem_why3
   ```

3. Update `server/db.js` to use `DATABASE_URL` if provided (we'll need to add this support)

## Still Not Working?

1. **Double-check** all values are copied exactly from Render database page
2. **Verify** no hidden characters or spaces
3. **Check** Render logs for the exact error message
4. **Try** deleting and re-adding the environment variables
5. **Ensure** the database service is running (green status)

