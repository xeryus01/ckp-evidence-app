# Setup Vercel - Quick Start

> **📖 Untuk panduan lengkap:** Baca [PANDUAN_DEPLOYMENT_VERCEL.md](PANDUAN_DEPLOYMENT_VERCEL.md)

## ✅ Status Setup Saat Ini

Project sudah dikonfigurasi untuk Vercel dengan:
- ✅ `api/index.js` - Entry point untuk serverless function
- ✅ `vercel.json` - Konfigurasi build & functions
- ✅ `.vercelignore` - File yang diignore
- ✅ Scripts helper - Deploy otomatis

## 🚀 Quick Start (5 Langkah)

### 1. Login ke Vercel
```bash
npm run vercel:setup
```

### 2. Setup Vercel Blob Storage
- Dashboard Vercel → Project → **Storage** → **Blob** → **Create**
- Copy token → Vercel otomatis add ke env variables

### 3. Add Google Service Account
```bash
npm run vercel:env:google
```

### 4. Verify Setup
```bash
npm run vercel:check
```

### 5. Deploy
```bash
# Test terlebih dahulu
npm run deploy:preview

# Deploy production
npm run deploy:prod
```

## 📚 Dokumentasi Lengkap

- **Setup lokal**: Lihat section "Setup Lokal" di [PANDUAN_DEPLOYMENT_VERCEL.md](PANDUAN_DEPLOYMENT_VERCEL.md#-setup-lokal)
- **Konfigurasi Vercel**: Lihat section "Konfigurasi Vercel" di [PANDUAN_DEPLOYMENT_VERCEL.md](PANDUAN_DEPLOYMENT_VERCEL.md#️-konfigurasi-vercel)
- **Troubleshooting**: Lihat section "Troubleshooting" di [PANDUAN_DEPLOYMENT_VERCEL.md](PANDUAN_DEPLOYMENT_VERCEL.md#️-troubleshooting)

## 🔐 Konfigurasi Penting

**Vercel Environment Variables (Production & Preview):**
- `BLOB_READ_WRITE_TOKEN` - Dari Vercel Blob Storage
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Google Cloud credentials
- `NODE_ENV=production` - Auto-set oleh Vercel

**Project Settings:**
- Node.js: **22.x**
- Framework: **Express.js**
- Function Memory: **1024MB** (bisa naik jika ada timeout)
- Max Duration: **300 detik** (bisa naik untuk generate PDF besar)

## 📱 Info Deployment

- **Function Entry:** `api/index.js` (→ `server/index.js`)
- **Build:** Otomatis
- **Storage:** Vercel Blob (private)
- **Logs:** `vercel logs --follow`
```bash
npm run deploy:preview
```
