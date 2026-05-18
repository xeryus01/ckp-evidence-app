const fs = require('fs/promises');
const path = require('path');
const convert = require('heic-convert');
const Jimp = require('jimp');

const IMAGE_MIMES = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp', '.heic', '.heif'];

function createDOMMatrixPolyfill() {
  class DOMMatrix {
    constructor(init = 'none') {
      if (Array.isArray(init)) {
        [this.a = 1, this.b = 0, this.c = 0, this.d = 1, this.e = 0, this.f = 0] = init;
      } else if (init instanceof DOMMatrix) {
        this.a = init.a; this.b = init.b; this.c = init.c; this.d = init.d; this.e = init.e; this.f = init.f;
      } else if (typeof init === 'string') {
        const values = init.trim().replace(/matrix\(|\)/g, '').split(/,|\s+/).filter(Boolean).map(Number);
        [this.a = 1, this.b = 0, this.c = 0, this.d = 1, this.e = 0, this.f = 0] = values;
      } else {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      }
    }

    static fromFloat32Array(array) {
      return new DOMMatrix(Array.from(array));
    }

    static fromFloat64Array(array) {
      return new DOMMatrix(Array.from(array));
    }

    multiply(other) {
      return new DOMMatrix([
        this.a * other.a + this.b * other.c,
        this.a * other.b + this.b * other.d,
        this.c * other.a + this.d * other.c,
        this.c * other.b + this.d * other.d,
        this.e * other.a + this.f * other.c + other.e,
        this.e * other.b + this.f * other.d + other.f
      ]);
    }

    multiplySelf(other) {
      const result = this.multiply(other);
      Object.assign(this, result);
      return this;
    }

    translateSelf(tx = 0, ty = 0) {
      this.e += tx;
      this.f += ty;
      return this;
    }

    scaleSelf(sx = 1, sy = sx) {
      this.a *= sx;
      this.b *= sx;
      this.c *= sy;
      this.d *= sy;
      return this;
    }

    invertSelf() {
      const det = this.a * this.d - this.b * this.c;
      if (!det) return this;
      const a = this.d / det;
      const b = -this.b / det;
      const c = -this.c / det;
      const d = this.a / det;
      const e = (this.c * this.f - this.d * this.e) / det;
      const f = (this.b * this.e - this.a * this.f) / det;
      Object.assign(this, { a, b, c, d, e, f });
      return this;
    }

    toFloat32Array() {
      return new Float32Array([this.a, this.b, this.c, this.d, this.e, this.f]);
    }

    toFloat64Array() {
      return new Float64Array([this.a, this.b, this.c, this.d, this.e, this.f]);
    }
  }
  return DOMMatrix;
}

function loadCanvasSupport() {
  let canvasLib = null;
  try {
    canvasLib = require('@napi-rs/canvas');
  } catch (err) {
    try {
      canvasLib = require('canvas');
    } catch (err2) {
      throw new Error('Library canvas tidak tersedia. Install @napi-rs/canvas atau canvas agar PDF dapat diproses.');
    }
  }

  if (!globalThis.DOMMatrix) {
    if (canvasLib.DOMMatrix) {
      globalThis.DOMMatrix = canvasLib.DOMMatrix;
    } else {
      globalThis.DOMMatrix = createDOMMatrixPolyfill();
    }
  }
  if (!globalThis.ImageData) {
    globalThis.ImageData = canvasLib.ImageData || class ImageData {
      constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    };
  }
  if (!globalThis.Path2D) {
    globalThis.Path2D = canvasLib.Path2D || class Path2D {
      constructor(path) {
        this.path = path;
      }
      addPath() {}
    };
  }

  if (!globalThis.DOMPoint) {
    globalThis.DOMPoint = canvasLib.DOMPoint || class DOMPoint {
      constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
      }
    };
  }

  if (!globalThis.DOMRect) {
    globalThis.DOMRect = canvasLib.DOMRect || class DOMRect {
      constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.top = y;
        this.left = x;
        this.right = x + width;
        this.bottom = y + height;
      }
    };
  }

  return canvasLib;
}

const canvasSupport = loadCanvasSupport();
const { createCanvas } = canvasSupport;
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

const HEIC_MIMES = ['image/heic', 'image/heif'];

async function tryLoadSharp() {
  try {
    return require('sharp');
  } catch (err) {
    console.warn('[processEvidence] sharp not available, falling back to Jimp:', err.message);
    return null;
  }
}

async function convertHeicToJpg(inputPathOrBuffer, outputPath) {
  const sharp = await tryLoadSharp();
  if (sharp) {
    try {
      await sharp(inputPathOrBuffer)
        .rotate()
        .toFormat('jpeg')
        .jpeg({ quality: 90, mozjpeg: true })
        .toFile(outputPath);
      return outputPath;
    } catch (err) {
      console.warn('[processEvidence] sharp HEIC conversion failed, falling back to Jimp/heic-convert:', err?.message || err);
    }
  }

  const inputBuffer = typeof inputPathOrBuffer === 'string'
    ? await fs.readFile(inputPathOrBuffer)
    : Buffer.isBuffer(inputPathOrBuffer)
      ? inputPathOrBuffer
      : Buffer.from(inputPathOrBuffer);
  const outputBuffer = await convert({
    buffer: inputBuffer,
    format: 'JPEG',
    quality: 0.9
  });
  const image = await Jimp.read(Buffer.from(outputBuffer));
  await image.quality(90).writeAsync(outputPath);
  return outputPath;
}

async function compressImage(inputPathOrBuffer, outputDir, index) {
  const out = path.join(outputDir, `evidence-${String(index).padStart(3, '0')}.jpg`);
  const sharp = await tryLoadSharp();
  if (sharp) {
    await sharp(inputPathOrBuffer)
      .rotate()
      .resize({ width: 1600, height: 2200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(out);
    return out;
  }

  const inputBuffer = typeof inputPathOrBuffer === 'string'
    ? await fs.readFile(inputPathOrBuffer)
    : Buffer.isBuffer(inputPathOrBuffer)
      ? inputPathOrBuffer
      : Buffer.from(inputPathOrBuffer);
  const image = await Jimp.read(inputBuffer);
  image.contain(1600, 2200, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE);
  await image.quality(78).writeAsync(out);
  return out;
}

async function pdfToImages(inputPath, outputDir, startIndex) {
  let data;
  if (inputPath instanceof Uint8Array || Buffer.isBuffer(inputPath)) {
    data = Buffer.from(inputPath);
  } else if (typeof inputPath === 'string') {
    data = Buffer.from(await fs.readFile(inputPath));
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
    const pngBuffer = canvas.toBuffer('image/png');
    const image = await Jimp.read(pngBuffer);
    await image.quality(78).writeAsync(out);
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
