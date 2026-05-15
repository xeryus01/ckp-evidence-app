require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { listFromDriveLinks, downloadDriveFilesByIds, streamDriveFileById } = require('./drive');
const { normalizeEvidence } = require('./processEvidence');
const { generatePdf } = require('./pdfGenerator');
const { readData, updateData, findActivity } = require('./dataStore');
const {
  OUTPUT_DIR,
  TMP_ROOT,
  deleteStoredFile,
  materializeStoredFile,
  persistOutputPdf,
  saveManualEvidence,
  saveUploadToTemp,
  sendOutputPdf
} = require('./fileStore');

const app = express();
const PORT = process.env.PORT || 3000;
const TMP_DIR = TMP_ROOT;
const MAX_FILE_SIZE = Number(process.env.MAX_UPLOAD_MB || (process.env.VERCEL ? 4 : 50)) * 1024 * 1024;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 100 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Hanya gambar dan PDF yang didukung.'));
  }
});

const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 100 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Hanya gambar dan PDF yang didukung.'));
  }
});

function monthLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return String(month || '-');
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
    .format(new Date(year, monthNumber - 1, 1));
}

function activityTimeLabel(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [year, month, day] = raw.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(year, month - 1, day));
}

function defaultEvidence() {
  return { driveLinks: [], driveFiles: [], selectedDriveIds: [], manualFiles: [] };
}

function normalizeActivity(activity) {
  activity.evidence = { ...defaultEvidence(), ...(activity.evidence || {}) };
  activity.generatedPdfs = activity.generatedPdfs || [];
  return activity;
}

function collectDriveLinks(input) {
  if (Array.isArray(input)) return input.map(item => String(item).trim()).filter(Boolean);
  return String(input || '').split(/\n|,/).map(item => item.trim()).filter(Boolean);
}

function activityStatus(activity) {
  const evidence = { ...defaultEvidence(), ...(activity.evidence || {}) };
  const count = evidence.selectedDriveIds.length + evidence.manualFiles.length;
  return count ? `${count} bukti siap` : 'Menunggu bukti';
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/state', async (req, res) => {
  const data = await readData();
  data.periods.forEach(period => period.activities.forEach(normalizeActivity));
  res.json(data);
});

app.put('/api/profile', async (req, res) => {
  const profile = await updateData((data) => {
    data.profile = {
      nama: String(req.body.nama || '').trim(),
      nip: String(req.body.nip || '').trim()
    };
    return data.profile;
  });
  res.json({ profile });
});

app.post('/api/periods', async (req, res) => {
  const month = String(req.body.month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Periode harus berupa bulan, contoh 2026-05.' });

  const period = await updateData((data) => {
    let existing = data.periods.find(item => item.month === month);
    if (existing) return existing;

    existing = {
      id: uuidv4(),
      month,
      label: monthLabel(month),
      activities: [],
      createdAt: new Date().toISOString()
    };
    data.periods.unshift(existing);
    data.periods.sort((a, b) => b.month.localeCompare(a.month));
    return existing;
  });
  res.json({ period });
});

app.post('/api/periods/:periodId/activities', async (req, res) => {
  const activity = await updateData((data) => {
    const period = data.periods.find(item => item.id === req.params.periodId);
    if (!period) return null;

    const newActivity = normalizeActivity({
      id: uuidv4(),
      kegiatan: String(req.body.kegiatan || '').trim(),
      waktu: String(req.body.waktu || '').trim(),
      catatan: String(req.body.catatan || '').trim(),
      createdAt: new Date().toISOString()
    });
    if (!newActivity.kegiatan) throw new Error('Nama kegiatan wajib diisi.');
    period.activities.unshift(newActivity);
    return newActivity;
  });
  if (!activity) return res.status(404).json({ error: 'Periode tidak ditemukan.' });
  res.json({ activity });
});

app.patch('/api/periods/:periodId/activities/:activityId', async (req, res) => {
  const activity = await updateData((data) => {
    const { activity: found } = findActivity(data, req.params.periodId, req.params.activityId);
    if (!found) return null;
    if (req.body.kegiatan !== undefined) found.kegiatan = String(req.body.kegiatan || '').trim();
    if (req.body.waktu !== undefined) found.waktu = String(req.body.waktu || '').trim();
    if (req.body.catatan !== undefined) found.catatan = String(req.body.catatan || '').trim();
    found.updatedAt = new Date().toISOString();
    return normalizeActivity(found);
  });
  if (!activity) return res.status(404).json({ error: 'Kegiatan tidak ditemukan.' });
  res.json({ activity });
});

app.post('/api/periods/:periodId/activities/:activityId/drive-preview', async (req, res) => {
  try {
    const files = await listFromDriveLinks(collectDriveLinks(req.body.driveLinks));
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Gagal membaca file Google Drive.' });
  }
});

app.put('/api/periods/:periodId/activities/:activityId/drive-evidence', async (req, res) => {
  const activity = await updateData((data) => {
    const { activity: found } = findActivity(data, req.params.periodId, req.params.activityId);
    if (!found) return null;
    normalizeActivity(found);
    const selectedDriveIds = Array.isArray(req.body.selectedDriveIds) ? req.body.selectedDriveIds.map(String).filter(Boolean) : [];
    const selected = new Set(selectedDriveIds);
    const driveFiles = Array.isArray(req.body.driveFiles) ? req.body.driveFiles.filter(file => selected.has(file.id)) : [];
    found.evidence.driveLinks = collectDriveLinks(req.body.driveLinks);
    found.evidence.selectedDriveIds = selectedDriveIds;
    found.evidence.driveFiles = driveFiles;
    found.updatedAt = new Date().toISOString();
    return found;
  });
  if (!activity) return res.status(404).json({ error: 'Kegiatan tidak ditemukan.' });
  res.json({ activity, status: activityStatus(activity) });
});

app.post('/api/periods/:periodId/activities/:activityId/manual-evidence', evidenceUpload.array('manualFiles', 100), async (req, res) => {
  const activity = await updateData(async (data) => {
    const { activity: found } = findActivity(data, req.params.periodId, req.params.activityId);
    if (!found) return null;
    normalizeActivity(found);
    const files = await Promise.all((req.files || []).map(async (file) => ({
      id: uuidv4(),
      ...(await saveManualEvidence(file, req.params.periodId, req.params.activityId)),
      uploadedAt: new Date().toISOString()
    })));
    found.evidence.manualFiles.push(...files);
    found.updatedAt = new Date().toISOString();
    return found;
  });
  if (!activity) return res.status(404).json({ error: 'Kegiatan tidak ditemukan.' });
  res.json({ activity, status: activityStatus(activity) });
});

app.delete('/api/periods/:periodId/activities/:activityId/manual-evidence/:fileId', async (req, res) => {
  let removedFile = null;
  const activity = await updateData((data) => {
    const { activity: found } = findActivity(data, req.params.periodId, req.params.activityId);
    if (!found) return null;
    normalizeActivity(found);
    const before = found.evidence.manualFiles.length;
    found.evidence.manualFiles = found.evidence.manualFiles.filter(file => {
      if (file.id !== req.params.fileId) return true;
      removedFile = file;
      return false;
    });
    if (before !== found.evidence.manualFiles.length) found.updatedAt = new Date().toISOString();
    return found;
  });
  if (!activity) return res.status(404).json({ error: 'Kegiatan tidak ditemukan.' });
  if (removedFile) await deleteStoredFile(removedFile);
  res.json({ activity, status: activityStatus(activity) });
});

app.get('/api/drive-thumbnail/:id', async (req, res) => {
  try {
    const { stream, meta } = await streamDriveFileById(req.params.id);
    res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    stream.on('error', (err) => {
      console.error(err);
      if (!res.headersSent) res.status(500).end('Gagal memuat preview.');
      else res.end();
    });
    stream.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message || 'Gagal memuat preview Drive.');
  }
});


app.post('/api/drive-preview', async (req, res) => {
  try {
    const rawLinks = Array.isArray(req.body.driveLinks) ? req.body.driveLinks : String(req.body.driveLinks || '').split(/\n|,/);
    const files = rawLinks.some(x => String(x).trim())
      ? await listFromDriveLinks(rawLinks.map(x => String(x).trim()))
      : [];
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Gagal membaca file Google Drive.' });
  }
});

app.post('/api/generate', upload.array('manualFiles', 100), async (req, res) => {
  const jobId = uuidv4();
  const jobDir = path.join(TMP_DIR, jobId);
  const driveDir = path.join(jobDir, 'drive');
  const manualDir = path.join(jobDir, 'manual');
  const processedDir = path.join(jobDir, 'processed');
  await fs.mkdir(driveDir, { recursive: true });
  await fs.mkdir(manualDir, { recursive: true });
  await fs.mkdir(processedDir, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const cleanup = async () => fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});

  try {
    const { nama, nip, periode, waktu, kegiatan } = req.body;
    const selectedDriveIdsRaw = req.body.selectedDriveIds;
    const selectedDriveIds = Array.isArray(selectedDriveIdsRaw)
      ? selectedDriveIdsRaw
      : String(selectedDriveIdsRaw || '').split(',').map(x => x.trim()).filter(Boolean);

    const driveFiles = selectedDriveIds.length
      ? await downloadDriveFilesByIds(selectedDriveIds, driveDir)
      : [];

    const manualFiles = await Promise.all((req.files || []).map(file => saveUploadToTemp(file, manualDir)));
    const allFiles = [...driveFiles, ...manualFiles];
    if (!allFiles.length) throw new Error('Belum ada bukti dukung. Isi link Drive atau upload file manual.');

    const imagePaths = await normalizeEvidence(allFiles, processedDir);
    if (!imagePaths.length) throw new Error('Tidak ada bukti yang berhasil diproses. Gunakan gambar atau PDF.');

    const safeName = `${nama || 'CKP'}-${nip || 'NIP'}`.replace(/[^a-zA-Z0-9-_]/g, '_');
    const outputPath = path.join(OUTPUT_DIR, `Bukti_CKP_${safeName}_${Date.now()}.pdf`);
    await generatePdf({ nama, nip, periode, waktu: activityTimeLabel(waktu), kegiatan, imagePaths, outputPath });

    res.download(outputPath, path.basename(outputPath), async (err) => {
      await cleanup();
      if (err) console.error(err);
    });
  } catch (err) {
    await cleanup();
    console.error(err);
    res.status(500).json({ error: err.message || 'Gagal membuat PDF.' });
  }
});

app.post('/api/periods/:periodId/activities/:activityId/generate', async (req, res) => {
  const data = await readData();
  const { period, activity } = findActivity(data, req.params.periodId, req.params.activityId);
  if (!period || !activity) return res.status(404).json({ error: 'Kegiatan tidak ditemukan.' });
  normalizeActivity(activity);

  const jobId = uuidv4();
  const jobDir = path.join(TMP_DIR, jobId);
  const driveDir = path.join(jobDir, 'drive');
  const manualDir = path.join(jobDir, 'manual');
  const processedDir = path.join(jobDir, 'processed');
  await fs.mkdir(driveDir, { recursive: true });
  await fs.mkdir(manualDir, { recursive: true });
  await fs.mkdir(processedDir, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const cleanup = async () => fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});

  try {
    const driveFiles = activity.evidence.selectedDriveIds.length
      ? await downloadDriveFilesByIds(activity.evidence.selectedDriveIds, driveDir)
      : [];
    const manualFiles = await Promise.all(activity.evidence.manualFiles.map(file => materializeStoredFile(file, manualDir)));
    const allFiles = [...driveFiles, ...manualFiles];
    if (!allFiles.length) throw new Error('Kegiatan ini belum memiliki bukti dukung.');

    const imagePaths = await normalizeEvidence(allFiles, processedDir);
    if (!imagePaths.length) throw new Error('Tidak ada bukti yang berhasil diproses. Gunakan gambar atau PDF.');

    const profile = data.profile || {};
    const safeName = `${profile.nama || 'CKP'}-${profile.nip || 'NIP'}-${period.month}`.replace(/[^a-zA-Z0-9-_]/g, '_');
    const outputPath = path.join(OUTPUT_DIR, `Bukti_CKP_${safeName}_${Date.now()}.pdf`);
    await generatePdf({
      nama: profile.nama,
      nip: profile.nip,
      periode: period.label || monthLabel(period.month),
      waktu: activityTimeLabel(activity.waktu),
      kegiatan: activity.kegiatan,
      imagePaths,
      outputPath
    });

    const filename = path.basename(outputPath);
    const pdf = await persistOutputPdf(outputPath, filename);
    await updateData((fresh) => {
      const { activity: freshActivity } = findActivity(fresh, req.params.periodId, req.params.activityId);
      if (!freshActivity) return null;
      normalizeActivity(freshActivity);
      freshActivity.generatedPdfs.unshift({
        ...pdf,
        generatedAt: new Date().toISOString()
      });
      return freshActivity;
    });

    res.json({ filename: pdf.filename, url: pdf.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Gagal membuat PDF.' });
  } finally {
    await cleanup();
  }
});

app.get('/api/output/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!/^Bukti_CKP_[\w.-]+\.pdf$/.test(filename)) return res.status(400).send('Nama file tidak valid.');
  await sendOutputPdf(res, filename);
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const message = err?.code === 'LIMIT_FILE_SIZE'
    ? `Ukuran file terlalu besar. Batas upload saat ini ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB per file.`
    : err.message || 'Terjadi kesalahan server.';
  res.status(400).json({ error: message });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`CKP Evidence App berjalan di http://localhost:${PORT}`));
}

module.exports = app;
