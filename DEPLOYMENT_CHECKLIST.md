## ✅ Deployment Checklist - CKP Evidence App to Vercel

Gunakan checklist ini untuk memastikan semua siap sebelum deploy.

---

## 🔍 Pre-Deployment Checklist

### Local Setup
- [ ] Node.js 22.x+ terinstall (`node --version`)
- [ ] npm terinstall (`npm --version`)
- [ ] Dependencies terinstall (`npm install`)
- [ ] `.env` file sudah dibuat dari `.env.example`
- [ ] `service-account.json` ada dan valid
- [ ] Aplikasi berjalan lokal (`npm run dev`)
- [ ] Tidak ada error di console lokal

### Git & Repository
- [ ] Repository di GitHub/GitLab/Bitbucket
- [ ] `.gitignore` includes: `node_modules/`, `.env`, `service-account.json`, `storage/`
- [ ] Latest changes sudah di-commit
- [ ] Branch main/master siap

### Vercel Account & Project
- [ ] Akun Vercel sudah membuat (`vercel.com`)
- [ ] Vercel CLI terinstall global atau via npm
- [ ] Sudah login ke Vercel (`vercel login`)
- [ ] Project sudah di-link ke Vercel (`npm run vercel:setup`)
- [ ] `.vercel/project.json` file sudah ada

### Environment Variables - Vercel Dashboard
- [ ] `BLOB_READ_WRITE_TOKEN` sudah ada (Preview & Production)
  - Cara check: Dashboard → Project → Settings → Environment Variables
  - Atau: `npm run vercel:check`
- [ ] `GOOGLE_SERVICE_ACCOUNT_JSON` sudah ada (Preview & Production)
  - Cara add: `npm run vercel:env:google`
- [ ] `NODE_ENV=production` otomatis di-set

### Vercel Blob Storage
- [ ] Vercel Blob sudah dihubungkan (Storage tab)
- [ ] Blob store sudah aktif dan bisa diakses
- [ ] Token (`BLOB_READ_WRITE_TOKEN`) tidak expired
- [ ] Access level diatur ke "Private"

### Google Cloud Setup
- [ ] Google Cloud Project sudah ada
- [ ] Service Account sudah dibuat
- [ ] JSON key sudah di-download
- [ ] Key sudah di-add ke environment variables Vercel

### File Konfigurasi
- [ ] `vercel.json` ada dan benar
  - Harus ada: `api/index.js` function config
  - Harus ada: `/api/(.*) → /api/index.js` rewrite
- [ ] `.vercelignore` ada dan tidak kosong
  - Harus exclude: `node_modules`, `.env`, `service-account.json`, `storage`
- [ ] `api/index.js` ada (entry point)
- [ ] `server/index.js` ada (Express app)
- [ ] `public/` folder ada (static assets)

### Package.json
- [ ] `"engines": {"node": "22.x"}` ada
- [ ] `"@vercel/blob"` ada di dependencies
- [ ] Scripts ada: `dev`, `start`, `vercel:setup`, `vercel:check`, `deploy:preview`, `deploy:prod`
- [ ] Semua dependencies kompatibel dengan Node 22.x

---

## 🧪 Pre-Deployment Testing

### Lokal Testing
- [ ] `npm run dev` berjalan tanpa error
- [ ] Browser buka `http://localhost:3000` ✅
- [ ] CSS/JS assets loading
- [ ] API endpoints responsive
- [ ] Upload file work
- [ ] Generate PDF work
- [ ] Google Drive integration work

### Vercel Staging Testing
```bash
npm run deploy:preview
```
- [ ] Preview deployment berhasil
- [ ] Health check OK (`/api/health`)
- [ ] Website buka di browser ✅
- [ ] CSS/JS assets loading
- [ ] API endpoints responsive
- [ ] Data tersimpan di Blob (check Vercel dashboard)
- [ ] PDF yang dihasilkan bisa didownload

### Logs & Monitoring
- [ ] Tidak ada error di preview logs (`vercel logs`)
- [ ] Tidak ada warning di build output
- [ ] Function initialization time acceptable (<1 detik)

---

## 🚀 Production Deployment

Ketika semua checklist di atas ✅:

### Final Check
```bash
npm run vercel:check
```
Expected output:
```
✅ File lokal lengkap
✅ Project linked ke Vercel
✅ Environment variables ada
✅ Preflight OK. Project siap deploy.
```

### Deploy Production
```bash
npm run deploy:prod
```

### Post-Deployment Verification
- [ ] Deployment berhasil (lihat Vercel dashboard)
- [ ] Production URL berfungsi
- [ ] Health check OK
- [ ] Dashboard loading
- [ ] Upload file work
- [ ] Generate PDF work
- [ ] Data tersimpan permanen (reload ✅)
- [ ] Tidak ada error di logs

---

## 🔧 Troubleshooting Quick Reference

| Error | Penyebab | Solusi |
|-------|---------|--------|
| `BLOB_READ_WRITE_TOKEN belum diatur` | Vercel Blob belum setup | Dashboard → Storage → Blob → Create |
| `GOOGLE_SERVICE_ACCOUNT_JSON tidak ditemukan` | Env var belum di-add | `npm run vercel:env:google` |
| `Project belum link ke Vercel` | `.vercel/project.json` tidak ada | `npm run vercel:setup` |
| `Function maxDuration error` | Generate PDF terlalu lama | Naik `maxDuration` di vercel.json |
| `File size too large` | Upload file > 4MB | Compress atau ubah MAX_UPLOAD_MB |
| `Module not found` | Dependency missing | `npm ci` dan cek package.json |
| `CSS/JS tidak loading` | Static files path salah | Check rewrite di vercel.json |
| `Data tidak tersimpan` | Tidak pakai Blob storage | Verifikasi BLOB_READ_WRITE_TOKEN aktif |

---

## 📞 Support Commands

```bash
# Check setup status
npm run vercel:check

# Check logs real-time
vercel logs --follow

# Pull latest env from Vercel
vercel pull

# Test lokal sebelum push
npm run dev

# Deploy preview untuk test
npm run deploy:preview

# Deploy production
npm run deploy:prod
```

---

## ✨ Setelah Deploy

- [ ] Share URL production dengan stakeholder
- [ ] Setup custom domain (optional)
- [ ] Setup email alerts di Vercel dashboard
- [ ] Monitor logs untuk errors
- [ ] Backup data secara berkala (download dari Blob)
- [ ] Update README dengan URL production

---

**Good luck with your deployment! 🚀**

Jika ada pertanyaan, baca panduan lengkap di: [PANDUAN_DEPLOYMENT_VERCEL.md](PANDUAN_DEPLOYMENT_VERCEL.md)
