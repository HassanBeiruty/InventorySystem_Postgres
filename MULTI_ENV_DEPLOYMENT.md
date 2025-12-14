# Multi-Environment Deployment Guide

This guide covers deploying your Inventory System to **two separate environments**:
- **Staging/Testing**: Render + Vercel (existing setup)
- **Production**: Render/Fly.io + Netlify + Supabase (new setup)

Both environments run independently, allowing you to test changes in staging before deploying to production.

## Why Different Databases?

**Staging Database**: Render PostgreSQL
- 90-day free trial, then $7/month
- Fine for testing (you can let it expire after testing)

**Production Database**: Supabase PostgreSQL
- **Free forever** (500MB storage, unlimited API requests)
- No credit card required
- No expiration date
- Perfect for production use

This setup ensures your production database never expires or requires payment.

---

## Environment Overview

### Staging Environment (Testing)
- **Frontend**: Vercel (React/Vite)
- **Backend**: Render (Node.js/Express)
- **Database**: Render PostgreSQL (90-day free trial, then $7/month - fine for testing)
- **Purpose**: Test new features and changes
- **Deployment**: Automatic on push to your current branch
- **URLs**: 
  - Frontend: `https://https://inventory-system-postgres.vercel.app/`
  - Backend: `https://invoicesystem-api-esb1.onrender.com`

### Production Environment (Live)
- **Frontend**: Netlify (React/Vite)
- **Backend**: Render (second service) or Fly.io (Node.js/Express)
- **Database**: Supabase PostgreSQL (free forever - 500MB storage, unlimited API requests)
- **Purpose**: Live production use
- **Deployment**: Manual or on push to `main` branch
- **URLs**: 
  - Frontend: `https://your-app.netlify.app`
  - Backend: `https://invoicesystem-api-prod.onrender.com` (Render) or `https://invoicesystem-api-prod.fly.dev` (Fly.io)

---

## Deployment Workflow

### Recommended Flow: Staging → Production

1. **Develop & Test Locally**
   - Make code changes
   - Test locally with `npm run dev:all`

2. **Deploy to Staging**
   - Push changes to your branch
   - Render and Vercel auto-deploy
   - Test thoroughly on staging URLs
   - Verify all features work correctly

3. **Deploy to Production**
   - After staging verification
   - Manually trigger production deployment OR
   - Merge to `main` branch (if auto-deploy configured)
   - Production deploys independently
   - Final verification on production URLs

---

## Part 1: Staging Environment Setup (Existing)

If you already have Render + Vercel set up, you can skip this section. Otherwise, follow the existing `DEPLOYMENT.md` guide.

### Quick Reference for Staging

**Render Backend Environment Variables:**
```
NODE_ENV=production
PORT=10000
PG_HOST=<render-db-host>
PG_PORT=5432
PG_DATABASE=invoicesystem
PG_USER=<render-db-user>
PG_PASSWORD=<render-db-password>
PG_SSL=true
JWT_SECRET=<staging-jwt-secret>
FRONTEND_URL=https://your-app.vercel.app
```

**Vercel Frontend Environment Variables:**
```
VITE_API_URL=https://invoicesystem-api.onrender.com
```

---

## Part 2: Production Environment Setup (New)

**Important**: Render PostgreSQL is a 90-day free trial, then $7/month. For production, we'll use **Supabase PostgreSQL** which is **free forever** (500MB storage, unlimited API requests, no credit card required).

### Step 1: Create Supabase Database (Production)

1. **Create Supabase Account**
   - Go to https://supabase.com
   - Click "Start your project"
   - Sign up with GitHub (no credit card required)
   - Verify your email

2. **Create New Project**
   - Click "New Project"
   - **Organization**: Create new or use existing
   - **Name**: `invoicesystem-production`
   - **Database Password**:prX8Z5tD2wfHLvah
   - **Region**: Choose closest to you
   - Click "Create new project"
   - Wait 2-3 minutes for project creation

3. **Get Database Connection Details**

   **IMPORTANT**: For Render and serverless environments, use the **Connection Pooler** (not direct connection) to avoid IPv6 issues.

   - Go to **Settings** → **Database**
   - Scroll to **Connection string**
   - **Use the "Connection Pooling" tab** (not "URI" or "JDBC")
   - Select **Transaction mode** (recommended for serverless)
   - Copy the **Connection Pooler URI** (looks like):
     ```
     postgresql://postgres.qblzgsyxokobdysavpcl:prX8Z5tD2wfHLvah@aws-0-us-east-1.pooler.supabase.com:6543/postgres
     ```
   - **Note**: Port is `6543` (connection pooler), not `5432` (direct)
   - **Save this connection string** - you'll need it for your backend

   **Why Connection Pooler?**
   - Avoids IPv6 connection issues
   - Better for serverless environments (Render, Fly.io)
   - Handles connection limits better
   - More reliable for production

4. **Alternative: Use Individual Parameters with Connection Pooler**
   - **Host**: `aws-0-us-east-1.pooler.supabase.com` (from connection pooler, NOT `db.xxxxx.supabase.co`)
   - **Port**: `6543` (connection pooler port, NOT 5432)
   - **Database**: `postgres`
   - **User**: `postgres.qblzgsyxokobdysavpcl` (includes project ref)
   - **Password**: prX8Z5tD2wfHLvah
   - **SSL**: Required (always true for Supabase) 

---

### Step 2: Deploy Backend (Production) - Choose One Option

**Option A: Second Render Service (Recommended - Easiest)**

Since you already use Render for staging, this is the simplest option. Create a second Render service for production.

1. **Create New Render Web Service**
   - Go to https://render.com (you already have an account)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository: `InventorySytem_Postgres`
   - Configure:
     - **Name**: `invoicesystem-api-prod` (different from staging)
     - **Region**: Choose closest to you
     - **Branch**: `main` (or your production branch)
     - **Root Directory**: `server`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Plan**: **Free**

2. **Configure Environment Variables**

   **Option 1: Use DATABASE_URL (Recommended - Easiest)**
   
   Add this single environment variable:
   ```
   DATABASE_URL=postgresql://postgres.qblzgsyxokobdysavpcl:prX8Z5tD2wfHLvah@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
   (Use your actual connection pooler URL from Step 1)

   Plus these:
   ```
   NODE_ENV=production
   PORT=10000
   PG_SSL=true
   JWT_SECRET=Qp9wL7mG2uX4zA8sV1eK0cRbT6yPjF3hN9tW2qY5uR8sD4vB7nF0kC6mT1zP8a
   FRONTEND_URL=https://693883c623fc95567410574d--melodic-begonia-7f79d5.netlify.app/
   ```

   **Option 2: Use Individual Parameters (If DATABASE_URL doesn't work)**
   
   ```
   NODE_ENV=production
   PORT=10000
   PG_HOST=aws-0-us-east-1.pooler.supabase.com
   PG_PORT=6543
   PG_DATABASE=postgres
   PG_USER=postgres.qblzgsyxokobdysavpcl
   PG_PASSWORD=prX8Z5tD2wfHLvah
   PG_SSL=true
   JWT_SECRET=Qp9wL7mG2uX4zA8sV1eK0cRbT6yPjF3hN9tW2qY5uR8sD4vB7nF0kC6mT1zP8a
   FRONTEND_URL=https://693883c623fc95567410574d--melodic-begonia-7f79d5.netlify.app/
   ```
   
   **CRITICAL**: 
   - Use connection pooler host: `aws-0-us-east-1.pooler.supabase.com` (NOT `db.xxxxx.supabase.co`)
   - Use connection pooler port: `6543` (NOT `5432`)
   - User includes project ref: `postgres.qblzgsyxokobdysavpcl` (NOT just `postgres`)
   
   **Important Notes:**
   - Use your Supabase **connection pooler** details from Step 1
   - Connection pooler avoids IPv6 connection issues
   - Set `FRONTEND_URL` after deploying frontend (Step 3)

3. **Deploy**
   - Click "Create Web Service"
   - Wait 5-10 minutes for deployment
   - **Save your backend URL**: `https://inventorysystem-postgres.onrender.com`

4. **Test Backend**
   - Visit: `https://inventorysystem-postgres.onrender.com/api/health`
   - Should return: `{"status":"ok",...}`

**Note**: Render free tier spins down after 15 min inactivity (cold start ~30 seconds). This is fine for production with limited traffic.

---

### Step 3: Deploy Frontend on Netlify (Production)

1. **Create Netlify Account**
   - Go to https://netlify.com
   - Click "Sign up"
   - Sign up with GitHub
   - Authorize Netlify

2. **Create New Site**
   - Click "Add new site" → "Import an existing project"
   - Choose "Deploy with GitHub"
   - Select your repository: `InventorySytem_Postgres`
   - Click "Connect"

3. **Configure Build Settings**
   - Netlify should auto-detect Vite
   - Verify these settings:
     - **Base directory**: Leave empty (root)
     - **Build command**: `npm run build`
     - **Publish directory**: `dist`
   - If auto-detection fails, the `netlify.toml` file will handle it

4. **Set Environment Variables**
   - Click "Show advanced"
   - Click "New variable"
   - Add:
     ```
     VITE_API_URL=https://inventorysystem-postgres.onrender.com
     ```
   - Replace with your actual backend URL from Step 2 (Render or Fly.io)

5. **Deploy**
   - Click "Deploy site"
   - Wait 2-3 minutes for build and deployment
   - **Save your frontend URL**: `https://693883c623fc95567410574d--melodic-begonia-7f79d5.netlify.app/`

6. **Update Backend CORS**
   - Go back to your backend dashboard (Render or Fly.io)
   - Update `FRONTEND_URL` environment variable:
     ```
     FRONTEND_URL=https://693883c623fc95567410574d--melodic-begonia-7f79d5.netlify.app/
     ```
   - **Render**: Edit environment variables in dashboard, save (auto-redeploys)

---

### Step 4: Initialize Production Database

1. **Initialize Database Schema**
   - Visit: `POST https://inventorysystem-postgres.onrender.com/api/admin/init`
   - Use Postman, curl, or browser extension:
     ```bash
     # Render example
     curl -X POST https://inventorysystem-postgres.onrender.com/api/admin/init
     
     ```

2. **Verify Initialization**
   - Visit: `GET https://inventorysystem-postgres.onrender.com/api/admin/init-status`
   - Should show all tables created successfully

3. **Create First Admin User**
   - Visit your production frontend: `https://your-app.netlify.app`
   - Sign up with your email
   - The first user automatically becomes admin

---

## Part 3: Managing Both Environments

### Environment URLs Reference

Create a document to track your URLs:

**Staging:**
- Frontend: `https://your-app.vercel.app`
- Backend: `https://invoicesystem-api.onrender.com`
- Database: Render PostgreSQL

**Production:**
- Frontend: `https://your-app.netlify.app`
- Backend: `https://invoicesystem-api-prod.onrender.com` 

### Deployment Commands

**Staging (Automatic):**
```bash
git add .
git commit -m "Your changes"
git push  # Auto-deploys to Render + Vercel
```

**Production (Manual):**
1. After testing on staging
2. Merge to `main` branch OR
3. Manually trigger deployment in Netlify/Render or Fly.io dashboards

### Environment Variables Summary

**Staging Backend (Render):**
- Uses Render PostgreSQL
- `FRONTEND_URL` = Vercel URL
- Separate `JWT_SECRET` for staging

**Production Backend (Render or Fly.io):**
- Uses Supabase PostgreSQL
- `FRONTEND_URL` = Netlify URL
- Separate `JWT_SECRET` for production

**Staging Frontend (Vercel):**
- `VITE_API_URL` = Render backend URL

**Production Frontend (Netlify):**
- `VITE_API_URL` = Render or Fly.io backend URL

---

## Part 4: Testing & Verification

### Test Staging Environment

1. Visit staging frontend URL
2. Create test account
3. Test all features:
   - Create products
   - Create invoices
   - Manage inventory
   - Generate reports
4. Check backend logs in Render dashboard

### Test Production Environment

1. Visit production frontend URL
2. Create production account
3. Verify all features work
4. Check backend logs in Render or Fly.io dashboard
5. Compare with staging to ensure consistency

---

## Troubleshooting

### CORS Errors

**Problem**: Frontend can't connect to backend

**Solution**:
- Verify `FRONTEND_URL` in backend matches frontend URL exactly
- Check that CORS patterns include your domain
- Ensure both URLs use HTTPS

### Database Connection Errors

**Problem**: Backend can't connect to database

**Solution**:
- Verify `DATABASE_URL` or individual parameters are correct
- Check Supabase project is active
- Ensure `PG_SSL=true` for Supabase
- Check Supabase connection pooling settings

### Build Failures

**Problem**: Frontend or backend won't deploy

**Solution**:
- Check build logs in Netlify/Render or Fly.io dashboards
- Verify all environment variables are set
- Ensure `package.json` scripts are correct
- Check for TypeScript/ESLint errors

### Different Data in Staging vs Production

**Expected Behavior**: 
- Staging and production use separate databases
- Data is completely independent
- This is intentional for testing

---

## Free Tier Limitations

### Supabase Free Tier
- **Database**: 500 MB storage
- **API Requests**: Unlimited
- **Bandwidth**: 5 GB/month
- **No credit card required**

### Render Free Tier (Production Backend)
- **Web Services**: Free forever, spins down after 15 min inactivity (cold start ~30 seconds)
- **Bandwidth**: 100 GB/month
- **Deployments**: Unlimited
- **No credit card required**
- **No expiration** - truly free forever

### Fly.io Free Tier (Alternative Production Backend)
- **VMs**: 3 shared-cpu VMs (always free)
- **Storage**: 3GB persistent volumes
- **Always-on option**: No cold starts
- **Bandwidth**: Generous free tier
- **No credit card required**
- **No expiration** - truly free forever

### Netlify Free Tier
- **Bandwidth**: 100 GB/month
- **Builds**: 300 build minutes/month
- **Deployments**: Unlimited
- **No credit card required**

### Render Free Tier (Staging)
- **Web Services**: Spins down after 15 min inactivity
- **PostgreSQL**: 90 days free, then $7/month
- **Bandwidth**: 100 GB/month

### Vercel Free Tier (Staging)
- **Bandwidth**: 100 GB/month
- **Builds**: Unlimited
- **No cold starts**

---

## Security Best Practices

1. **Separate Secrets**: Use different `JWT_SECRET` for staging and production
2. **Environment Variables**: Never commit secrets to Git
3. **HTTPS**: All services provide HTTPS automatically
4. **Database Access**: Keep database credentials secure
5. **CORS**: Only allow trusted frontend domains

---

## Updating the Application

### Update Staging First

1. Make code changes
2. Test locally
3. Push to branch (auto-deploys to staging)
4. Test on staging URLs
5. Fix any issues

### Deploy to Production

1. After staging is verified
2. Merge to `main` branch OR
3. Manually trigger production deployment
4. Verify on production URLs
5. Monitor for issues

---

## Support & Resources

- **Supabase Docs**: https://supabase.com/docs
- **Render Docs**: https://render.com/docs
- **Fly.io Docs**: https://fly.io/docs
- **Netlify Docs**: https://docs.netlify.com
- **Render Docs**: https://render.com/docs
- **Vercel Docs**: https://vercel.com/docs

---

## Quick Reference Checklist

### Initial Setup
- [ ] Supabase project created
- [ ] Render or Fly.io backend deployed
- [ ] Netlify frontend deployed
- [ ] Environment variables configured
- [ ] Database initialized
- [ ] First admin user created

### Regular Deployment
- [ ] Test changes locally
- [ ] Deploy to staging (Render + Vercel)
- [ ] Test on staging
- [ ] Deploy to production (Render/Fly.io + Netlify)
- [ ] Verify production
- [ ] Monitor both environments

---

**Note**: Both environments are completely independent. You can test freely on staging without affecting production users.

