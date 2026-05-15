# Dashboard Bukti Dukung CKP

Aplikasi website untuk menyusun bukti dukung CKP per periode bulanan.

## Fitur Utama

- Dashboard periode CKP bulanan.
- Satu periode dapat berisi banyak kegiatan.
- Kegiatan bisa dibuat lebih dulu tanpa bukti.
- Bukti dukung Google Drive dan upload manual bisa ditambahkan menyusul per kegiatan.
- Tombol generate PDF tersedia langsung di setiap kegiatan yang sudah memiliki bukti.
- Output PDF berukuran A4 portrait dan dilengkapi nomor halaman tanpa halaman kosong tambahan.
- Lokal: data dashboard tersimpan di `storage/app-data.json` dan upload manual di `storage/evidence`.
- Vercel: data, upload manual, dan output PDF tersimpan di Vercel Blob.
- File kerja sementara untuk proses PDF otomatis dibersihkan setelah generate.

## Cara Menjalankan Lokal

```bash
npm install
cp .env.example .env
npm run dev
```

Buka:

```text
http://localhost:3000
```

## Deploy ke Vercel

Project ini sudah disiapkan untuk Vercel melalui `api/index.js` dan `vercel.json`.

1. Push project ke GitHub/GitLab/Bitbucket atau upload lewat Vercel CLI.
2. Buat project baru di Vercel dari repo ini.
3. Di Vercel Dashboard, buka tab **Storage** lalu buat/hubungkan **Vercel Blob** dengan access **Private** ke project.
4. Pastikan environment variable `BLOB_READ_WRITE_TOKEN` terisi otomatis dari Blob store.
5. Tambahkan environment variable `GOOGLE_SERVICE_ACCOUNT_JSON` berisi JSON service account Google dalam satu baris.
6. Deploy.

### Deploy Lewat CLI

Project ini punya helper CLI agar upload ke Vercel lebih aman:

```bash
npm run vercel:setup
npm run vercel:check
npm run upload:vercel
```

Untuk production:

```bash
npm run deploy:prod
```

Jika ingin menambahkan service account dari file lokal ke Vercel:

```bash
npm run vercel:env:google
```

CLI akan menjalankan urutan ini: cek file project, link Vercel jika belum ada, pull env, cek `BLOB_READ_WRITE_TOKEN` dan `GOOGLE_SERVICE_ACCOUNT_JSON`, `vercel build`, `vercel deploy --prebuilt`, lalu tes `/api/health`.

Catatan penting:

- Jangan upload `.env` atau `service-account.json` ke Vercel. File tersebut sudah masuk `.vercelignore`.
- Di Vercel, file sementara diproses di `/tmp/ckp-evidence`.
- Upload manual via server mengikuti batas request Vercel. Default project ini membatasi `MAX_UPLOAD_MB=4` di Vercel. Untuk file lebih besar, gunakan bukti dari Google Drive atau kembangkan flow client upload langsung ke Vercel Blob.
- Jika `BLOB_READ_WRITE_TOKEN` belum ada, dashboard bisa dibuka tetapi data tidak akan tersimpan permanen di Vercel.

## Alur Penggunaan

1. Isi profil pegawai: nama dan NIP.
2. Tambah periode CKP dengan input bulan.
3. Tambah daftar kegiatan pada periode tersebut.
4. Klik tombol **Bukti** pada kegiatan untuk menambahkan bukti Drive atau upload manual.
5. Klik **Generate PDF** pada kegiatan yang sudah memiliki bukti.

## Konfigurasi Google Drive

Aplikasi ini menggunakan Google Drive API dengan service account.

1. Buat project di Google Cloud Console.
2. Aktifkan Google Drive API.
3. Buat Service Account.
4. Download JSON key.
5. Untuk lokal, simpan sebagai `service-account.json` di root project.
6. Isi `.env` lokal:

```env
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

7. Untuk Vercel, gunakan environment variable:

```env
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

8. Share folder/file Google Drive bukti dukung ke email service account.

Jika file/folder Drive tidak dibagikan ke service account, aplikasi tidak bisa membaca file tersebut.

## Struktur Project

```text
ckp-evidence-app/
|-- api/
|   `-- index.js
|-- public/
|   |-- index.html
|   |-- style.css
|   `-- app.js
|-- server/
|   |-- dataStore.js
|   |-- drive.js
|   |-- fileStore.js
|   |-- index.js
|   |-- pdfGenerator.js
|   `-- processEvidence.js
|-- storage/
|   |-- app-data.json
|   |-- evidence/
|   |-- output/
|   `-- tmp/
|-- .env.example
|-- package.json
|-- vercel.json
`-- README.md
```

## Batasan

- Format bukti yang didukung: gambar dan PDF.
- Google Docs/Sheets/Slides belum diekspor otomatis.
- Upload manual besar di Vercel sebaiknya memakai client upload langsung ke Blob, bukan upload via server.
- Untuk deployment publik, tambahkan login, rate limit, dan validasi akses dokumen.
