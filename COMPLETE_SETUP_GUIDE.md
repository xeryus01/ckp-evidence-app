# 🔧 Complete Setup & Troubleshooting Guide

Panduan lengkap setup lokal, migration, dan troubleshooting untuk CKP Evidence App.

---

## 📋 Quick Reference

### Commands

```bash
# Development
npm install                 # Install dependencies
npm run dev                 # Start dev server (http://localhost:3000)

# Testing
npm run vercel:check       # Check Vercel setup
npm run vercel:setup       # Setup/link Vercel project
npm run migrate:vercel     # Migrate data to Vercel Blob

# Deployment
npm run deploy:preview     # Deploy preview version
npm run deploy:prod        # Deploy production

# Environment
cp .env.example .env.local # Copy example env
vercel env pull           # Pull Vercel environment variables
vercel logs --follow      # View live logs
```

---

## 🏠 Local Development Setup

### 1. Clone & Install

```bash
# Navigate ke project
cd ckp-evidence-app

# Install dependencies
npm install

# Setup environment file
cp .env.example .env.local
```

### 2. Configure Google Drive Access

**Option A: Using Service Account (Recommended)**

```bash
# 1. Download service-account.json dari Google Cloud Console
#    https://console.cloud.google.com/apis/credentials

# 2. Simpan di project root: service-account.json

# 3. Update .env.local:
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

**Option B: Using Application Default Credentials**

```bash
# Install Google Cloud CLI
gcloud auth application-default login

# .env.local tidak perlu Google credentials (auto-detected)
```

### 3. Start Development Server

```bash
npm run dev

# Output:
# CKP Evidence App berjalan di http://localhost:3000
```

Buka browser ke `http://localhost:3000` dan test:
- ✅ Create profil baru
- ✅ Create periode
- ✅ Add kegiatan
- ✅ Upload evidence
- ✅ Generate PDF

---

## 🌐 Vercel Setup

### 1. Create Vercel Account

- https://vercel.com
- Sign up with GitHub/GitLab/Bitbucket
- Link repository

### 2. Link Project

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Link project
vercel link

# Follow prompts
```

### 3. Create Blob Storage

**Via Vercel Dashboard:**

1. Dashboard > Project > Storage > Create > Blob
2. Name: `ckp-evidence-db`
3. Region: Pilih terdekat
4. Copy **BLOB_READ_WRITE_TOKEN**

**Via CLI:**

```bash
vercel storage create blob --name ckp-evidence-db
```

### 4. Set Environment Variables

```bash
# Via Dashboard: Project Settings > Environment Variables

# Atau via CLI:
vercel env add BLOB_READ_WRITE_TOKEN
# Paste token saat diminta

vercel env add GOOGLE_SERVICE_ACCOUNT_JSON
# Paste 1-line JSON credentials
```

### 5. Verify Setup

```bash
npm run vercel:check

# Output akan menunjukkan:
# ✓ Vercel linked
# ✓ Blob token found
# ✓ Environment variables set
```

---

## 📦 Migration: Local → Vercel Blob

### Pre-Migration Checklist

```bash
# ✓ Backup data lokal
mkdir -p backups
cp storage/app-data.json backups/app-data-$(date +%Y%m%d).json
cp -r storage/evidence backups/evidence-$(date +%Y%m%d)
cp -r storage/output backups/output-$(date +%Y%m%d)

# ✓ Setup .env dengan Blob token
echo "BLOB_READ_WRITE_TOKEN=vercel_blob_rw_..." >> .env

# ✓ Verify token bekerja
vercel env list
```

### Run Migration

```bash
# Interactive migration dengan feedback detail
npm run migrate:vercel

# Output akan menunjukkan:
# 📤 Migrasi file bukti manual ke Blob...
#   ✓ Upload: file1.jpg → evidence/...
#   ✓ Upload: file2.pdf → evidence/...
#
# 📤 Migrasi PDF yang sudah dibuat ke Blob...
#   ✓ Upload: bukti.pdf → output/...
#
# 📤 Upload data JSON ke Blob...
# ✓ Data JSON diupload ke Blob: data/app-data.json
#
# ✅ MIGRASI SELESAI
# Total file dimigrasikan: 42
# File yang gagal: 0
```

### Verify Migration

```bash
# 1. Check di Vercel Dashboard
# Storage > Blob > Contents
# Seharusnya ada:
# - data/app-data.json
# - evidence/...
# - output/...

# 2. Test app local
npm run dev

# 3. API diagnostics
curl http://localhost:3000/api/diagnostics | jq .

# 4. Create something baru
# Pastikan data persisten di Blob (bisa di dashboard)
```

---

## 🚀 Deployment

### Preview Deployment

```bash
# Deploy ke staging/preview
vercel --prod=false

# Atau commit ke git (jika linked)
git push

# Vercel otomatis deploy preview
# Check email atau Vercel Dashboard untuk preview URL
```

### Production Deployment

```bash
# Deploy production
vercel --prod

# Atau
vercel deploy --prod

# Verify di:
# Vercel Dashboard > Deployments
# Live URL: https://ckp-evidence-app.vercel.app
```

---

## 🔍 Troubleshooting

### Issue: `BLOB_READ_WRITE_TOKEN not found`

**Symptoms:**
```
❌ ERROR: BLOB_READ_WRITE_TOKEN belum diatur
```

**Solutions:**

```bash
# 1. Check .env file
cat .env | grep BLOB_READ_WRITE_TOKEN

# 2. If empty, add token
vercel env add BLOB_READ_WRITE_TOKEN
# Paste: vercel_blob_rw_...

# 3. Pull latest from Vercel
vercel env pull .env

# 4. Verify
cat .env | grep BLOB_READ_WRITE_TOKEN
```

### Issue: `Failed to connect to Google Drive`

**Symptoms:**
```
❌ ERROR: Failed to read files from Google Drive
❌ Service account credentials not found
```

**Solutions:**

```bash
# 1. Check credentials file
ls -la service-account.json

# 2. If missing, download from Google Cloud Console
# https://console.cloud.google.com/apis/credentials
# Create > Service Account > Download JSON

# 3. Verify format
cat service-account.json | jq . | head -5

# 4. For Vercel, convert to 1-line JSON
cat service-account.json | jq -c . | pbcopy  # macOS
# Atau Windows: Select All > Copy

# 5. Set in Vercel Dashboard
# Project Settings > Environment Variables
# GOOGLE_SERVICE_ACCOUNT_JSON = {1-line JSON}

# 6. Verify
npm run vercel:check
```

### Issue: `Data tidak persisten setelah deploy`

**Symptoms:**
- Lokal berjalan fine
- Preview/Production data hilang setelah refresh
- Atau error "data tidak ditemukan"

**Diagnosis:**

```bash
# 1. Check storage configuration
curl https://your-app.vercel.app/api/diagnostics | jq '.storage'

# Expected output:
# {
#   "usesBlob": true,
#   "blobToken": true,
#   "inMemoryCacheActive": false
# }

# 2. If usesBlob=false, Blob token tidak terbaca
vercel env list

# 3. Check Vercel logs
vercel logs --follow

# Look for: "[readData] Attempting Blob read"
```

**Solutions:**

```bash
# 1. Verify token di Vercel
vercel env list | grep BLOB

# 2. If missing, add:
vercel env add BLOB_READ_WRITE_TOKEN
vercel env add DATA_BLOB_PATH

# 3. Redeploy
vercel deploy --prod

# 4. Wait untuk propagate (biasanya 1-2 menit)
sleep 120

# 5. Test
curl https://your-app.vercel.app/api/state
```

### Issue: `PDF generation fails / timeout`

**Symptoms:**
```
❌ Timeout Error: Request timed out
❌ Error generating PDF
```

**Solutions:**

```bash
# 1. Check function timeout
cat vercel.json | jq '.functions["api/index.js"]'

# Should show: "maxDuration": 300

# 2. Check function memory
# Should show: "memory": 1024

# 3. Verify current config
vercel inspect

# 4. If needed, update vercel.json
# and redeploy:
vercel deploy --prod --force

# 5. For large PDFs, split into parts
# Each kegiatan harus terpisah, jangan digabung
```

### Issue: `File upload size limit`

**Symptoms:**
```
❌ File terlalu besar
❌ Ukuran file melebihi batas upload
```

**Solutions:**

```bash
# 1. Check current limit
echo "MAX_UPLOAD_MB in env: $(grep MAX_UPLOAD_MB .env || echo 'default: 4')"

# 2. Vercel default limit: 4.5MB per request
# Rekomendasi: 4MB untuk safety

# 3. Untuk file lebih besar:
# - Compress image sebelum upload
# - Split PDF menjadi multiple kegiatan
# - Upgrade Vercel plan untuk function memory

# 4. Edit .env
echo "MAX_UPLOAD_MB=4" >> .env
vercel env add MAX_UPLOAD_MB
# Paste: 4

# 5. Redeploy
vercel deploy --prod
```

### Issue: `Memory exceeded / Out of memory`

**Symptoms:**
```
❌ FATAL: JavaScript heap out of memory
❌ Cannot allocate memory
```

**Solutions:**

```bash
# 1. Vercel default: 1024 MB
# Maximum: 3008 MB

# 2. Update vercel.json:
cat > vercel.json << 'EOF'
{
  "functions": {
    "api/index.js": {
      "maxDuration": 300,
      "memory": 2048
    }
  }
}
EOF

# 3. Redeploy
git add vercel.json
git commit -m "Increase function memory to 2048MB"
git push

# 4. Monitor
vercel logs --follow

# 5. If still OOM, reduce:
# - Image resolution
# - PDF page count per request
# - Concurrent uploads
```

### Issue: `Google Drive file 404 / not found`

**Symptoms:**
```
❌ File tidak ditemukan di Google Drive
❌ Akses ditolak
```

**Solutions:**

```bash
# 1. Verify Google Drive sharing
# - Open file di Google Drive
# - Check visibility (shared with service account?)
# - Check permissions (reader/editor?)

# 2. Verify file link format
# Supported formats:
# - https://drive.google.com/file/d/{FILE_ID}/view
# - https://drive.google.com/folders/{FOLDER_ID}
# - {FILE_ID} langsung

# 3. Test file access
# Di lokal:
curl https://www.googleapis.com/drive/v3/files/{FILE_ID} \
  -H "Authorization: Bearer $(gcloud auth print-access-token)"

# 4. If access denied:
# - Share file dengan service account email
# - Email format: {project}-{hash}@{project}.iam.gserviceaccount.com
# - Find di Google Cloud Console > Service Accounts

# 5. Retry upload
```

### Issue: `Blob storage full`

**Symptoms:**
```
❌ Blob storage quota exceeded
❌ 413 Payload too large
```

**Solutions:**

```bash
# 1. Check storage usage
# Vercel Dashboard > Storage > Blob > Settings

# 2. View current contents
vercel storage list blob

# 3. If full:
# Option A: Delete old files via Dashboard
# Option B: Upgrade Vercel plan
# Option C: Cleanup locally

# 4. For manual cleanup:
# Vercel Dashboard > Storage > Blob > Click file > Delete

# 5. Re-migrate if needed
npm run migrate:vercel
```

---

## 📊 Monitoring

### Check App Health

```bash
# 1. Health endpoint
curl https://your-app.vercel.app/api/health

# Expected: {"ok": true}

# 2. Diagnostics
curl https://your-app.vercel.app/api/diagnostics | jq .

# Expected status: "healthy"

# 3. Get current state
curl https://your-app.vercel.app/api/state | jq '.profiles | length'

# Shows number of profiles
```

### View Logs

```bash
# Real-time logs
vercel logs --follow

# Filter by function
vercel logs api/index.js

# Last N lines
vercel logs --limit 100

# Export to file
vercel logs > app-logs.txt

# Search in logs
vercel logs | grep -i error
```

### Performance

```bash
# Check deployment status
vercel deployments

# View analytics
# Vercel Dashboard > Analytics

# Inspect function
vercel inspect <deployment-id>

# See cold starts, latency, etc.
```

---

## 🔄 Rollback

### Rollback to Previous Version

```bash
# List deployments
vercel deployments

# Show details
vercel deployments --limit 10

# Promote previous deployment
vercel promote <DEPLOYMENT_ID>

# Or delete failed deployment
vercel remove <DEPLOYMENT_ID>
```

### Restore Data

```bash
# If data corrupted in Blob:

# 1. Check backups
ls -la backups/app-data-*.json

# 2. Re-upload backup
# Option A: Restore local, then migrate again
cp backups/app-data-YYYYMMDD.json storage/app-data.json
npm run migrate:vercel

# Option B: Via Vercel Dashboard
# Storage > Blob > app-data.json > Restore Version
```

---

## ✅ Deployment Checklist

Before production:

- [ ] `npm install` - semua dependencies terinstall
- [ ] `npm run dev` - local berjalan sempurna
- [ ] `vercel link` - project linked ke Vercel
- [ ] Blob storage created
- [ ] `BLOB_READ_WRITE_TOKEN` set di Vercel
- [ ] `GOOGLE_SERVICE_ACCOUNT_JSON` set di Vercel
- [ ] Data migrated: `npm run migrate:vercel`
- [ ] Preview tested: `vercel --prod=false`
- [ ] `/api/diagnostics` endpoint healthy
- [ ] Manual testing passed:
  - [ ] Create profil
  - [ ] Create periode & kegiatan
  - [ ] Upload file manual
  - [ ] Generate PDF
  - [ ] Refresh → data persisten
- [ ] Google Drive integration tested
- [ ] `vercel logs` no errors
- [ ] Ready for production: `vercel deploy --prod`

---

## 🎯 Best Practices

1. **Always Backup Before Migration**
   ```bash
   cp storage/app-data.json storage/app-data.backup-$(date +%s).json
   ```

2. **Use Environment Variables**
   - Never commit secrets to git
   - Use `.env` locally (in .gitignore)
   - Use Vercel Dashboard for production

3. **Test in Preview First**
   ```bash
   vercel deploy  # Or git push if linked
   ```

4. **Monitor Production**
   ```bash
   vercel logs --follow
   ```

5. **Keep Git Clean**
   ```bash
   # .gitignore harus include:
   .env
   .env.local
   service-account.json
   node_modules/
   storage/
   ```

---

## 📞 Quick Help

| Issue | Command |
|-------|---------|
| App berjalan lokal? | `npm run dev` → http://localhost:3000 |
| Setup Vercel? | `vercel link` → ikuti prompts |
| Blob token berhasil? | `vercel env list \| grep BLOB` |
| Data di Blob? | Dashboard > Storage > Blob > Contents |
| Deployment working? | `curl https://your-app.vercel.app/api/health` |
| Error di production? | `vercel logs --follow` |
| Mau rollback? | `vercel promote <DEPLOYMENT_ID>` |
| Database backup? | `backups/` folder |

---

## 🚀 Success!

Aplikasi siap untuk production:
- ✅ Local development bekerja
- ✅ Vercel deployment configured
- ✅ Blob storage persisten
- ✅ Google Drive integrated
- ✅ Data migration complete
- ✅ Production tested

**Happy deploying!** 🎉
