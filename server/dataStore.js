const fs = require('fs/promises');
const path = require('path');
const { Readable } = require('stream');
const { buffer } = require('stream/consumers');
const { get, put } = require('@vercel/blob');
const { v4: uuidv4 } = require('uuid');

const DATA_PATH = process.env.DATA_PATH || path.join('storage', 'app-data.json');
const DATA_BLOB_PATH = process.env.DATA_BLOB_PATH || 'data/app-data.json';
const USE_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const IS_VERCEL = Boolean(process.env.VERCEL);

function emptyData() {
  return {
    profiles: [],
    selectedProfileId: null
  };
}

function normalizeLegacyData(rawData) {
  const source = rawData || {};
  const data = { ...emptyData() };

  if (Array.isArray(source.profiles) && source.profiles.length) {
    data.profiles = source.profiles;
    data.selectedProfileId = source.selectedProfileId || null;
  } else if ((source.profile && typeof source.profile === 'object') || Array.isArray(source.periods)) {
    const profile = {
      id: uuidv4(),
      nama: source.profile?.nama || '',
      nip: source.profile?.nip || '',
      periods: Array.isArray(source.periods) ? source.periods : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.profiles = [profile];
    data.selectedProfileId = profile.id;
  }

  if (!Array.isArray(data.profiles)) data.profiles = [];
  if (!data.selectedProfileId && data.profiles.length) data.selectedProfileId = data.profiles[0].id;

  return data;
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
      return normalizeLegacyData(JSON.parse(raw));
    } catch {
      return emptyData();
    }
  }

  if (IS_VERCEL) return emptyData();

  await ensureDataFile();
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  try {
    return normalizeLegacyData(JSON.parse(raw));
  } catch {
    return emptyData();
  }
}

async function writeData(data) {
  const normalized = normalizeLegacyData(data);

  if (USE_BLOB) {
    await put(DATA_BLOB_PATH, JSON.stringify(normalized, null, 2), {
      access: 'private',
      contentType: 'application/json',
      allowOverwrite: true,
      cacheControlMaxAge: 60
    });
    return normalized;
  }

  if (IS_VERCEL) {
    throw new Error('BLOB_READ_WRITE_TOKEN belum diatur. Hubungkan Vercel Blob agar data dashboard bisa tersimpan.');
  }

  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
}

async function updateData(mutator) {
  const data = await readData();
  const result = await mutator(data);
  await writeData(data);
  return result ?? data;
}

function findProfile(data, profileId) {
  return data.profiles.find(profile => profile.id === profileId) || null;
}

function findPeriod(data, profileId, periodId) {
  if (arguments.length === 2) {
    periodId = profileId;
    profileId = data.selectedProfileId;
  }
  const profile = findProfile(data, profileId);
  return profile?.periods?.find(period => period.id === periodId) || null;
}

function findActivity(data, profileId, periodId, activityId) {
  if (arguments.length === 3) {
    activityId = periodId;
    periodId = profileId;
    profileId = data.selectedProfileId;
  }
  const profile = findProfile(data, profileId);
  const period = profile?.periods?.find(periodItem => periodItem.id === periodId);
  if (!period) return { profile: null, period: null, activity: null };
  const activity = period.activities.find(item => item.id === activityId) || null;
  return { profile, period, activity };
}

module.exports = { readData, writeData, updateData, findActivity, findPeriod, findProfile };
