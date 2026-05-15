const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { del, get, put } = require('@vercel/blob');

const hasBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const isVercel = Boolean(process.env.VERCEL);
const TMP_ROOT = process.env.TMP_DIR || (process.env.VERCEL ? '/tmp/ckp-evidence' : 'storage/tmp');
const OUTPUT_DIR = process.env.OUTPUT_DIR || (process.env.VERCEL ? path.join(TMP_ROOT, 'output') : 'storage/output');
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || 'storage/evidence';

function usingBlob() {
  return hasBlob;
}

function safeFilename(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|]/g, '_');
}

function blobPath(...parts) {
  return parts.map(part => safeFilename(part)).join('/');
}

async function saveUploadToTemp(file, dir) {
  await fsp.mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${safeFilename(file.originalname)}`;
  const filePath = path.join(dir, filename);
  await fsp.writeFile(filePath, file.buffer);
  return { path: filePath, mimetype: file.mimetype, name: file.originalname };
}

async function saveManualEvidence(file, periodId, activityId) {
  const filename = `${Date.now()}-${safeFilename(file.originalname)}`;

  if (hasBlob) {
    const pathname = blobPath('evidence', periodId, activityId, filename);
    const stored = await put(pathname, file.buffer, {
      access: 'private',
      contentType: file.mimetype,
      addRandomSuffix: true
    });
    return {
      name: file.originalname,
      filename: stored.pathname.split('/').pop(),
      blobPath: stored.pathname,
      blobUrl: stored.url,
      mimetype: file.mimetype,
      size: file.size
    };
  }

  if (isVercel) {
    throw new Error('BLOB_READ_WRITE_TOKEN belum diatur. Hubungkan Vercel Blob agar upload manual bisa tersimpan.');
  }

  const dir = path.join(EVIDENCE_DIR, periodId, activityId);
  await fsp.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await fsp.writeFile(filePath, file.buffer);
  return {
    name: file.originalname,
    filename,
    path: filePath,
    mimetype: file.mimetype,
    size: file.size
  };
}

async function deleteStoredFile(file) {
  if (file?.blobPath && hasBlob) {
    await del(file.blobPath).catch(() => {});
    return;
  }
  if (file?.path) await fsp.rm(file.path, { force: true }).catch(() => {});
}

async function materializeStoredFile(file, destDir) {
  if (!file?.blobPath) {
    return {
      path: file.path,
      mimetype: file.mimetype,
      mimeType: file.mimeType,
      name: file.name
    };
  }

  if (!hasBlob) throw new Error('BLOB_READ_WRITE_TOKEN belum tersedia untuk membaca bukti manual.');

  await fsp.mkdir(destDir, { recursive: true });
  const result = await get(file.blobPath, { access: 'private', useCache: false });
  if (!result?.stream) throw new Error(`Bukti manual tidak ditemukan: ${file.name}`);

  const filePath = path.join(destDir, file.filename || safeFilename(file.name));
  await pipeline(Readable.fromWeb(result.stream), fs.createWriteStream(filePath));
  return {
    path: filePath,
    mimetype: file.mimetype || result.blob.contentType,
    name: file.name
  };
}

async function persistOutputPdf(outputPath, filename) {
  if (hasBlob) {
    const pathname = blobPath('output', filename);
    const stored = await put(pathname, fs.createReadStream(outputPath), {
      access: 'private',
      contentType: 'application/pdf',
      allowOverwrite: true
    });
    return {
      filename,
      url: `/api/output/${encodeURIComponent(filename)}`,
      blobPath: stored.pathname,
      blobUrl: stored.url
    };
  }

  if (isVercel) {
    throw new Error('BLOB_READ_WRITE_TOKEN belum diatur. Hubungkan Vercel Blob agar PDF tersimpan.');
  }

  return { filename, url: `/api/output/${encodeURIComponent(filename)}` };
}

async function sendOutputPdf(res, filename) {
  if (hasBlob) {
    const result = await get(blobPath('output', filename), { access: 'private', useCache: false });
    if (!result?.stream) return res.status(404).send('PDF tidak ditemukan.');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await pipeline(Readable.fromWeb(result.stream), res);
    return null;
  }

  const filePath = path.join(OUTPUT_DIR, filename);
  return res.download(filePath, filename);
}

module.exports = {
  EVIDENCE_DIR,
  OUTPUT_DIR,
  TMP_ROOT,
  deleteStoredFile,
  materializeStoredFile,
  persistOutputPdf,
  saveManualEvidence,
  saveUploadToTemp,
  sendOutputPdf,
  usingBlob
};
