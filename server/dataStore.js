const fs = require('fs/promises');
const path = require('path');
const { Readable } = require('stream');
const { buffer } = require('stream/consumers');
const { get, put } = require('@vercel/blob');

const DATA_PATH = process.env.DATA_PATH || path.join('storage', 'app-data.json');
const DATA_BLOB_PATH = process.env.DATA_BLOB_PATH || 'data/app-data.json';
const USE_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const IS_VERCEL = Boolean(process.env.VERCEL);

function emptyData() {
  return {
    profile: { nama: '', nip: '' },
    periods: []
  };
}

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  try {
    await fs.access(DATA_PATH);
  } catch {
    await fs.writeFile(DATA_PATH, JSON.stringify(emptyData(), null, 2));
  }
}

async function readData() {
  if (USE_BLOB) {
    const stored = await get(DATA_BLOB_PATH, { access: 'private', useCache: false });
    if (!stored?.stream) return emptyData();
    const raw = (await buffer(Readable.fromWeb(stored.stream))).toString('utf8');
    try {
      return { ...emptyData(), ...JSON.parse(raw) };
    } catch {
      return emptyData();
    }
  }

  if (IS_VERCEL) return emptyData();

  await ensureDataFile();
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  try {
    return { ...emptyData(), ...JSON.parse(raw) };
  } catch {
    return emptyData();
  }
}

async function writeData(data) {
  if (USE_BLOB) {
    await put(DATA_BLOB_PATH, JSON.stringify(data, null, 2), {
      access: 'private',
      contentType: 'application/json',
      allowOverwrite: true,
      cacheControlMaxAge: 60
    });
    return data;
  }

  if (IS_VERCEL) {
    throw new Error('BLOB_READ_WRITE_TOKEN belum diatur. Hubungkan Vercel Blob agar data dashboard bisa tersimpan.');
  }

  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2));
  return data;
}

async function updateData(mutator) {
  const data = await readData();
  const result = await mutator(data);
  await writeData(data);
  return result ?? data;
}

function findPeriod(data, periodId) {
  return data.periods.find(period => period.id === periodId);
}

function findActivity(data, periodId, activityId) {
  const period = findPeriod(data, periodId);
  if (!period) return { period: null, activity: null };
  const activity = period.activities.find(item => item.id === activityId);
  return { period, activity };
}

module.exports = { readData, writeData, updateData, findActivity, findPeriod };
