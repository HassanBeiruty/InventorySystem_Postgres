# Automatic Deployment Setup

Both Vercel and Render support automatic deployments when you push to GitHub.

## ✅ Vercel (Frontend) - Already Automatic!

Vercel automatically deploys when you push to your connected branch (usually `main`).

### Verify Auto-Deploy is Enabled:

1. Go to https://vercel.com/dashboard
2. Click on your project: `InventorySystem_Postgres`
3. Go to **Settings** → **Git**
4. Verify:
   - ✅ **Production Branch**: `main` (or your default branch)
   - ✅ **Auto-deploy** is enabled
   - ✅ **Deploy Hooks** are active

### How It Works:
- Every `git push` to `main` branch → **Automatic deployment**
- Preview deployments for pull requests
- Build logs available in dashboard

### Customize (Optional):
- **Settings** → **Git** → **Production Branch**: Change if needed
- **Settings** → **Deployments** → Configure build settings

---

## 🔧 Render (Backend) - Enable Auto-Deploy

Render needs to be configured for automatic deployments.

### Step 1: Enable Auto-Deploy

1. Go to https://dashboard.render.com
2. Click on your **invoicesystem-api** web service
3. Go to **Settings** tab
4. Scroll to **"Auto-Deploy"** section
5. Select: **"Yes"** (Auto-deploy on git push)
6. **Save Changes**

### Step 2: Verify Branch

1. In the same **Settings** tab
2. Check **"Branch"** field
3. Should be: `main` (or your default branch)
4. If different, update it

### Step 3: Manual Deploy (One-time)

After enabling auto-deploy:
1. Go to **Manual Deploy** tab
2. Click **"Deploy latest commit"**
3. This ensures everything is synced

### How It Works After Setup:
- Every `git push` to `main` branch → **Automatic deployment**
- Render will:
  1. Pull latest code
  2. Run build command: `cd server && npm install`
  3. Start service: `cd server && npm start`
  4. Health check

---

## 🗄️ Render Database - No Auto-Deploy Needed

**PostgreSQL database** doesn't need auto-deploy (it's a managed service).
- Database schema changes are handled by your application code
- The `/api/admin/init` endpoint creates/updates tables automatically

---

## 📋 Workflow Summary

### Your Development Workflow:

```bash
# 1. Make changes locally
git add .
git commit -m "Your changes"
git push origin main

# 2. Automatic deployments happen:
#    ✅ Vercel: Frontend deploys automatically (2-5 min)
#    ✅ Render: Backend deploys automatically (5-10 min)

# 3. Check deployment status:
#    - Vercel: https://vercel.com/dashboard
#    - Render: https://dashboard.render.com
```

---

## 🔍 Verify Auto-Deploy is Working

### Test It:

1. Make a small change (e.g., update a comment)
2. Commit and push:
   ```bash
   git commit --allow-empty -m "Test auto-deploy"
   git push origin main
   ```
3. Check dashboards:
   - **Vercel**: Should show "Building..." then "Ready" (2-5 min)
   - **Render**: Should show "Updating..." then "Live" (5-10 min)

---

## ⚙️ Advanced: Deployment Hooks & Notifications

### Vercel:
- **Settings** → **Git** → **Deploy Hooks**
- Create webhooks for CI/CD integration
- Get notifications via email/Slack

### Render:
- **Settings** → **Notifications**
- Enable email notifications for deployments
- Get alerts for failed deployments

---

## 🚨 Troubleshooting

### Render Not Auto-Deploying?

1. **Check Settings**:
   - Go to service → Settings → Auto-Deploy
   - Must be set to **"Yes"**

2. **Check Branch**:
   - Settings → Branch
   - Must match your GitHub branch name (usually `main`)

3. **Check GitHub Connection**:
   - Settings → Git Repository
   - Verify repository is connected
   - Reconnect if needed

4. **Manual Trigger**:
   - Manual Deploy → Deploy latest commit
   - This will sync everything

### Vercel Not Auto-Deploying?

1. **Check Git Connection**:
   - Settings → Git
   - Verify repository is connected
   - Reconnect if needed

2. **Check Branch**:
   - Settings → Git → Production Branch
   - Should be `main`

3. **Check Build Settings**:
   - Settings → General → Build & Development Settings
   - Verify build command: `npm run build`

---

## 📝 Quick Checklist

- [ ] Vercel: Auto-deploy enabled (default)
- [ ] Render: Auto-deploy set to "Yes"
- [ ] Render: Branch set to `main`
- [ ] Both services connected to GitHub
- [ ] Tested with a test commit

---

## 🎯 Best Practices

1. **Always push to `main`** for production deployments
2. **Use feature branches** for testing (Vercel creates preview deployments)
3. **Monitor deployment logs** for errors
4. **Test locally first** before pushing
5. **Use meaningful commit messages** (visible in deployment history)

---

## 📊 Deployment Status

Check deployment status:
- **Vercel**: Dashboard shows deployment history and status
- **Render**: Service page shows current deployment status and logs

Both platforms show:
- ✅ Success (green)
- ⏳ In Progress (yellow)
- ❌ Failed (red)

---

That's it! Once configured, every `git push` will automatically deploy your changes! 🚀

