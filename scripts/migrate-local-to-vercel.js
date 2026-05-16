#!/usr/bin/env node
const dotenv = require('dotenv');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { put } = require('@vercel/blob');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_ENV = path.join(ROOT, '.env.local');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');

dotenv.config({ path: LOCAL_ENV });
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  const envPath = path.join(ROOT, '.env');
  if (fsSync.existsSync(envPath)) dotenv.config({ path: envPath });
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const DATA_BLOB_PATH = process.env.DATA_BLOB_PATH || 'data/app-data.json';
const LOCAL_DATA_PATH = path.join(ROOT, 'storage', 'app-data.json');
const LOCAL_EVIDENCE_DIR = path.join(ROOT, 'storage', 'evidence');
const LOCAL_OUTPUT_DIR = path.join(ROOT, 'storage', 'output');

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
  const data = await fs.readFile(localFilePath);
  const result = await put(remotePath, data, {
    access: 'public',
    contentType: contentType || 'application/octet-stream',
    addRandomSuffix: false
  });
  return result;
}

async function handleManualFiles(profiles) {
  let uploaded = 0;
  for (const profile of profiles || []) {
    for (const period of profile.periods || []) {
      const periodId = period.id;
      for (const activity of period.activities || []) {
        for (const file of (activity.evidence?.manualFiles || [])) {
          if (file.blobPath) continue;
          const localPath = resolveLocalPath(file.path);
          if (!localPath || !fsSync.existsSync(localPath)) {
            console.warn(`Manual evidence file not found, skipping: ${file?.path || 'unknown'}`);
            continue;
          }
          const remotePath = blobPath('evidence', periodId, activity.id, file.filename || file.name);
          const result = await uploadFileToBlob(localPath, remotePath, file.mimetype);
          file.blobPath = result.pathname;
          file.blobUrl = result.url;
          uploaded += 1;
          console.log(`Uploaded manual evidence: ${file.filename} -> ${result.pathname}`);
        }
      }
    }
  }
  return uploaded;
}

async function handleGeneratedPdfs(profiles) {
  let uploaded = 0;
  for (const profile of profiles || []) {
    for (const period of profile.periods || []) {
      for (const activity of period.activities || []) {
        for (const pdf of (activity.generatedPdfs || [])) {
          if (pdf.blobPath) continue;
          const filename = String(pdf.filename || '').trim();
          if (!filename) continue;
          const localPath = path.join(LOCAL_OUTPUT_DIR, filename);
          if (!fsSync.existsSync(localPath)) {
            console.warn(`Local PDF not found, skipping: ${filename}`);
            continue;
          }
          const remotePath = blobPath('output', filename);
          const result = await uploadFileToBlob(localPath, remotePath, 'application/pdf');
          pdf.blobPath = result.pathname;
          pdf.blobUrl = result.url;
          uploaded += 1;
          console.log(`Uploaded PDF: ${filename} -> ${result.pathname}`);
        }
      }
    }
  }
  return uploaded;
}

async function uploadDataFile(data) {
  const json = JSON.stringify(data, null, 2);
  const result = await put(DATA_BLOB_PATH, json, {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
    cacheControlMaxAge: 60
  });
  console.log(`Uploaded data file to blob: ${result.pathname}`);
  return result;
}

async function main() {
  if (!BLOB_TOKEN) {
    console.error('ERROR: BLOB_READ_WRITE_TOKEN tidak ditemukan di environment.');
    process.exit(1);
  }

  if (!fsSync.existsSync(LOCAL_DATA_PATH)) {
    console.error(`ERROR: Local data file tidak ditemukan di ${LOCAL_DATA_PATH}`);
    process.exit(1);
  }

  const rawData = await fs.readFile(LOCAL_DATA_PATH, 'utf8');
  const data = JSON.parse(rawData);

  console.log('Migrating local manual evidence files to Blob...');
  const manualFilesUploaded = await handleManualFiles(data.profiles || []);
  console.log(`Manual evidence files uploaded: ${manualFilesUploaded}`);

  console.log('Migrating local generated PDFs to Blob...');
  const pdfsUploaded = await handleGeneratedPdfs(data.profiles || []);
  console.log(`Generated PDFs uploaded: ${pdfsUploaded}`);

  console.log('Uploading app data JSON to Blob...');
  await uploadDataFile(data);

  console.log('\nMigration complete. Pastikan Vercel menggunakan BLOB_READ_WRITE_TOKEN dan DATA_BLOB_PATH yang sama.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
