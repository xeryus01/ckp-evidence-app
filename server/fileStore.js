const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const hasBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const isVercel = Boolean(process.env.VERCEL);

let blobClient = null;
function getBlobClient() {
  if (blobClient !== null) return blobClient;
  try {
    blobClient = require('@vercel/blob');
  } catch (err) {
    console.warn('[fileStore] @vercel/blob import failed:', err.message);
    blobClient = null;
  }
  return blobClient;
}
const TMP_ROOT = process.env.TMP_DIR || (process.env.VERCEL ? '/tmp/ckp-evidence' : 'storage/tmp');
const OUTPUT_DIR = process.env.OUTPUT_DIR || (process.env.VERCEL ? path.join(TMP_ROOT, 'output') : 'storage/output');
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || 'storage/evidence';

// In-memory fallback storage for Vercel when Blob is not configured
const inMemoryFiles = new Map();
const inMemoryOutputs = new Map();

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
  if (isVercel && !hasBlob) {
    // In-memory storage for Vercel without Blob
    const filename = `${Date.now()}-${safeFilename(file.originalname)}`;
    const fileKey = path.join(dir, filename).replace(/\\/g, '/');
    inMemoryFiles.set(fileKey, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      name: file.originalname
    });
    console.log('[saveUploadToTemp] Stored in-memory:', fileKey);
    return { path: fileKey, mimetype: file.mimetype, name: file.originalname, inMemory: true };
  }

  // Local filesystem storage
  await fsp.mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${safeFilename(file.originalname)}`;
  const filePath = path.join(dir, filename);
  await fsp.writeFile(filePath, file.buffer);
  return { path: filePath, mimetype: file.mimetype, name: file.originalname };
}

async function saveManualEvidence(file, periodId, activityId) {
  const filename = `${Date.now()}-${safeFilename(file.originalname)}`;

  if (hasBlob) {
    const blob = getBlobClient();
    const pathname = blobPath('evidence', periodId, activityId, filename);
    if (blob) {
      try {
        const stored = await blob.put(pathname, file.buffer, {
          access: 'public',
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
      } catch (err) {
        console.error('[saveManualEvidence] Blob upload failed:', err.message);
      }
    } else {
      console.warn('[saveManualEvidence] Blob client unavailable, falling back to in-memory storage');
    }

    // Fallback to in-memory if Blob fails or is unavailable
    const fileKey = blobPath('evidence', periodId, activityId, filename);
    inMemoryFiles.set(fileKey, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      name: file.originalname
    });
    console.log('[saveManualEvidence] Fallback to in-memory storage:', fileKey);
    return {
      name: file.originalname,
      filename,
      inMemoryKey: fileKey,
      blobPath: null,
      mimetype: file.mimetype,
      size: file.size
    };
  }

  if (isVercel) {
    // In-memory storage for Vercel without Blob
    const fileKey = blobPath('evidence', periodId, activityId, filename);
    inMemoryFiles.set(fileKey, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      name: file.originalname
    });
    console.log('[saveManualEvidence] Stored in-memory:', fileKey);
    return {
      name: file.originalname,
      filename,
      inMemoryKey: fileKey,
      blobPath: null,
      mimetype: file.mimetype,
      size: file.size
    };
  }

  // Local storage
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
  if (file?.inMemoryKey) {
    inMemoryFiles.delete(file.inMemoryKey);
    console.log('[deleteStoredFile] Deleted from in-memory:', file.inMemoryKey);
    return;
  }
  if (file?.blobPath && hasBlob) {
    const blob = getBlobClient();
    if (blob) {
      try {
        await blob.del(file.blobPath);
        console.log('[deleteStoredFile] Deleted from Blob:', file.blobPath);
      } catch (err) {
        console.warn('[deleteStoredFile] Failed to delete from Blob:', err.message);
      }
    } else {
      console.warn('[deleteStoredFile] Blob client unavailable, cannot delete blob path:', file.blobPath);
    }
    return;
  }
  if (file?.path) {
    try {
      await fsp.rm(file.path, { force: true });
      console.log('[deleteStoredFile] Deleted from filesystem:', file.path);
    } catch (err) {
      console.warn('[deleteStoredFile] Failed to delete from filesystem:', err.message);
    }
  }
}

async function materializeStoredFile(file, destDir) {
  // Check in-memory first
  if (file?.inMemoryKey) {
    const stored = inMemoryFiles.get(file.inMemoryKey);
    if (stored) {
      await fsp.mkdir(destDir, { recursive: true });
      const filePath = path.join(destDir, file.filename || safeFilename(file.name));
      await fsp.writeFile(filePath, stored.buffer);
      console.log('[materializeStoredFile] Materialized from in-memory:', filePath);
      return {
        path: filePath,
        mimetype: stored.mimetype,
        name: stored.name
      };
    }
  }

  // Check local filesystem
  if (!file?.blobPath) {
    return {
      path: file.path,
      mimetype: file.mimetype,
      mimeType: file.mimeType,
      name: file.name
    };
  }

  // Fetch from Blob
  if (!hasBlob) {
    console.error('[materializeStoredFile] No Blob token available');
    throw new Error('Bukti manual tidak dapat dibaca (Blob storage belum dikonfigurasi).');
  }

  try {
    await fsp.mkdir(destDir, { recursive: true });
    const blob = getBlobClient();
    if (!blob) {
      console.error('[materializeStoredFile] Blob client unavailable');
      throw new Error('Bukti manual tidak dapat dibaca (Blob storage belum dikonfigurasi).');
    }

    const result = await blob.get(file.blobPath, { access: 'public', useCache: false });
    if (!result?.stream) {
      throw new Error(`Bukti manual tidak ditemukan: ${file.name}`);
    }

    const filePath = path.join(destDir, file.filename || safeFilename(file.name));
    await pipeline(Readable.fromWeb(result.stream), fs.createWriteStream(filePath));
    console.log('[materializeStoredFile] Materialized from Blob:', filePath);
    return {
      path: filePath,
      mimetype: file.mimetype || result.blob.contentType,
      name: file.name
    };
  } catch (err) {
    console.error('[materializeStoredFile] Blob fetch failed:', err.message);
    throw err;
  }
}

async function persistOutputPdf(outputPath, filename) {
  if (hasBlob) {
    const blob = getBlobClient();
    const pathname = blobPath('output', filename);
    if (blob) {
      try {
        const stored = await blob.put(pathname, fs.createReadStream(outputPath), {
          access: 'public',
          contentType: 'application/pdf',
          allowOverwrite: true
        });
        console.log('[persistOutputPdf] Persisted to Blob:', pathname);
        return {
          filename,
          url: `/api/output/${encodeURIComponent(filename)}`,
          blobPath: stored.pathname,
          blobUrl: stored.url
        };
      } catch (err) {
        console.error('[persistOutputPdf] Blob upload failed:', err.message);
      }
    } else {
      console.warn('[persistOutputPdf] Blob client unavailable, falling back to in-memory');
    }

    const pdfBuffer = await fsp.readFile(outputPath);
    inMemoryOutputs.set(filename, pdfBuffer);
    console.log('[persistOutputPdf] Fallback to in-memory storage:', filename);
    return {
      filename,
      url: `/api/output/${encodeURIComponent(filename)}`,
      inMemory: true
    };
  }

  if (isVercel) {
    // In-memory storage for Vercel without Blob
    const pdfBuffer = await fsp.readFile(outputPath);
    inMemoryOutputs.set(filename, pdfBuffer);
    console.log('[persistOutputPdf] Stored in-memory:', filename);
    return {
      filename,
      url: `/api/output/${encodeURIComponent(filename)}`,
      inMemory: true
    };
  }

  // Local storage
  console.log('[persistOutputPdf] Stored locally:', filename);
  return { filename, url: `/api/output/${encodeURIComponent(filename)}` };
}

async function sendOutputPdf(res, filename) {
  // Check in-memory first
  if (inMemoryOutputs.has(filename)) {
    const pdfBuffer = inMemoryOutputs.get(filename);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    console.log('[sendOutputPdf] Sending from in-memory:', filename);
    return res.send(pdfBuffer);
  }

  // Fetch from Blob
  if (hasBlob) {
    const blob = getBlobClient();
    if (blob) {
      try {
        const result = await blob.get(blobPath('output', filename), { access: 'public', useCache: false });
        if (!result?.stream) {
          return res.status(404).json({ error: 'PDF tidak ditemukan.' });
        }
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        console.log('[sendOutputPdf] Sending from Blob:', filename);
        await pipeline(Readable.fromWeb(result.stream), res);
        return null;
      } catch (err) {
        console.error('[sendOutputPdf] Blob fetch failed:', err.message);
        return res.status(500).json({ error: 'Gagal mengakses PDF.' });
      }
    }
    console.warn('[sendOutputPdf] Blob client unavailable, falling back to filesystem/in-memory');
  }

  // Fetch from local filesystem
  const filePath = path.join(OUTPUT_DIR, filename);
  try {
    await fsp.access(filePath);
    console.log('[sendOutputPdf] Sending from filesystem:', filePath);
    return res.download(filePath, filename);
  } catch (err) {
    console.error('[sendOutputPdf] File not found:', filePath);
    return res.status(404).json({ error: 'PDF tidak ditemukan.' });
  }
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
