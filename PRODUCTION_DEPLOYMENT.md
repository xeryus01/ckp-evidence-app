# 🚀 Production Deployment Guide - CKP Evidence App to Vercel

Complete step-by-step guide untuk deploy aplikasi ke Vercel dengan full persistence menggunakan Vercel Blob Storage.

---

## 📋 Prerequisites

Sebelum mulai, pastikan Anda memiliki:

- ✅ Git repository initialized (sudah ada `.git/`)
- ✅ Vercel account (https://vercel.com)
- ✅ Vercel CLI installed (`npm install -g vercel`)
- ✅ Node.js 22.x installed
- ✅ Google Cloud credentials (untuk akses Google Drive)
- ✅ Data lokal di `storage/app-data.json` (jika ada)

---

## 🔧 Step 1: Setup Lokal (Preparation)

### 1.1 Install Dependencies

```bash
npm install
```

### 1.2 Verify Lokal Development Berjalan

```bash
# Copy environment template
cp .env.example .env.local

# Update .env.local dengan Google credentials:
# GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# Run lokal
npm run dev
# Buka http://localhost:3000
```

### 1.3 Backup Data Lokal

```bash
# Backup data dan uploaded files
cp storage/app-data.json storage/app-data.backup-$(date +%Y%m%d-%H%M%S).json
cp -r storage/evidence storage/evidence.backup-$(date +%Y%m%d-%H%M%S)
cp -r storage/output storage/output.backup-$(date +%Y%m%d-%H%M%S)
```

---

## 🌐 Step 2: Link Aplikasi ke Vercel

### 2.1 Daftarkan Aplikasi di Vercel

```bash
# Login ke Vercel
vercel login

# Link project (ikuti prompts)
vercel link

# Pilih:
# - Link to existing project: No (atau Yes jika sudah ada)
# - Project name: ckp-evidence-app
# - Directory: .
```

Atau via Vercel Dashboard:
1. https://vercel.com/new
2. Import Git repository
3. Pilih configuration defaults
4. Deploy

### 2.2 Verify Konfigurasi Vercel

```bash
# Cek status
vercel projects list
vercel env list

# Lihat environment variables yang sudah ada
vercel env pull .env.local

# Atau buka di Dashboard:
# https://vercel.com/dashboard → Select Project → Settings → Environment Variables
```

---

## 💾 Step 3: Setup Vercel Blob Storage

### 3.1 Enable Vercel Blob

Di Vercel Dashboard:

1. Masuk ke project Anda: `https://vercel.com/dashboard`
2. Klik project name: `ckp-evidence-app`
3. Buka tab **Storage**
4. Klik **Create** → **Blob**
5. Namakan: `ckp-evidence-db` (atau nama apapun)
6. Pilih region (gunakan region terdekat)
7. Klik **Create**

### 3.2 Dapatkan Token Blob

Setelah Blob dibuat:

1. Klik Blob yang baru dibuat
2. Buka tab **Settings**
3. Copy **BLOB_READ_WRITE_TOKEN**
4. Simpan di tempat aman (Anda akan butuh ini)

---

## 🔐 Step 4: Setup Environment Variables di Vercel

### 4.1 Google Service Account JSON

Anda butuh konversi `service-account.json` menjadi 1-line JSON:

```bash
# Linux/Mac:
cat service-account.json | tr -d '\n' > /tmp/google-sa.json
cat /tmp/google-sa.json | xclip -selection clipboard

# Windows PowerShell:
[System.IO.File]::ReadAllText("service-account.json") | Set-Clipboard
```

### 4.2 Set Environment Variables di Vercel

Di Vercel Dashboard > Project Settings > Environment Variables, tambahkan:

```env
# Google Cloud Service Account (1-line JSON dari langkah 4.1)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","...":...}

# Vercel Blob Token (dari Step 3.2)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Data Blob Path (optional, default: data/app-data.json)
DATA_BLOB_PATH=data/app-data.json

# Node environment
NODE_ENV=production

# File paths (akan diabaikan di Vercel, menggunakan Blob)
TMP_DIR=/tmp/ckp-evidence
OUTPUT_DIR=/tmp/ckp-evidence/output
EVIDENCE_DIR=/tmp/ckp-evidence/evidence
MAX_UPLOAD_MB=4
```

### 4.3 Verify Environment Variables

```bash
# Pull dan verifikasi
vercel env pull .env.production

# Cek isinya (jangan commit ke git!)
cat .env.production

# Pastikan semua variabel ada
```

---

## 🚀 Step 5: Migration Data Lokal ke Blob

Jika Anda memiliki data lokal yang ingin dimigrasikan:

### 5.1 Persiapan

```bash
# Pastikan Anda memiliki .env dengan BLOB_READ_WRITE_TOKEN
# Tambahkan ke .env lokal:
# BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Pull vercel environment
vercel env pull .env.vercel.migration
cat .env.vercel.migration >> .env
```

### 5.2 Run Migration Script

```bash
# Script ini akan:
# 1. Backup data lokal
# 2. Upload manual evidence files ke Blob
# 3. Upload generated PDFs ke Blob
# 4. Upload app-data.json ke Blob

npm run migrate:vercel

# Atau langsung:
node scripts/migrate-local-to-vercel.js
```

Output akan menunjukkan:
- ✓ File berhasil diupload
- ✗ File yang gagal
- 📊 Verifikasi total file

### 5.3 Verifikasi di Vercel Dashboard

1. Masuk ke Vercel Dashboard
2. Project → Storage → Blob
3. Seharusnya ada:
   - `data/app-data.json`
   - `evidence/...` (manual files)
   - `output/...` (generated PDFs)

---

## ⚠️ Step 6: Important Configuration Checks

### 6.1 Vercel Function Configuration

File `vercel.json` sudah dikonfigurasi dengan optimal:

```json
{
  "functions": {
    "api/index.js": {
      "maxDuration": 300,
      "memory": 1024
    }
  }
}
```

✓ maxDuration 300s (untuk PDF generation yang kompleks)
✓ memory 1024MB (untuk processing file besar)

### 6.2 .vercelignore Optimal

```
node_modules         # Tidak diupload (terlalu besar)
.env                 # Tidak upload credentials
storage/            # Sudah di Blob, tidak perlu
.git/                # Repository metadata
```

### 6.3 package.json Scripts

```json
"scripts": {
  "start": "node server/index.js",      // Production server
  "dev": "nodemon server/index.js",     // Development
  "migrate:vercel": "node scripts/migrate-local-to-vercel.js"
}
```

Vercel secara otomatis menggunakan `npm start` atau `npm run build`.

---

## 🧪 Step 7: Test Preview Deployment

Sebelum production, test di preview environment:

### 7.1 Deploy Preview

```bash
# Deploy ke preview environment
vercel --prod=false

# Atau via git (jika linked):
git push
# Vercel otomatis deploy preview
```

### 7.2 Test Functionalities

Preview URL: `https://ckp-evidence-app-xxxx.vercel.app` (diberikan setelah deploy)

Test:

```bash
# 1. Health check
curl https://ckp-evidence-app-xxxx.vercel.app/api/health

# 2. Diagnostics
curl https://ckp-evidence-app-xxxx.vercel.app/api/diagnostics
# Response:
# {
#   "environment": {"vercel": true},
#   "storage": {"usesBlob": true, "inMemoryCacheActive": false},
#   "features": {"blob": true, "googleDrive": true},
#   "status": "healthy"
# }

# 3. Load aplikasi
curl https://ckp-evidence-app-xxxx.vercel.app
```

### 7.3 Manual Testing di Browser

1. Buka preview URL
2. Buat profil baru
3. Buat periode dan kegiatan
4. Upload file manual
5. Generate PDF
6. Refresh halaman → data harus persisten

---

## 📦 Step 8: Production Deployment

Setelah testing preview berhasil:

### 8.1 Deploy Production

```bash
# Deploy ke production
vercel --prod

# Atau:
vercel deploy --prod
```

### 8.2 Verify Production

```bash
# Cek status deployment
vercel deployments

# Buka aplikasi production
# https://ckp-evidence-app.vercel.app
```

### 8.3 Test Production

Lakukan manual test yang sama seperti preview untuk memastikan semuanya berjalan.

---

## 🔍 Troubleshooting

### Problem: BLOB_READ_WRITE_TOKEN tidak terbaca

**Solution:**
```bash
# Pull latest environment
vercel env pull

# Atau set manual:
vercel env add BLOB_READ_WRITE_TOKEN
# Paste token saat diminta

# Verify
vercel env list
```

### Problem: Data tidak persisten setelah deploy

**Check:**
1. Pastikan `BLOB_READ_WRITE_TOKEN` terset di Vercel
2. Cek di Vercel Dashboard > Storage > Blob > Contents
3. Gunakan endpoint diagnostics: `/api/diagnostics`

```bash
curl https://your-app.vercel.app/api/diagnostics | jq '.storage'
# Seharusnya: "usesBlob": true
```

### Problem: File upload gagal

**Possible causes:**
1. `MAX_UPLOAD_MB=4` terlalu kecil → ubah di env variables
2. Blob storage penuh → check quota di Dashboard
3. File format tidak support → hanya image dan PDF

### Problem: PDF generation timeout

**Solutions:**
1. Increase function timeout di `vercel.json` (max 300s)
2. Optimize image processing di server
3. Split large PDF menjadi beberapa kegiatan

---

## 📊 Monitoring & Maintenance

### 7.1 Monitor di Vercel Dashboard

- **Deployments**: Tab Deployments
- **Logs**: Tab Logs (real-time logs)
- **Analytics**: Tab Analytics (traffic, errors)
- **Storage**: Tab Storage > Blob (usage statistics)

### 7.2 View Logs

```bash
# Real-time logs
vercel logs --follow

# Filter by function
vercel logs api/index.js

# Export logs
vercel logs --limit=1000 > logs.txt
```

### 7.3 Storage Management

Blob storage punya limit sesuai plan. Monitor di:
- Vercel Dashboard > Storage > Blob > Settings

Untuk cleanup:
```bash
# Local backup sebelum delete
npm run migrate:vercel  # Backup di storage/app-data.backup-*.json

# Manual delete via Dashboard atau API
# Lihat https://vercel.com/docs/storage/vercel-blob/api-reference
```

---

## 🔄 Rollback Procedure

Jika ada masalah di production:

### Rollback ke Previous Deployment

```bash
# Lihat deployments
vercel deployments

# Promote previous deployment
vercel promote [DEPLOYMENT_ID]
```

### Rollback Data

Jika data rusak:

1. Stop current deployment
2. Restore dari backup lokal:
   ```bash
   npm run migrate:vercel
   ```
3. Atau restore via Vercel Dashboard > Storage > Blob > Versions (jika enabled)

---

## ✅ Deployment Checklist

Sebelum declare production ready:

- [ ] Environment variables semua terset di Vercel
- [ ] BLOB_READ_WRITE_TOKEN terbaca di diagnostics (`/api/diagnostics`)
- [ ] Data lokal sudah dimigrasikan ke Blob (jika ada)
- [ ] Preview deployment testing berhasil
- [ ] Production deployment testing berhasil
- [ ] Google Drive integration bekerja
- [ ] Manual file upload bekerja
- [ ] PDF generation bekerja
- [ ] Data persisten setelah refresh
- [ ] Logs tidak ada error (vercel logs)
- [ ] Domain/DNS configured (jika custom domain)

---

## 📞 Support & Resources

### Official Documentation
- Vercel Deployment: https://vercel.com/docs
- Vercel Blob Storage: https://vercel.com/docs/storage/vercel-blob
- Express.js: https://expressjs.com
- Node.js 22: https://nodejs.org/docs/latest-v22.x/api/

### Diagnostics Endpoint

Gunakan untuk debugging:
```bash
curl https://your-app.vercel.app/api/diagnostics | jq .
```

Response:
```json
{
  "environment": {
    "vercel": true,
    "nodeEnv": "production"
  },
  "storage": {
    "usesBlob": true,
    "isVercel": true,
    "blobToken": true,
    "inMemoryCacheActive": false,
    "inMemoryCacheProfiles": 0
  },
  "features": {
    "googleDrive": true,
    "blob": true,
    "pdfGeneration": true
  },
  "status": "healthy"
}
```

---

## 🎉 Deployment Complete!

Aplikasi Anda sekarang berjalan di Vercel dengan:

✅ **Persistent Storage**: Vercel Blob untuk data, files, dan PDFs  
✅ **Scalable Infrastructure**: Auto-scaling Vercel functions  
✅ **Global CDN**: Automatic image optimization dan caching  
✅ **Monitoring**: Real-time logs dan analytics  
✅ **Reliability**: Automatic backups dan rollback capabilities  

Aplikasi siap untuk production usage! 🚀
