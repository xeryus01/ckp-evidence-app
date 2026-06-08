require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Jimp = require('jimp');
const { v4: uuidv4 } = require('uuid');

// Lazy load sharp - try to load, fallback gracefully if unavailable
async function tryLoadSharp() {
  try {
    return require('sharp');
  } catch (err) {
    console.warn('[server] sharp not available:', err.message);
    return null;
  }
}
const {
  listFromDriveLinks,
  downloadDriveFilesByIds,
  streamDriveFileById,
  uploadFileToFolder
} = require('./drive');
const { generatePdf } = require('./pdfGenerator');
const XLSX = require('xlsx');

let normalizeEvidence;
function getNormalizeEvidence() {
  if (!normalizeEvidence) {
    normalizeEvidence = require('./processEvidence').normalizeEvidence;
  }
  return normalizeEvidence;
}
const { readData, updateData, findActivity, findPeriod, findProfile, getStorageInfo } = require('./dataStore');
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
const DRIVE_UPLOAD_FOLDER_ID = process.env.GOOGLE_DRIVE_UPLOAD_FOLDER_ID || '1vzMxCBTOm3zVFZic-XKnb0GIC68Yn7qK';
const MAX_FILE_SIZE = Number(process.env.MAX_UPLOAD_MB || (process.env.VERCEL ? 4 : 50)) * 1024 * 1024;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

const supportedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp', 'image/heic', 'image/heif', 'application/pdf'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 100 },
  fileFilter: (req, file, cb) => {
    if (supportedMimes.includes(file.mimetype) || file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Hanya gambar (termasuk HEIC) dan PDF yang didukung.'));
  }
});

const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 100 },
  fileFilter: (req, file, cb) => {
    if (supportedMimes.includes(file.mimetype) || file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Hanya gambar (termasuk HEIC) dan PDF yang didukung.'));
  }
});

function monthLabel(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return String(month || '-');
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
    .format(new Date(year, monthNumber - 1, 1));
}

async function bufferStream(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
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

function formatOutputFilename(dateValue, activityName) {
  let datePart = String(dateValue || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    datePart = datePart.replace(/-/g, '');
  } else if (/^\d{4}-\d{2}$/.test(datePart)) {
    datePart = `${datePart.slice(0, 4)}${datePart.slice(5, 7)}01`;
  } else {
    datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }

  const safeName = String(activityName || 'kegiatan')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ');

  return `${datePart}_${safeName}.pdf`;
}

function defaultEvidence() {
  return { driveLinks: [], driveFiles: [], selectedDriveIds: [], manualFiles: [], supportLinks: [] };
}

function normalizeActivity(activity) {
  activity.evidence = { ...defaultEvidence(), ...(activity.evidence || {}) };
  if (!Array.isArray(activity.evidence.driveFiles)) activity.evidence.driveFiles = [];
  if (!Array.isArray(activity.evidence.selectedDriveIds)) activity.evidence.selectedDriveIds = [];
  if (!Array.isArray(activity.evidence.manualFiles)) activity.evidence.manualFiles = [];
  if (!Array.isArray(activity.evidence.supportLinks)) activity.evidence.supportLinks = [];
  activity.generatedPdfs = activity.generatedPdfs || [];
  return activity;
}

function getSelectedDriveIds(evidence) {
  const normalized = { ...defaultEvidence(), ...(evidence || {}) };
  const ids = Array.isArray(normalized.selectedDriveIds)
    ? normalized.selectedDriveIds.map(String).filter(Boolean)
    : [];
  if (ids.length) return [...new Set(ids)];
  return Array.isArray(normalized.driveFiles)
    ? normalized.driveFiles.map(file => String(file.id || '').trim()).filter(Boolean)
    : [];
}

function collectDriveLinks(input) {
  if (Array.isArray(input)) return input.map(item => String(item).trim()).filter(Boolean);
  return String(input || '').split(/\n|,/).map(item => item.trim()).filter(Boolean);
}

function collectSupportLinks(input) {
  if (Array.isArray(input)) return input.map(item => String(item).trim()).filter(Boolean);
  return String(input || '').split(/\n|,/).map(item => item.trim()).filter(Boolean);
}

function activityStatus(activity) {
  const evidence = normalizeActivity({ evidence: activity.evidence }).evidence;
  const driveCount = getSelectedDriveIds(evidence).length;
  const supportCount = Array.isArray(evidence.supportLinks) ? evidence.supportLinks.length : 0;
  const count = driveCount + evidence.manualFiles.length;

  if (count && supportCount) return `${count} bukti siap + ${supportCount} bukti dukung`;
  if (count) return `${count} bukti siap`;
  if (supportCount) return `${supportCount} bukti dukung`;
  return 'Menunggu bukti';
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/state', async (req, res) => {
  try {
    console.log('[/api/state] Reading data...');
    const data = await readData();
    console.log('[/api/state] Data read successfully, profiles:', data.profiles.length);
    const profile = findProfile(data, data.selectedProfileId) || { nama: '', nip: '', periods: [] };
    profile.periods = Array.isArray(profile.periods) ? profile.periods : [];
    profile.periods.forEach(period => period.activities.forEach(normalizeActivity));
    console.log('[/api/state] Sending response');
    res.json({
      profiles: data.profiles,
      selectedProfileId: data.selectedProfileId,
      profile: {
        id: profile.id,
        nama: profile.nama,
        nip: profile.nip
      },
      periods: profile.periods
    });
  } catch (error) {
    console.error('[/api/state] ERROR:', {
      message: error.message,
      stack: error.stack?.slice(0, 300)
    });
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/profile', async (req, res) => {
  const profile = await updateData((data) => {
    let selected = findProfile(data, data.selectedProfileId);
    if (!selected && data.profiles.length) {
      selected = data.profiles[0];
      data.selectedProfileId = selected.id;
    }
    if (!selected) {
      selected = {
        id: uuidv4(),
        nama: String(req.body.nama || '').trim(),
        nip: String(req.body.nip || '').trim(),
        periods: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.profiles.unshift(selected);
      data.selectedProfileId = selected.id;
      return selected;
    }
    selected.nama = String(req.body.nama || '').trim();
    selected.nip = String(req.body.nip || '').trim();
    selected.updatedAt = new Date().toISOString();
    return selected;
  });
  res.json({ profile });
});

app.get('/api/profiles', async (req, res) => {
  const data = await readData();
  res.json({ profiles: data.profiles, selectedProfileId: data.selectedProfileId });
});

app.post('/api/profiles', async (req, res) => {
  const profile = await updateData((data) => {
    const newProfile = {
      id: uuidv4(),
      nama: String(req.body.nama || '').trim(),
      nip: String(req.body.nip || '').trim(),
      periods: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.profiles.unshift(newProfile);
    data.selectedProfileId = newProfile.id;
    return newProfile;
  });
  res.json({ profile, selectedProfileId: profile.id });
});

app.put('/api/profiles/:profileId', async (req, res) => {
  const profile = await updateData((data) => {
    const found = findProfile(data, req.params.profileId);
    if (!found) return null;
    found.nama = String(req.body.nama || '').trim();
    found.nip = String(req.body.nip || '').trim();
    found.updatedAt = new Date().toISOString();
    data.selectedProfileId = found.id;
    return found;
  });
  if (!profile) return res.status(404).json({ error: 'Profil tidak ditemukan.' });
  res.json({ profile, selectedProfileId: profile.id });
});

app.put('/api/profiles/:profileId/select', async (req, res) => {
  const profile = await updateData((data) => {
    const found = findProfile(data, req.params.profileId);
    if (!found) return null;
    data.selectedProfileId = found.id;
    return found;
  });
  if (!profile) return res.status(404).json({ error: 'Profil tidak ditemukan.' });
  res.json({ profile, selectedProfileId: profile.id });
});

app.post('/api/periods', async (req, res) => {
  const month = String(req.body.month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Periode harus berupa bulan, contoh 2026-05.' });

  const period = await updateData((data) => {
    const profile = findProfile(data, data.selectedProfileId);
    if (!profile) throw new Error('Pilih profil terlebih dahulu.');
    let existing = profile.periods.find(item => item.month === month);
    if (existing) return existing;

    existing = {
      id: uuidv4(),
      month,
      label: monthLabel(month),
      activities: [],
      createdAt: new Date().toISOString()
    };
    profile.periods.unshift(existing);
    profile.periods.sort((a, b) => b.month.localeCompare(a.month));
    return existing;
  });
  res.json({ period });
});

app.post('/api/periods/:periodId/activities', async (req, res) => {
  const activity = await updateData((data) => {
    const profile = findProfile(data, data.selectedProfileId);
    if (!profile) return null;
    const period = profile.periods.find(item => item.id === req.params.periodId);
    if (!period) return null;

    const newActivity = normalizeActivity({
      id: uuidv4(),
      kegiatan: String(req.body.kegiatan || '').trim(),
      startDate: String(req.body.startDate || '').trim(),
      endDate: String(req.body.endDate || '').trim(),
      startTime: String(req.body.startTime || '').trim(),
      endTime: String(req.body.endTime || '').trim(),
      waktu: String(req.body.startDate || req.body.waktu || '').trim(),
      catatan: String(req.body.catatan || '').trim(),
      createdAt: new Date().toISOString()
    });
    if (!newActivity.kegiatan) throw new Error('Nama kegiatan wajib diisi.');
    period.activities.push(newActivity);
    period.activities.sort((a, b) => String(b.startDate || b.waktu || '').localeCompare(String(a.startDate || a.waktu || '')));
    return newActivity;
  });
  if (!activity) return res.status(404).json({ error: 'Periode tidak ditemukan.' });
  res.json({ activity });
});

app.patch('/api/periods/:periodId/activities/:activityId', async (req, res) => {
  const activity = await updateData((data) => {
    const { period, activity: found } = findActivity(data, req.params.periodId, req.params.activityId);
    if (!found) return null;
    if (req.body.kegiatan !== undefined) found.kegiatan = String(req.body.kegiatan || '').trim();
    if (req.body.waktu !== undefined) found.waktu = String(req.body.waktu || '').trim();
    if (req.body.startDate !== undefined) {
      found.startDate = String(req.body.startDate || '').trim();
      found.waktu = found.startDate || String(found.waktu || '').trim();
    }
    if (req.body.endDate !== undefined) found.endDate = String(req.body.endDate || '').trim();
    if (req.body.startTime !== undefined) found.startTime = String(req.body.startTime || '').trim();
    if (req.body.endTime !== undefined) found.endTime = String(req.body.endTime || '').trim();
    if (req.body.catatan !== undefined) found.catatan = String(req.body.catatan || '').trim();
    found.updatedAt = new Date().toISOString();
    const normalized = normalizeActivity(found);
    if (period?.activities) {
      period.activities.sort((a, b) => String(b.startDate || b.waktu || '').localeCompare(String(a.startDate || a.waktu || '')));
    }
    return normalized;
  });
  if (!activity) return res.status(404).json({ error: 'Kegiatan tidak ditemukan.' });
  res.json({ activity });
});

app.delete('/api/periods/:periodId/activities/:activityId', async (req, res) => {
  const removed = await updateData((data) => {
    const { period, activity } = findActivity(data, req.params.periodId, req.params.activityId);
    if (!period || !activity) return null;
    const index = period.activities.findIndex(item => item.id === activity.id);
    if (index === -1) return null;
    period.activities.splice(index, 1);
    return activity;
  });
  if (!removed) return res.status(404).json({ error: 'Kegiatan tidak ditemukan.' });
  res.json({ success: true });
});
app.post('/api/periods/:periodId/activities/:activityId/duplicate', async (req, res) => {
  const duplicate = await updateData((data) => {
    const profile = findProfile(data, data.selectedProfileId);
    if (!profile) return null;

    const { period: sourcePeriod, activity } = findActivity(data, req.params.periodId, req.params.activityId);
    if (!sourcePeriod || !activity) return null;

    const waktu = String(req.body.waktu || '').trim();
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(waktu)) {
      throw new Error('Tanggal duplikasi harus dalam format YYYY-MM-DD.');
    }

    const targetMonth = waktu.slice(0, 7);
    let targetPeriod = profile.periods.find(item => item.month === targetMonth);
    if (!targetPeriod) {
      targetPeriod = {
        id: uuidv4(),
        month: targetMonth,
        label: monthLabel(targetMonth),
        activities: [],
        createdAt: new Date().toISOString()
      };
      profile.periods.unshift(targetPeriod);
      profile.periods.sort((a, b) => b.month.localeCompare(a.month));
    }

    const duplicatedActivity = normalizeActivity({
      id: uuidv4(),
      kegiatan: activity.kegiatan,
      waktu,
      startDate: waktu,
      endDate: activity.endDate || '',
      startTime: activity.startTime || '',
      endTime: activity.endTime || '',
      catatan: activity.catatan || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    targetPeriod.activities.push(duplicatedActivity);
    targetPeriod.activities.sort((a, b) => String(b.startDate || b.waktu || '').localeCompare(String(a.startDate || a.waktu || '')));

    return { activity: duplicatedActivity, period: { id: targetPeriod.id, month: targetPeriod.month, label: targetPeriod.label } };
  });

  if (!duplicate) return res.status(404).json({ error: 'Kegiatan tidak ditemukan.' });
  res.json(duplicate);
});
app.get('/api/periods/:periodId/export', async (req, res) => {
  try {
    const data = await readData();
    const profile = findProfile(data, data.selectedProfileId) || { nama: '', nip: '' };
    const period = findPeriod(data, req.params.periodId);
    if (!period) return res.status(404).json({ error: 'Periode tidak ditemukan.' });

    const parseActivityTime = (value) => {
      const raw = String(value || '').trim();
      if (!raw) return { date: '', startTime: '', endTime: '' };

      const dateOnlyMatch = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
      if (dateOnlyMatch) {
        return { date: activityTimeLabel(dateOnlyMatch[1]), startTime: '', endTime: '' };
      }

      const dateTimeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[ T]+(.+)$/);
      if (dateTimeMatch) {
        const dateLabel = activityTimeLabel(dateTimeMatch[1]);
        const timePart = dateTimeMatch[2].trim();
        const rangeMatch = timePart.match(/^(\d{2}:\d{2}(?::\d{2})?)\s*[-–—]\s*(\d{2}:\d{2}(?::\d{2})?)$/);
        if (rangeMatch) {
          return { date: dateLabel, startTime: rangeMatch[1], endTime: rangeMatch[2] };
        }
        const singleTimeMatch = timePart.match(/^(\d{2}:\d{2}(?::\d{2})?)$/);
        if (singleTimeMatch) {
          return { date: dateLabel, startTime: singleTimeMatch[1], endTime: '' };
        }
        return { date: dateLabel, startTime: '', endTime: '' };
      }

      return { date: raw, startTime: '', endTime: '' };
    };

    const rows = (Array.isArray(period.activities) ? period.activities : []).map((activity, index) => {
      const parsed = parseActivityTime(activity.waktu);
      const dateLabel = activity.startDate ? activityTimeLabel(activity.startDate) : parsed.date;
      const startTime = activity.startTime || parsed.startTime;
      const endTime = activity.endTime || parsed.endTime;
      return {
        No: index + 1,
        Tanggal: dateLabel,
        'Tanggal Mulai': activity.startDate ? activityTimeLabel(activity.startDate) : '',
        'Tanggal Selesai': activity.endDate ? activityTimeLabel(activity.endDate) : '',
        'Jam Mulai': startTime,
        'Jam Selesai': endTime,
        Kegiatan: activity.kegiatan || '',
        Catatan: activity.catatan || '',
        Progres: 100,
        'Centang SKP': 1,
        'Status Bukti': activityStatus(activity),
        'Link Bukti Dukung': ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: ['No', 'Tanggal', 'Tanggal Mulai', 'Tanggal Selesai', 'Jam Mulai', 'Jam Selesai', 'Kegiatan', 'Catatan', 'Progres', 'Centang SKP', 'Status Bukti', 'Link Bukti Dukung']
    });
    const workbook = XLSX.utils.book_new();
    const sheetName = String(period.label || period.month).slice(0, 31) || 'Kegiatan';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const safeName = `${profile.nama || 'Pegawai'}_${period.month}`.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `Kegiatan_CKP_${safeName}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Gagal mengekspor Excel.' });
  }
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
    found.evidence.supportLinks = collectSupportLinks(req.body.supportLinks);
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
    const mimeType = String(meta.mimeType || '').toLowerCase();
    const isImage = mimeType.startsWith('image/');
    res.setHeader('Cache-Control', 'private, max-age=300');

    if (!isImage) {
      res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
      stream.on('error', (err) => {
        console.error('Drive thumbnail stream error:', err);
        if (!res.headersSent) res.status(500).end('Gagal memuat preview.');
      });
      return stream.pipe(res);
    }

    const resizeOptions = { width: 640, height: 640, fit: 'inside', withoutEnlargement: true };
    res.setHeader('Content-Type', 'image/jpeg');

    try {
      const sharp = await tryLoadSharp();
      
      if (mimeType === 'image/heic' || mimeType === 'image/heif') {
        const buffer = await bufferStream(stream);
        if (sharp) {
          const outputBuffer = await sharp(buffer)
            .rotate()
            .resize(resizeOptions)
            .jpeg({ quality: 80, mozjpeg: true })
            .toBuffer();
          return res.send(outputBuffer);
        } else {
          // Jimp fallback for HEIC
          const image = await Jimp.read(buffer);
          const resized = image.resize({ w: resizeOptions.width, h: resizeOptions.height, mode: 'contain' });
          const outputBuffer = await resized.quality(80).getBuffer('image/jpeg');
          return res.send(outputBuffer);
        }
      }

      if (sharp) {
        const transformer = sharp()
          .rotate()
          .resize(resizeOptions)
          .jpeg({ quality: 80, mozjpeg: true });
        stream.on('error', (err) => {
          console.error('Drive thumbnail stream error:', err);
          if (!res.headersSent) res.status(500).end('Gagal memuat preview.');
        });
        transformer.on('error', (err) => {
          console.error('Sharp preview conversion error:', err);
          if (!res.headersSent) res.status(500).end('Gagal memuat preview.');
        });
        return stream.pipe(transformer).pipe(res);
      } else {
        // Jimp fallback
        const buffer = await bufferStream(stream);
        const image = await Jimp.read(buffer);
        const resized = image.resize({ w: resizeOptions.width, h: resizeOptions.height, mode: 'contain' });
        const outputBuffer = await resized.quality(80).getBuffer('image/jpeg');
        return res.send(outputBuffer);
      }
    } catch (err) {
      console.error('Thumbnail conversion error:', err);
      if (!res.headersSent) res.status(500).end('Gagal memuat preview.');
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).send(err.message || 'Gagal memuat preview Drive.');
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

    const normalizeEvidenceFn = getNormalizeEvidence();
    const imagePaths = await normalizeEvidenceFn(allFiles, processedDir);
    if (!imagePaths.length) throw new Error('Tidak ada bukti yang berhasil diproses. Gunakan gambar atau PDF.');

    const filename = formatOutputFilename(waktu, kegiatan);
    const outputPath = path.join(OUTPUT_DIR, filename);
    await generatePdf({ nama, nip, periode, waktu: activityTimeLabel(waktu), kegiatan, imagePaths, outputPath });
    console.log('[server] Generated PDF without uploading to Drive:', outputPath);

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
  const requestId = uuidv4();
  const startAt = Date.now();
  console.log(`[generate] Request ${requestId} start`, {
    periodId: req.params.periodId,
    activityId: req.params.activityId
  });

  const data = await readData();
  const { period, activity } = findActivity(data, req.params.periodId, req.params.activityId);
  if (!period || !activity) {
    console.error(`[generate] Request ${requestId} not found`, { periodId: req.params.periodId, activityId: req.params.activityId });
    return res.status(404).json({ error: 'Kegiatan tidak ditemukan.' });
  }
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
    const driveIds = getSelectedDriveIds(activity.evidence);
    console.log(`[generate] Request ${requestId} fetching evidence`, {
      driveIdsCount: driveIds.length,
      manualCount: Array.isArray(activity.evidence.manualFiles) ? activity.evidence.manualFiles.length : 0
    });

    const driveFiles = driveIds.length
      ? await downloadDriveFilesByIds(driveIds, driveDir)
      : [];
    console.log(`[generate] Request ${requestId} downloaded drive files`, { driveFilesCount: driveFiles.length });

    const manualFiles = await Promise.all((Array.isArray(activity.evidence.manualFiles) ? activity.evidence.manualFiles : []).map(file => materializeStoredFile(file, manualDir)));
    console.log(`[generate] Request ${requestId} materialized manual files`, { manualFilesCount: manualFiles.length });

    const allFiles = [...driveFiles, ...manualFiles];
    if (!allFiles.length) throw new Error('Kegiatan ini belum memiliki bukti dukung.');

    const normalizeEvidenceFn = getNormalizeEvidence();
    const imagePaths = await normalizeEvidenceFn(allFiles, processedDir);
    console.log(`[generate] Request ${requestId} evidence processed`, { imagePathsCount: imagePaths.length });
    if (!imagePaths.length) throw new Error('Tidak ada bukti yang berhasil diproses. Gunakan gambar atau PDF.');

    const profile = findProfile(data, data.selectedProfileId) || { nama: '', nip: '' };
    const filename = formatOutputFilename(activity.waktu, activity.kegiatan);
    const outputPath = path.join(OUTPUT_DIR, filename);
    await generatePdf({
      nama: profile.nama,
      nip: profile.nip,
      periode: period.label || monthLabel(period.month),
      waktu: activityTimeLabel(activity.waktu),
      kegiatan: activity.kegiatan,
      imagePaths,
      outputPath
    });
    console.log(`[generate] Request ${requestId} PDF generated`, { outputPath });

    const pdf = await persistOutputPdf(outputPath, filename);
    console.log(`[generate] Request ${requestId} PDF persisted`, { pdfUrl: pdf.url, filename: pdf.filename });

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

    console.log(`[generate] Request ${requestId} skipped Drive upload and completed`);
    const elapsedMs = Date.now() - startAt;
    console.log(`[generate] Request ${requestId} completed`, { elapsedMs });
    res.json({ filename: pdf.filename, url: pdf.url });
  } catch (err) {
    await cleanup();
    console.error(`[generate] Request ${requestId} failed`, {
      message: err.message,
      stack: err.stack,
      periodId: req.params.periodId,
      activityId: req.params.activityId
    });
    res.status(500).json({ error: err.message || 'Gagal membuat PDF.', stack: err.stack });
  } finally {
    await cleanup();
  }
});

app.get('/api/output/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!/^[A-Za-z0-9 _\-.]+\.pdf$/.test(filename)) return res.status(400).send('Nama file tidak valid.');
  await sendOutputPdf(res, filename);
});

app.get('/api/diagnostics', async (req, res) => {
  try {
    const storageInfo = await getStorageInfo();
    const isDev = !process.env.VERCEL;
    res.json({
      environment: {
        vercel: process.env.VERCEL === '1',
        nodeEnv: process.env.NODE_ENV || 'development',
        platform: process.env.VERCEL_PLATFORM_OS || 'unknown'
      },
      storage: storageInfo,
      features: {
        googleDrive: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        blob: storageInfo.usesBlob,
        pdfGeneration: true
      },
      limits: {
        maxUploadMB: MAX_FILE_SIZE / 1024 / 1024,
        maxTimeout: 300
      },
      status: 'healthy'
    });
  } catch (err) {
    console.error('[/api/diagnostics] ERROR:', err.message);
    res.status(500).json({
      error: err.message,
      status: 'degraded'
    });
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const message = err?.code === 'LIMIT_FILE_SIZE'
    ? `Ukuran file terlalu besar. Batas upload saat ini ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB per file.`
    : err.message || 'Terjadi kesalahan server.';
  res.status(400).json({ error: message });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR] Unhandled error:', {
    message: err.message,
    code: err.code,
    statusCode: err.statusCode,
    stack: err.stack?.slice(0, 500)
  });
  const message = err.status === 400 
    ? err.message 
    : 'Terjadi kesalahan server yang tidak terduga.';
  res.status(err.status || 500).json({ error: message });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`CKP Evidence App berjalan di http://localhost:${PORT}`));
}

module.exports = app;
