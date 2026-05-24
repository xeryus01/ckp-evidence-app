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

// In-memory cache for data persistence on Vercel
let inMemoryDataCache = null;
let inMemoryDataLastUpdate = 0;

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
  console.log('[readData] Starting - USE_BLOB:', USE_BLOB, 'IS_VERCEL:', IS_VERCEL);
  
  try {
    // Check in-memory cache first (for Vercel without Blob)
    if (IS_VERCEL && !USE_BLOB && inMemoryDataCache) {
      console.log('[readData] Using in-memory cache');
      return inMemoryDataCache;
    }

    if (USE_BLOB) {
      console.log('[readData] Attempting Blob read from', DATA_BLOB_PATH);
      try {
        const stored = await get(DATA_BLOB_PATH, { access: 'public', useCache: false });
        console.log('[readData] Blob read successful, has stream:', !!stored?.stream);
        
        if (!stored?.stream) {
          console.log('[readData] No stream in Blob response');
          const emptyDataSet = emptyData();
          inMemoryDataCache = emptyDataSet;
          return emptyDataSet;
        }
        
        const raw = (await buffer(Readable.fromWeb(stored.stream))).toString('utf8');
        console.log('[readData] Blob data buffered, length:', raw.length);
        
        try {
          const parsed = JSON.parse(raw);
          console.log('[readData] Blob JSON parsed successfully');
          const normalized = normalizeLegacyData(parsed);
          inMemoryDataCache = normalized; // Cache it
          return normalized;
        } catch (parseErr) {
          console.warn('[readData] Failed to parse Blob data:', parseErr.message);
          const emptyDataSet = emptyData();
          inMemoryDataCache = emptyDataSet;
          return emptyDataSet;
        }
      } catch (blobErr) {
        console.error('[readData] Blob read error:', {
          message: blobErr.message,
          code: blobErr.code,
          statusCode: blobErr.statusCode
        });
        
        // Fallback to in-memory cache if available
        if (inMemoryDataCache) {
          console.warn('[readData] Blob failed, using in-memory cache');
          return inMemoryDataCache;
        }
        
        if (IS_VERCEL) {
          console.warn('[readData] Blob read failed on Vercel, using empty data');
          const emptyDataSet = emptyData();
          inMemoryDataCache = emptyDataSet;
          return emptyDataSet;
        }
        
        throw blobErr;
      }
    }

    if (IS_VERCEL && !USE_BLOB) {
      console.log('[readData] On Vercel without Blob, using in-memory cache');
      if (inMemoryDataCache) return inMemoryDataCache;
      const emptyDataSet = emptyData();
      inMemoryDataCache = emptyDataSet;
      return emptyDataSet;
    }

    // Local filesystem read
    console.log('[readData] Reading from local filesystem:', DATA_PATH);
    await ensureDataFile();
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    console.log('[readData] Local file read, length:', raw.length);
    
    try {
      const parsed = JSON.parse(raw);
      console.log('[readData] Local JSON parsed successfully');
      const normalized = normalizeLegacyData(parsed);
      inMemoryDataCache = normalized;
      return normalized;
    } catch {
      console.warn('[readData] Failed to parse local data');
      const emptyDataSet = emptyData();
      inMemoryDataCache = emptyDataSet;
      return emptyDataSet;
    }
  } catch (error) {
    console.error('[readData] fatal error:', {
      message: error.message,
      stack: error.stack?.slice(0, 200)
    });
    const emptyDataSet = emptyData();
    inMemoryDataCache = emptyDataSet;
    return emptyDataSet;
  }
}

async function writeData(data) {
  console.log('[writeData] Starting - USE_BLOB:', USE_BLOB, 'IS_VERCEL:', IS_VERCEL);
  
  try {
    const normalized = normalizeLegacyData(data);
    console.log('[writeData] Data normalized, profiles:', normalized.profiles.length);

    // Always update in-memory cache
    inMemoryDataCache = normalized;
    inMemoryDataLastUpdate = Date.now();

    if (USE_BLOB) {
      console.log('[writeData] Attempting Blob write to', DATA_BLOB_PATH);
      try {
        const jsonStr = JSON.stringify(normalized, null, 2);
        console.log('[writeData] JSON stringified, length:', jsonStr.length);
        
        await put(DATA_BLOB_PATH, jsonStr, {
          access: 'public',
          contentType: 'application/json',
          allowOverwrite: true,
          cacheControlMaxAge: 60
        });
        console.log('[writeData] Blob write successful');
        return normalized;
      } catch (blobErr) {
        console.error('[writeData] Blob write error:', {
          message: blobErr.message,
          code: blobErr.code,
          statusCode: blobErr.statusCode
        });
        
        if (IS_VERCEL) {
          console.warn('[writeData] Blob write failed on Vercel, data kept in memory');
          // Data is already in inMemoryDataCache, so reads will work
          return normalized;
        }
        
        throw blobErr;
      }
    }

    if (IS_VERCEL) {
      console.log('[writeData] On Vercel without Blob, data kept in memory');
      // Data is already in inMemoryDataCache
      return normalized;
    }

    // Local filesystem write
    console.log('[writeData] Writing to local filesystem:', DATA_PATH);
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify(normalized, null, 2));
    console.log('[writeData] Local write successful');
    return normalized;
  } catch (error) {
    console.error('[writeData] error:', error.message);
    throw error;
  }
}

async function updateData(mutator) {
  const data = await readData();
  const result = await mutator(data);
  await writeData(data);
  return result ?? data;
}

// Add diagnostic function for debugging
async function getStorageInfo() {
  return {
    usesBlob: USE_BLOB,
    isVercel: IS_VERCEL,
    blobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    dataPath: DATA_PATH,
    blobPath: DATA_BLOB_PATH,
    inMemoryCacheActive: !!inMemoryDataCache,
    inMemoryCacheProfiles: inMemoryDataCache?.profiles?.length || 0,
    lastCacheUpdate: inMemoryDataLastUpdate ? new Date(inMemoryDataLastUpdate).toISOString() : 'never'
  };
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

module.exports = { readData, writeData, updateData, findActivity, findPeriod, findProfile, getStorageInfo };
