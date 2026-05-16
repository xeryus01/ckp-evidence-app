#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VERCEL_VERSION = process.env.VERCEL_CLI_VERSION || '50.5.0';
const VERCEL_CMD = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
const REQUIRED_ENV = ['BLOB_READ_WRITE_TOKEN', 'GOOGLE_SERVICE_ACCOUNT_JSON'];

function rel(file) {
  return path.join(ROOT, file);
}

function exists(file) {
  return fs.existsSync(rel(file));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(rel(file), 'utf8'));
}

function log(message = '') {
  console.log(message);
}

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }
    const [key, inline] = item.slice(2).split('=');
    if (inline !== undefined) {
      args[key] = inline;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[key] = argv[++i];
    } else {
      args[key] = true;
    }
  }
  return args;
}

function runVercel(vercelArgs, options = {}) {
  const args = ['--yes', ...vercelArgs];
  const hasInput = options.input !== undefined;
  const stdio = options.capture ? 'pipe' : hasInput ? ['pipe', 'inherit', 'inherit'] : 'inherit';
  const result = spawnSync(VERCEL_CMD, args, {
    cwd: ROOT,
    encoding: options.capture || hasInput ? 'utf8' : undefined,
    input: options.input,
    stdio,
    shell: true
  });

  if (result.error) {
    fail(`Gagal menjalankan Vercel CLI: ${result.error.message}`);
  }

  if (result.status !== 0 && !options.allowFail) {
    const detail = options.capture ? `${result.stdout || ''}${result.stderr || ''}`.trim() : '';
    fail(detail || `Perintah Vercel gagal: vercel ${vercelArgs.join(' ')}`);
  }

  return result;
}

function checkLocalFiles() {
  const requiredFiles = [
    'package.json',
    'package-lock.json',
    'vercel.json',
    'api/index.js',
    'server/index.js',
    'server/fileStore.js',
    'server/dataStore.js',
    '.vercelignore'
  ];

  const missing = requiredFiles.filter(file => !exists(file));
  if (missing.length) fail(`File wajib belum ada: ${missing.join(', ')}`);

  const pkg = readJson('package.json');
  if (!pkg.engines?.node) fail('package.json belum punya engines.node.');
  if (!pkg.dependencies?.['@vercel/blob']) fail('Dependency @vercel/blob belum ada.');

  const vercel = readJson('vercel.json');
  if (!vercel.functions?.['api/index.js']) fail('vercel.json belum mengatur function api/index.js.');
  // Express app akan handle routing sendiri, rewrites tidak wajib
  // const hasApiRewrite = (vercel.rewrites || []).some(rule => rule.source === '/api/(.*)');
  // if (!hasApiRewrite) fail('vercel.json belum punya rewrite /api/(.*)');

  const ignore = fs.readFileSync(rel('.vercelignore'), 'utf8');
  for (const item of ['node_modules', '.env', 'service-account.json', 'storage']) {
    if (!ignore.includes(item)) fail(`.vercelignore belum mengabaikan ${item}.`);
  }

  return true;
}

function ensureLinked(args) {
  if (exists('.vercel/project.json')) return;

  log('Project belum terhubung ke Vercel. Membuka vercel link...');
  const linkArgs = ['link'];
  if (args.project) linkArgs.push('--yes', '--project', args.project);
  if (args.scope) linkArgs.push('--scope', args.scope);
  runVercel(linkArgs);
}

function pullEnv(target) {
  log(`Menarik environment ${target} dari Vercel...`);
  // Vercel pull mengambil development env by default
  // Gunakan env ls untuk check environment spesifik
  runVercel(['pull', '--yes'], { allowFail: true });
}

function assertVercelEnv(target) {
  log(`Memeriksa env Vercel untuk ${target}...`);
  const result = runVercel(['env', 'ls'], { capture: true, allowFail: true });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;

  if (result.status !== 0) {
    fail(`Tidak bisa membaca env Vercel. Jalankan "npm run vercel:setup" atau "npx vercel login" dulu.\n${output.trim()}`);
  }

  const missing = REQUIRED_ENV.filter(key => !output.includes(key));
  if (missing.length) {
    fail([
      `Env Vercel belum lengkap untuk ${target}: ${missing.join(', ')}`,
      'Hubungkan Vercel Blob agar BLOB_READ_WRITE_TOKEN otomatis tersedia.',
      'Tambahkan GOOGLE_SERVICE_ACCOUNT_JSON di Project Settings > Environment Variables,',
      'atau jalankan: npm run vercel:env:google'
    ].join('\n'));
  }
}

function extractUrl(output) {
  const urls = output.match(/https:\/\/[^\s]+/g) || [];
  return urls[urls.length - 1] || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyHealth(url) {
  if (!url) {
    log('Deploy selesai, tetapi URL tidak terbaca otomatis dari output CLI.');
    return;
  }

  const healthUrl = `${url.replace(/\/$/, '')}/api/health`;
  log(`Memeriksa health check: ${healthUrl}`);

  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const res = await fetch(healthUrl, { redirect: 'follow' });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok === true) {
        log(`Health check OK: ${healthUrl}`);
        return;
      }
    } catch {
      // Deployment may still be warming up.
    }
    await sleep(3000);
  }

  fail(`Deployment terupload, tetapi /api/health belum OK setelah 30 detik: ${healthUrl}`);
}

function build(target) {
  log(`Build ${target} dengan Vercel...`);
  const args = ['build'];
  if (target === 'production') args.push('--prod');
  runVercel(args);
}

async function deploy(args) {
  checkLocalFiles();
  ensureLinked(args);

  const target = args.prod || args.production ? 'production' : 'preview';
  pullEnv(target);
  assertVercelEnv(target);

  log(`Deploy ${target} ke Vercel...`);
  const deployArgs = ['deploy'];
  if (target === 'production') deployArgs.push('--prod');
  const result = runVercel(deployArgs, { capture: true });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  process.stdout.write(output);

  const url = extractUrl(output);
  await verifyHealth(url);

  log('');
  log(`Deploy ${target} siap: ${url || '(lihat output Vercel di atas)'}`);
}

function setup(args) {
  checkLocalFiles();
  ensureLinked(args);
  const target = args.prod || args.production ? 'production' : 'preview';
  pullEnv(target);
  assertVercelEnv(target);
  log('Setup Vercel OK.');
}

function check(args) {
  checkLocalFiles();
  if (!exists('.vercel/project.json')) {
    fail('Project belum link ke Vercel. Jalankan: npm run vercel:setup');
  }
  const target = args.prod || args.production ? 'production' : 'preview';
  assertVercelEnv(target);
  log('Preflight OK. Project siap deploy.');
}

function addGoogleEnv(args) {
  ensureLinked(args);
  const file = args.file || 'service-account.json';
  if (!exists(file)) fail(`File ${file} tidak ditemukan.`);

  const raw = fs.readFileSync(rel(file), 'utf8');
  const compact = JSON.stringify(JSON.parse(raw));
  const targets = String(args.targets || 'production,preview,development')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  log(`Menambahkan GOOGLE_SERVICE_ACCOUNT_JSON ke: ${targets.join(', ')}`);
  const result = runVercel(['env', 'add', 'GOOGLE_SERVICE_ACCOUNT_JSON', ...targets], {
    input: `${compact}\n`,
    allowFail: true
  });

  if (result.status !== 0) {
    fail('Gagal menambahkan env. Jika env sudah ada, hapus/ubah dari Vercel Dashboard lalu coba lagi.');
  }
}

function usage() {
  log(`
CKP Vercel CLI

Commands:
  setup                 Link project, pull env, dan cek env wajib
  check                 Cek file lokal, link Vercel, dan env wajib
  deploy --preview      Build dan upload preview deployment
  deploy --prod         Build dan upload production deployment
  env:google            Tambahkan GOOGLE_SERVICE_ACCOUNT_JSON dari service-account.json

Options:
  --project <name>      Nama/id project Vercel untuk link non-interaktif
  --scope <team>        Team/scope Vercel
  --targets <list>      Target env untuk env:google, default production,preview,development
  --file <path>         Path service account JSON untuk env:google
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'help';

  if (command === 'setup') return setup(args);
  if (command === 'check') return check(args);
  if (command === 'deploy') return deploy(args);
  if (command === 'env:google') return addGoogleEnv(args);
  usage();
}

main().catch(err => fail(err.message || String(err)));
