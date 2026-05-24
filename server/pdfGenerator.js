const fs = require('fs');
const PDFDocument = require('pdfkit');
const Jimp = require('jimp');

// Helper to get image metadata using Jimp
async function getImageMetadata(imagePath) {
  try {
    const image = await Jimp.read(imagePath);
    return {
      width: image.bitmap.width,
      height: image.bitmap.height
    };
  } catch (err) {
    console.error('[pdfGenerator] Error reading image metadata:', err.message);
    return { width: 800, height: 600 }; // fallback dimensions
  }
}

function safeText(v) {
  return String(v || '-').replace(/\s+/g, ' ').trim();
}

function drawIdentityBlock(doc, { nama, nip, periode, waktu, kegiatan }) {
  const margin = 36;
  const pageW = doc.page.width;
  const contentW = pageW - margin * 2;
  let y = 30;

  doc.font('Helvetica-Bold').fontSize(15).fillColor('#111827')
    .text('DOKUMEN BUKTI DUKUNG CKP', margin, y, { width: contentW, align: 'center' });
  y += 30;

  const labelW = 108;
  const padX = 14;
  const padY = 12;
  const rowGap = 21;
  const rows = [
    ['Nama', safeText(nama)],
    ['NIP', safeText(nip)],
    ['Periode CKP', safeText(periode)],
    ['Waktu Kegiatan', safeText(waktu)],
    ['Nama Kegiatan', safeText(kegiatan)]
  ];

  const boxH = padY * 2 + rowGap * rows.length + 4;
  doc.roundedRect(margin, y, contentW, boxH, 8).stroke('#111827');

  rows.forEach(([label, val], idx) => {
    const rowY = y + padY + idx * rowGap;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151')
      .text(label, margin + padX, rowY, { width: labelW });
    doc.font('Helvetica').fontSize(9).fillColor('#111827')
      .text(': ' + val, margin + padX + labelW, rowY, { width: contentW - labelW - padX * 2, lineGap: 1 });
  });

  return y + boxH + 18;
}

async function drawEvidenceGrid(doc, imagePaths, startY) {
  const margin = 36;
  const gap = 8;
  const contentW = doc.page.width - margin * 2;
  const contentH = doc.page.height - margin * 2;
  const normalImages = [];
  const pdfPages = [];

  for (const imagePath of imagePaths) {
    if (imagePath && imagePath.includes('pdf-page-')) {
      pdfPages.push(imagePath);
    } else {
      normalImages.push(imagePath);
    }
  }

  let y = startY;
  if (normalImages.length) {
    const cols = 4;
    const boxW = (doc.page.width - margin * 2 - gap * (cols - 1)) / cols;
    const boxH = 104;
    let x = margin;

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('BUKTI DUKUNG', margin, y);
    y += 18;

    for (let i = 0; i < normalImages.length; i++) {
      if (y + boxH > doc.page.height - 42) {
        doc.addPage();
        y = 38;
        x = margin;
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('BUKTI DUKUNG LANJUTAN', margin, y);
        y += 18;
      }

      const imagePath = normalImages[i];
      const meta = await getImageMetadata(imagePath);
      const captionH = 14;
      const imgMaxH = boxH - captionH - 6;
      const scale = Math.min(boxW / meta.width, imgMaxH / meta.height);
      const w = Math.max(1, meta.width * scale);
      const h = Math.max(1, meta.height * scale);
      const imgX = x + (boxW - w) / 2;
      const imgY = y + captionH + (imgMaxH - h) / 2 + 3;

      doc.roundedRect(x, y, boxW, boxH, 4).stroke('#d1d5db');
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#374151')
        .text(`Bukti ${i + 1}`, x + 5, y + 4, { width: boxW - 10 });
      doc.image(imagePath, imgX, imgY, { width: w, height: h });

      if ((i + 1) % cols === 0) {
        x = margin;
        y += boxH + gap;
      } else {
        x += boxW + gap;
      }
    }
  }

  if (pdfPages.length) {
    if (normalImages.length || startY > 36) {
      doc.addPage();
    }

    for (let i = 0; i < pdfPages.length; i++) {
      const imagePath = pdfPages[i];
      if (i > 0) doc.addPage();

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827')
        .text(`BUKTI PDF HALAMAN ${i + 1}`, margin, 36);

      const meta = await getImageMetadata(imagePath);
      const availableW = contentW;
      const availableH = contentH - 24;
      const scale = Math.min(availableW / meta.width, availableH / meta.height);
      const w = Math.max(1, meta.width * scale);
      const h = Math.max(1, meta.height * scale);
      const x = margin + (availableW - w) / 2;
      const yImage = 36 + 24;

      doc.image(imagePath, x, yImage, { width: w, height: h });
    }
  }
}

function drawPageNumbers(doc) {
  const range = doc.bufferedPageRange();
  const margin = 36;

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const pageNumber = i - range.start + 1;
    const y = doc.page.height - margin - 14;
    doc.fontSize(8).fillColor('gray')
      .text(`Halaman ${pageNumber} dari ${range.count}`, margin, y, {
        width: doc.page.width - margin * 2,
        align: 'center',
        lineBreak: false
      });
    doc.fillColor('black');
  }
}

async function generatePdf({ nama, nip, periode, waktu, kegiatan, imagePaths, outputPath }) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 36, autoFirstPage: true, bufferPages: true, compress: true });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const startY = drawIdentityBlock(doc, { nama, nip, periode, waktu, kegiatan });
      await drawEvidenceGrid(doc, imagePaths, startY);
      drawPageNumbers(doc);

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generatePdf };
