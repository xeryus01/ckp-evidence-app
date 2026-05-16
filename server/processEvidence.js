const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const convert = require('heic-convert');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
const { createCanvas } = require('@napi-rs/canvas');

const IMAGE_MIMES = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp', '.heic', '.heif'];
const HEIC_MIMES = ['image/heic', 'image/heif'];

async function convertHeicToJpg(inputPath, outputPath) {
  try {
    await sharp(inputPath)
      .rotate()
      .toFormat('jpeg')
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(outputPath);
    return outputPath;
  } catch (err) {
    console.warn('sharp HEIC conversion failed, falling back to heic-convert:', err?.message || err);
    const inputBuffer = await fs.readFile(inputPath);
    const outputBuffer = await convert({
      buffer: inputBuffer,
      format: 'JPEG',
      quality: 0.9
    });
    await fs.writeFile(outputPath, outputBuffer);
    return outputPath;
  }
}

async function compressImage(inputPath, outputDir, index) {
  const out = path.join(outputDir, `evidence-${String(index).padStart(3, '0')}.jpg`);
  await sharp(inputPath)
    .rotate()
    .resize({ width: 1600, height: 2200, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(out);
  return out;
}

async function pdfToImages(inputPath, outputDir, startIndex) {
  let data;
  if (inputPath instanceof Uint8Array) {
    data = inputPath;
  } else if (typeof inputPath === 'string') {
    data = new Uint8Array(await fs.readFile(inputPath));
  } else {
    throw new Error('PDF input tidak valid: harus berupa String path atau Buffer/Uint8Array.');
  }
  const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await loadingTask.promise;
  const result = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.8 });
    if (!viewport || !viewport.width || !viewport.height) {
      throw new Error(`Halaman PDF ${pageNum} tidak dapat dirender: ukuran halaman tidak valid.`);
    }
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const out = path.join(outputDir, `pdf-page-${startIndex}-${pageNum}.jpg`);
    await sharp(canvas.toBuffer('image/png'))
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(out);
    result.push(out);
  }
  return result;
}

function resolveEvidenceFilePath(file) {
  if (typeof file === 'string') return file;
  if (!file || typeof file !== 'object') return null;
  if (typeof file.path === 'string' && file.path) return file.path;
  if (Buffer.isBuffer(file.path) && file.path.length) return file.path;
  if (file.path && typeof file.path.toString === 'function') {
    const asString = file.path.toString();
    if (typeof asString === 'string' && asString) return asString;
  }
  if (typeof file.filepath === 'string' && file.filepath) return file.filepath;
  if (Buffer.isBuffer(file.filepath) && file.filepath.length) return file.filepath;
  if (file.filepath && typeof file.filepath.toString === 'function') {
    const asString = file.filepath.toString();
    if (typeof asString === 'string' && asString) return asString;
  }
  if (typeof file.filename === 'string' && file.filename && !file.blobPath) return file.filename;
  return null;
}

function isHeicFile(filePath, file) {
  const ext = typeof filePath === 'string' ? path.extname(filePath).toLowerCase() : '';
  const mimeType = String(file.mimetype || file.mimeType || '').toLowerCase();
  return ext === '.heic' || ext === '.heif' || HEIC_MIMES.includes(mimeType);
}

async function normalizeEvidence(files, outputDir) {
  const imagePaths = [];
  let idx = 1;
  for (const file of files) {
    const filePath = resolveEvidenceFilePath(file);
    const displayName = (file && (file.name || file.filename)) || 'unknown file';
    const ext = typeof filePath === 'string' ? path.extname(filePath).toLowerCase() : '';
    const mimeType = String(file.mimetype || file.mimeType || '').toLowerCase();

    if (!filePath && !file?.buffer) {
      throw new Error('Bukti dukung tidak valid: file belum tersedia atau tidak dapat diproses.');
    }

    if (!filePath && file?.blobPath) {
      throw new Error(`Bukti dukung ${displayName} ditemukan, tetapi file belum dimaterialisasi.`);
    }

    if (ext === '.pdf' || mimeType === 'application/pdf') {
      const pages = await pdfToImages(filePath || file.buffer, outputDir, idx);
      imagePaths.push(...pages);
      idx += pages.length;
      continue;
    }

    if (IMAGE_MIMES.includes(ext) || mimeType.startsWith('image/')) {
      let processedPath = filePath || null;
      let tempConverted = false;
      const input = filePath || file.buffer;

      if (!input) {
        throw new Error(`Bukti dukung ${displayName} tidak punya data input yang valid.`);
      }

      if (isHeicFile(filePath, file)) {
        const jpgPath = path.join(outputDir, `heic-converted-${idx}.jpg`);
        processedPath = await convertHeicToJpg(input, jpgPath);
        tempConverted = true;
      }

      const img = await compressImage(processedPath || input, outputDir, idx++);
      imagePaths.push(img);

      if (tempConverted && processedPath && processedPath !== filePath) {
        await fs.rm(processedPath, { force: true });
      }
      continue;
    }

    throw new Error(`Bukti dukung ${displayName} tidak didukung. Gunakan PDF atau file gambar.`);
  }
  return imagePaths;
}

module.exports = { normalizeEvidence };
