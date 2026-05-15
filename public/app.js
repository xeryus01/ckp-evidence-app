const $ = (id) => document.getElementById(id);

const els = {
  profileForm: $('profileForm'),
  namaInput: $('namaInput'),
  nipInput: $('nipInput'),
  periodForm: $('periodForm'),
  periodMonth: $('periodMonth'),
  periodList: $('periodList'),
  currentPeriodTitle: $('currentPeriodTitle'),
  periodSummary: $('periodSummary'),
  activityForm: $('activityForm'),
  activityKegiatan: $('activityKegiatan'),
  activityWaktu: $('activityWaktu'),
  activityCatatan: $('activityCatatan'),
  emptyState: $('emptyState'),
  activityList: $('activityList'),
  evidencePanel: $('evidencePanel'),
  evidenceTitle: $('evidenceTitle'),
  closeEvidenceBtn: $('closeEvidenceBtn'),
  driveForm: $('driveForm'),
  driveLinks: $('driveLinks'),
  previewBtn: $('previewBtn'),
  saveDriveBtn: $('saveDriveBtn'),
  drivePicker: $('drivePicker'),
  driveList: $('driveList'),
  selectAllBtn: $('selectAllBtn'),
  clearAllBtn: $('clearAllBtn'),
  manualForm: $('manualForm'),
  manualFiles: $('manualFiles'),
  manualList: $('manualList'),
  status: $('status')
};

let state = { profile: {}, periods: [] };
let activePeriodId = null;
let activeActivityId = null;
let previewFiles = [];

function setStatus(message) {
  els.status.textContent = message || '';
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Permintaan gagal.');
  }
  return res.json();
}

function jsonOptions(method, body) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function todayMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function dateBoundsForMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return { min: '', max: '' };
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    min: `${month}-01`,
    max: `${month}-${String(lastDay).padStart(2, '0')}`
  };
}

function formatActivityTime(value) {
  if (!value) return 'Waktu belum diisi';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(year, month - 1, day));
}

function activePeriod() {
  return state.periods.find(period => period.id === activePeriodId) || null;
}

function activeActivity() {
  const period = activePeriod();
  return period?.activities.find(activity => activity.id === activeActivityId) || null;
}

function evidenceCount(activity) {
  const evidence = activity.evidence || {};
  return (evidence.selectedDriveIds || []).length + (evidence.manualFiles || []).length;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function selectedDriveIds() {
  return [...els.driveList.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
}

function renderDriveFiles(files, selectedIds = []) {
  previewFiles = files || [];
  const selected = new Set(selectedIds.length ? selectedIds : previewFiles.map(file => file.id));
  els.driveList.innerHTML = '';
  els.drivePicker.classList.toggle('hidden', !previewFiles.length);

  previewFiles.forEach((file, idx) => {
    const label = document.createElement('label');
    label.className = 'drive-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = file.id;
    checkbox.checked = selected.has(file.id);

    const thumb = document.createElement('div');
    thumb.className = 'drive-thumb';
    if (file.mimeType?.startsWith('image/')) {
      const img = document.createElement('img');
      img.alt = `Preview ${file.name}`;
      img.loading = 'lazy';
      
      // Handle HEIC images
      if (file.mimeType === 'image/heic' || file.mimeType === 'image/heif' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
        // For HEIC images, fetch the blob and convert to JPEG
        fetch(`/api/drive-thumbnail/${file.id}`)
          .then(response => response.blob())
          .then(blob => {
            return heic2any({ blob, toType: 'image/jpeg', quality: 0.8 });
          })
          .then(convertedBlob => {
            img.src = URL.createObjectURL(convertedBlob);
          })
          .catch(err => {
            console.warn('HEIC conversion failed, using original URL:', err);
            img.src = `/api/drive-thumbnail/${file.id}`;
          });
      } else {
        // Regular images
        img.src = `/api/drive-thumbnail/${file.id}`;
      }
      
      thumb.appendChild(img);
    } else {
      const pdf = document.createElement('div');
      pdf.className = 'pdf-icon';
      pdf.textContent = 'PDF';
      thumb.appendChild(pdf);
    }

    const meta = document.createElement('div');
    meta.className = 'drive-meta';
    const name = document.createElement('strong');
    name.textContent = `${idx + 1}. ${file.name}`;
    const type = document.createElement('span');
    type.textContent = `${file.type || 'File'} - ${file.mimeType || ''}`;
    meta.append(name, type);

    label.append(checkbox, thumb, meta);
    els.driveList.appendChild(label);
  });
}

function renderManualFiles(activity) {
  const files = activity?.evidence?.manualFiles || [];
  els.manualList.innerHTML = '';

  files.forEach((file) => {
    const row = document.createElement('div');
    row.className = 'file-item';

    const meta = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = file.name;
    const detail = document.createElement('span');
    detail.textContent = [file.mimetype, formatBytes(file.size)].filter(Boolean).join(' - ');
    meta.append(name, detail);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'mini secondary-mini';
    remove.textContent = 'Hapus';
    remove.addEventListener('click', () => removeManualFile(file.id));

    row.append(meta, remove);
    els.manualList.appendChild(row);
  });
}

function renderEvidencePanel() {
  const activity = activeActivity();
  els.evidencePanel.classList.toggle('hidden', !activity);
  if (!activity) return;

  els.evidenceTitle.textContent = activity.kegiatan;
  const evidence = activity.evidence || {};
  els.driveLinks.value = (evidence.driveLinks || []).join('\n');
  renderDriveFiles(evidence.driveFiles || [], evidence.selectedDriveIds || []);
  renderManualFiles(activity);
}

function renderPeriods() {
  els.periodList.innerHTML = '';

  state.periods.forEach((period) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `period-item ${period.id === activePeriodId ? 'active' : ''}`;
    btn.addEventListener('click', () => {
      activePeriodId = period.id;
      activeActivityId = null;
      render();
    });

    const title = document.createElement('strong');
    title.textContent = period.label || period.month;
    const meta = document.createElement('small');
    meta.textContent = `${period.activities.length} kegiatan`;
    btn.append(title, meta);
    els.periodList.appendChild(btn);
  });
}

function renderActivities() {
  const period = activePeriod();
  els.activityList.innerHTML = '';
  els.activityForm.classList.toggle('hidden', !period);
  els.emptyState.classList.toggle('hidden', !!period);

  if (!period) {
    els.currentPeriodTitle.textContent = 'Belum ada periode';
    els.periodSummary.textContent = '';
    els.activityWaktu.min = '';
    els.activityWaktu.max = '';
    return;
  }

  els.currentPeriodTitle.textContent = period.label || period.month;
  els.periodSummary.textContent = `${period.activities.length} kegiatan`;
  const { min, max } = dateBoundsForMonth(period.month);
  els.activityWaktu.min = min;
  els.activityWaktu.max = max;

  period.activities.forEach((activity) => {
    const count = evidenceCount(activity);
    const card = document.createElement('article');
    card.className = `activity-card ${activity.id === activeActivityId ? 'selected' : ''}`;

    const body = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'activity-title';
    title.textContent = activity.kegiatan;

    const meta = document.createElement('div');
    meta.className = 'activity-meta';
    const time = document.createElement('span');
    time.textContent = formatActivityTime(activity.waktu);
    const status = document.createElement('span');
    status.className = `pill ${count ? '' : 'pending'}`;
    status.textContent = count ? `${count} bukti siap` : 'Menunggu bukti';
    meta.append(time, status);

    const lastPdf = activity.generatedPdfs?.[0];
    if (lastPdf) {
      const link = document.createElement('a');
      link.href = lastPdf.url;
      link.textContent = 'PDF terakhir';
      link.target = '_blank';
      meta.append(link);
    }

    body.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'activity-actions';
    const evidenceBtn = document.createElement('button');
    evidenceBtn.type = 'button';
    evidenceBtn.className = 'secondary';
    evidenceBtn.textContent = 'Bukti';
    evidenceBtn.addEventListener('click', () => {
      activeActivityId = activity.id;
      render();
      els.evidencePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.textContent = 'Generate PDF';
    generateBtn.disabled = count === 0;
    generateBtn.addEventListener('click', () => generatePdf(activity.id));
    actions.append(evidenceBtn, generateBtn);

    card.append(body, actions);
    els.activityList.appendChild(card);
  });
}

function render() {
  if (!activePeriodId && state.periods.length) activePeriodId = state.periods[0].id;
  if (activePeriodId && !activePeriod()) activePeriodId = state.periods[0]?.id || null;
  if (activeActivityId && !activeActivity()) activeActivityId = null;
  els.namaInput.value = state.profile?.nama || '';
  els.nipInput.value = state.profile?.nip || '';
  renderPeriods();
  renderActivities();
  renderEvidencePanel();
}

async function loadState(message) {
  state = await api('/api/state');
  render();
  if (message) setStatus(message);
}

async function removeManualFile(fileId) {
  const period = activePeriod();
  const activity = activeActivity();
  if (!period || !activity) return;
  setStatus('Menghapus bukti...');
  await api(`/api/periods/${period.id}/activities/${activity.id}/manual-evidence/${fileId}`, { method: 'DELETE' });
  await loadState('Bukti manual dihapus.');
}

async function generatePdf(activityId) {
  const period = activePeriod();
  if (!period) return;
  setStatus('Membuat PDF A4...');
  try {
    const data = await api(`/api/periods/${period.id}/activities/${activityId}/generate`, { method: 'POST' });
    const a = document.createElement('a');
    a.href = data.url;
    a.download = data.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    await loadState('PDF berhasil dibuat.');
  } catch (err) {
    setStatus(err.message);
  }
}

els.profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Menyimpan profil...');
  try {
    await api('/api/profile', jsonOptions('PUT', {
      nama: els.namaInput.value,
      nip: els.nipInput.value
    }));
    await loadState('Profil disimpan.');
  } catch (err) {
    setStatus(err.message);
  }
});

els.periodForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Membuat periode...');
  try {
    const data = await api('/api/periods', jsonOptions('POST', { month: els.periodMonth.value }));
    activePeriodId = data.period.id;
    activeActivityId = null;
    await loadState('Periode siap digunakan.');
  } catch (err) {
    setStatus(err.message);
  }
});

els.activityForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const period = activePeriod();
  if (!period) return;
  setStatus('Menambahkan kegiatan...');
  try {
    const data = await api(`/api/periods/${period.id}/activities`, jsonOptions('POST', {
      kegiatan: els.activityKegiatan.value,
      waktu: els.activityWaktu.value,
      catatan: els.activityCatatan.value
    }));
    activeActivityId = data.activity.id;
    els.activityForm.reset();
    await loadState('Kegiatan ditambahkan. Bukti bisa diisi sekarang atau nanti.');
  } catch (err) {
    setStatus(err.message);
  }
});

els.previewBtn.addEventListener('click', async () => {
  const period = activePeriod();
  const activity = activeActivity();
  if (!period || !activity) return;
  els.previewBtn.disabled = true;
  setStatus('Membaca Google Drive...');
  try {
    const data = await api(`/api/periods/${period.id}/activities/${activity.id}/drive-preview`, jsonOptions('POST', {
      driveLinks: els.driveLinks.value
    }));
    renderDriveFiles(data.files || []);
    setStatus(data.files?.length ? `${data.files.length} file ditemukan.` : 'Tidak ada gambar/PDF yang ditemukan.');
  } catch (err) {
    setStatus(err.message);
  } finally {
    els.previewBtn.disabled = false;
  }
});

els.driveForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const period = activePeriod();
  const activity = activeActivity();
  if (!period || !activity) return;
  setStatus('Menyimpan bukti Drive...');
  try {
    await api(`/api/periods/${period.id}/activities/${activity.id}/drive-evidence`, jsonOptions('PUT', {
      driveLinks: els.driveLinks.value,
      selectedDriveIds: selectedDriveIds(),
      driveFiles: previewFiles
    }));
    await loadState('Bukti Drive disimpan.');
  } catch (err) {
    setStatus(err.message);
  }
});

els.manualForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const period = activePeriod();
  const activity = activeActivity();
  if (!period || !activity || !els.manualFiles.files.length) return;
  setStatus('Mengupload bukti manual...');
  try {
    const fd = new FormData();
    [...els.manualFiles.files].forEach(file => fd.append('manualFiles', file));
    await api(`/api/periods/${period.id}/activities/${activity.id}/manual-evidence`, {
      method: 'POST',
      body: fd
    });
    els.manualForm.reset();
    await loadState('Bukti manual tersimpan.');
  } catch (err) {
    setStatus(err.message);
  }
});

els.selectAllBtn.addEventListener('click', () => {
  els.driveList.querySelectorAll('input[type="checkbox"]').forEach(input => input.checked = true);
});

els.clearAllBtn.addEventListener('click', () => {
  els.driveList.querySelectorAll('input[type="checkbox"]').forEach(input => input.checked = false);
});

els.closeEvidenceBtn.addEventListener('click', () => {
  activeActivityId = null;
  render();
});

els.periodMonth.value = todayMonth();
loadState().catch(err => setStatus(err.message));
