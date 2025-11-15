# Deployment Guide

This guide will help you deploy the Invoice System to free hosting platforms.

## Architecture

- **Frontend**: Vercel (React/Vite)
- **Backend**: Render (Node.js/Express)
- **Database**: Render PostgreSQL (Free Tier)

## Prerequisites

1. GitHub account
2. Vercel account (free) - https://vercel.com
3. Render account (free) - https://render.com

## Step 1: Deploy Database and Backend on Render

### 1.1 Create Render Account and Connect GitHub

1. Go to https://render.com and sign up
2. Connect your GitHub account
3. Select your repository: `InventorySystem_Postgres`

### 1.2 Create PostgreSQL Database

1. In Render dashboard, click **"New +"** → **"PostgreSQL"**
2. Configure:
   - **Name**: `invoicesystem-db`
   - **Database**: `invoicesystem`
   - **User**: `invoicesystem_user`
   - **Region**: Choose closest to you
   - **Plan**: **Free**
3. Click **"Create Database"**
4. Wait for database to be created (2-3 minutes)
5. **Save the connection details** shown on the dashboard:
   - Internal Database URL
   - Host, Port, Database, User, Password

### 1.3 Deploy Backend Service

1. In Render dashboard, click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Configure:
   - **Name**: `invoicesystem-api`
   - **Region**: Same as database
   - **Branch**: `main`
   - **Root Directory**: Leave empty (or `server` if you want to deploy only server folder)
   - **Environment**: `Node`
   - **Build Command**: `cd server && npm install`
   - **Start Command**: `cd server && npm start`
   - **Plan**: **Free**

4. **Environment Variables** - Add these:
   ```
   NODE_ENV=production
   PORT=10000
   PG_HOST=<your-db-host-from-step-1.2>
   PG_PORT=5432
   PG_DATABASE=invoicesystem
   PG_USER=<your-db-user-from-step-1.2>
   PG_PASSWORD=<your-db-password-from-step-1.2>
   PG_SSL=true
   JWT_SECRET=<generate-a-strong-random-string-here>
   FRONTEND_URL=https://your-app.vercel.app
   ```

   **To generate JWT_SECRET**, use:
   ```bash
   # Linux/Mac
   openssl rand -base64 32
   
   # Windows PowerShell
   -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
   ```

5. Click **"Create Web Service"**
6. Wait for deployment (5-10 minutes)
7. **Save your backend URL**: `https://invoicesystem-api.onrender.com` (or your custom domain)

### 1.4 Update Backend URL

After deployment, update the `FRONTEND_URL` environment variable in Render with your actual Vercel URL (you'll get this in Step 2).

## Step 2: Deploy Frontend on Vercel

### 2.1 Create Vercel Account and Connect GitHub

1. Go to https://vercel.com and sign up
2. Connect your GitHub account
3. Import your repository: `InventorySystem_Postgres`

### 2.2 Configure Vercel Project

1. **Project Settings**:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (root)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

2. **Environment Variables** - Add:
   ```
   VITE_API_URL=https://invoicesystem-api.onrender.com
   ```
   (Use your actual Render backend URL from Step 1.3)

3. Click **"Deploy"**
4. Wait for deployment (2-5 minutes)
5. **Save your frontend URL**: `https://your-app.vercel.app`

### 2.3 Update Backend CORS

1. Go back to Render dashboard
2. Edit your backend service
3. Update `FRONTEND_URL` environment variable:
   ```
   FRONTEND_URL=https://your-app.vercel.app
   ```
4. Save and redeploy

### 2.4 Update Vercel Configuration (Optional)

If you want to use Vercel's proxy instead of direct API calls:

1. Update `vercel.json` with your actual backend URL:
   ```json
   {
     "rewrites": [
       {
         "source": "/api/(.*)",
         "destination": "https://invoicesystem-api.onrender.com/api/$1"
       }
     ]
   }
   ```

2. Remove `VITE_API_URL` from Vercel environment variables
3. Redeploy

## Step 3: Initialize Database

After both services are deployed:

1. Visit your backend health endpoint:
   ```
   https://invoicesystem-api.onrender.com/api/health
   ```
   Should return: `{"status":"ok",...}`

2. Initialize database schema:
   ```
   POST https://invoicesystem-api.onrender.com/api/admin/init
   ```
   
   You can use:
   - **Postman**
   - **curl**: `curl -X POST https://invoicesystem-api.onrender.com/api/admin/init`
   - **Browser extension** (like REST Client)

3. Verify initialization:
   ```
   GET https://invoicesystem-api.onrender.com/api/admin/init-status
   ```
   Should show all tables created.

4. (Optional) Seed sample data:
   - SSH into Render service (if available)
   - Or create a one-time script endpoint to seed data

## Step 4: Test Deployment

1. Visit your frontend URL: `https://your-app.vercel.app`
2. Create a new account
3. Test creating products, invoices, etc.
4. Check backend logs in Render dashboard for any errors

## Free Tier Limitations

### Render Free Tier:
- **Web Services**: Spins down after 15 minutes of inactivity (cold start ~30 seconds)
- **PostgreSQL**: 90 days free trial, then $7/month (or use external free DB)
- **Bandwidth**: 100 GB/month

### Vercel Free Tier:
- **Bandwidth**: 100 GB/month
- **Builds**: Unlimited
- **No cold starts**

## Alternative: Use Supabase (Free PostgreSQL)

If Render PostgreSQL free tier expires:

1. Create account at https://supabase.com
2. Create new project
3. Get connection string from Settings → Database
4. Update backend environment variables in Render:
   ```
   PG_HOST=<supabase-host>
   PG_PORT=5432
   PG_DATABASE=postgres
   PG_USER=postgres
   PG_PASSWORD=<supabase-password>
   PG_SSL=true
   ```

## Troubleshooting

### Backend won't start:
- Check Render logs for errors
- Verify all environment variables are set
- Ensure database is accessible from Render

### CORS errors:
- Verify `FRONTEND_URL` in backend matches your Vercel URL exactly
- Check browser console for exact error

### Database connection errors:
- Verify database credentials in Render
- Check if database is running (Render dashboard)
- Ensure `PG_SSL=true` for Render PostgreSQL

### Frontend can't reach backend:
- Check `VITE_API_URL` in Vercel environment variables
- Verify backend URL is correct
- Check browser network tab for failed requests

## Custom Domain (Optional)

### Vercel:
1. Go to Project Settings → Domains
2. Add your domain
3. Follow DNS configuration instructions

### Render:
1. Go to Service Settings → Custom Domain
2. Add your domain
3. Update DNS records as instructed

## Monitoring

- **Render**: View logs in dashboard, set up alerts
- **Vercel**: Analytics available in dashboard
- **Database**: Monitor in Render dashboard

## Security Checklist

- ✅ JWT_SECRET is set and strong
- ✅ Database password is secure
- ✅ CORS is configured correctly
- ✅ Environment variables are not in code
- ✅ HTTPS is enabled (automatic on Vercel/Render)
- ✅ Database uses SSL connection

## Support

- Render Docs: https://render.com/docs
- Vercel Docs: https://vercel.com/docs
- Project Issues: Open issue on GitHub

