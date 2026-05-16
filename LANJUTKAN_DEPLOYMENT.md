# 🚀 Lanjutkan Deployment ke Production

Panduan melanjutkan setup CKP Evidence App dari titik sekarang hingga bisa diakses pengguna.

## ✅ Tahapan yang Sudah Dilakukan

- ✅ Project sudah di-create di Vercel: `xeryus01s-projects/ckp-app`
- ✅ Scripts helper diperbaiki (error `--environment` sudah fixed)
- ✅ Konfigurasi Vercel optimal (vercel.json sudah updated)
- ✅ Dokumentasi lengkap sudah siap

## 🎯 Sisa Langkah untuk Go-Live

### 1️⃣ Verifikasi Setup Lokal (1 menit)

```bash
cd c:\Users\BPS 1900\Documents\ckp-evidence-app

# Test aplikasi lokal
npm run dev
```

Buka http://localhost:3000 di browser. Harus loading dashboard dengan baik.

**Jika error:** Baca section "Troubleshooting" di bawah.

### 2️⃣ Verify Project Link ke Vercel (2 menit)

```bash
# Check apakah sudah link
ls -la .vercel/project.json
```

Jika ada file tersebut, berarti sudah link. Jika tidak:

```bash
npm run vercel:setup
```

### 3️⃣ Setup Environment Variables di Vercel (3 menit)

**A. Vercel Blob Storage** (untuk menyimpan file & PDF):

1. Buka https://vercel.com/xeryus01s-projects/ckp-app
2. Tab **Storage** → **Blob** → **Create**
3. Tunggu Blob dibuat
4. **BLOB_READ_WRITE_TOKEN** akan otomatis ditambahkan ke env variables

**Verifikasi:**
- Settings → Environment Variables
- Cari `BLOB_READ_WRITE_TOKEN` (harus ada untuk Production)

---

**B. Google Service Account** (untuk Google Drive integration):

1. Pastikan sudah punya `service-account.json` lokal:
   ```bash
   ls -la service-account.json
   ```

2. Jika tidak ada, buat di Google Cloud:
   - https://console.cloud.google.com
   - Create Service Account → Generate JSON key

3. Tambahkan ke Vercel environment:
   ```bash
   npm run vercel:env:google
   ```
   
   Script akan:
   - Baca file `service-account.json` lokal
   - Mengirim ke Vercel secara aman
   - Auto-add ke Production, Preview, Development environment

### 4️⃣ Final Verification (1 menit)

```bash
npm run vercel:check
```

**Harus output:**
```
✅ File lokal lengkap
✅ Project linked ke Vercel
✅ Environment variables ada
✅ Preflight OK. Project siap deploy.
```

Jika ada error, baca "Troubleshooting" di bawah.

### 5️⃣ Deploy! (5 menit)

#### **Option A: Deploy Preview** (Test dulu - RECOMMENDED)

```bash
npm run deploy:preview
```

Output akan berupa URL preview (contoh: `https://ckp-app-preview-xxx.vercel.app`)

**Tes:**
- Buka URL preview di browser
- Test upload file
- Test generate PDF
- Reload halaman - data masih ada? ✅

Jika OK, lanjut ke production.

---

#### **Option B: Deploy Production** (Go Live)

```bash
npm run deploy:prod
```

Output akan berupa URL production (contoh: `https://ckp-app.vercel.app`)

**Tes:**
- Buka URL production di browser
- Dashboard berfungsi? ✅
- Upload & generate PDF work? ✅
- Data tersimpan setelah reload? ✅

---

## 🎊 Selesai! Website Live

URL production Anda: `https://ckp-app.vercel.app` atau custom domain (jika sudah setup)

Bagikan ke pengguna!

---

## 🔧 Troubleshooting

### ❌ Error: "npm run vercel:setup" gagal

**Solusi:**
```bash
# Manual login
npx vercel login

# Atau link manual
npx vercel link
```

### ❌ Error: "BLOB_READ_WRITE_TOKEN belum ada"

**Solusi:**
1. Buka Vercel Dashboard → ckp-app project
2. Tab **Storage** → **Blob** → Pastikan ada Blob store
3. Jika belum: Klik **Create** untuk membuat Blob storage baru
4. Tunggu ~ 1 menit untuk auto-add token ke env

**Verifikasi manual:**
```bash
vercel env ls production
# Cari BLOB_READ_WRITE_TOKEN di output
```

### ❌ Error: "service-account.json tidak ditemukan"

**Solusi:**
```bash
# Buat file baru dari Google Cloud
# https://console.cloud.google.com
# → Service Account → Create key (JSON format) → Download

# Letakkan di folder root
# File ini di-.gitignore, jadi aman

# Kemudian
npm run vercel:env:google
```

### ❌ Error: "GOOGLE_SERVICE_ACCOUNT_JSON tidak ditemukan" di Vercel

**Solusi:**
```bash
# Pastikan sudah ada di local
ls -la service-account.json

# Add ke Vercel
npm run vercel:env:google --targets=production,preview

# Jika masih gagal, add manual:
# 1. Buka Vercel Dashboard
# 2. Settings → Environment Variables
# 3. Add Variable:
#    Key: GOOGLE_SERVICE_ACCOUNT_JSON
#    Value: [paste seluruh isi service-account.json dalam 1 baris]
#    Apply to: Production, Preview
```

### ❌ Error: "CSS/JS tidak loading" di production

**Penyebab:** Static files path salah

**Verifikasi:**
- Buka browser DevTools (F12)
- Network tab → lihat request `/app.js` dan `/style.css`
- 404 error? Berarti path salah

**Solusi:** Pastikan `server/index.js` punya:
```javascript
app.use(express.static(path.join(__dirname, '..', 'public')));
```

Kalau sudah ada, coba redeploy:
```bash
npm run deploy:prod
```

### ❌ Error: "File upload gagal" di Vercel

**Penyebab:** BLOB_READ_WRITE_TOKEN tidak aktif

**Solusi:**
1. Verifikasi token ada di env: `vercel env ls production`
2. Jika ada tapi upload masih gagal: Redeploy
   ```bash
   npm run deploy:prod
   ```

### ❌ Error: "Generate PDF timeout"

**Penyebab:** Proses PDF terlalu lama

**Solusi:** Tingkatkan timeout di `vercel.json`
```json
{
  "functions": {
    "api/index.js": {
      "maxDuration": 600,    // Naik dari 300 ke 600 detik
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

## 📋 Checklist Sebelum Share ke Pengguna

- [ ] Aplikasi berjalan lokal (`npm run dev`)
- [ ] Project linked ke Vercel (`.vercel/project.json` ada)
- [ ] BLOB_READ_WRITE_TOKEN ada di env Vercel
- [ ] GOOGLE_SERVICE_ACCOUNT_JSON ada di env Vercel
- [ ] `npm run vercel:check` output OK ✅
- [ ] Preview deploy berhasil
- [ ] Dashboard buka di preview URL
- [ ] Upload file work di preview
- [ ] Generate PDF work di preview
- [ ] Data tersimpan setelah reload di preview
- [ ] Production deploy berhasil
- [ ] Dashboard buka di production URL
- [ ] Health check OK: `curl https://ckp-app.vercel.app/api/health`
- [ ] Test semua fitur di production
- [ ] Share URL ke pengguna

---

## 📞 Monitoring Setelah Live

### Lihat Logs Real-time
```bash
vercel logs --follow
```

### Cek Status Deployment
```bash
# Lihat daftar deployment
vercel deployments list

# Lihat detail deployment
vercel deployments inspect
```

### Setup Alerts (Optional)
1. Buka Vercel Dashboard → ckp-app project
2. Settings → Notifications
3. Enable alerts untuk failed deployments

---

## 🎯 Next Steps

### Jika Berhasil Deploy:
1. ✅ Share URL ke pengguna
2. ✅ Buat dokumentasi user guide
3. ✅ Monitor logs untuk errors
4. ✅ Backup data secara berkala

### Jika Ada Issue:
1. Check error message di: `vercel logs --follow`
2. Baca troubleshooting section
3. Atau buka issue/chat support

---

## 📚 Quick Command Reference

```bash
# Setup & Verify
npm run vercel:setup              # Login & link project
npm run vercel:check              # Verify siap deploy

# Development
npm run dev                       # Local development (port 3000)

# Deployment
npm run deploy:preview            # Deploy preview (test)
npm run deploy:prod               # Deploy production (go live)

# Maintenance
npm run vercel:env:google         # Add Google credentials
vercel logs --follow              # View live logs
vercel env ls production          # List environment variables
vercel deployments list           # List all deployments
```

---

**Siap untuk go-live! 🚀**

Ikuti langkah di atas dan aplikasi Anda akan bisa diakses pengguna dalam ~10 menit.

Butuh bantuan? Lihat troubleshooting atau baca [PANDUAN_DEPLOYMENT_VERCEL.md](PANDUAN_DEPLOYMENT_VERCEL.md).
