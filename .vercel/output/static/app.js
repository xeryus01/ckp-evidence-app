const $ = (id) => document.getElementById(id);

const els = {
  profileForm: $('profileForm'),
  profileSelect: $('profileSelect'),
  newProfileBtn: $('newProfileBtn'),
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
  activitySubmitBtn: $('activitySubmitBtn'),
  activityCancelBtn: $('activityCancelBtn'),
  emptyState: $('emptyState'),
  activityList: $('activityList'),
  calendarPanel: $('calendarPanel'),
  calendarTitle: $('calendarTitle'),
  calendarSummary: $('calendarSummary'),
  calendarGrid: $('calendarGrid'),
  evidencePanel: $('evidencePanel'),
  evidenceTitle: $('evidenceTitle'),
  closeEvidenceBtn: $('closeEvidenceBtn'),
  driveForm: $('driveForm'),
  driveLinks: $('driveLinks'),
  supportLinks: $('supportLinks'),
  previewBtn: $('previewBtn'),
  saveDriveBtn: $('saveDriveBtn'),
  drivePicker: $('drivePicker'),
  driveList: $('driveList'),
  selectAllBtn: $('selectAllBtn'),
  clearAllBtn: $('clearAllBtn'),
  manualForm: $('manualForm'),
  manualFiles: $('manualFiles'),
  manualList: $('manualList'),
  exportExcelBtn: $('exportExcelBtn'),
  status: $('status')
};

let state = { profiles: [], selectedProfileId: null, profile: {}, periods: [], creatingProfile: false };
let activePeriodId = null;
let activeActivityId = null;
let editingActivityId = null;
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

function renderPeriodCalendar(period) {
  els.calendarPanel.classList.toggle('hidden', !period);
  if (!period) {
    els.calendarSummary.textContent = '';
    els.calendarGrid.innerHTML = '';
    return;
  }

  const [year, month] = period.month.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startWeekday = firstDay.getDay();
  const activitiesByDate = new Set((period.activities || [])
    .map(activity => activity.waktu)
    .filter(Boolean));
  const occupiedDays = new Set([...activitiesByDate].map(date => date.slice(8, 10)));
  const emptyDays = daysInMonth - occupiedDays.size;

  els.calendarSummary.textContent = `${emptyDays} hari kosong dari ${daysInMonth} hari di periode ini.`;
  els.calendarGrid.innerHTML = '';

  ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].forEach(label => {
    const cell = document.createElement('div');
    cell.className = 'calendar-weekday';
    cell.textContent = label;
    els.calendarGrid.appendChild(cell);
  });

  for (let i = 0; i < startWeekday; i++) {
    const spacer = document.createElement('div');
    spacer.className = 'calendar-day spacer';
    els.calendarGrid.appendChild(spacer);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${period.month}-${String(day).padStart(2, '0')}`;
    const hasActivity = activitiesByDate.has(dateKey);
    const cell = document.createElement('div');
    cell.className = `calendar-day ${hasActivity ? 'filled' : 'empty'}`;
    cell.setAttribute('data-date', dateKey);
    cell.innerHTML = `
      <div class="calendar-number">${day}</div>
      <div class="calendar-status">${hasActivity ? 'Isi' : 'Kosong'}</div>
    `;
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', (event) => {
      event.stopPropagation();
      const date = event.currentTarget.getAttribute('data-date');
      handleCalendarDateClick(date);
    });
    els.calendarGrid.appendChild(cell);
  }
}

function handleCalendarDateClick(dateKey) {
  setActivityEditMode(null);
  const waktuInput = document.getElementById('activityWaktu');
  const formInput = document.getElementById('activityKegiatan');
  const form = document.getElementById('activityForm');

  if (waktuInput) waktuInput.value = dateKey;
  if (form) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (formInput) formInput.focus();
}

function activePeriod() {
  return state.periods.find(period => period.id === activePeriodId) || null;
}

function activeActivity() {
  const period = activePeriod();
  return period?.activities.find(activity => activity.id === activeActivityId) || null;
}

function evidenceFileCount(activity) {
  const evidence = activity.evidence || {};
  return (evidence.selectedDriveIds || []).length + (evidence.manualFiles || []).length;
}

function evidenceSupportCount(activity) {
  const evidence = activity.evidence || {};
  return Array.isArray(evidence.supportLinks) ? evidence.supportLinks.length : 0;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setActivityEditMode(activity = null) {
  editingActivityId = activity?.id || null;
  if (activity) {
    els.activityKegiatan.value = activity.kegiatan || '';
    els.activityWaktu.value = activity.waktu || '';
    els.activityCatatan.value = activity.catatan || '';
    els.activitySubmitBtn.textContent = 'Simpan Perubahan';
    els.activityCancelBtn.classList.remove('hidden');
  } else {
    editingActivityId = null;
    els.activityForm.reset();
    els.activitySubmitBtn.textContent = 'Tambah Kegiatan';
    els.activityCancelBtn.classList.add('hidden');
  }
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
    label.className = `drive-item${file.mimeType?.includes('pdf') ? ' pdf-file' : ''}`;

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
      img.src = `/api/drive-thumbnail/${file.id}`;
      img.onerror = () => {
        img.style.opacity = '0.35';
        img.alt = 'Pratinjau tidak tersedia';
        img.title = 'Pratinjau gagal dimuat. Gunakan file ini tanpa preview.';
      };
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

function renderProfileOptions() {
  els.profileSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.disabled = !state.creatingProfile && !!state.profiles.length;
  placeholder.selected = state.creatingProfile || !state.selectedProfileId;
  placeholder.textContent = state.creatingProfile ? 'Profil baru' : 'Pilih profil';
  els.profileSelect.appendChild(placeholder);

  state.profiles.forEach((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = `${profile.nama || '(Tanpa nama)'} (${profile.nip || 'NIP kosong'})`;
    if (profile.id === state.selectedProfileId) option.selected = true;
    els.profileSelect.appendChild(option);
  });
}

function renderEvidencePanel() {
  const activity = activeActivity();
  els.evidencePanel.classList.toggle('hidden', !activity);
  if (!activity) return;

  els.evidenceTitle.textContent = activity.kegiatan;
  const evidence = activity.evidence || {};
  els.driveLinks.value = (evidence.driveLinks || []).join('\n');
  els.supportLinks.value = (evidence.supportLinks || []).join('\n');
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
  els.exportExcelBtn.classList.toggle('hidden', !period);

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
  renderPeriodCalendar(period);

  const activities = [...period.activities].sort((a, b) => String(b.waktu || '').localeCompare(String(a.waktu || '')));
  activities.forEach((activity) => {
    const fileCount = evidenceFileCount(activity);
    const supportCount = evidenceSupportCount(activity);
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
    const hasAnyEvidence = fileCount || supportCount;
    let statusText = 'Menunggu bukti';
    if (fileCount && supportCount) statusText = `${fileCount} bukti siap + ${supportCount} bukti dukung`;
    else if (fileCount) statusText = `${fileCount} bukti siap`;
    else if (supportCount) statusText = `${supportCount} bukti dukung`;
    status.className = `pill ${hasAnyEvidence ? '' : 'pending'}`;
    status.textContent = statusText;
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

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'secondary';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      setActivityEditMode(activity);
      activeActivityId = activity.id;
      render();
      els.activityForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const duplicateBtn = document.createElement('button');
    duplicateBtn.type = 'button';
    duplicateBtn.className = 'secondary';
    duplicateBtn.textContent = 'Duplikat';
    duplicateBtn.addEventListener('click', async () => {
      const defaultDate = activity.waktu || todayMonth() + '-01';
      const newDate = window.prompt('Pilih tanggal duplikat (YYYY-MM-DD):', defaultDate);
      if (!newDate) return;
      if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(newDate)) {
        setStatus('Tanggal tidak valid. Gunakan format YYYY-MM-DD.');
        return;
      }
      await duplicateActivity(activity.id, newDate);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'secondary secondary-mini';
    deleteBtn.textContent = 'Hapus';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Hapus kegiatan ini? Tindakan tidak bisa dibatalkan.')) return;
      setStatus('Menghapus kegiatan...');
      try {
        await api(`/api/periods/${period.id}/activities/${activity.id}`, { method: 'DELETE' });
        if (activeActivityId === activity.id) activeActivityId = null;
        setActivityEditMode(null);
        await loadState('Kegiatan dihapus.');
      } catch (err) {
        setStatus(err.message);
      }
    });

    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.textContent = 'Generate PDF';
    generateBtn.disabled = fileCount === 0;
    generateBtn.addEventListener('click', () => generatePdf(activity.id));
    actions.append(evidenceBtn, editBtn, duplicateBtn, deleteBtn, generateBtn);

    card.append(body, actions);
    els.activityList.appendChild(card);
  });
}

function render() {
  renderProfileOptions();
  if (!state.creatingProfile && !state.selectedProfileId && state.profiles.length) {
    state.selectedProfileId = state.profiles[0].id;
  }
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
  state.profiles = state.profiles || [];
  state.selectedProfileId = state.selectedProfileId || null;
  state.profile = state.profile || { nama: '', nip: '' };
  state.periods = state.periods || [];
  state.creatingProfile = false;
  setActivityEditMode(null);
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

  const modal = document.getElementById('progressModal');
  const msgEl = document.getElementById('progressMessage');
  const barEl = document.getElementById('progressBar');
  const percentEl = document.getElementById('progressPercent');
  const logEl = document.getElementById('progressLog');

  modal.classList.remove('hidden');
  logEl.innerHTML = '';
  let step = 0;
  const steps = [
    'Mempersiapkan file...',
    'Mengunduh dari Google Drive...',
    'Memproses gambar...',
    'Mengonversi HEIC (jika ada)...',
    'Membuat PDF...',
    'Menyimpan hasil...'
  ];

  const updateProgress = (index, percent) => {
    barEl.style.width = Math.min(percent, 95) + '%';
    percentEl.textContent = Math.min(percent, 95) + '%';
    if (index < steps.length) msgEl.textContent = steps[index];
  };

  const addLog = (msg) => {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = new Date().toLocaleTimeString() + ' - ' + msg;
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
  };

  setStatus('Membuat PDF A4...');
  try {
    addLog('Mengirim permintaan generate...');
    updateProgress(0, 10);

    const response = await fetch(`/api/periods/${period.id}/activities/${activityId}/generate`, {
      method: 'POST'
    });

    updateProgress(1, 25);
    addLog('Response diterima, memproses...');

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Gagal membuat PDF (${response.status})`);
    }

    updateProgress(4, 80);
    addLog('PDF berhasil dibuat di server');

    const data = await response.json();

    updateProgress(5, 95);
    addLog('Mengunduh file PDF...');

    const a = document.createElement('a');
    a.href = data.url;
    a.download = data.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    updateProgress(5, 100);
    barEl.style.width = '100%';
    percentEl.textContent = '100%';
    addLog('PDF berhasil diunduh!');

    setTimeout(() => {
      modal.classList.add('hidden');
      loadState('PDF berhasil dibuat.');
    }, 800);
  } catch (err) {
    addLog('ERROR: ' + err.message);
    console.error(err);
    setStatus(err.message);
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 3000);
  }
}

async function duplicateActivity(activityId, waktu) {
  const period = activePeriod();
  if (!period) return;
  setStatus('Menduplikasi kegiatan...');
  try {
    const data = await api(`/api/periods/${period.id}/activities/${activityId}/duplicate`, jsonOptions('POST', { waktu }));
    activePeriodId = data.period.id;
    activeActivityId = data.activity.id;
    await loadState('Kegiatan berhasil diduplikasi.');
  } catch (err) {
    setStatus(err.message);
  }
}

async function exportPeriodExcel() {
  const period = activePeriod();
  if (!period) return;
  setStatus('Membuat file Excel...');

  try {
    const response = await fetch(`/api/periods/${period.id}/export`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Gagal mengekspor Excel.');
    }

    const buffer = await response.arrayBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Kegiatan_CKP_${period.month}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus('Ekspor Excel selesai.');
  } catch (err) {
    setStatus(err.message);
  }
}

els.profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Menyimpan profil...');
  try {
    const profileId = state.creatingProfile ? null : state.selectedProfileId;
    if (profileId) {
      await api(`/api/profiles/${profileId}`, jsonOptions('PUT', {
        nama: els.namaInput.value,
        nip: els.nipInput.value
      }));
    } else {
      await api('/api/profiles', jsonOptions('POST', {
        nama: els.namaInput.value,
        nip: els.nipInput.value
      }));
    }
    await loadState('Profil disimpan.');
  } catch (err) {
    setStatus(err.message);
  }
});

els.profileSelect.addEventListener('change', async () => {
  const profileId = els.profileSelect.value;
  if (!profileId) return;
  setStatus('Memilih profil...');
  try {
    await api(`/api/profiles/${profileId}/select`, jsonOptions('PUT', {}));
    await loadState('Profil dipilih.');
  } catch (err) {
    setStatus(err.message);
  }
});

els.newProfileBtn.addEventListener('click', () => {
  state.creatingProfile = true;
  state.selectedProfileId = null;
  state.profile = { nama: '', nip: '' };
  state.periods = [];
  activePeriodId = null;
  activeActivityId = null;
  render();
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
  setStatus(editingActivityId ? 'Menyimpan perubahan kegiatan...' : 'Menambahkan kegiatan...');
  try {
    const payload = {
      kegiatan: els.activityKegiatan.value,
      waktu: els.activityWaktu.value,
      catatan: els.activityCatatan.value
    };
    const url = editingActivityId
      ? `/api/periods/${period.id}/activities/${editingActivityId}`
      : `/api/periods/${period.id}/activities`;
    const method = editingActivityId ? 'PATCH' : 'POST';
    const data = await api(url, jsonOptions(method, payload));
    activeActivityId = data.activity.id;
    setActivityEditMode(null);
    await loadState(editingActivityId ? 'Perubahan kegiatan disimpan.' : 'Kegiatan ditambahkan. Bukti bisa diisi sekarang atau nanti.');
  } catch (err) {
    setStatus(err.message);
  }
});

els.activityCancelBtn.addEventListener('click', () => {
  setActivityEditMode(null);
});

els.exportExcelBtn.addEventListener('click', exportPeriodExcel);

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
      supportLinks: els.supportLinks.value,
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
