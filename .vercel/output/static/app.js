const $ = (id) => document.getElementById(id);

const els = {
  profileSelect: $('profileSelect'),
  newProfileBtn: $('newProfileBtn'),
  saveProfileBtn: $('saveProfileBtn'),
  nipDisplay: $('nipDisplay'),
  periodForm: $('periodForm'),
  periodMonth: $('periodMonth'),
  periodList: $('periodList'),
  periodTitle: $('periodTitle'),
  periodStatText: $('periodStatText'),
  activityFormWrapper: $('activityFormWrapper'),
  activityForm: $('activityForm'),
  kegiatanInput: $('kegiatanInput'),
  startDate: $('startDate'),
  endDate: $('endDate'),
  startTime: $('startTime'),
  endTime: $('endTime'),
  catatanInput: $('catatanInput'),
  activitySubmitBtn: $('activitySubmitBtn'),
  activityCancelBtn: $('activityCancelBtn'),
  emptyState: $('emptyState'),
  activityList: $('activityList'),
  calendarContainer: $('calendarContainer'),
  calTitle: $('calTitle'),
  calGrid: $('calGrid'),
  evidenceOverlay: $('evidenceOverlay'),
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
  exportExcelBtn: $('exportExcelBtn'),
  generateAllPdfBtn: $('generateAllPdfBtn'),
  statusToast: $('statusToast'),
  progressOverlay: $('progressOverlay'),
  progressMsg: $('progressMsg'),
  progressBar: $('progressBar'),
  progressPct: $('progressPct'),
  progressLog: $('progressLog'),
  cancelPdfBtn: $('cancelPdfBtn')
};

let cancelPdfGeneration = false;

let state = { profiles: [], selectedProfileId: null, profile: {}, periods: [], creatingProfile: false };
let activePeriodId = null;
let activeActivityId = null;
let editingActivityId = null;
let previewFiles = [];
let toastTimer = null;

function showToast(message, duration = 3000) {
  if (!message) {
    els.statusToast.classList.remove('show');
    return;
  }

  els.statusToast.textContent = message;
  els.statusToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.statusToast.classList.remove('show'), duration);
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(year, month - 1, day));
  }
  return value;
}

function renderPeriodCalendar(period) {
  els.calTitle.textContent = `Kalender ${period.label || period.month}`;
  const activitiesByDate = new Set((period.activities || [])
    .map(activity => activity.startDate || activity.waktu)
    .filter(Boolean));
  const [year, month] = period.month.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startWeekday = firstDay.getDay();
  const emptyDays = daysInMonth - new Set([...activitiesByDate]).size;

  els.calGrid.innerHTML = '';

  ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].forEach((label) => {
    const labelCell = document.createElement('div');
    labelCell.className = 'cal-wday';
    labelCell.textContent = label;
    els.calGrid.appendChild(labelCell);
  });

  for (let i = 0; i < startWeekday; i++) {
    const spacer = document.createElement('div');
    spacer.className = 'cal-day spacer';
    els.calGrid.appendChild(spacer);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${period.month}-${String(day).padStart(2, '0')}`;
    const hasActivity = activitiesByDate.has(dateKey);
    const cell = document.createElement('div');
    cell.className = `cal-day ${hasActivity ? 'filled' : 'empty'}`;
    cell.innerHTML = `
      <div class="day-num">${day}</div>
      <div class="day-dot"></div>
    `;
    cell.addEventListener('click', () => {
      els.startDate.value = dateKey;
      els.startDate.focus();
    });
    els.calGrid.appendChild(cell);
  }
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

function setActivityEditMode(activity = null) {
  editingActivityId = activity?.id || null;
  if (activity) {
    els.kegiatanInput.value = activity.kegiatan || '';
    els.startDate.value = activity.startDate || activity.waktu || '';
    els.endDate.value = activity.endDate || '';
    els.startTime.value = activity.startTime || '';
    els.endTime.value = activity.endTime || '';
    els.catatanInput.value = activity.catatan || '';
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
  placeholder.disabled = state.profiles.length > 0;
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

  els.nipDisplay.textContent = state.profile?.nip || '–';
}

function renderEvidencePanel() {
  const activity = activeActivity();
  els.evidenceOverlay.classList.toggle('open', !!activity);

  if (!activity) return;

  els.evidenceTitle.textContent = activity.kegiatan || 'Pilih kegiatan';
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
  els.activityFormWrapper.classList.toggle('hidden', !period);
  els.emptyState.classList.toggle('hidden', !!period);
  els.exportExcelBtn.classList.toggle('hidden', !period);
  els.generateAllPdfBtn.classList.toggle('hidden', !period || !period.activities.length);
  els.calendarContainer.classList.toggle('hidden', !period);

  if (!period) {
    els.periodTitle.textContent = 'Belum ada periode';
    els.periodStatText.textContent = '0 kegiatan';
    els.startDate.min = '';
    els.startDate.max = '';
    els.endDate.min = '';
    els.endDate.max = '';
    return;
  }

  const { min, max } = dateBoundsForMonth(period.month);
  els.startDate.min = min;
  els.startDate.max = max;
  els.endDate.min = min;
  els.endDate.max = max;
  if (els.startDate.value && (els.startDate.value < min || els.startDate.value > max)) {
    els.startDate.value = '';
  }
  if (els.endDate.value && (els.endDate.value < min || els.endDate.value > max)) {
    els.endDate.value = '';
  }

  els.periodTitle.textContent = period.label || period.month;
  els.periodStatText.textContent = `${period.activities.length} kegiatan`;
  renderPeriodCalendar(period);

  const activities = [...period.activities].sort((a, b) => String(b.startDate || b.waktu || '').localeCompare(String(a.startDate || a.waktu || '')));

  activities.forEach((activity) => {
    const count = evidenceCount(activity);
    const card = document.createElement('article');
    card.className = `activity-card ${activity.id === activeActivityId ? 'selected' : ''}`;

    const body = document.createElement('div');
    body.className = 'activity-body';

    const title = document.createElement('p');
    title.className = 'activity-name';
    title.textContent = activity.kegiatan;

    const meta = document.createElement('div');
    meta.className = 'meta-row';

    const time = document.createElement('span');
    time.className = 'meta-tag waktu';
    time.textContent = formatActivityTime(activity.startDate || activity.waktu || '');

    const status = document.createElement('span');
    status.className = `meta-tag ${count ? 'bukti' : ''}`.trim();
    status.textContent = count ? `${count} bukti siap` : 'Menunggu bukti';

    meta.append(time, status);
    if (activity.catatan) {
      const note = document.createElement('span');
      note.className = 'meta-tag';
      note.textContent = activity.catatan;
      meta.append(note);
    }

    const actions = document.createElement('div');
    actions.className = 'actions-row';

    const evidenceBtn = document.createElement('button');
    evidenceBtn.type = 'button';
    evidenceBtn.className = 'act-btn';
    evidenceBtn.textContent = 'Bukti';
    evidenceBtn.addEventListener('click', () => {
      activeActivityId = activity.id;
      render();
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'act-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      setActivityEditMode(activity);
      activeActivityId = activity.id;
      render();
      els.activityForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const duplicateBtn = document.createElement('button');
    duplicateBtn.type = 'button';
    duplicateBtn.className = 'act-btn';
    duplicateBtn.textContent = 'Duplikat';
    duplicateBtn.addEventListener('click', async () => {
      const defaultDate = activity.startDate || activity.waktu || `${todayMonth()}-01`;
      const newDate = window.prompt('Pilih tanggal duplikat (YYYY-MM-DD):', defaultDate);
      if (!newDate) return;
      if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(newDate)) {
        showToast('Tanggal tidak valid. Gunakan format YYYY-MM-DD.');
        return;
      }
      await duplicateActivity(activity.id, newDate);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'act-btn danger';
    deleteBtn.textContent = 'Hapus';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Hapus kegiatan ini? Tindakan tidak bisa dibatalkan.')) return;
      showToast('Menghapus kegiatan...');
      try {
        await api(`/api/periods/${period.id}/activities/${activity.id}`, { method: 'DELETE' });
        if (activeActivityId === activity.id) activeActivityId = null;
        setActivityEditMode(null);
        await loadState('Kegiatan dihapus.');
      } catch (err) {
        showToast(err.message);
      }
    });

    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.className = 'act-btn primary';
    generateBtn.textContent = 'Generate PDF';
    generateBtn.disabled = count === 0;
    generateBtn.addEventListener('click', () => generatePdf(activity.id));

    actions.append(evidenceBtn, editBtn, duplicateBtn, deleteBtn, generateBtn);
    body.append(title, meta, actions);
    card.append(body);
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
  if (message) showToast(message);
}

async function removeManualFile(fileId) {
  const period = activePeriod();
  const activity = activeActivity();
  if (!period || !activity) return;
  showToast('Menghapus bukti...');
  await api(`/api/periods/${period.id}/activities/${activity.id}/manual-evidence/${fileId}`, { method: 'DELETE' });
  await loadState('Bukti manual dihapus.');
}

async function generatePdf(activityId) {
  const period = activePeriod();
  if (!period) {
    showToast('Periode tidak ditemukan');
    return;
  }

  // Find activity by the passed activityId, not by activeActivityId
  const activity = period.activities.find(act => act.id === activityId);
  if (!activity) {
    showToast('Kegiatan tidak ditemukan');
    return;
  }

  cancelPdfGeneration = false;
  els.progressOverlay.classList.add('open');
  els.cancelPdfBtn.style.display = 'block';
  els.cancelPdfBtn.disabled = false;
  els.progressMsg.textContent = `Membuat PDF: ${activity.kegiatan}...`;
  els.progressLog.innerHTML = '';
  els.progressBar.style.width = '0%';
  els.progressPct.textContent = '0%';

  try {
    // Progress: preparing
    els.progressBar.style.width = '25%';
    els.progressPct.textContent = '25%';
    els.progressMsg.textContent = `Mempersiapkan: ${activity.kegiatan}`;
    await new Promise(resolve => setTimeout(resolve, 300));

    if (cancelPdfGeneration) throw new Error('Generate PDF dibatalkan.');

    // Progress: generating
    els.progressBar.style.width = '50%';
    els.progressPct.textContent = '50%';
    els.progressMsg.textContent = `Membuat dokumen: ${activity.kegiatan}`;
    console.log('Calling API:', `/api/periods/${period.id}/activities/${activityId}/generate`);
    const data = await api(`/api/periods/${period.id}/activities/${activityId}/generate`, { method: 'POST' });
    console.log('API Response:', data);
    
    if (cancelPdfGeneration) throw new Error('Generate PDF dibatalkan.');

    // Progress: downloading
    els.progressBar.style.width = '75%';
    els.progressPct.textContent = '75%';
    els.progressMsg.textContent = `Mengunduh file: ${activity.kegiatan}`;
    await new Promise(resolve => setTimeout(resolve, 200));

    if (cancelPdfGeneration) throw new Error('Generate PDF dibatalkan.');

    if (!data.url) {
      throw new Error('URL PDF tidak diterima dari server.');
    }

    const a = document.createElement('a');
    a.href = data.url;
    a.download = data.filename || 'document.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Progress: complete
    els.progressBar.style.width = '100%';
    els.progressPct.textContent = '100%';
    els.progressMsg.textContent = `PDF berhasil dibuat: ${activity.kegiatan}`;

    const logEntry = document.createElement('div');
    logEntry.textContent = `✓ ${activity.kegiatan}`;
    logEntry.style.color = 'var(--accent2)';
    els.progressLog.appendChild(logEntry);

    setTimeout(() => {
      els.progressOverlay.classList.remove('open');
      els.cancelPdfBtn.style.display = 'none';
    }, 1500);

    showToast('PDF berhasil dibuat.');
  } catch (err) {
    console.error('PDF Generation Error:', err);
    if (err.message.includes('dibatalkan')) {
      els.progressMsg.textContent = 'Generate PDF dibatalkan';
      const logEntry = document.createElement('div');
      logEntry.textContent = '✗ Dibatalkan oleh pengguna';
      logEntry.style.color = 'var(--danger)';
      els.progressLog.appendChild(logEntry);
    } else {
      els.progressMsg.textContent = `Gagal: ${err.message}`;
      const logEntry = document.createElement('div');
      logEntry.textContent = `✗ ${err.message}`;
      logEntry.style.color = 'var(--danger)';
      els.progressLog.appendChild(logEntry);
    }
    setTimeout(() => {
      els.progressOverlay.classList.remove('open');
      els.cancelPdfBtn.style.display = 'none';
    }, 2000);
    showToast(err.message);
  }
}

async function generateAllPdf() {
  const period = activePeriod();
  if (!period || !period.activities.length) return;

  const activitiesWithEvidence = period.activities.filter(act => {
    const evidence = act.evidence || {};
    return (evidence.selectedDriveIds || []).length + (evidence.manualFiles || []).length > 0;
  });

  if (!activitiesWithEvidence.length) {
    showToast('Tidak ada kegiatan dengan bukti untuk dikonversi.');
    return;
  }

  // Show progress overlay
  cancelPdfGeneration = false;
  els.progressOverlay.classList.add('open');
  els.cancelPdfBtn.style.display = 'block';
  els.cancelPdfBtn.disabled = false;
  els.progressLog.innerHTML = '';
  els.progressBar.style.width = '0%';
  els.progressPct.textContent = '0%';
  els.progressMsg.textContent = `Mempersiapkan ${activitiesWithEvidence.length} dokumen...`;

  let success = 0;
  let failed = 0;
  const failedList = [];

  for (let i = 0; i < activitiesWithEvidence.length; i++) {
    if (cancelPdfGeneration) break;
    
    const activity = activitiesWithEvidence[i];
    const progress = Math.round(((i) / activitiesWithEvidence.length) * 100);
    
    try {
      els.progressMsg.textContent = `Membuat PDF: ${activity.kegiatan}`;
      els.progressBar.style.width = progress + '%';
      els.progressPct.textContent = progress + '%';
      
      const logEntry = document.createElement('div');
      logEntry.textContent = `⏳ ${activity.kegiatan}...`;
      els.progressLog.appendChild(logEntry);
      els.progressLog.scrollTop = els.progressLog.scrollHeight;

      const data = await api(`/api/periods/${period.id}/activities/${activity.id}/generate`, { method: 'POST' });
      
      if (cancelPdfGeneration) throw new Error('Dibatalkan oleh pengguna');
      
      const a = document.createElement('a');
      a.href = data.url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      success++;
      
      logEntry.textContent = `✓ ${activity.kegiatan}`;
      logEntry.style.color = 'var(--accent2)';
      
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      if (err.message.includes('Dibatalkan')) {
        failed++;
        const logEntry = document.createElement('div');
        logEntry.textContent = `✗ ${activity.kegiatan} - Dibatalkan`;
        logEntry.style.color = 'var(--danger)';
        els.progressLog.appendChild(logEntry);
        break;
      } else {
        failed++;
        failedList.push(activity.kegiatan);
        
        const logEntry = document.createElement('div');
        logEntry.textContent = `✗ ${activity.kegiatan} - ${err.message}`;
        logEntry.style.color = 'var(--danger)';
        els.progressLog.appendChild(logEntry);
        els.progressLog.scrollTop = els.progressLog.scrollHeight;
      }
    }
  }

  // Final progress update
  const finalProgress = cancelPdfGeneration ? Math.round(((success + failed) / activitiesWithEvidence.length) * 100) : 100;
  els.progressBar.style.width = finalProgress + '%';
  els.progressPct.textContent = finalProgress + '%';
  
  let message = `${success} PDF berhasil dibuat`;
  if (failed > 0) {
    message += ` | ${failed} gagal/dibatalkan`;
  }
  if (cancelPdfGeneration) {
    message += ' (dibatalkan)';
  }
  els.progressMsg.textContent = message;
  
  // Add final summary to log
  const summary = document.createElement('div');
  summary.style.marginTop = '8px';
  summary.style.paddingTop = '8px';
  summary.style.borderTop = '1px solid var(--border)';
  summary.style.fontWeight = '600';
  summary.textContent = message;
  els.progressLog.appendChild(summary);
  els.progressLog.scrollTop = els.progressLog.scrollHeight;
  
  setTimeout(() => {
    els.progressOverlay.classList.remove('open');
    els.cancelPdfBtn.style.display = 'none';
  }, cancelPdfGeneration ? 1500 : 2000);
  
  showToast(message, 3000);
}

async function duplicateActivity(activityId, waktu) {
  const period = activePeriod();
  if (!period) return;
  showToast('Menduplikasi kegiatan...');
  try {
    const data = await api(`/api/periods/${period.id}/activities/${activityId}/duplicate`, jsonOptions('POST', { waktu }));
    activePeriodId = data.period.id;
    activeActivityId = data.activity.id;
    await loadState('Kegiatan berhasil diduplikasi.');
  } catch (err) {
    showToast(err.message);
  }
}

async function exportPeriodExcel() {
  const period = activePeriod();
  if (!period) return;
  showToast('Membuat file Excel...');

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
    showToast('Ekspor Excel selesai.');
  } catch (err) {
    showToast(err.message);
  }
}

els.saveProfileBtn.addEventListener('click', async () => {
  const currentName = state.profile?.nama || '';
  const currentNip = state.profile?.nip || '';
  const nama = window.prompt('Nama profil:', currentName);
  if (nama === null) return;
  const nip = window.prompt('NIP:', currentNip);
  if (nip === null) return;

  showToast(state.creatingProfile ? 'Membuat profil...' : 'Menyimpan profil...');
  try {
    if (state.creatingProfile || !state.selectedProfileId) {
      await api('/api/profiles', jsonOptions('POST', { nama, nip }));
    } else {
      await api(`/api/profiles/${state.selectedProfileId}`, jsonOptions('PUT', { nama, nip }));
    }
    await loadState(state.creatingProfile ? 'Profil dibuat.' : 'Profil disimpan.');
  } catch (err) {
    showToast(err.message);
  }
});

els.profileSelect.addEventListener('change', async () => {
  const profileId = els.profileSelect.value;
  if (!profileId) return;
  showToast('Memilih profil...');
  try {
    await api(`/api/profiles/${profileId}/select`, jsonOptions('PUT', {}));
    await loadState('Profil dipilih.');
  } catch (err) {
    showToast(err.message);
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
  showToast('Membuat periode...');
  try {
    const data = await api('/api/periods', jsonOptions('POST', { month: els.periodMonth.value }));
    activePeriodId = data.period.id;
    activeActivityId = null;
    await loadState('Periode siap digunakan.');
  } catch (err) {
    showToast(err.message);
  }
});

els.activityForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const period = activePeriod();
  if (!period) return;

  const { min, max } = dateBoundsForMonth(period.month);
  const startDate = els.startDate.value;
  const endDate = els.endDate.value;

  if (startDate && (startDate < min || startDate > max)) {
    showToast(`Tanggal mulai harus berada pada bulan periode ${period.month}.`);
    return;
  }
  if (endDate && (endDate < min || endDate > max)) {
    showToast(`Tanggal selesai harus berada pada bulan periode ${period.month}.`);
    return;
  }
  if (startDate && endDate && startDate > endDate) {
    showToast('Tanggal selesai harus setelah atau sama dengan tanggal mulai.');
    return;
  }

  showToast(editingActivityId ? 'Menyimpan perubahan kegiatan...' : 'Menambahkan kegiatan...');
  try {
    const payload = {
      kegiatan: els.kegiatanInput.value,
      startDate,
      endDate,
      startTime: els.startTime.value,
      endTime: els.endTime.value,
      catatan: els.catatanInput.value
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
    showToast(err.message);
  }
});

els.activityCancelBtn.addEventListener('click', () => {
  setActivityEditMode(null);
});

els.cancelPdfBtn.addEventListener('click', () => {
  cancelPdfGeneration = true;
  els.cancelPdfBtn.disabled = true;
  showToast('Membatalkan generate PDF...');
});

els.generateAllPdfBtn.addEventListener('click', generateAllPdf);

els.exportExcelBtn.addEventListener('click', exportPeriodExcel);

els.previewBtn.addEventListener('click', async () => {
  const period = activePeriod();
  const activity = activeActivity();
  if (!period || !activity) return;
  els.previewBtn.disabled = true;
  showToast('Membaca Google Drive...');
  try {
    const data = await api(`/api/periods/${period.id}/activities/${activity.id}/drive-preview`, jsonOptions('POST', {
      driveLinks: els.driveLinks.value
    }));
    renderDriveFiles(data.files || []);
    showToast(data.files?.length ? `${data.files.length} file ditemukan.` : 'Tidak ada gambar/PDF yang ditemukan.');
  } catch (err) {
    showToast(err.message);
  } finally {
    els.previewBtn.disabled = false;
  }
});

els.driveForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const period = activePeriod();
  const activity = activeActivity();
  if (!period || !activity) return;
  showToast('Menyimpan bukti Drive...');
  try {
    await api(`/api/periods/${period.id}/activities/${activity.id}/drive-evidence`, jsonOptions('PUT', {
      driveLinks: els.driveLinks.value,
      selectedDriveIds: selectedDriveIds(),
      driveFiles: previewFiles
    }));
    await loadState('Bukti Drive disimpan.');
  } catch (err) {
    showToast(err.message);
  }
});

els.manualForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const period = activePeriod();
  const activity = activeActivity();
  if (!period || !activity || !els.manualFiles.files.length) return;
  showToast('Mengupload bukti manual...');
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
    showToast(err.message);
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
loadState().catch(err => showToast(err.message));
