# 🚀 Quick Start - Deploy ke Vercel dalam 10 Menit

Panduan cepat untuk deploy CKP Evidence App ke Vercel tanpa ribet.

---

## ✅ Persyaratan (5 menit setup)

1. **Vercel account** - [daftar gratis di vercel.com](https://vercel.com/signup)
2. **Google Cloud service account JSON** - [buat di console.cloud.google.com](https://console.cloud.google.com)
3. **Git** - push code ke GitHub (atau GitLab/Bitbucket)
4. **Node.js 22.x** - [unduh di nodejs.org](https://nodejs.org/)

---

## 🎯 5 Langkah Deploy

### 1️⃣ Prepare Lokal (2 menit)

```bash
cd ckp-evidence-app

# Install dependencies
npm install

# Buat .env dari template
cp .env.example .env

# Edit .env dan isi:
# - Pastikan GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
# - Letakkan service-account.json di folder root

# Test lokal (opsional tapi recommended)
npm run dev
# Buka http://localhost:3000 - harus berjalan
```

### 2️⃣ Push ke Git (1 menit)

```bash
git add .
git commit -m "Setup for Vercel deployment"
git push origin main
```

### 3️⃣ Login ke Vercel (1 menit)

```bash
npm run vercel:setup

# Atau manual:
# npx vercel login
```

Ikuti instruksi di browser untuk login/signup dengan akun Vercel.

### 4️⃣ Setup Storage & Env (1 menit)

**Di Vercel Dashboard:**
1. Buka https://vercel.com/dashboard/projects
2. Pilih project `ckp-evidence-app`
3. Tab **Storage** → **Blob** → **Create**
4. Blob akan otomatis menambahkan `BLOB_READ_WRITE_TOKEN` ke env

**Add Google Service Account:**
```bash
npm run vercel:env:google
```

**Verify:**
```bash
npm run vercel:check
```

Harus output: `✅ Preflight OK. Project siap deploy.`

### 5️⃣ Deploy! (berapa detik)

```bash
# Test preview dulu (recommended)
npm run deploy:preview
# Output: https://ckp-evidence-app-xxx.vercel.app

# Jika OK, deploy production
npm run deploy:prod
# Output: https://ckp-evidence-app.vercel.app (atau custom domain)
```

---

## ✨ Selesai!

Deploy selesai. Website Anda sudah live di cloud Vercel. 🎉

Verifikasi:
- [ ] Buka URL di browser
- [ ] Upload file test
- [ ] Generate PDF test
- [ ] Reload halaman - data masih ada? ✅

---

## 📱 Setup Domain Custom (Opsional, 2 menit)

Jika ingin ganti dari `*.vercel.app` ke domain sendiri:

1. Vercel Dashboard → Project → Settings → Domains
2. Add domain Anda
3. Update DNS records di domain provider
4. Done ✅

---

## 🔧 Jika Ada Error

Jalankan ini untuk troubleshoot:

```bash
# Check status
npm run vercel:check

# Lihat logs
vercel logs --follow

# Update env dari Vercel
vercel pull

# Coba deploy ulang
npm run deploy:prod
```

Error umum dan solusi: baca [PANDUAN_DEPLOYMENT_VERCEL.md#️-troubleshooting](PANDUAN_DEPLOYMENT_VERCEL.md#️-troubleshooting)

---

## 📚 Baca Lebih Lanjut

- **Panduan Lengkap** → [PANDUAN_DEPLOYMENT_VERCEL.md](PANDUAN_DEPLOYMENT_VERCEL.md)
- **Pre-Deployment Checklist** → [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
- **Quick Reference** → [VERCEL_SETUP.md](VERCEL_SETUP.md)

---

**Happy deploying! 🚀**
