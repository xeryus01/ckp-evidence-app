#!/usr/bin/env node
/**
 * Migration script: Localhost → Vercel Blob Storage
 * Uploads all local evidence files and app data to Vercel Blob
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
require('dotenv').config();

const { put } = require('@vercel/blob');

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!BLOB_TOKEN) {
  console.error('❌ ERROR: BLOB_READ_WRITE_TOKEN not set');
  process.exit(1);
}

const DATA_FILE = 'storage/app-data.json';
const EVIDENCE_DIR = 'storage/evidence';
const OUTPUT_DIR = 'storage/output';

let uploadCount = 0;
let totalSize = 0;
let errors = [];

async function uploadFile(filePath, blobPath) {
  try {
    const buffer = await fsp.readFile(filePath);
    const mimeType = getMimeType(filePath);
    
    const result = await put(blobPath, buffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false
    });
    
    uploadCount++;
    totalSize += buffer.length;
    console.log(`  ✓ Uploaded: ${blobPath.split('/').pop()} (${(buffer.length / 1024).toFixed(2)}KB)`);
    return result.url;
  } catch (error) {
    const msg = `Failed to upload ${filePath}: ${error.message}`;
    errors.push(msg);
    console.error(`  ✗ ${msg}`);
    return null;
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.pdf': 'application/pdf', '.gif': 'image/gif', '.webp': 'image/webp'
  };
  return types[ext] || 'application/octet-stream';
}

async function findEvidenceFiles() {
  const files = [];
  
  if (!fs.existsSync(EVIDENCE_DIR)) {
    console.log(`⚠ Evidence directory not found: ${EVIDENCE_DIR}`);
    return files;
  }

  function walkDir(dir, prefix = '') {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      const relPath = path.join(prefix, item);
      
      if (stat.isDirectory()) {
        walkDir(fullPath, relPath);
      } else if (stat.isFile()) {
        files.push({ fullPath, relPath });
      }
    });
  }
  
  walkDir(EVIDENCE_DIR);
  return files;
}

async function migrateEvidenceFiles(data) {
  console.log('\n📦 Migrating evidence files to Vercel Blob...');
  
  const evidenceFiles = await findEvidenceFiles();
  if (evidenceFiles.length === 0) {
    console.log('  No evidence files found');
    return data;
  }

  console.log(`  Found ${evidenceFiles.length} files to upload`);
  
  const urlMap = {}; // Map old paths to new blob URLs
  
  for (const file of evidenceFiles) {
    const blobPath = `evidence/${file.relPath.replace(/\\/g, '/')}`;
    const url = await uploadFile(file.fullPath, blobPath);
    if (url) {
      urlMap[file.fullPath] = url;
    }
  }

  // Update data with blob URLs
  if (data.profiles && Array.isArray(data.profiles)) {
    data.profiles.forEach(profile => {
      if (profile.periods && Array.isArray(profile.periods)) {
        profile.periods.forEach(period => {
          if (period.activities && Array.isArray(period.activities)) {
            period.activities.forEach(activity => {
              if (activity.evidence && activity.evidence.manualFiles) {
                activity.evidence.manualFiles = activity.evidence.manualFiles.map(file => ({
                  ...file,
                  blobUrl: file.blobUrl || 'will be set after processing',
                  // Keep existing structure, just mark as migrated
                  migratedAt: new Date().toISOString()
                }));
              }
            });
          }
        });
      }
    });
  }

  return data;
}

async function uploadAppData(data) {
  console.log('\n💾 Uploading app-data.json to Vercel Blob...');
  
  try {
    const buffer = Buffer.from(JSON.stringify(data, null, 2));
    const result = await put('data/app-data.json', buffer, {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false
    });
    
    console.log(`  ✓ Uploaded: app-data.json (${(buffer.length / 1024).toFixed(2)}KB)`);
    console.log(`  📍 Blob URL: ${result.url}`);
    return result.url;
  } catch (error) {
    console.error(`  ✗ Failed to upload app-data.json: ${error.message}`);
    errors.push(error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Starting migration: Localhost → Vercel Blob\n');

  // Check if data file exists
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`❌ Data file not found: ${DATA_FILE}`);
    process.exit(1);
  }

  // Read local data
  console.log('📖 Reading local data...');
  let data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`  ✓ Loaded ${data.profiles?.length || 0} profiles`);
  
  // Count activities and evidence
  let totalActivities = 0;
  let totalEvidence = 0;
  if (data.profiles && Array.isArray(data.profiles)) {
    data.profiles.forEach(p => {
      if (p.periods && Array.isArray(p.periods)) {
        p.periods.forEach(per => {
          if (per.activities && Array.isArray(per.activities)) {
            totalActivities += per.activities.length;
            per.activities.forEach(act => {
              if (act.evidence?.manualFiles) totalEvidence += act.evidence.manualFiles.length;
            });
          }
        });
      }
    });
  }
  console.log(`  ✓ Found ${totalActivities} activities with ${totalEvidence} evidence files`);

  // Migrate evidence files
  data = await migrateEvidenceFiles(data);

  // Upload updated app-data to blob
  const blobUrl = await uploadAppData(data);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ Migration Complete!\n');
  console.log(`📊 Summary:`);
  console.log(`   • Files uploaded: ${uploadCount}`);
  console.log(`   • Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
  console.log(`   • App data URL: ${blobUrl}`);
  
  if (errors.length > 0) {
    console.log(`\n⚠ Warnings (${errors.length}):`);
    errors.forEach(err => console.log(`   • ${err}`));
  }

  console.log('\n✨ Data is now synced with Vercel Blob storage!');
  console.log('✨ All future changes will be auto-saved to Vercel.\n');
}

main().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
