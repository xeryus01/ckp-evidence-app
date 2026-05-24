#!/usr/bin/env node
/**
 * Migration Script: Local Storage → Vercel Blob
 * 
 * Migrates all data from local filesystem to Vercel Blob storage:
 * - App data JSON (app-data.json)
 * - Manual uploaded evidence files
 * - Generated PDF outputs
 * 
 * Usage:
 *   npm run migrate:vercel
 *   node scripts/migrate-local-to-vercel.js
 */

const dotenv = require('dotenv');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { put, list } = require('@vercel/blob');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_ENV = path.join(ROOT, '.env.local');
const LOCAL_DATA_PATH = path.join(ROOT, 'storage', 'app-data.json');
const LOCAL_EVIDENCE_DIR = path.join(ROOT, 'storage', 'evidence');
const LOCAL_OUTPUT_DIR = path.join(ROOT, 'storage', 'output');

// Load environment variables
dotenv.config({ path: LOCAL_ENV });
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  const envPath = path.join(ROOT, '.env');
  if (fsSync.existsSync(envPath)) dotenv.config({ path: envPath });
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const DATA_BLOB_PATH = process.env.DATA_BLOB_PATH || 'data/app-data.json';

function safeFilename(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|]/g, '_');
}

function blobPath(...parts) {
  return parts.map(part => safeFilename(part)).join('/');
}

function resolveLocalPath(filePath) {
  if (!filePath) return null;
  const normalized = path.normalize(filePath);
  if (path.isAbsolute(normalized)) return normalized;
  return path.resolve(ROOT, normalized);
}

async function uploadFileToBlob(localFilePath, remotePath, contentType) {
  try {
    const data = await fs.readFile(localFilePath);
    const result = await put(remotePath, data, {
      access: 'public',
      contentType: contentType || 'application/octet-stream',
      addRandomSuffix: false
    });
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleManualFiles(profiles) {
  let uploaded = 0;
  let failed = 0;
  const failedFiles = [];

  for (const profile of profiles || []) {
    for (const period of profile.periods || []) {
      const periodId = period.id;
      for (const activity of period.activities || []) {
        for (const file of (activity.evidence?.manualFiles || [])) {
          if (file.blobPath) {
            console.log(`  ✓ Sudah di Blob: ${file.filename || file.name}`);
            continue;
          }

          const localPath = resolveLocalPath(file.path);
          if (!localPath || !fsSync.existsSync(localPath)) {
            console.warn(`  ✗ File tidak ditemukan: ${file?.path || 'unknown'}`);
            failed++;
            failedFiles.push(file?.path || 'unknown');
            continue;
          }

          const remotePath = blobPath('evidence', periodId, activity.id, file.filename || file.name);
          const { success, result, error } = await uploadFileToBlob(localPath, remotePath, file.mimetype);

          if (success) {
            file.blobPath = result.pathname;
            file.blobUrl = result.url;
            uploaded++;
            console.log(`  ✓ Upload: ${file.filename || file.name} → ${result.pathname}`);
          } else {
            failed++;
            failedFiles.push(file?.path || 'unknown');
            console.error(`  ✗ Upload gagal: ${file.filename || file.name} - ${error}`);
          }
        }
      }
    }
  }

  return { uploaded, failed, failedFiles };
}

async function handleGeneratedPdfs(profiles) {
  let uploaded = 0;
  let failed = 0;
  const failedFiles = [];

  for (const profile of profiles || []) {
    for (const period of profile.periods || []) {
      for (const activity of period.activities || []) {
        for (const pdf of (activity.generatedPdfs || [])) {
          if (pdf.blobPath) {
            console.log(`  ✓ Sudah di Blob: ${pdf.filename}`);
            continue;
          }

          const filename = String(pdf.filename || '').trim();
          if (!filename) continue;

          const localPath = path.join(LOCAL_OUTPUT_DIR, filename);
          if (!fsSync.existsSync(localPath)) {
            console.warn(`  ✗ File PDF tidak ditemukan: ${filename}`);
            failed++;
            failedFiles.push(filename);
            continue;
          }

          const remotePath = blobPath('output', filename);
          const { success, result, error } = await uploadFileToBlob(localPath, remotePath, 'application/pdf');

          if (success) {
            pdf.blobPath = result.pathname;
            pdf.blobUrl = result.url;
            uploaded++;
            console.log(`  ✓ Upload: ${filename} → ${result.pathname}`);
          } else {
            failed++;
            failedFiles.push(filename);
            console.error(`  ✗ Upload gagal: ${filename} - ${error}`);
          }
        }
      }
    }
  }

  return { uploaded, failed, failedFiles };
}

async function uploadDataFile(data) {
  try {
    const json = JSON.stringify(data, null, 2);
    const result = await put(DATA_BLOB_PATH, json, {
      access: 'public',
      contentType: 'application/json',
      allowOverwrite: true,
      cacheControlMaxAge: 60
    });
    console.log(`✓ Data JSON diupload ke Blob: ${result.pathname}`);
    return { success: true, result };
  } catch (err) {
    console.error(`✗ Gagal upload data JSON: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function verifyMigration(data) {
  console.log('\n📊 Verifikasi Migrasi...');
  let totalItems = 0;
  let itemsWithBlob = 0;

  for (const profile of data.profiles || []) {
    for (const period of profile.periods || []) {
      for (const activity of period.activities || []) {
        totalItems += activity.evidence?.manualFiles?.length || 0;
        itemsWithBlob += (activity.evidence?.manualFiles || []).filter(f => f.blobPath).length;
        totalItems += activity.generatedPdfs?.length || 0;
        itemsWithBlob += (activity.generatedPdfs || []).filter(p => p.blobPath).length;
      }
    }
  }

  console.log(`Total file: ${totalItems}`);
  console.log(`Sudah di Blob: ${itemsWithBlob}`);
  console.log(`Masih lokal: ${totalItems - itemsWithBlob}`);

  return {
    total: totalItems,
    inBlob: itemsWithBlob,
    remaining: totalItems - itemsWithBlob
  };
}

async function saveBackup(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(ROOT, 'storage', `app-data.backup-${timestamp}.json`);
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(backupPath, JSON.stringify(data, null, 2));
  console.log(`✓ Backup disimpan: ${backupPath}`);
  return backupPath;
}

async function main() {
  console.log('🚀 CKP Evidence App - Migrasi ke Vercel Blob Storage\n');

  // Validate prerequisites
  if (!BLOB_TOKEN) {
    console.error('❌ ERROR: BLOB_READ_WRITE_TOKEN tidak ditemukan di environment.');
    console.error('   Set variable di Vercel Dashboard atau .env file');
    process.exit(1);
  }
  console.log('✓ BLOB_READ_WRITE_TOKEN ditemukan');

  if (!fsSync.existsSync(LOCAL_DATA_PATH)) {
    console.error(`❌ ERROR: Local data file tidak ditemukan di ${LOCAL_DATA_PATH}`);
    process.exit(1);
  }
  console.log(`✓ Local data file ditemukan: ${LOCAL_DATA_PATH}`);

  // Read and parse data
  try {
    const rawData = await fs.readFile(LOCAL_DATA_PATH, 'utf8');
    var data = JSON.parse(rawData);
    console.log(`✓ Data JSON terbaca: ${(data.profiles || []).length} profil\n`);
  } catch (err) {
    console.error(`❌ ERROR: Gagal parse data JSON - ${err.message}`);
    process.exit(1);
  }

  // Create backup
  console.log('💾 Membuat backup lokal...');
  await saveBackup(data);

  // Migrate manual evidence files
  console.log('\n📤 Migrasi file bukti manual ke Blob...');
  const manualResult = await handleManualFiles(data.profiles || []);
  console.log(`   Hasil: ${manualResult.uploaded} upload, ${manualResult.failed} gagal`);
  if (manualResult.failed > 0) {
    console.warn(`   ⚠️  File yang gagal: ${manualResult.failedFiles.join(', ')}`);
  }

  // Migrate generated PDFs
  console.log('\n📤 Migrasi PDF yang sudah dibuat ke Blob...');
  const pdfResult = await handleGeneratedPdfs(data.profiles || []);
  console.log(`   Hasil: ${pdfResult.uploaded} upload, ${pdfResult.failed} gagal`);
  if (pdfResult.failed > 0) {
    console.warn(`   ⚠️  File yang gagal: ${pdfResult.failedFiles.join(', ')}`);
  }

  // Upload data file
  console.log('\n📤 Upload data JSON ke Blob...');
  const dataResult = await uploadDataFile(data);
  if (!dataResult.success) {
    console.error(`❌ Gagal upload data JSON. Migrasi tidak lengkap.`);
    process.exit(1);
  }

  // Verification
  const verification = await verifyMigration(data);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ MIGRASI SELESAI');
  console.log('='.repeat(50));
  console.log(`Total file dimigrasikan: ${manualResult.uploaded + pdfResult.uploaded}`);
  console.log(`File yang gagal: ${manualResult.failed + pdfResult.failed}`);
  console.log(`\nData kini tersimpan di Vercel Blob:`);
  console.log(`  - ${DATA_BLOB_PATH}`);
  console.log(`  - evidence/* (manual uploads)`);
  console.log(`  - output/* (generated PDFs)`);
  console.log('\nNext steps:');
  console.log('1. Verifikasi data di Vercel Dashboard > Storage > Blob');
  console.log('2. Test aplikasi di production environment');
  console.log('3. Backup data lokal disimpan di:', path.join(ROOT, 'storage', '*.backup-*.json'));
}

main().catch(err => {
  console.error('\n❌ Migration error:', err.message);
  process.exit(1);
});
