# Quick Deployment Checklist

Follow these steps to deploy your Invoice System:

## 🚀 Step-by-Step Deployment

### 1️⃣ Deploy Database & Backend (Render)

1. **Sign up at Render**: https://render.com
2. **Create PostgreSQL Database**:
   - New → PostgreSQL
   - Name: `invoicesystem-db`
   - Plan: Free
   - **Save connection details!**

3. **Create Web Service (Backend)**:
   - New → Web Service
   - Connect GitHub repo
   - Settings:
     - **Build Command**: `cd server && npm install`
     - **Start Command**: `cd server && npm start`
     - **Plan**: Free
   
4. **Add Environment Variables**:
   ```
   NODE_ENV=production
   PORT=10000
   PG_HOST=<from-database-details>
   PG_PORT=5432
   PG_DATABASE=invoicesystem
   PG_USER=<from-database-details>
   PG_PASSWORD=<from-database-details>
   PG_SSL=true
   JWT_SECRET=<generate-random-64-chars>
   FRONTEND_URL=https://your-app.vercel.app
   ```
   
   **Generate JWT_SECRET** (PowerShell):
   ```powershell
   -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
   ```

5. **Deploy** and wait for URL: `https://invoicesystem-api.onrender.com`

### 2️⃣ Deploy Frontend (Vercel)

1. **Sign up at Vercel**: https://vercel.com
2. **Import GitHub Repository**
3. **Configure**:
   - Framework: Vite
   - Build Command: `npm run build`
   - Output: `dist`
   
4. **Add Environment Variable**:
   ```
   VITE_API_URL=https://invoicesystem-api.onrender.com
   ```
   (Use your actual Render backend URL)

5. **Deploy** and get URL: `https://your-app.vercel.app`

### 3️⃣ Update Backend CORS

1. Go back to Render dashboard
2. Update `FRONTEND_URL` with your Vercel URL
3. Redeploy backend

### 4️⃣ Initialize Database

Visit in browser or use curl:
```
POST https://invoicesystem-api.onrender.com/api/admin/init
```

Verify:
```
GET https://invoicesystem-api.onrender.com/api/admin/init-status
```

### 5️⃣ Test Your App

Visit: `https://your-app.vercel.app`

Create account and test!

## 📝 Important URLs to Save

- Backend URL: `https://invoicesystem-api.onrender.com`
- Frontend URL: `https://your-app.vercel.app`
- Database connection details (from Render)

## ⚠️ Free Tier Notes

- **Render**: Backend spins down after 15 min inactivity (30s cold start)
- **Vercel**: No cold starts, always fast
- **Database**: 90 days free, then $7/month (or use Supabase free tier)

## 🔧 Troubleshooting

**Backend won't start?**
- Check Render logs
- Verify all env vars are set
- Ensure database is running

**CORS errors?**
- Update `FRONTEND_URL` in Render
- Check exact URL (no trailing slash)

**Can't connect to database?**
- Verify credentials in Render
- Ensure `PG_SSL=true`

For detailed instructions, see `DEPLOYMENT.md`

