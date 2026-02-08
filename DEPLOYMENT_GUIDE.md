# Render Deployment Guide - Puppeteer PDF Generation Fix

## Issue Resolution Summary

The application was failing with the error: `An 'executablePath' or 'channel' must be specified for 'puppeteer-core'`

### Root Cause
- **puppeteer-core** alone doesn't include Chromium binaries
- Render doesn't have a pre-installed Chromium browser
- Missing or improperly configured executable path

### Solution Implemented
Added dual-mode PDF generation that automatically uses the best available option:

1. **Prefers full `puppeteer` package** - Includes built-in Chromium (simplest solution)
2. **Falls back to `puppeteer-core` + `@sparticuz/chromium`** - For custom environments

## Critical Configuration for Render

### 1. **Environment Variables** (MUST BE SET in Render Dashboard)

```bash
NODE_ENV=production
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
MONGODB_URI=<your-mongodb-uri>
CLOUDINARY_CLOUD_NAME=<your-cloud-name>
CLOUDINARY_API_KEY=<your-api-key>
CLOUDINARY_API_SECRET=<your-api-secret>
PORT=8080
FRONTEND_URL=https://your-frontend-url.onrender.com
COMPANY_PREFIX_PO=INGPO
COMPANY_PREFIX_PI=INGPI
COMPANY_PREFIX_INV=INGINV
YEAR_RANGE=25-26
```

**⚠️ CRITICAL**: `NODE_ENV=production` MUST be set!

### 2. **Updated Dependencies**

Both packages are now installed:
```json
{
  "dependencies": {
    "puppeteer": "^22.12.1",           // NEW: Full puppeteer with built-in Chromium
    "puppeteer-core": "^24.22.3",      // Fallback
    "@sparticuz/chromium": "^140.0.0", // Fallback for puppeteer-core
    ...
  }
}
```

### 3. **Build Configuration**

Render settings:
- **Build Command**: `npm install`
- **Start Command**: `npm start` (runs `node server.js`)
- **Instance Plan**: Standard or higher (Free won't work)

## How It Works Now

The PDF service automatically detects which configuration to use:

```javascript
// Try full puppeteer first (recommended)
try {
  puppeteer = require("puppeteer");
  console.log("✅ Using full puppeteer package (includes chromium)");
} catch (e) {
  // Fallback to puppeteer-core + @sparticuz/chromium
  puppeteer = require("puppeteer-core");
  chromium = require("@sparticuz/chromium");
}
```

### Startup Messages (in Render Logs)

**Success with full puppeteer:**
```
✅ Using full puppeteer package (includes chromium)
✅ Using built-in puppeteer chromium (recommended)
✅ Browser launched successfully
```

**Success with fallback:**
```
✅ Using puppeteer-core with @sparticuz/chromium
✅ Chromium executable path set: /path/to/chromium
✅ Browser launched successfully
```

## Deployment Steps

### 1. Install Dependencies Locally
```bash
npm install
```

This should add `puppeteer` package to your `package-lock.json`.

### 2. Commit Changes
```bash
git add package.json package-lock.json services/pdf.service.js
git commit -m "Fix: Add dual-mode PDF generation with puppeteer fallback"
git push origin main
```

### 3. Deploy to Render

Option A: **Automatic** (if connected to GitHub)
- Push triggers automatic deploy
- Monitor in Render Dashboard → Deploys

Option B: **Manual**
- Render Dashboard → your service
- Settings → Manual Deploy

### 4. Monitor Logs

Go to Render Dashboard → Logs and look for:
```
✅ Using full puppeteer package (includes chromium)
✅ Browser launched successfully
✅ Billing Software Backend is live!
```

## Troubleshooting

### Still Getting "executablePath" Error?

1. **Check Logs**:
   - Should show: `Using full puppeteer package` OR `Chromium executable path set`
   - If not, dependencies not installed properly

2. **Verify Build**:
   - Render Logs should show: `npm install` completing successfully
   - Check that `puppeteer` is listed in output

3. **Restart Service**:
   - Render Dashboard → your service
   - Click "Manual Deploy" to rebuild

4. **Clear Cache**:
   - If still failing, try: `npm ci` (clean install) instead of `npm install`

### PDF Generation Timeout?

Timeouts configured to:
- Protocol Timeout: 180 seconds
- Puppeteer Timeout: 90 seconds

If timing out on Render:
1. Upgrade to **Standard** or **Pro** plan (Free plan has limited resources)
2. Check `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` is set
3. Increase timeouts in `services/pdf.service.js` → `_createBrowser()`

### Memory Issues?

Symptoms: Browser crashes, "heap out of memory"

Solutions:
1. Use Standard plan or higher on Render
2. Limit concurrent PDF operations (already set to 2 in code)
3. Increase Node.js memory: Add to server startup:
   ```bash
   NODE_OPTIONS="--max-old-space-size=1024" npm start
   ```

## Local Development Testing

### Test with Full Puppeteer
```bash
npm install  # Installs puppeteer
npm start    # Server starts
```

### Test Production Setup
```bash
NODE_ENV=production npm start
npm run test-pdf  # Tests PDF generation
```

### Debug Browser Launch
```javascript
// In pdf.service.js _createBrowser(), check logs for:
// ✅ Using full puppeteer package (includes chromium)
// ✅ Using built-in puppeteer chromium (recommended)
// ✅ Browser launched successfully
```

## File Changes Made

1. **package.json**
   - Added `"puppeteer": "^22.12.1"` to dependencies
   - Now installs full puppeteer by default

2. **services/pdf.service.js**
   - Enhanced `_createBrowser()` with dual-mode support
   - Better error logging for debugging
   - Fallback chain: puppeteer → puppeteer-core + @sparticuz/chromium

3. **server.js**
   - Environment verification on startup
   - Warnings if configured incorrectly

## Performance Notes

- **Full puppeteer**: Larger download (~150MB), no runtime overhead
- **Puppeteer-core + chromium**: Smaller download, runtime path discovery

Both approaches work equally well once deployed.

## Next Steps

1. Run `npm install` locally to test
2. Deploy code to Render
3. Check logs for success messages
4. Test PDF generation: `POST /api/bills`

## Support

**If PDF still fails:**
1. Check exact error in Render Logs
2. Verify `NODE_ENV=production` (most common issue)
3. Ensure `puppeteer` appears in `node_modules` during build
4. Try manual deploy/restart in Render Dashboard
5. Check that service plan is Standard or higher

**Helpful logs to check:**
- `npm install` output in build logs
- First 50 lines of app startup in runtime logs
- Error messages contain stack traces

---

**Last Updated**: December 2025
**Working Solution**: Full puppeteer + puppeteer-core fallback

