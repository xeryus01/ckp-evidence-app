const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const mime = require('mime-types');

function getDriveId(urlOrId) {
  if (!urlOrId) return null;
  const s = String(urlOrId).trim();
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]{20,})$/
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  return null;
}

function getAuth() {
  const scopes = ['https://www.googleapis.com/auth/drive.readonly'];
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({ credentials, scopes });
  }
  return new google.auth.GoogleAuth({ scopes });
}

async function getDrive() {
  const auth = await getAuth().getClient();
  return google.drive({ version: 'v3', auth });
}

async function getMeta(drive, fileId) {
  const res = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,size,thumbnailLink,webViewLink',
    supportsAllDrives: true
  });
  return res.data;
}

async function listFolderFiles(drive, folderId) {
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id,name,mimeType,size,thumbnailLink,webViewLink)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    files.push(...res.data.files);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}

function isSupported(file) {
  return file.mimeType?.startsWith('image/') || file.mimeType === 'application/pdf';
}

async function listFromDriveLinks(links) {
  const drive = await getDrive();
  const found = [];
  const seen = new Set();

  for (const link of links.filter(Boolean)) {
    const id = getDriveId(link);
    if (!id) continue;
    const meta = await getMeta(drive, id);
    const files = meta.mimeType === 'application/vnd.google-apps.folder'
      ? await listFolderFiles(drive, id)
      : [meta];

    for (const file of files) {
      if (!isSupported(file) || seen.has(file.id)) continue;
      seen.add(file.id);
      found.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size || null,
        thumbnailLink: file.thumbnailLink || null,
        webViewLink: file.webViewLink || null,
        type: file.mimeType === 'application/pdf' ? 'PDF' : 'Gambar'
      });
    }
  }
  return found;
}

async function downloadFile(drive, file, destDir) {
  const ext = mime.extension(file.mimeType) || path.extname(file.name).replace('.', '') || 'bin';
  const safeName = `${file.id}-${file.name.replace(/[\\/:*?"<>|]/g, '_')}${path.extname(file.name) ? '' : '.' + ext}`;
  const dest = path.join(destDir, safeName);
  const writer = fs.createWriteStream(dest);
  const res = await drive.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
    res.data.on('error', reject).pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  return { path: dest, name: file.name, mimeType: file.mimeType };
}

async function downloadDriveFilesByIds(fileIds, destDir) {
  const drive = await getDrive();
  const downloaded = [];
  const seen = new Set();
  for (const id of fileIds.filter(Boolean)) {
    if (seen.has(id)) continue;
    seen.add(id);
    const meta = await getMeta(drive, id);
    if (!isSupported(meta)) continue;
    downloaded.push(await downloadFile(drive, meta, destDir));
  }
  return downloaded;
}

async function downloadFromDriveLinks(links, destDir) {
  const files = await listFromDriveLinks(links);
  return downloadDriveFilesByIds(files.map(f => f.id), destDir);
}


async function streamDriveFileById(fileId) {
  const drive = await getDrive();
  const meta = await getMeta(drive, fileId);
  if (!isSupported(meta)) throw new Error('File tidak didukung untuk preview.');
  const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
  return { stream: res.data, meta };
}

module.exports = { downloadFromDriveLinks, getDriveId, listFromDriveLinks, downloadDriveFilesByIds, streamDriveFileById };

