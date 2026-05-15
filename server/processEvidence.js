const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
const { createCanvas } = require('@napi-rs/canvas');

const IMAGE_MIMES = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp'];

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
  const data = new Uint8Array(await fs.readFile(inputPath));
  const loadingTask = pdfjsLib.getDocument({ data, disableWorker: true });
  const pdf = await loadingTask.promise;
  const result = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const raw = path.join(outputDir, `pdf-page-${startIndex}-${pageNum}.png`);
    await fs.writeFile(raw, canvas.toBuffer('image/png'));
    const compressed = await compressImage(raw, outputDir, startIndex + pageNum - 1);
    await fs.rm(raw, { force: true });
    result.push(compressed);
  }
  return result;
}

async function normalizeEvidence(files, outputDir) {
  const imagePaths = [];
  let idx = 1;
  for (const file of files) {
    const filePath = file.path;
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf' || file.mimetype === 'application/pdf' || file.mimeType === 'application/pdf') {
      const pages = await pdfToImages(filePath, outputDir, idx);
      imagePaths.push(...pages);
      idx += pages.length;
    } else if (IMAGE_MIMES.includes(ext) || file.mimetype?.startsWith('image/') || file.mimeType?.startsWith('image/')) {
      const img = await compressImage(filePath, outputDir, idx++);
      imagePaths.push(img);
    }
  }
  return imagePaths;
}

module.exports = { normalizeEvidence };
