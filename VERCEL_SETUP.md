# Panduan Setup Vercel untuk CKP Evidence App

Project Anda sudah berhasil di-link ke Vercel dengan nama: **xeryus01s-projects/ckp-evidence-app**

## Status Setup Saat Ini
✅ Vercel CLI terinstall dan ter-update  
✅ Project sudah di-link ke Vercel  
✅ Development environment variables sudah tersedia  
✅ Konfigurasi Vercel sudah optimal  

## ⚠️ Yang Masih Perlu Setup

Anda perlu menambahkan 2 environment variables di Vercel Dashboard untuk production dan preview:

### 1. **BLOB_READ_WRITE_TOKEN**
Ini adalah token untuk Vercel Blob Storage (untuk menyimpan file hasil PDF di cloud).

**Cara mendapatkan:**
- Buka https://vercel.com/dashboard
- Pergi ke project **ckp-evidence-app**
- Tab **Settings** → **Storage** → **Blob**
- Jika belum ada, klik "Create" untuk membuat Blob Storage
- Copy token yang muncul

**Setelah dapat token:**
```bash
vercel env add BLOB_READ_WRITE_TOKEN production
# Paste token saat diminta

vercel env add BLOB_READ_WRITE_TOKEN preview
# Paste token saat diminta (biasanya sama)
```

### 2. **GOOGLE_SERVICE_ACCOUNT_JSON**
Ini adalah credentials dari Google Cloud untuk akses Google Drive dan membuat PDF dengan font custom.

**Cara mendapatkan:**
1. Buka https://console.cloud.google.com
2. Buat Service Account atau gunakan yang sudah ada
3. Buat JSON key untuk service account tersebut
4. Download file JSON key-nya

**Setelah dapat file JSON:**
```bash
vercel env add GOOGLE_SERVICE_ACCOUNT_JSON production
# Paste seluruh isi file JSON (jangan include filename)

vercel env add GOOGLE_SERVICE_ACCOUNT_JSON preview
# Paste seluruh isi file JSON yang sama
```

## Langkah Deployment

Setelah setup env variables, jalankan:

```bash
# Build untuk production
npm run build

# Deploy ke preview (testing)
npm run deploy:preview

# Deploy ke production (live)
npm run deploy:prod
```

Atau gunakan script yang lebih lengkap:
```bash
npm run vercel:check          # Cek apakah semua siap
npm run deploy:preview        # Deploy preview
npm run deploy:prod           # Deploy production
```

## Troubleshooting

Jika ada masalah, jalankan:
```bash
npm run vercel:check
```

Script ini akan memeriksa:
- ✓ File lokal lengkap
- ✓ Project linked ke Vercel
- ✓ Environment variables ada

## Info Project
- **Project Vercel:** xeryus01s-projects/ckp-evidence-app
- **Node Version:** 22.x
- **Framework:** Express.js
- **Runtime:** Node.js Serverless Functions
- **Function Memory:** 1024MB
- **Max Duration:** 300 detik

## Catatan Penting
- Environment variables harus ditambahkan untuk KEDUA `production` dan `preview` environment
- Vercel akan otomatis build dan deploy ketika ada perubahan
- Pastikan `.vercelignore` sudah mengabaikan `node_modules`, `.env`, `service-account.json`, dan `storage`

---
Jika sudah setup env variables, lanjutkan dengan:
```bash
npm run deploy:preview
```
