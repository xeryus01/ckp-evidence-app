# 📋 Panduan Lengkap: Deploy CKP Evidence App ke Vercel

Panduan ini menjelaskan cara menyiapkan dan menghosting **CKP Evidence App** di Vercel dengan konfigurasi lengkap.

---

## 📚 Daftar Isi

1. [Persyaratan Awal](#persyaratan-awal)
2. [Struktur Proyek](#struktur-proyek)
3. [Setup Lokal](#setup-lokal)
4. [Konfigurasi Vercel](#konfigurasi-vercel)
5. [Deploy ke Vercel](#deploy-ke-vercel)
6. [Verifikasi & Testing](#verifikasi--testing)
7. [Troubleshooting](#troubleshooting)
8. [File Konfigurasi](#file-konfigurasi-penting)

---

## 🔧 Persyaratan Awal

Sebelum mulai, pastikan Anda sudah memiliki:

- **Node.js 22.x** atau lebih baru ([unduh di sini](https://nodejs.org/))
- **npm** (biasanya terinstall bersamaan Node.js)
- **Vercel CLI** (akan diinstall otomatis melalui npm)
- **Akun Vercel** ([daftar gratis di vercel.com](https://vercel.com))
- **Google Cloud Project** dengan service account JSON
- **GitHub/GitLab/Bitbucket** akun (untuk git)

### Periksa versi Node.js:
```bash
node --version    # Harus v22.x atau lebih baru
npm --version     # Harus v10.x atau lebih baru
```

---

## 📁 Struktur Proyek

```
ckp-evidence-app/
├── api/                          # Vercel serverless function entry point
│   └── index.js                  # Re-exports server untuk Vercel
├── server/                        # Express.js application
│   ├── index.js                  # Main server
│   ├── fileStore.js              # File/Blob storage manager
│   ├── dataStore.js              # Data persistence
│   ├── drive.js                  # Google Drive integration
│   ├── pdfGenerator.js           # PDF generation
│   └── processEvidence.js        # Evidence processing
├── public/                        # Static assets
│   ├── index.html
│   ├── app.js
│   └── style.css
├── scripts/                       # Helper scripts
│   └── vercel-cli.js             # Vercel deployment CLI
├── storage/                       # Local storage (NOT uploaded)
│   ├── app-data.json             # Local database
│   ├── evidence/                 # Local uploaded files
│   ├── tmp/                      # Temporary processing files
│   └── output/                   # Generated PDFs
├── package.json                  # Dependencies & scripts
├── vercel.json                   # Vercel configuration
├── .vercelignore                 # Files to exclude from Vercel
├── .env.example                  # Environment variables template
└── service-account.json          # Google Cloud credentials (NOT uploaded)
```

### Apa yang TIDAK diupload ke Vercel:
- ❌ `node_modules/` - Di-rebuild otomatis
- ❌ `service-account.json` - Tersimpan di env variables
- ❌ `storage/` - Diganti dengan Vercel Blob
- ❌ `.env` - Diganti dengan Vercel Environment Variables

---

## 🚀 Setup Lokal

### 1. Clone atau Persiapkan Repository

```bash
# Jika menggunakan git
git clone <your-repo-url>
cd ckp-evidence-app

# Atau gunakan folder yang sudah ada
cd ckp-evidence-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment Variables Lokal

Buat file `.env` di root folder (copy dari `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` dengan editor favorit Anda:

```env
PORT=3000

# Google Cloud Service Account
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
# ATAU jika ingin menggunakan JSON langsung:
# GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# Vercel Blob (kosongkan untuk testing lokal)
# BLOB_READ_WRITE_TOKEN=

# Storage paths
TMP_DIR=storage/tmp
OUTPUT_DIR=storage/output
EVIDENCE_DIR=storage/evidence
```

### 4. Letakkan Google Service Account JSON

Jika Anda punya file `service-account.json` dari Google Cloud:

```bash
# Letakkan di root folder
# File ini sudah di-.gitignore, jadi aman untuk kredensial
cp /path/ke/service-account.json ./service-account.json
```

### 5. Tes Lokal

```bash
# Development mode (dengan auto-reload)
npm run dev

# Buka browser
# http://localhost:3000
```

Jika aplikasi berjalan lancar, lanjut ke setup Vercel.

---

## ☁️ Konfigurasi Vercel

### Langkah 1: Login ke Vercel CLI

```bash
npm install -g vercel   # Install Vercel CLI global (atau gunakan npx)

# Login
npm run vercel:setup
# atau
npx vercel login
```

Ikuti instruksi di browser untuk login dengan akun Vercel Anda.

### Langkah 2: Link Project ke Vercel

```bash
npm run vercel:setup
```

Script ini akan:
1. ✅ Link project ke Vercel (jika belum)
2. ✅ Pull environment variables dari Vercel
3. ✅ Verifikasi semua konfigurasi

**Catatan:** Jika sudah punya project di Vercel, gunakan:
```bash
npm run vercel:setup -- --project=your-project-name
```

### Langkah 3: Setup Vercel Blob Storage

Vercel Blob digunakan untuk menyimpan:
- 📁 Data app (app-data.json)
- 📤 File yang di-upload
- 📄 PDF yang dihasilkan

#### Cara setup:

1. **Buka Vercel Dashboard**: https://vercel.com/dashboard
2. **Pilih project** `ckp-evidence-app`
3. **Tab "Storage"** → Pilih "Blob"
4. **Klik "Create" atau "Connect"**
5. **Buat Blob store baru:**
   - Nama: `ckp-evidence-blob` (bebas)
   - Database Region: Pilih yang terdekat dengan Anda
   - Klik "Create"

6. **Copy token yang muncul:**
   - Token akan ditampilkan sebagai `BLOB_READ_WRITE_TOKEN`
   - Vercel akan otomatis menambahkan ke environment variables
   - Verifikasi di: **Settings** → **Environment Variables** → Cari `BLOB_READ_WRITE_TOKEN`

### Langkah 4: Tambahkan Google Service Account JSON

```bash
# Script ini akan menambahkan GOOGLE_SERVICE_ACCOUNT_JSON ke env Vercel
npm run vercel:env:google

# Atau manual:
npm run vercel:env:google -- --file=service-account.json --targets=production,preview
```

**Proses:**
1. Script membaca `service-account.json`
2. Mengirim ke Vercel CLI secara aman
3. Ditambahkan ke environment variables (production, preview, development)

**Verifikasi:**
- Buka https://vercel.com/dashboard/your-project/settings/environment-variables
- Cari `GOOGLE_SERVICE_ACCOUNT_JSON` - harusnya ada di kolom Production, Preview

### Langkah 5: Verifikasi Semua Setup

```bash
npm run vercel:check
```

Output yang diharapkan:
```
✅ File lokal lengkap
✅ Project linked ke Vercel
✅ Environment variables ada
✅ Preflight OK. Project siap deploy.
```

Jika ada error, baca troubleshooting di bawah.

---

## 🚀 Deploy ke Vercel

### Deploy Preview (Testing)

```bash
npm run deploy:preview
```

Ini akan:
1. Build aplikasi
2. Upload ke Vercel sebagai preview deployment
3. Generate URL preview (contoh: `https://ckp-evidence-app-9d4x7k.vercel.app`)
4. Run health check

**Keuntungan:**
- Test sebelum production
- Setiap push bisa generate preview baru
- URL unique untuk setiap preview

### Deploy Production (Live)

```bash
npm run deploy:prod
```

Ini akan:
1. Build aplikasi
2. Upload ke Vercel sebagai production deployment
3. Update domain production (jika sudah dikonfigurasi)
4. Run health check

**Penting:** Pastikan sudah test di preview dulu!

### Deploy via Git (Recommended)

Jika proyek sudah di GitHub/GitLab/Bitbucket:

1. **Push ke git:**
   ```bash
   git add .
   git commit -m "Setup Vercel deployment"
   git push origin main
   ```

2. **Buka Vercel Dashboard** → **Add New Project**
3. **Pilih repository** `ckp-evidence-app`
4. **Klik "Import"**
5. **Vercel akan otomatis:**
   - Detect Node.js project
   - Set build command: `npm run build` (atau default)
   - Deploy preview dari branch

**Konfigurasi otomatis:**
- Preview untuk setiap pull request
- Production deploy dari main branch
- Auto-rebuild saat ada push

---

## ✅ Verifikasi & Testing

### 1. Health Check Manual

Setelah deploy, test endpoint health check:

```bash
curl https://your-deployment-url/api/health
```

Response yang diharapkan:
```json
{
  "ok": true,
  "storage": "blob",
  "uptime": 123.45
}
```

### 2. Test Fitur Utama

1. **Dashboard** - Buka aplikasi di browser
   - Harusnya loading halaman index
   - CSS dan JS assets loading dengan benar

2. **API Endpoints** - Test dengan curl/Postman:
   ```bash
   # Get all periods
   curl https://your-deployment-url/api/periods
   
   # Get app health
   curl https://your-deployment-url/api/health
   ```

3. **File Upload** - Test di UI:
   - Upload gambar untuk bukti
   - Verify tersimpan di Vercel Blob
   - Download PDF yang dihasilkan

4. **Google Drive Integration** - Test di UI:
   - Add bukti dari Google Drive link
   - Verify data tersimpan

### 3. Monitor Logs

```bash
# Lihat logs dari Vercel deployment
vercel logs --follow

# Atau di dashboard: Project → Deployments → [deployment] → Logs
```

---

## 🛠️ Troubleshooting

### Error: "BLOB_READ_WRITE_TOKEN belum diatur"

**Penyebab:** Vercel Blob belum dikonfigurasi

**Solusi:**
1. Buka Vercel Dashboard → Project Settings → Storage
2. Pastikan Blob sudah terhubung
3. Copy `BLOB_READ_WRITE_TOKEN`
4. Settings → Environment Variables → Add `BLOB_READ_WRITE_TOKEN`
5. Redeploy dengan `npm run deploy:prod`

---

### Error: "GOOGLE_SERVICE_ACCOUNT_JSON tidak ditemukan"

**Penyebab:** Environment variable belum ditambahkan

**Solusi:**
```bash
# Pastikan file service-account.json ada lokal
ls -la service-account.json

# Tambahkan ke Vercel
npm run vercel:env:google

# Jika manual:
# 1. Buka https://console.cloud.google.com
# 2. Buat service account JSON baru
# 3. Settings → Environment Variables → Add GOOGLE_SERVICE_ACCOUNT_JSON
# 4. Paste seluruh JSON content dalam 1 baris
```

---

### Error: "Project belum link ke Vercel"

**Penyebab:** `.vercel/project.json` tidak ada

**Solusi:**
```bash
npm run vercel:setup
# atau
vercel link
```

---

### Error: "Functions maxDuration problem" atau timeout

**Penyebab:** Generate PDF terlalu lama (API function ada timeout)

**Solusi:**
```json
// vercel.json - Tingkatkan maxDuration
{
  "functions": {
    "api/index.js": {
      "maxDuration": 600,    // Naik dari 300 ke 600 detik (10 menit)
      "memory": 2048         // Naik dari 1024 ke 2048 MB
    }
  }
}
```

Lalu redeploy:
```bash
npm run deploy:prod
```

---

### Error: "File size too large" saat upload

**Penyebab:** File lebih dari limit (4MB di Vercel)

**Solusi:**
1. Lokal bisa sampai 50MB, tapi Vercel 4MB max
2. Compress image dulu sebelum upload
3. Atau ubah MAX_UPLOAD_MB di `.env`:
   ```env
   MAX_UPLOAD_MB=4  # Vercel limit
   ```

---

### Build gagal dengan error "Module not found"

**Penyebab:** Ada dependency yang hilang atau tidak kompatibel

**Solusi:**
```bash
# Lokal
npm ci  # Clean install
npm run dev  # Test lokal

# Jika error pada canvas/sharp
npm install --build-from-source

# Push ulang
git push origin main
```

---

### Preview/Production tidak loading CSS/JS

**Penyebab:** Static assets path salah

**Solusi:**
Pastikan di `vercel.json`:
```json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/index.js"
    },
    {
      "source": "/static/(.*)",
      "destination": "/static/$1"
    }
  ]
}
```

Dan di `server/index.js`:
```javascript
app.use(express.static(path.join(__dirname, '..', 'public')));
```

---

### Data tidak tersimpan setelah reload

**Penyebab:** Data masih menggunakan local file storage, bukan Blob

**Solusi:**
1. Pastikan `BLOB_READ_WRITE_TOKEN` sudah di-env variables
2. Check bahwa `usingBlob()` return `true`:
   ```bash
   curl https://your-deployment-url/api/health | grep -i blob
   ```
3. Jika masih lokal, redeploy dengan env yang benar:
   ```bash
   npm run vercel pull  # Pull latest env
   npm run deploy:prod
   ```

---

## 📄 File Konfigurasi Penting

### `package.json` - Dependencies & Scripts

```json
{
  "name": "ckp-evidence-app",
  "version": "1.0.0",
  "engines": {
    "node": "22.x"
  },
  "scripts": {
    "dev": "nodemon server/index.js",
    "start": "node server/index.js",
    "vercel:setup": "node scripts/vercel-cli.js setup",
    "vercel:check": "node scripts/vercel-cli.js check",
    "deploy:preview": "node scripts/vercel-cli.js deploy --preview",
    "deploy:prod": "node scripts/vercel-cli.js deploy --prod"
  },
  "dependencies": {
    "@vercel/blob": "^2.3.3",
    "express": "latest",
    "googleapis": "latest"
  }
}
```

### `vercel.json` - Konfigurasi Build & Functions

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "api/index.js": {
      "maxDuration": 300,
      "memory": 1024
    }
  },
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/index.js"
    }
  ]
}
```

**Penjelasan:**
- `maxDuration: 300` - Fungsi timeout 300 detik (5 menit)
- `memory: 1024` - Alokasi RAM 1GB per function
- `rewrites` - Route semua `/api/*` ke `api/index.js`

### `.vercelignore` - File yang Diignore

```
node_modules
.env
.env.local
.vercel
service-account.json
storage
npm-debug.log*
.git
.gitignore
```

### `.env.example` - Template Environment Variables

```env
PORT=3000

# Google Cloud Service Account - Pilih salah satu:
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
# atau
# GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# Vercel Blob Token (auto-filled by Vercel)
# BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Data path di Blob
DATA_BLOB_PATH=data/app-data.json

# Storage paths
TMP_DIR=storage/tmp
OUTPUT_DIR=storage/output
EVIDENCE_DIR=storage/evidence

# Upload size limit (4MB untuk Vercel, 50MB untuk lokal)
# MAX_UPLOAD_MB=4
```

---

## 📱 Domain Custom (Opsional)

Jika ingin menggunakan domain sendiri bukan `vercel.app`:

1. Buka **Vercel Dashboard** → Project → **Settings** → **Domains**
2. **Add** domain Anda
3. **Update DNS records** sesuai instruksi Vercel
4. Tunggu DNS propagate (bisa 24 jam)

---

## 🔐 Best Practices & Security

1. **Environment Variables:**
   - ✅ Jangan commit `.env` atau `service-account.json`
   - ✅ Gunakan Vercel Environment Variables untuk production
   - ✅ Gunakan file `.vercelignore` untuk exclude credentials

2. **Git & Version Control:**
   - ✅ Selalu gunakan `.gitignore` untuk credentials
   - ✅ Push changes ke branch terlebih dahulu
   - ✅ Test di preview sebelum merge ke main

3. **Blob Storage:**
   - ✅ Access token diatur ke `private`
   - ✅ Hanya bisa diakses dari backend
   - ✅ Cache dimatikan untuk security

4. **Monitoring:**
   - ✅ Setup email alerts di Vercel Dashboard
   - ✅ Monitor function logs untuk errors
   - ✅ Review deployment history regularly

---

## 📞 Support & Resources

- **Vercel Docs:** https://vercel.com/docs
- **Vercel Blob:** https://vercel.com/docs/storage/vercel-blob
- **Express.js:** https://expressjs.com/
- **Google Cloud:** https://cloud.google.com/docs

---

**Happy deploying! 🚀**
