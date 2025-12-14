# Quick Steps: Migrate to Supabase & Deploy

## Step 1: Create Supabase Database

1. Go to https://supabase.com → Sign up (GitHub, no credit card)
2. Click "New Project"
   - Name: `invoicesystem`
   - Database Password: `prX8Z5tD2wfHLvah`
   - Choose region → Create
3. Wait 2-3 minutes for setup
4. Go to **Settings → Database**
5. Scroll to **Connection string** section
6. **IMPORTANT**: Use **"Connection Pooling" tab** (NOT "URI" tab)
   - This avoids IPv6 connection issues on Render
7. Select **Transaction mode**
8. **For Option A (DATABASE_URL)**: Copy the **Connection Pooler URI**:
   - It should look like:
     ```
     postgresql://postgres.qblzgsyxokobdysavpcl:prX8Z5tD2wfHLvah@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres
     ```
   - **Note**: Port is `6543` (pooler), host contains `pooler.supabase.com`, and user includes project ref

---

## Step 2: Update Backend Environment Variables in Render

### Option A: Use DATABASE_URL (Recommended - Simpler)

If you already have a Render service, update your environment variables:

1. Go to Render dashboard → Your service `invoicesystem-api`
2. Go to **Environment** tab
3. **DELETE** these old Render DB variables:
   - `PG_HOST`
   - `PG_PORT`
   - `PG_DATABASE`
   - `PG_USER`
   - `PG_PASSWORD`
4. **ADD** this new variable:
   - **Key**: `DATABASE_URL`
   - **Value**: `postgresql://postgres.qblzgsyxokobdysavpcl:prX8Z5tD2wfHLvah@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres`
   - **⚠️ IMPORTANT**: Use the **Connection Pooler URL** from Step 1 (port 6543, not 5432)
5. **KEEP** these existing variables (update if needed):
   - `NODE_ENV` = `production`
   - `PORT` = `10000`
   - `PG_SSL` = `true`
   - `JWT_SECRET` = `fP9!zQ7v@W3k#Lm2Xr8$Bt6nH4y%Cd0` 
   - `FRONTEND_URL` = `https://inventory-system-postgres.vercel.app/`
6. Click **Save Changes** (service will auto-redeploy)

### Option B: Use Individual Parameters (Similar to Current Setup)

If you prefer to keep individual parameters:

1. Go to Render dashboard → Your service `invoicesystem-api`
2. Go to **Environment** tab
3. **UPDATE** these variables:
   - `PG_HOST` = `aws-0-us-east-1.pooler.supabase.com` (connection pooler host, NOT `db.xxxxx.supabase.co`)
   - `PG_PORT` = `6543` (connection pooler port, NOT 5432)
   - `PG_DATABASE` = `postgres`
   - `PG_USER` = `postgres.qblzgsyxokobdysavpcl` (includes project ref, NOT just `postgres`)
   - `PG_PASSWORD` = `prX8Z5tD2wfHLvah`
   - `PG_SSL` = `true` (keep this)
   - **⚠️ IMPORTANT**: Use connection pooler details (port 6543) to avoid IPv6 issues
4. **KEEP** these existing variables:
   - `NODE_ENV` = `production`
   - `PORT` = `10000`
   - `JWT_SECRET` = `fP9!zQ7v@W3k#Lm2Xr8$Bt6nH4y%Cd0`
   - `FRONTEND_URL` = `https://inventory-system-postgres.vercel.app/`
5. Click **Save Changes** (service will auto-redeploy)

**Recommendation**: Use **Option A** (DATABASE_URL) - it's simpler and your code supports it!

---

## Step 3: Deploy Frontend on Vercel

1. Go to https://vercel.com → Log in with GitHub
2. Click "Add New..." → "Project"
3. Import repository: `InventorySytem_Postgres`
4. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (root)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add Environment Variable:
   ```
   VITE_API_URL=https://invoicesystem-api.onrender.com
   ```
   (Use your backend URL from Step 2)
6. Click "Deploy"
7. Wait 2-3 minutes
8. **Save your frontend URL**: `https://your-app.vercel.app`

---

## Step 4: Update Backend CORS

1. Go back to Render dashboard → Your backend service
2. Go to "Environment" tab
3. Update `FRONTEND_URL`:
   ```
   FRONTEND_URL=https://your-app.vercel.app
   ```
   (Use your Vercel URL from Step 3)
4. Save (auto-redeploys)

---

## Step 5: Verify Database Initialization

**The database auto-initializes when your backend starts!** No manual action needed.

### Option A: Check Render Logs (Recommended)

1. Go to Render dashboard → Your service `invoicesystem-api`
2. Click on **"Logs"** tab
3. Look for these messages:
   - `✓ Database connection verified`
   - `✓ SQL init completed: X/Y tables created`
   - If you see these, initialization succeeded!

### Option B: Check Init Status Endpoint

1. Visit in browser: `https://invoicesystem-api-esb1.onrender.com/api/admin/init-status`
2. Should return JSON with tables list:
   ```json
   {
     "status": "ok",
     "tablesCount": 15,
     "tables": ["users", "products", "invoices", ...]
   }
   ```

**If tables don't appear:** Check Render logs for errors. The service auto-initializes on every restart, so just restart the service if needed.

---

## Step 6: Create First Admin User

1. Visit your frontend: `https://your-app.vercel.app`
2. Sign up with your email
3. First user automatically becomes admin

---

## ✅ Done!

**Your URLs:**
- Frontend: `https://your-app.vercel.app`
- Backend: `https://invoicesystem-api.onrender.com`
- Database: Supabase (free forever)

**Notes:**
- Supabase free tier: 500MB storage, unlimited requests
- Render backend: Spins down after 15min (cold start ~30sec)
- Schema auto-initializes on first backend startup

---

## Troubleshooting

### Error: `connect ENETUNREACH` or IPv6 connection failed

**Problem**: You see errors like:
```
connect ENETUNREACH 2406:da12:...:5432
```

**Cause**: Using direct connection (port 5432) which resolves to IPv6, but Render can't reach it.

**Solution**: Use **Connection Pooler** (port 6543) instead:
1. In Supabase, go to **Settings → Database**
2. Use **"Connection Pooling" tab** (NOT "URI" tab)
3. Copy the connection pooler URL (port 6543)
4. Update your `DATABASE_URL` or individual parameters to use the pooler
5. The pooler URL has:
   - Host: `aws-0-us-east-1.pooler.supabase.com` (contains "pooler")
   - Port: `6543` (NOT 5432)
   - User: `postgres.qblzgsyxokobdysavpcl` (includes project ref)

After updating, Render will auto-redeploy and should connect successfully!

