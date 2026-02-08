# Quick Deployment Guide - Render

## Problem Fixed ✅
PDF generation was failing with: `An 'executablePath' or 'channel' must be specified for 'puppeteer-core'`

## Solution: Dual-Mode Puppeteer Setup
- **Full `puppeteer`** package (includes Chromium) is now primary
- **Fallback** to `puppeteer-core` + `@sparticuz/chromium` if needed

## 3-Step Deployment

### 1️⃣ Install Locally (Test)
```bash
npm install
npm start
```
Server should start with: `✅ Using full puppeteer package (includes chromium)`

### 2️⃣ Push to GitHub
```bash
git add package.json package-lock.json services/pdf.service.js server.js
git commit -m "Fix: Full puppeteer + dual-mode PDF generation"
git push origin main
```

### 3️⃣ Check Render Logs
- Go to Render Dashboard → Logs
- Look for: `✅ Using full puppeteer package (includes chromium)`
- Look for: `✅ Browser launched successfully`

## Environment Variables (Verify in Render)
```
NODE_ENV=production              ← CRITICAL!
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
MONGODB_URI=<your-url>
CLOUDINARY_CLOUD_NAME=<your-name>
CLOUDINARY_API_KEY=<your-key>
CLOUDINARY_API_SECRET=<your-secret>
```

## Test It Works
```bash
curl -X POST https://your-app.onrender.com/api/bills \
  -H "Content-Type: application/json" \
  -d '{
    "customerName":"Test",
    "items":[{"description":"item","quantity":1,"unitPrice":100}],
    "currency":"INR"
  }'
```

Should return PDF without errors!

## Still Not Working?
1. ✅ Check `NODE_ENV=production` is set (most common issue)
2. ✅ Manual Deploy in Render (Settings → Manual Deploy)
3. ✅ Check build logs show `npm install` completing
4. ✅ Use Standard plan or higher (Free won't work for PDFs)
5. 📖 See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed troubleshooting

## Changed Files
- `package.json` - Added full puppeteer
- `services/pdf.service.js` - Dual-mode browser initialization  
- `server.js` - Environment verification
- `test-puppeteer.js` - Updated test script

---

**Status**: Ready to deploy! Push to Render and check logs.
