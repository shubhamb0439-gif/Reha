(() => {
  'use strict';

  // =====================================================================================
  // DOM ELEMENTS
  // =====================================================================================
  const dom = {
    panelRoot: document.getElementById('rheaCockpitRoot'),
    transcript: document.getElementById('liveTranscript'),
    templateSelect: document.getElementById('templateSelect'),
    soapHost: document.getElementById('soapScroller'),

    btnClear: document.getElementById('_scribe_clear'),
    btnSave: null,
    btnAddEhr: document.getElementById('_scribe_add_ehr'),
    btnGenerate: document.getElementById('_scribe_generate'),

    aiPane: document.getElementById('aiPane'),
    aiDiagnosisBody: document.getElementById('aiDiagnosisBody'),

    ehrButton: document.getElementById('ehrButton'),
    ehrSidebar: document.getElementById('ehrSidebar'),
    ehrOverlay: document.getElementById('ehrOverlay'),
    ehrCloseButton: document.getElementById('ehrCloseButton'),
    mrnInput: document.getElementById('mrnInput'),
    mrnSearchButton: document.getElementById('mrnSearchButton'),
    ehrError: document.getElementById('ehrError'),
    ehrInitialState: document.getElementById('ehrInitialState'),
    ehrPatientState: document.getElementById('ehrPatientState'),
    patientNameDisplay: document.getElementById('patientNameDisplay'),
    patientMRNDisplay: document.getElementById('patientMRNDisplay'),
    patientEmailDisplay: document.getElementById('patientEmailDisplay'),
    patientMobileDisplay: document.getElementById('patientMobileDisplay'),
    notesList: document.getElementById('notesList'),
    noteDetail: document.getElementById('noteDetail'),
    totalEditsSlot: document.getElementById('totalEditsSlot'),
  };

  // =====================================================================================
  //  CONSTANTS + RUNTIME STATE
  // =====================================================================================
  const CONFIG = {
    SOAP_NOTE_TEMPLATE_ID: '20',
    AI_DIAGNOSIS_ENDPOINT: '/ehr/ai/diagnosis',
    EHR_STORAGE_KEY: 'rhea_ehr_state_v1',
    SUMMARY_NOTE_ID: 'summary',
    HISTORY_KEY: 'rhea.noteHistory',
    LATEST_SOAP_KEY: 'rhea.latestSoap',
    ACTIVE_ITEM_KEY: 'rhea.activeItem',
    MED_AVAIL_KEY: 'rhea.medAvailability',
    MRN_AUTOMATION_DELAY_MS: 1200,
  };

  const state = {
    transcriptItems: [],
    activeTranscriptId: null,
    latestSoapNote: {},
    soapGenerating: false,
    soapNoteTimer: null,
    summaryGenerating: false,
    summaryTimer: null,
    addEhrInFlight: false,
    currentPatient: null,
    currentNotes: [],
    noteCache: new Map(),
    me: null,
    summaryCacheByMrn: new Map(),
    patientCacheByMrn: new Map(),
    aiDiagnosisInFlight: false,
    aiDiagnosisLastError: null,
    aiDiagnosisTimer: null,
    templateKeywords: new Map(),
    templatesLoaded: false,
    medAvailability: new Map(),
    editStateMap: new WeakMap(),
    totalEditsBadgeEl: null,
    lastProcessedMrn: null,
    mrnAutomationInProgress: false,
    mrnAutomationTimer: null,
    audioState: 'stopped',
    audioPlaying: false,
    currentPlayingMrn: null,
    socket: null,
    currentRoom: null,
    SERVER_URL: null,
  };

  // =====================================================================================
  //  UTILS
  // =====================================================================================
  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeTextBlock(v) {
    return String(v ?? '').replace(/\r\n/g, '\n').trim();
  }

  function normalizeTemplateId(v) {
    const s = String(v ?? '').trim();
    return s ? s : CONFIG.SOAP_NOTE_TEMPLATE_ID;
  }

  function templateIdToApiValue(v) {
    const n = Number(normalizeTemplateId(v));
    return Number.isFinite(n) && n > 0 ? n : Number(CONFIG.SOAP_NOTE_TEMPLATE_ID);
  }

  function safeJsonParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  function clampNumber(n, fallback = 0) {
    const v = Number(n);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  }

  function isMedicationSectionName(name) {
    return /\bmedication|medicine|med\b/i.test(name);
  }

  async function apiGetJson(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json();
  }

  function fmtDate(dt) {
    if (!dt) return 'N/A';
    const d = new Date(dt);
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString();
  }

  function escapeHtmlEhr(str) {
    return String(str ?? 'N/A')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function unwrapFirstObjectResponse(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (Array.isArray(raw)) return raw[0] || null;
    return raw;
  }

  // =====================================================================================
  //  HISTORY STORAGE (localStorage, keyed by rhea)
  // =====================================================================================
  function saveHistory(items) {
    try { localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(items)); } catch { }
  }

  function loadHistory() {
    return safeJsonParse(localStorage.getItem(CONFIG.HISTORY_KEY), []);
  }

  function saveActiveItemId(id) {
    try { localStorage.setItem(CONFIG.ACTIVE_ITEM_KEY, id || ''); } catch { }
  }

  function loadActiveItemId() {
    try { return localStorage.getItem(CONFIG.ACTIVE_ITEM_KEY) || ''; } catch { return ''; }
  }

  function saveLatestSoap(note) {
    try { localStorage.setItem(CONFIG.LATEST_SOAP_KEY, JSON.stringify(note || {})); } catch { }
  }

  function loadLatestSoap() {
    return safeJsonParse(localStorage.getItem(CONFIG.LATEST_SOAP_KEY), {});
  }

  function saveMedStatus(byName, lastText) {
    try { localStorage.setItem(CONFIG.MED_AVAIL_KEY, JSON.stringify({ byName, lastText })); } catch { }
  }

  function loadMedStatus() {
    return safeJsonParse(localStorage.getItem(CONFIG.MED_AVAIL_KEY), { byName: {}, lastText: '' });
  }

  // History item structure:
  // { id, from, to, text (raw transcript — stored internally, never shown), timestamp, templateId, templateLabel, note: { templateId, data } }
  function normalizeHistoryItems(items) {
    if (!Array.isArray(items)) return [];
    return items.filter(Boolean).map((x) => ({
      id: String(x.id || uid()),
      from: x.from || '',
      to: x.to || 'AIERIA',
      text: x.text || '',
      timestamp: x.timestamp || Date.now(),
      templateId: x.templateId || '',
      templateLabel: x.templateLabel || '',
      note: x.note || null,
    }));
  }

  function getActiveHistoryContext() {
    const hist = normalizeHistoryItems(loadHistory());
    const activeId = loadActiveItemId();
    let index = hist.findIndex((x) => x.id === activeId);
    if (index === -1 && hist.length) index = hist.length - 1;
    const item = hist[index] ?? null;
    return { hist, index, item };
  }

  function getActiveNoteForItem(item) {
    return item?.note || null;
  }

  function getActiveTemplateIdForItem(item) {
    return item?.note?.templateId || item?.templateId || CONFIG.SOAP_NOTE_TEMPLATE_ID;
  }

  function setActiveNoteDataForItem(item, data) {
    if (!item) return;
    item.note = item.note || {};
    item.note.data = data;
  }

  function setActiveTemplateIdForItem(item, tid) {
    if (!item) return;
    item.templateId = tid;
    item.note = item.note || {};
    item.note.templateId = tid;
  }

  function deleteHistoryItem(id) {
    const hist = normalizeHistoryItems(loadHistory()).filter((x) => x.id !== id);
    saveHistory(hist);
    if (loadActiveItemId() === id) {
      const last = hist[hist.length - 1];
      saveActiveItemId(last?.id || '');
    }
  }

  // =====================================================================================
  //  NOTE HISTORY PANEL
  // =====================================================================================
  function getTemplateLabelForItem(item) {
    if (item.templateLabel) return item.templateLabel;
    if (item.templateId && dom.templateSelect) {
      const opt = Array.from(dom.templateSelect.options).find((o) => o.value === item.templateId);
      if (opt) return opt.textContent;
    }
    if (item.note?.templateId && dom.templateSelect) {
      const opt = Array.from(dom.templateSelect.options).find((o) => o.value === item.note.templateId);
      if (opt) return opt.textContent;
    }
    return 'Note';
  }

  function renderNoteHistoryList() {
    const list = document.getElementById('rheaNoteHistoryList');
    if (!list) return;

    const hist = normalizeHistoryItems(loadHistory());
    list.innerHTML = '';

    if (!hist.length) {
      list.innerHTML = '<div class="rhea-nh-empty">No notes yet.</div>';
      return;
    }

    const activeId = loadActiveItemId();
    const reversed = [...hist].reverse();

    reversed.forEach((item) => {
      const label = getTemplateLabelForItem(item);
      const time = item.timestamp
        ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

      const el = document.createElement('div');
      el.className = 'rhea-nh-item' + (item.id === activeId ? ' active' : '');
      el.dataset.id = item.id;
      el.innerHTML =
        '<div class="rhea-nh-item-title">' + escapeHtml(label) + '</div>' +
        '<div class="rhea-nh-item-meta">' + escapeHtml(time) + '</div>' +
        '<button class="rhea-nh-delete" title="Delete note" data-id="' + escapeHtml(item.id) + '">&times;</button>';

      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('rhea-nh-delete')) {
          e.stopPropagation();
          handleDeleteHistoryItem(item.id);
          return;
        }
        saveActiveItemId(item.id);
        const noteData = item.note?.data || {};
        state.latestSoapNote = noteData;
        saveLatestSoap(state.latestSoapNote);
        syncDropdownToActiveItem(item);
        renderSoapNote(state.latestSoapNote);
        renderNoteHistoryList();
        renderAiDiagnosisUi();
      });

      list.appendChild(el);
    });
  }

  function handleDeleteHistoryItem(id) {
    const Swal2 = getSwal();
    if (Swal2) {
      Swal2.fire({
        title: 'Delete note?',
        text: 'This will permanently remove this note from history.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
        reverseButtons: true,
      }).then((res) => {
        if (!res.isConfirmed) return;
        deleteHistoryItem(id);
        const ctx = getActiveHistoryContext();
        if (ctx.item) {
          const noteData = ctx.item.note?.data || {};
          state.latestSoapNote = noteData;
          saveLatestSoap(state.latestSoapNote);
          syncDropdownToActiveItem(ctx.item);
          renderSoapNote(state.latestSoapNote);
        } else {
          state.latestSoapNote = {};
          saveLatestSoap({});
          renderSoapBlank();
          if (dom.templateSelect) dom.templateSelect.value = '';
          clearAiDiagnosisPaneUi();
        }
        renderNoteHistoryList();
        renderAiDiagnosisUi();
      });
    } else {
      if (!confirm('Delete this note?')) return;
      deleteHistoryItem(id);
      renderNoteHistoryList();
    }
  }

  // =====================================================================================
  //  SOAP BLANK / ERROR
  // =====================================================================================
  function soapContainerEnsure() {
    let sc = document.getElementById('soapScroller');
    if (!sc) {
      sc = document.createElement('div');
      sc.id = 'soapScroller';
      sc.className = 'scribe-soap-scroll scribe-scroll';
      const pane = document.getElementById('soapPane');
      if (pane) pane.insertBefore(sc, pane.querySelector('#soapActions'));
    }
    return sc;
  }

  function renderSoapBlank() {
    const scroller = soapContainerEnsure();
    scroller.innerHTML = '<div class="scribe-ai-center"><div class="scribe-ai-empty">No note generated yet. Start or select a transcription.</div></div>';
    updateTotalsAndEhrState();
  }

  function renderSoapNoteError(msg) {
    state.soapGenerating = false;
    stopSoapGenerationTimer();
    const scroller = soapContainerEnsure();
    scroller.innerHTML = `<div class="scribe-ai-center"><div class="scribe-ai-error">${escapeHtml(msg)}</div></div>`;
    updateTotalsAndEhrState();
  }

  // =====================================================================================
  //  TIMERS
  // =====================================================================================
  function startSoapGenerationTimer() {
    stopSoapGenerationTimer();
    state.soapGenerating = true;
    state.soapNoteTimer = setInterval(() => {
      const scroller = soapContainerEnsure();
      const elapsed = Math.round((Date.now() - (state.soapNoteStartTime || Date.now())) / 1000);
      scroller.innerHTML = `<div class="scribe-ai-center"><div class="scribe-ai-empty">Generating note... ${elapsed}s</div></div>`;
    }, 1000);
    state.soapNoteStartTime = Date.now();
    const scroller = soapContainerEnsure();
    scroller.innerHTML = `<div class="scribe-ai-center"><div class="scribe-ai-empty">Generating note... 0s</div></div>`;
  }

  function stopSoapGenerationTimer() {
    if (state.soapNoteTimer) { clearInterval(state.soapNoteTimer); state.soapNoteTimer = null; }
    state.soapGenerating = false;
  }

  function startSummaryTimer() {
    state.summaryGenerating = true;
    state.summaryTimer = setInterval(() => {
      const elapsed = Math.round((Date.now() - (state.summaryStartTime || Date.now())) / 1000);
      if (dom.noteDetail) dom.noteDetail.innerHTML = `<div class="text-gray-400 text-sm">Generating summary... ${elapsed}s</div>`;
    }, 1000);
    state.summaryStartTime = Date.now();
    if (dom.noteDetail) dom.noteDetail.innerHTML = `<div class="text-gray-400 text-sm">Generating summary... 0s</div>`;
  }

  function stopSummaryTimer() {
    if (state.summaryTimer) { clearInterval(state.summaryTimer); state.summaryTimer = null; }
    state.summaryGenerating = false;
  }

  function startAiDiagnosisTimer() {
    state.aiDiagnosisTimer = setInterval(() => {
      const elapsed = Math.round((Date.now() - (state.aiDiagnosisStartTime || Date.now())) / 1000);
      if (dom.aiDiagnosisBody) dom.aiDiagnosisBody.innerHTML = `<div class="scribe-ai-center"><div class="scribe-ai-empty">Generating AI diagnosis... ${elapsed}s</div></div>`;
    }, 1000);
    state.aiDiagnosisStartTime = Date.now();
  }

  function stopAiDiagnosisTimer() {
    if (state.aiDiagnosisTimer) { clearInterval(state.aiDiagnosisTimer); state.aiDiagnosisTimer = null; }
  }

  // =====================================================================================
  //  TEMPLATE DROPDOWN
  // =====================================================================================
  function setTemplateSelectValue(tid) {
    if (!dom.templateSelect || !tid) return;
    const opt = Array.from(dom.templateSelect.options).find((o) => o.value === String(tid));
    if (opt) dom.templateSelect.value = opt.value;
  }

  function syncDropdownToActiveItem(item) {
    if (!item) return;
    const tid = getActiveTemplateIdForItem(item);
    setTemplateSelectValue(tid);
  }

  async function initTemplateDropdown() {
    if (!dom.templateSelect) return;

    dom.templateSelect.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = 'Select note type...'; ph.disabled = true; ph.selected = true;
    dom.templateSelect.appendChild(ph);

    const optSoap = document.createElement('option');
    optSoap.value = CONFIG.SOAP_NOTE_TEMPLATE_ID;
    optSoap.textContent = 'SOAP Note';
    dom.templateSelect.appendChild(optSoap);

    const SERVER_URL = getServerUrl();
    try {
      const resp = await fetch(`${SERVER_URL}/api/templates`, { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json();
        const templates = data.templates || [];
        state.templateKeywords.clear();
        templates.forEach((t) => {
          const id = String(t.id);
          const exists = Array.from(dom.templateSelect.options).some((o) => o.value === id);
          if (exists) return;
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = t.name || t.short_name || `Template ${t.id}`;
          dom.templateSelect.appendChild(opt);
          const keywords = [];
          if (t.name) keywords.push(t.name);
          if (t.short_name && t.short_name !== t.name) keywords.push(t.short_name);
          if (keywords.length) state.templateKeywords.set(id, keywords);
        });
        state.templateKeywords.set(CONFIG.SOAP_NOTE_TEMPLATE_ID, ['soap note', 'soap', 'subjective objective assessment plan']);
        state.templatesLoaded = true;
      }
    } catch { }

    dom.templateSelect.onchange = () => {
      const ctx = getActiveHistoryContext();
      if (!ctx.item) return;
      const selectedTemplateId = dom.templateSelect.value || CONFIG.SOAP_NOTE_TEMPLATE_ID;
      applyTemplateToActiveTranscript(selectedTemplateId);
    };

    const ctx = getActiveHistoryContext();
    if (ctx.item) syncDropdownToActiveItem(ctx.item);
  }

  function matchTemplateByKeywords(text) {
    if (!text || state.templateKeywords.size === 0) return null;
    const normalizedText = text.toLowerCase().trim();
    for (const [templateId, keywords] of state.templateKeywords.entries()) {
      for (const keyword of keywords) {
        if (normalizedText.includes(keyword.toLowerCase().trim())) return templateId;
      }
    }
    return null;
  }

  function autoDetectFromTranscript(text) {
    const result = { mrn: null, noteType: null };
    const mrnMatch = text.match(/\bMRN[:\s#-]*([A-Z0-9-]{4,20})/i);
    if (mrnMatch) result.mrn = mrnMatch[1].trim();
    if (state.templatesLoaded) result.noteType = matchTemplateByKeywords(text);
    return result;
  }

  // =====================================================================================
  //  SERVER URL
  // =====================================================================================
  function getServerUrl() {
    if (state.SERVER_URL) return state.SERVER_URL;
    const isLocal =
      location.protocol === 'file:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
    return isLocal ? 'http://localhost:8080' : 'https://xr-messaging-geexbheshbghhab7.centralindia-01.azurewebsites.net';
  }

  // =====================================================================================
  //  SWAL
  // =====================================================================================
  function getSwal() {
    const S = window.Swal;
    if (!S || typeof S.fire !== 'function') return null;
    return S;
  }

  function swalConfirmSaveToEhr() {
    const Swal2 = getSwal();
    if (!Swal2) return Promise.resolve({ isConfirmed: false });
    return Swal2.fire({
      title: 'Save to EHR?',
      text: 'This will save the current template note to the patient\'s EHR.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Save',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      allowOutsideClick: false,
      allowEscapeKey: false,
      focusConfirm: true,
    });
  }

  function swalSuccessSaved(noteId) {
    const Swal2 = getSwal();
    if (!Swal2) return Promise.resolve({});
    return Swal2.fire({
      title: 'Saved',
      text: 'Template note saved to EHR successfully.',
      icon: 'success',
      confirmButtonText: 'OK',
      allowOutsideClick: false,
      allowEscapeKey: false,
      focusConfirm: true,
    });
  }

  function swalError(msg) {
    const Swal2 = getSwal();
    if (!Swal2) return Promise.resolve({});
    return Swal2.fire({
      title: 'Error',
      text: String(msg || 'Failed to save to EHR.'),
      icon: 'error',
      confirmButtonText: 'OK',
      allowOutsideClick: false,
      allowEscapeKey: false,
      focusConfirm: true,
    });
  }

  // =====================================================================================
  //  EDIT TRACKING / SOAP UTILITIES
  // =====================================================================================
  function autoExpandTextarea(box) {
    box.style.height = 'auto';
    box.style.height = Math.min(box.scrollHeight, 220) + 'px';
  }

  function rebaseBoxStateToCurrent(box) {
    const s = state.editStateMap.get(box) || {};
    s.aiText = box.value;
    s.editCount = 0;
    state.editStateMap.set(box, s);
  }

  function attachEditTrackingToTextarea(box, aiText) {
    state.editStateMap.set(box, { aiText: aiText || box.value, editCount: 0 });

    box.addEventListener('input', () => {
      autoExpandTextarea(box);
      const s = state.editStateMap.get(box) || {};
      const current = box.value;
      const diff = Math.abs(current.length - (s.aiText || '').length);
      const edits = Math.max(s.editCount || 0, diff > 0 ? (s.editCount || 0) + 1 : s.editCount || 0);
      state.editStateMap.set(box, { ...s, editCount: edits });

      const section = box.dataset.section;
      const headMeta = document.querySelector(`.scribe-section[data-section="${CSS.escape(section)}"] .scribe-section-meta`);
      if (headMeta) headMeta.textContent = `Edits: ${edits}`;

      persistActiveNoteFromUI();
      updateTotalsAndEhrState();
    });
  }

  function getTotalEditsFromNote(note) {
    const scroller = soapContainerEnsure();
    let total = 0;
    scroller.querySelectorAll('textarea[data-section]').forEach((ta) => {
      const s = state.editStateMap.get(ta);
      total += clampNumber(s?.editCount, 0);
    });
    return total;
  }

  function resetAllEditCountersToZero() {
    const scroller = soapContainerEnsure();
    scroller.querySelectorAll('textarea[data-section]').forEach((ta) => {
      const s = state.editStateMap.get(ta) || {};
      state.editStateMap.set(ta, { ...s, editCount: 0 });
      ta.dataset.editCount = '0';
      const section = ta.dataset.section;
      const headMeta = document.querySelector(`.scribe-section[data-section="${CSS.escape(section)}"] .scribe-section-meta`);
      if (headMeta) headMeta.textContent = 'Edits: 0';
    });
  }

  function getSoapSections(note) {
    if (!note) return [];
    return Object.keys(note).filter((k) => !k.startsWith('_') && typeof note[k] !== 'object' || Array.isArray(note[k]));
  }

  function isTemplateDrivenNoteEligible(note) {
    return !!(note && note._rowsForPatientNoteInsert && Array.isArray(note._rowsForPatientNoteInsert) && note._rowsForPatientNoteInsert.length > 0);
  }

  function syncTemplateRowsFromSections(note) {
    if (!note || typeof note !== 'object') return note;
    const templateId = note._templateMeta?.id ?? note._templateId ?? null;
    if (!templateId) return note;

    const rows = [];
    const sections = getSoapSections(note);
    sections.forEach((section) => {
      const rawVal = note[section];
      const text = Array.isArray(rawVal) ? rawVal.join('\n') : String(rawVal ?? '');
      rows.push({ section, text, template_component_mapping_id: null, mapping_id: null });
    });

    note._rowsForPatientNoteInsert = rows;
    return note;
  }

  function initializeEditMetaForSoap(note) {
    if (!note) return;
    note._aiMeta = {};
    const sections = getSoapSections(note);
    sections.forEach((section) => {
      const rawVal = note[section];
      const text = Array.isArray(rawVal) ? rawVal.join('\n') : String(rawVal ?? '');
      note._aiMeta[section] = { text };
    });
  }

  function persistActiveNoteFromUI() {
    const scroller = soapContainerEnsure();
    const note = state.latestSoapNote || {};
    scroller.querySelectorAll('textarea[data-section]').forEach((ta) => {
      note[ta.dataset.section] = ta.value;
    });
    state.latestSoapNote = note;
    saveLatestSoap(note);

    const ctx = getActiveHistoryContext();
    if (ctx.item) {
      ctx.item.note = ctx.item.note || {};
      ctx.item.note.data = note;
      ctx.hist[ctx.index] = ctx.item;
      saveHistory(ctx.hist);
    }
  }

  // =====================================================================================
  //  TOTAL EDITS BADGE + EHR BUTTON STATE
  // =====================================================================================
  function updateTotalsAndEhrState() {
    const scroller = soapContainerEnsure();
    let total = 0;
    scroller.querySelectorAll('textarea[data-section]').forEach((ta) => {
      const s = state.editStateMap.get(ta);
      total += clampNumber(s?.editCount, 0);
    });

    const slot = dom.totalEditsSlot;
    if (slot) {
      if (total > 0) {
        slot.innerHTML = `<span class="_scribe_total_edits">Total Edits: ${total}</span>`;
      } else {
        slot.innerHTML = '';
      }
    }

    const btn = dom.btnAddEhr;
    if (btn) {
      const note = state.latestSoapNote || {};
      const hasContent = getSoapSections(note).some((s) => {
        const v = note[s];
        return normalizeTextBlock(Array.isArray(v) ? v.join('\n') : v);
      });
      const eligible = isTemplateDrivenNoteEligible(note) || hasContent;
      btn.disabled = !eligible || state.addEhrInFlight;
      btn.className = eligible && !state.addEhrInFlight
        ? 'scribe-btn scribe-add-ehr-enabled'
        : 'scribe-btn scribe-add-ehr-disabled';
    }
  }

  // =====================================================================================
  //  AI DIAGNOSIS PANE
  // =====================================================================================
  function clearAiDiagnosisPaneUi() {
    if (dom.aiDiagnosisBody) {
      dom.aiDiagnosisBody.innerHTML = '<div class="scribe-ai-empty">AI diagnosis not available yet.</div>';
    }
  }

  function renderDiagnosisSectionsHtml(sections) {
    if (!Array.isArray(sections) || !sections.length) return '<div class="scribe-ai-empty">No diagnosis data.</div>';
    return sections.map((s) => {
      const title = escapeHtml(s.component || s.title || s.section || '');
      const body = escapeHtml(String(s.text || s.content || ''));
      return `<div class="scribe-ai-section"><div class="scribe-ai-section-title">${title}</div><div class="scribe-ai-section-body">${body}</div></div>`;
    }).join('');
  }

  function getRenderableDiagnosisSections(data) {
    if (!data) return [];
    if (Array.isArray(data.sections) && data.sections.length) return data.sections;
    if (Array.isArray(data)) return data;
    return [];
  }

  function renderAiDiagnosisUi(diagData) {
    if (!dom.aiDiagnosisBody) return;

    if (state.aiDiagnosisInFlight) {
      dom.aiDiagnosisBody.innerHTML = '<div class="scribe-ai-center"><div class="scribe-ai-empty">Generating AI diagnosis...</div></div>';
      return;
    }

    if (state.aiDiagnosisLastError) {
      dom.aiDiagnosisBody.innerHTML = `<div class="scribe-ai-center"><div class="scribe-ai-error">${escapeHtml(state.aiDiagnosisLastError)}</div></div>`;
      return;
    }

    if (diagData) {
      const sections = getRenderableDiagnosisSections(diagData);
      dom.aiDiagnosisBody.innerHTML = sections.length
        ? renderDiagnosisSectionsHtml(sections)
        : '<div class="scribe-ai-empty">No diagnosis data returned.</div>';
      return;
    }

    clearAiDiagnosisPaneUi();
  }

  // =====================================================================================
  //  SOAP NOTE RENDER
  // =====================================================================================
  function renderSoapNote(soap) {
    if (state.soapGenerating) return;

    const scroller = soapContainerEnsure();
    scroller.innerHTML = '';

    if (!soap || !Object.keys(soap).length || soap._aiMeta && !Object.keys(soap).filter((k) => !k.startsWith('_')).length) {
      renderSoapBlank();
      return;
    }

    state.latestSoapNote = soap || {};
    state.latestSoapNote = syncTemplateRowsFromSections(state.latestSoapNote);
    saveLatestSoap(state.latestSoapNote);

    const sections = getSoapSections(state.latestSoapNote);
    sections.forEach((section) => {
      const wrap = document.createElement('div');
      wrap.className = 'scribe-section';
      wrap.dataset.section = section;

      const head = document.createElement('div');
      head.className = 'scribe-section-head';

      const h = document.createElement('h3');
      h.textContent = section;

      const metaSpan = document.createElement('div');
      metaSpan.className = 'scribe-section-meta';
      metaSpan.textContent = 'Edits: 0';

      head.appendChild(h);
      head.appendChild(metaSpan);
      wrap.appendChild(head);

      const box = document.createElement('textarea');
      box.className = 'scribe-textarea';
      box.readOnly = false;
      box.dataset.section = section;

      const rawVal = state.latestSoapNote[section];
      const contentText = Array.isArray(rawVal) ? rawVal.join('\n') : typeof rawVal === 'string' ? rawVal : '';
      box.value = contentText;
      autoExpandTextarea(box);

      const aiText = state.latestSoapNote._aiMeta?.[section]?.text ?? contentText;
      attachEditTrackingToTextarea(box, aiText);

      wrap.appendChild(box);
      scroller.appendChild(wrap);
    });

    updateTotalsAndEhrState();
    scroller.scrollTop = 0;
  }

  // =====================================================================================
  //  NOTE GENERATION
  // =====================================================================================
  async function requestNoteGenerationForActiveTranscript(templateId) {
    const ctx = getActiveHistoryContext();
    if (!ctx.item) return;

    const transcript = String(ctx.item.text || '').trim();
    if (!transcript) return;

    const tid = normalizeTemplateId(templateId);
    setActiveTemplateIdForItem(ctx.item, tid);
    ctx.hist[ctx.index] = ctx.item;
    saveHistory(ctx.hist);
    saveActiveItemId(ctx.item.id);

    startSoapGenerationTimer();
    const SERVER_URL = getServerUrl();

    try {
      const resp = await fetch(`${SERVER_URL}/api/notes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ transcript, templateId: templateIdToApiValue(tid) }),
      });

      if (!resp.ok) {
        stopSoapGenerationTimer();
        renderSoapNoteError(`Server returned ${resp.status} ${resp.statusText || ''}`);
        return;
      }

      const data = await resp.json();
      const note = data.note || {};
      initializeEditMetaForSoap(note);
      syncTemplateRowsFromSections(note);

      setActiveNoteDataForItem(ctx.item, note);
      setActiveTemplateIdForItem(ctx.item, tid);

      const optLabel = Array.from(dom.templateSelect?.options || []).find((o) => o.value === tid)?.textContent || '';
      if (optLabel) ctx.item.templateLabel = optLabel;

      ctx.hist[ctx.index] = ctx.item;
      saveHistory(ctx.hist);

      stopSoapGenerationTimer();
      state.latestSoapNote = note;
      saveLatestSoap(state.latestSoapNote);

      renderSoapNote(state.latestSoapNote);
      syncDropdownToActiveItem(ctx.item);
      renderNoteHistoryList();
      renderAiDiagnosisUi();
    } catch (e) {
      stopSoapGenerationTimer();
      renderSoapNoteError(String(e?.message || e));
    }
  }

  async function applyTemplateToActiveTranscript(newTemplateId) {
    const templateId = normalizeTemplateId(newTemplateId);
    setTemplateSelectValue(templateId);
    state.latestSoapNote = {};
    renderSoapBlank();
    clearAiDiagnosisPaneUi();
    await requestNoteGenerationForActiveTranscript(templateId);
  }

  // =====================================================================================
  //  AI DIAGNOSIS GENERATION
  // =====================================================================================
  function buildNoteSectionsPayload(note) {
    try {
      const sections = getSoapSections(note || {});
      const out = [];
      for (const section of sections) {
        const raw = note[section];
        const text = normalizeTextBlock(Array.isArray(raw) ? raw.join('\n') : raw);
        if (!text) continue;
        out.push({ component: section, text });
      }
      return out;
    } catch { return []; }
  }

  function getCachedSummaryTextForMrn(mrn) {
    if (!mrn) return '';
    const cached = state.summaryCacheByMrn.get(String(mrn).trim());
    return cached?.text || '';
  }

  async function generateAiDiagnosisForActiveTranscript() {
    const ctx = getActiveHistoryContext();
    if (!ctx.item) return;

    try { persistActiveNoteFromUI(); } catch { }

    if (state.aiDiagnosisInFlight) return;

    const noteData = ctx.item.note?.data || state.latestSoapNote || {};
    const noteSections = buildNoteSectionsPayload(noteData);
    const mrn = String(state.currentPatient?.mrn_no || '').trim() || null;
    const summaryText = mrn ? getCachedSummaryTextForMrn(mrn) : '';
    const templateId = getActiveTemplateIdForItem(ctx.item);

    if (!noteSections.length && !summaryText) {
      state.aiDiagnosisLastError = 'AI does not have enough data to provide diagnosis.';
      renderAiDiagnosisUi();
      return;
    }

    state.aiDiagnosisInFlight = true;
    state.aiDiagnosisLastError = null;
    startAiDiagnosisTimer();
    renderAiDiagnosisUi();

    const SERVER_URL = getServerUrl();

    try {
      const res = await fetch(`${SERVER_URL}${CONFIG.AI_DIAGNOSIS_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mrn,
          transcript_id: ctx.item.id,
          template_id: templateIdToApiValue(templateId),
          note_sections: noteSections,
          summary_text: summaryText || null,
        }),
      });

      const raw = await res.json().catch(() => ({}));
      const data = unwrapFirstObjectResponse(raw) || {};

      if (!res.ok) throw new Error(data?.error || `Failed to generate AI diagnosis (${res.status})`);

      const sections = getRenderableDiagnosisSections(data);
      if (!sections.length) throw new Error('AI diagnosis response was empty. Please try again.');

      stopAiDiagnosisTimer();
      state.aiDiagnosisInFlight = false;
      state.aiDiagnosisLastError = null;
      renderAiDiagnosisUi(data);
    } catch (e) {
      stopAiDiagnosisTimer();
      state.aiDiagnosisInFlight = false;
      state.aiDiagnosisLastError = String(e?.message || e);
      renderAiDiagnosisUi();
    }
  }

  // =====================================================================================
  //  TRANSCRIPT APPEND (raw hidden from UI, stored internally)
  // =====================================================================================
  async function appendTranscriptItem({ from, to, text, timestamp }) {
    if (!text) return;

    const textStr = String(text || '').trim();
    const item = {
      id: uid(),
      from: from || 'Provider',
      to: to || 'AIERIA',
      text: textStr,
      timestamp: timestamp || Date.now(),
      templateId: '',
      templateLabel: '',
      note: null,
    };

    const hist = normalizeHistoryItems(loadHistory());
    hist.push(item);
    saveHistory(hist);
    saveActiveItemId(item.id);

    state.latestSoapNote = {};
    renderSoapBlank();
    clearAiDiagnosisPaneUi();

    renderNoteHistoryList();
    openPanel();

    const detected = autoDetectFromTranscript(textStr);

    if (detected.mrn) {
      if (dom.mrnInput) dom.mrnInput.value = detected.mrn;
      await searchPatientByMrn(detected.mrn);
    }

    if (detected.noteType) {
      const templateId = detected.noteType;
      setTemplateSelectValue(templateId);
      const optLabel = Array.from(dom.templateSelect?.options || []).find((o) => o.value === templateId)?.textContent || '';
      item.templateId = templateId;
      item.templateLabel = optLabel;
      const h2 = normalizeHistoryItems(loadHistory());
      const idx2 = h2.findIndex((x) => x.id === item.id);
      if (idx2 !== -1) { h2[idx2] = item; saveHistory(h2); }
      renderNoteHistoryList();
      await applyTemplateToActiveTranscript(templateId);
    } else {
      renderSoapBlank();
      clearAiDiagnosisPaneUi();
    }
  }

  async function handleTranscript(payload) {
    if (!payload?.text || !payload?.final) return;
    await appendTranscriptItem(payload);
  }

  // =====================================================================================
  //  PANEL OPEN/CLOSE
  // =====================================================================================
  const panelToggleBtn = document.getElementById('rheaPanelToggle');

  function openPanel() {
    if (!dom.panelRoot) return;
    dom.panelRoot.classList.add('active');
    if (panelToggleBtn) panelToggleBtn.textContent = '›';
    panelToggleBtn?.setAttribute('aria-expanded', 'true');
  }

  function syncPanelUi() {
    if (!dom.panelRoot) return;
    const open = dom.panelRoot.classList.contains('active');
    if (panelToggleBtn) {
      panelToggleBtn.textContent = open ? '›' : '‹';
      panelToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  if (panelToggleBtn) {
    panelToggleBtn.addEventListener('click', () => {
      if (!dom.panelRoot) return;
      dom.panelRoot.classList.toggle('active');
      syncPanelUi();
    });
  }

  // =====================================================================================
  //  EHR SIDEBAR
  // =====================================================================================
  function renderPatient(p) {
    if (dom.ehrInitialState) dom.ehrInitialState.style.display = 'none';
    if (dom.ehrPatientState) dom.ehrPatientState.style.display = 'flex';
    if (dom.patientNameDisplay) dom.patientNameDisplay.textContent = p.full_name || 'N/A';
    if (dom.patientMRNDisplay) dom.patientMRNDisplay.textContent = p.mrn_no || 'N/A';
    if (dom.patientEmailDisplay) dom.patientEmailDisplay.textContent = p.email || 'N/A';
    if (dom.patientMobileDisplay) dom.patientMobileDisplay.textContent = p.contact_no_primary || 'N/A';
  }

  function setActiveNote(noteId) {
    document.querySelectorAll('.ehr-note-item').forEach((el) => el.classList.remove('active'));
    const items = [...document.querySelectorAll('.ehr-note-item')];
    const active = items.find(
      (el) => el.dataset.noteId == noteId || (noteId === CONFIG.SUMMARY_NOTE_ID && el.textContent === 'Summary')
    );
    if (active) active.classList.add('active');
  }

  function renderClinicalNotes(notes) {
    if (!dom.notesList) return;
    dom.notesList.innerHTML = '';
    dom.notesList.classList.add('ehr-notes-scroll');

    const summary = document.createElement('div');
    summary.className = 'ehr-note-item';
    summary.textContent = 'Summary';
    summary.onclick = () => { setActiveNote(CONFIG.SUMMARY_NOTE_ID); loadSummary(); };
    dom.notesList.appendChild(summary);

    notes.forEach((note) => {
      const item = document.createElement('div');
      item.className = 'ehr-note-item';
      item.dataset.noteId = note.note_id;
      const fullName = (note.template || note.full_name || note.long_name || note.short_name || 'Clinical Note').toString();
      const dateLine = fmtDate(note.document_created_date);
      item.title = `${fullName}\n${dateLine}`;
      item.textContent = note.short_name || 'Clinical Note';
      item.onclick = () => { setActiveNote(note.note_id); loadNote(note.note_id); };
      dom.notesList.appendChild(item);
    });
  }

  function renderNoteDetail(template, createdDate, sections, isSummary) {
    if (!dom.noteDetail) return;
    let html = '';
    if (!isSummary) {
      html += `<div style="font-size:12px;font-weight:600;margin-bottom:12px;">DATE: ${escapeHtmlEhr(fmtDate(createdDate))}</div>`;
    }
    html += `<div style="text-align:center;font-size:18px;font-weight:800;margin-top:22px;margin-bottom:20px;">${escapeHtmlEhr(template)}</div>`;
    (sections || []).forEach((s) => {
      html += `<div style="margin-bottom:18px;"><div style="font-weight:700;margin-bottom:6px;">${escapeHtmlEhr(s.component)}</div><div>${escapeHtmlEhr(s.text || 'N/A')}</div></div>`;
    });
    dom.noteDetail.innerHTML = html;
  }

  async function loadNote(noteId) {
    if (!dom.noteDetail) return;
    dom.noteDetail.innerHTML = `<div class="text-gray-400 text-sm">Loading...</div>`;
    const SERVER_URL = getServerUrl();
    if (state.noteCache.has(noteId)) {
      const cached = state.noteCache.get(noteId);
      renderNoteDetail(cached.note.template, cached.note.document_created_date, cached.sections, false);
      return;
    }
    try {
      const data = await apiGetJson(`${SERVER_URL}/ehr/notes/${noteId}`);
      state.noteCache.set(noteId, data);
      renderNoteDetail(data.note?.template || 'Clinical Note', data.note?.document_created_date, data.sections || [], false);
    } catch {
      dom.noteDetail.innerHTML = `<div class="text-red-500 text-sm">Failed to load note</div>`;
    }
  }

  function renderSummaryDetail(summaryText, title = 'AI Summary Note') {
    if (!dom.noteDetail) return;
    const raw = String(summaryText ?? '').trim();
    const normalized = raw.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const paragraphs = (normalized ? normalized.split(/\n\s*\n/) : []).map((p) => p.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
    const bodyHtml = (paragraphs.length ? paragraphs : ['N/A']).map((p) => `<p style="margin:0 0 14px 0;">${escapeHtmlEhr(p)}</p>`).join('');

    dom.noteDetail.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;">
        <div style="flex:0 0 auto;padding:12px 14px;text-align:center;font-size:18px;font-weight:800;color:#FFFFFF;display:flex;align-items:center;justify-content:center;gap:12px;">
          ${escapeHtmlEhr(title || 'AI Summary Note')}
          <button id="speakerBtn" style="background:#2563eb;border:none;border-radius:8px;color:#fff;cursor:pointer;padding:8px 12px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px;transition:background 0.2s;" title="Play summary audio on device">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
            Play
          </button>
        </div>
        <div style="flex:1 1 auto;min-height:0;overflow-y:auto;padding:14px;color:#FFFFFF;">
          <div style="max-width:760px;margin:0 auto;font-size:14px;line-height:1.8;text-align:justify;">${bodyHtml}</div>
        </div>
      </div>`;

    const speakerBtn = document.getElementById('speakerBtn');
    if (speakerBtn) {
      speakerBtn.onmouseover = () => speakerBtn.style.background = '#1d4ed8';
      speakerBtn.onmouseout = () => speakerBtn.style.background = '#2563eb';
      speakerBtn.onclick = () => playSummaryAudio(raw);
    }
  }

  async function playSummaryAudio(text) {
    if (state.audioPlaying) {
      const Swal2 = getSwal();
      if (Swal2) Swal2.fire({ icon: 'warning', title: 'Audio Playing', text: 'Please wait for current audio to finish.', timer: 2000 });
      return;
    }

    let textToSend = typeof text === 'object' && text !== null
      ? (text.text || text.content || JSON.stringify(text))
      : text;
    textToSend = String(textToSend || '').trim();

    if (!textToSend) {
      const Swal2 = getSwal();
      if (Swal2) Swal2.fire({ icon: 'error', title: 'No Content', text: 'No summary text available to play.' });
      return;
    }

    const speakerBtn = document.getElementById('speakerBtn');
    if (speakerBtn) {
      speakerBtn.disabled = true;
      speakerBtn.style.opacity = '0.6';
      speakerBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Generating...`;
    }

    const SERVER_URL = getServerUrl();

    try {
      const res = await fetch(`${SERVER_URL}/ehr/ai/text-to-speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: textToSend }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to generate audio');

      const socket = state.socket || window.RheaSocket;
      if (socket && socket.connected) {
        if (speakerBtn) {
          speakerBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg> Playing`;
        }
        socket.emit('play_audio_on_device', { audio: data.audio, contentType: data.contentType || 'audio/mpeg', room: state.currentRoom });
        state.audioState = 'playing';
        state.audioPlaying = true;
        state.currentPlayingMrn = state.currentPatient?.mrn_no || null;
        const Swal2 = getSwal();
        if (Swal2) Swal2.fire({ icon: 'success', title: 'Audio Sent', text: 'Audio is now playing on the device.', timer: 2000 });
      } else {
        throw new Error('Not connected to server');
      }
    } catch (err) {
      const Swal2 = getSwal();
      if (Swal2) Swal2.fire({ icon: 'error', title: 'Audio Error', text: err.message || 'Failed to generate or play audio.' });
      if (speakerBtn) {
        speakerBtn.disabled = false;
        speakerBtn.style.opacity = '1';
        speakerBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg> Play`;
      }
    }
  }

  async function loadSummary(autoPlay = false) {
    if (!dom.noteDetail) return;
    if (state.summaryGenerating) return;
    const mrn = String(state.currentPatient?.mrn_no || '').trim();
    if (!mrn) { dom.noteDetail.innerHTML = `<div class="text-red-500 text-sm">MRN not selected.</div>`; return; }

    const cached = state.summaryCacheByMrn.get(mrn);
    if (cached?.text) {
      renderSummaryDetail(cached.text, cached.template_title || 'Summary Note');
      if (autoPlay) setTimeout(() => { const btn = document.getElementById('speakerBtn'); if (btn && !state.audioPlaying) btn.click(); }, 1000);
      return;
    }

    startSummaryTimer();
    const SERVER_URL = getServerUrl();
    try {
      const res = await fetch(`${SERVER_URL}/ehr/ai/summary`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ mrn, _ts: Date.now() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.message || `Failed (${res.status})`);
      stopSummaryTimer();
      state.summaryCacheByMrn.set(mrn, { text: data?.text, template_title: data?.template_title || 'Summary Note', fetchedAt: Date.now() });
      renderSummaryDetail(data?.text, data?.template_title || 'Summary Note');
      if (autoPlay) setTimeout(() => { const btn = document.getElementById('speakerBtn'); if (btn && !state.audioPlaying) btn.click(); }, 1000);
    } catch (e) {
      stopSummaryTimer();
      dom.noteDetail.innerHTML = `<div class="text-red-500 text-sm">${escapeHtmlEhr(e?.message || 'Failed to generate summary')}</div>`;
    }
  }

  async function searchPatientByMrn(mrn) {
    const m = String(mrn || '').trim();
    if (!m) return;
    if (!dom.mrnSearchButton) return;

    if (dom.ehrError) dom.ehrError.style.display = 'none';
    dom.mrnSearchButton.disabled = true;
    dom.mrnSearchButton.textContent = 'Searching...';
    state.noteCache.clear();

    const SERVER_URL = getServerUrl();
    try {
      const data = await apiGetJson(`${SERVER_URL}/ehr/patient/${encodeURIComponent(m)}`);
      state.currentPatient = data.patient || {};
      state.currentNotes = (data.notes || []).map((n) => ({
        note_id: n.note_id ?? n.patient_note_id,
        short_name: n.short_name,
        template: n.template,
        document_created_date: n.document_created_date,
      }));
      if (state.currentPatient?.mrn_no && state.currentPatient?.patient_id) {
        state.patientCacheByMrn.set(String(state.currentPatient.mrn_no).trim(), { patientId: state.currentPatient.patient_id, patient: state.currentPatient });
      }
      renderPatient(state.currentPatient);
      renderClinicalNotes(state.currentNotes);
      if (dom.noteDetail) dom.noteDetail.innerHTML = `<div class="text-gray-400 text-sm">Select a note to view details</div>`;
    } catch (e) {
      if (dom.ehrError) { dom.ehrError.textContent = e.message; dom.ehrError.style.display = 'block'; }
    } finally {
      dom.mrnSearchButton.disabled = false;
      dom.mrnSearchButton.textContent = 'Search';
    }
  }

  function openEhrSidebar() {
    if (dom.ehrSidebar) dom.ehrSidebar.classList.add('active');
    if (dom.ehrOverlay) dom.ehrOverlay.classList.add('active');
  }

  // =====================================================================================
  //  EHR SAVE FLOW
  // =====================================================================================
  function getCurrentMrnForEhrSave() {
    try {
      const fromState = String(state.currentPatient?.mrn_no || '').trim();
      if (fromState) return fromState;
      const selectors = ['#mrnInput', '#mrn', '#mrnDisplay'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const raw = (el.value ?? el.textContent ?? '').toString().trim();
        if (raw) return raw;
      }
      return '';
    } catch { return ''; }
  }

  async function fetchMeDoctorAndScribeIds() {
    if (state.me?.doctorId && state.me?.scribeId) return { doctorId: state.me.doctorId, scribeId: state.me.scribeId };
    const meRes = await fetch('/api/platform/me', { credentials: 'include' });
    if (!meRes.ok) throw new Error(`Failed to load /api/platform/me (${meRes.status})`);
    const me = await meRes.json();
    state.me = me || null;
    const doctorId = me?.doctorId ?? null;
    const scribeId = me?.scribeId ?? null;
    if (!doctorId || !scribeId) throw new Error('Missing doctorId/scribeId from /api/platform/me');
    return { doctorId, scribeId };
  }

  async function fetchPatientIdByMrn(mrn) {
    const m = String(mrn || '').trim();
    if (!m) throw new Error('MRN is empty');
    if (String(state.currentPatient?.mrn_no || '').trim() === m && state.currentPatient?.patient_id) {
      return { patientId: state.currentPatient.patient_id, patient: state.currentPatient };
    }
    if (state.patientCacheByMrn.has(m)) return state.patientCacheByMrn.get(m);
    const SERVER_URL = getServerUrl();
    const resp = await fetch(`${SERVER_URL}/ehr/patient/${encodeURIComponent(m)}`, { credentials: 'include' });
    if (!resp.ok) throw new Error(`Failed to load patient (${resp.status})`);
    const data = await resp.json();
    const p = data?.patient ?? null;
    const patientId = p?.patient_id ?? null;
    if (!patientId) throw new Error('Missing patient.patient_id from /ehr/patient/:mrn');
    const out = { patientId, patient: p };
    state.patientCacheByMrn.set(m, out);
    return out;
  }

  function buildTemplateEhrSavePayload({ patientId, doctorId, scribeId, modifiedBy, timestamp, note }) {
    const patientNoteRow = {
      patient_id: patientId, doctor_id: doctorId,
      document_created_date: timestamp, created_by: doctorId,
      modified_by: modifiedBy, modified_date: timestamp, row_status: 1,
    };
    const rows = Array.isArray(note?._rowsForPatientNoteInsert) ? note._rowsForPatientNoteInsert : [];
    const contentRows = rows.map((r) => ({
      template_component_mapping_id: r?.template_component_mapping_id ?? r?.mapping_id ?? null,
      text: String(r?.text ?? ''),
      edit_count: clampNumber(r?.edit_count ?? 0, 0),
      created_by: doctorId, modified_by: modifiedBy,
      created_date: timestamp, modified_date: timestamp, row_status: 1,
    }));
    return { doctorId, scribeId, patient_notes: patientNoteRow, patient_note_content: contentRows, template_meta: note?._templateMeta || null };
  }

  async function saveTemplateNoteToEHR(payload) {
    const SERVER_URL = getServerUrl();
    const resp = await fetch(`${SERVER_URL}/ehr/patient_notes/template`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`EHR save failed (${resp.status}): ${txt || resp.statusText || 'Unknown error'}`);
    }
    return resp.json().catch(() => ({}));
  }

  function clearActiveTranscriptAfterEhrSave() {
    const activeId = loadActiveItemId();
    if (activeId) deleteHistoryItem(activeId);
    state.latestSoapNote = {};
    saveLatestSoap({});
    state.medAvailability.clear();
    saveMedStatus({}, '');
    renderSoapBlank();
    if (dom.templateSelect) dom.templateSelect.value = '';
    clearAiDiagnosisPaneUi();
    renderNoteHistoryList();
  }

  async function refreshPatientAndNotes(mrn) {
    state.noteCache.clear();
    const mrnKey = String(mrn).trim();
    if (mrnKey && state.summaryCacheByMrn.has(mrnKey)) state.summaryCacheByMrn.delete(mrnKey);
    const SERVER_URL = getServerUrl();
    const data = await apiGetJson(`${SERVER_URL}/ehr/patient/${encodeURIComponent(mrn)}`);
    state.currentPatient = data.patient || {};
    state.currentNotes = (data.notes || []).map((n) => ({
      note_id: n.note_id ?? n.patient_note_id,
      short_name: n.short_name, template: n.template,
      document_created_date: n.document_created_date,
    }));
    if (state.currentPatient?.mrn_no && state.currentPatient?.patient_id) {
      state.patientCacheByMrn.set(String(state.currentPatient.mrn_no).trim(), { patientId: state.currentPatient.patient_id, patient: state.currentPatient });
    }
    renderPatient(state.currentPatient);
    renderClinicalNotes(state.currentNotes);
  }

  function pickLatestNoteId(notes) {
    if (!Array.isArray(notes) || !notes.length) return null;
    const sorted = notes.slice().filter((n) => n && n.note_id != null).sort((a, b) => new Date(b.document_created_date || 0) - new Date(a.document_created_date || 0));
    return sorted[0]?.note_id ?? null;
  }

  // =====================================================================================
  //  MRN AUTO-DETECTION
  // =====================================================================================
  async function automateEHRWorkflow(mrn) {
    if (state.audioState === 'playing') return;
    if (!mrn || state.mrnAutomationInProgress) return;
    if (state.mrnAutomationTimer) { clearTimeout(state.mrnAutomationTimer); state.mrnAutomationTimer = null; }
    if (state.lastProcessedMrn === mrn) return;

    state.mrnAutomationInProgress = true;
    try {
      if (!dom.ehrSidebar || !dom.mrnInput) { state.mrnAutomationInProgress = false; return; }
      if (!dom.ehrSidebar.classList.contains('active')) {
        dom.ehrSidebar.classList.add('active');
        if (dom.ehrOverlay) dom.ehrOverlay.classList.add('active');
        await new Promise((r) => setTimeout(r, 300));
      }
      if (dom.mrnInput) {
        dom.mrnInput.value = mrn;
        dom.mrnInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await new Promise((r) => setTimeout(r, 150));
      if (dom.mrnSearchButton) dom.mrnSearchButton.click();
      await new Promise((r) => setTimeout(r, CONFIG.MRN_AUTOMATION_DELAY_MS));
      const summaryTab = Array.from(document.querySelectorAll('.ehr-note-item')).find((el) => el.textContent.trim() === 'Summary');
      if (summaryTab) { setActiveNote(CONFIG.SUMMARY_NOTE_ID); await loadSummary(true); }
      state.mrnAutomationInProgress = false;
    } catch { state.mrnAutomationInProgress = false; }
  }

  // =====================================================================================
  //  BUTTON WIRING
  // =====================================================================================
  function wireSoapActionButtons() {
    if (dom.btnSave) { dom.btnSave.disabled = true; dom.btnSave.style.display = 'none'; }

    if (dom.btnClear) {
      dom.btnClear.addEventListener('click', () => {
        const scroller = soapContainerEnsure();
        scroller.querySelectorAll('textarea[data-section]').forEach((t) => {
          t.value = '';
          autoExpandTextarea(t);
          rebaseBoxStateToCurrent(t);
        });
        persistActiveNoteFromUI();
        state.medAvailability.clear();
        saveMedStatus({}, '');
        resetAllEditCountersToZero();
        updateTotalsAndEhrState();
        renderAiDiagnosisUi();
      });
    }

    if (dom.btnGenerate) {
      dom.btnGenerate.addEventListener('click', async () => {
        const ctx = getActiveHistoryContext();
        if (!ctx.item) return;
        const selectedTemplateId = dom.templateSelect?.value || CONFIG.SOAP_NOTE_TEMPLATE_ID;
        await applyTemplateToActiveTranscript(selectedTemplateId);
        const typedMrn = String(dom.mrnInput?.value || '').trim();
        if (typedMrn) await searchPatientByMrn(typedMrn);
        else if (state.currentPatient?.mrn_no) await searchPatientByMrn(state.currentPatient.mrn_no);
      });
    }

    if (dom.btnAddEhr) {
      dom.btnAddEhr.addEventListener('click', async () => {
        if (dom.btnAddEhr.disabled || state.addEhrInFlight) return;
        const confirmRes = await swalConfirmSaveToEhr();
        if (!confirmRes?.isConfirmed) return;

        state.addEhrInFlight = true;
        updateTotalsAndEhrState();

        try {
          persistActiveNoteFromUI();
          const mrn = getCurrentMrnForEhrSave();
          if (!mrn) throw new Error('Missing MRN. Please enter/select a patient MRN before saving to EHR.');
          const { doctorId, scribeId } = await fetchMeDoctorAndScribeIds();
          const { patientId } = await fetchPatientIdByMrn(mrn);
          let note = state.latestSoapNote || {};
          note = syncTemplateRowsFromSections(note);
          if (!isTemplateDrivenNoteEligible(note)) throw new Error('Template-driven note is not eligible for EHR save.');
          const totalEdits = getTotalEditsFromNote(note);
          const modifiedBy = totalEdits > 0 ? scribeId : doctorId;
          const ts = new Date().toISOString();
          const payload = buildTemplateEhrSavePayload({ patientId, doctorId, scribeId, modifiedBy, timestamp: ts, note });
          const saveRes = await saveTemplateNoteToEHR(payload);
          const noteId = saveRes?.note_id ?? saveRes?.patient_note_id ?? saveRes?.id ?? null;
          await swalSuccessSaved(noteId);
          if (mrn && state.summaryCacheByMrn.has(mrn)) state.summaryCacheByMrn.delete(mrn);
          clearActiveTranscriptAfterEhrSave();
          window.dispatchEvent(new CustomEvent('ehr_note_saved', { detail: { mrn, patientId, doctorId, scribeId, noteId, timestamp: ts } }));
        } catch (e) {
          await swalError(e?.message || e);
        } finally {
          state.addEhrInFlight = false;
          updateTotalsAndEhrState();
          renderAiDiagnosisUi();
        }
      });
    }

    updateTotalsAndEhrState();
  }

  function wireEhrSidebar() {
    if (dom.ehrButton && dom.ehrSidebar) {
      dom.ehrButton.onclick = () => {
        const open = dom.ehrSidebar.classList.contains('active');
        if (open) {
          dom.ehrSidebar.classList.remove('active');
          if (dom.ehrOverlay) dom.ehrOverlay.classList.remove('active');
        } else {
          openEhrSidebar();
        }
      };
    }

    if (dom.ehrOverlay) {
      dom.ehrOverlay.onclick = () => {
        if (dom.ehrSidebar) dom.ehrSidebar.classList.remove('active');
        dom.ehrOverlay.classList.remove('active');
      };
    }

    if (dom.ehrCloseButton) {
      dom.ehrCloseButton.onclick = () => {
        try { stopSummaryTimer(); } catch { }
        state.currentPatient = null;
        state.currentNotes = [];
        state.noteCache.clear();
        try { state.summaryCacheByMrn.clear(); } catch { }
        if (dom.ehrSidebar) dom.ehrSidebar.classList.remove('active');
        if (dom.ehrOverlay) dom.ehrOverlay.classList.remove('active');
        if (dom.ehrInitialState) dom.ehrInitialState.style.display = 'flex';
        if (dom.ehrPatientState) dom.ehrPatientState.style.display = 'none';
        if (dom.mrnInput) dom.mrnInput.value = '';
        if (dom.ehrError) { dom.ehrError.textContent = ''; dom.ehrError.style.display = 'none'; }
        if (dom.notesList) dom.notesList.innerHTML = '';
        if (dom.noteDetail) dom.noteDetail.innerHTML = '';
      };
    }

    if (dom.mrnSearchButton) dom.mrnSearchButton.onclick = () => searchPatientByMrn(dom.mrnInput?.value || '');
    if (dom.mrnInput) dom.mrnInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchPatientByMrn(dom.mrnInput.value || ''); });

    window.addEventListener('ehr_note_saved', async (e) => {
      try {
        const snap = e?.detail || {};
        const mrn = String(snap.mrn || state.currentPatient?.mrn_no || '').trim();
        if (!mrn) return;
        if (dom.mrnInput) dom.mrnInput.value = mrn;
        await refreshPatientAndNotes(mrn);
        const latestId = snap.noteId || pickLatestNoteId(state.currentNotes);
        if (latestId) {
          setActiveNote(latestId);
          await loadNote(latestId);
          openEhrSidebar();
        }
      } catch { }
    });
  }

  // =====================================================================================
  //  NOTE HISTORY PANEL TOGGLE + RESIZE
  // =====================================================================================
  function wireNoteHistoryPanel() {
    const nhPanel = document.getElementById('rheaNoteHistory');
    const nhToggle = document.getElementById('rheaNoteHistoryToggle');
    const nhResize = document.getElementById('rheaNhResize');

    if (!nhPanel || !nhToggle) return;

    nhToggle.addEventListener('click', () => {
      const isCollapsed = nhPanel.classList.toggle('collapsed');
      nhToggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      nhToggle.title = isCollapsed ? 'Expand Note History' : 'Collapse Note History';
      nhToggle.textContent = isCollapsed ? '›' : '‹';
    });

    if (!nhResize) return;
    let dragging = false, startX = 0, startW = 0;
    nhResize.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault(); nhResize.setPointerCapture(e.pointerId);
      dragging = true; startX = e.clientX; startW = nhPanel.getBoundingClientRect().width;
      document.body.classList.add('is-resizing');
    });
    nhResize.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const newW = Math.max(120, Math.min(400, startW + (e.clientX - startX)));
      document.documentElement.style.setProperty('--rhea-nh-w', newW + 'px');
      if (newW < 130 && !nhPanel.classList.contains('collapsed')) nhPanel.classList.add('collapsed');
      else if (newW >= 130 && nhPanel.classList.contains('collapsed')) nhPanel.classList.remove('collapsed');
    });
    nhResize.addEventListener('pointerup', () => { dragging = false; document.body.classList.remove('is-resizing'); });
  }

  function wireRheaSoapAiResize() {
    const handle = document.querySelector('.rhea-soap-ai-resize');
    const soapPane = document.getElementById('soapPane');
    if (!handle || !soapPane) return;
    let dragging = false, startY = 0, startH = 0;
    handle.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault(); handle.setPointerCapture(e.pointerId);
      dragging = true; startY = e.clientY; startH = soapPane.getBoundingClientRect().height;
      document.body.classList.add('is-resizing');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const newH = Math.max(160, Math.min(600, startH + (e.clientY - startY)));
      document.documentElement.style.setProperty('--rhea-soap-h', newH + 'px');
    });
    handle.addEventListener('pointerup', () => { dragging = false; document.body.classList.remove('is-resizing'); });
  }

  // =====================================================================================
  //  RESTORE FROM STORAGE
  // =====================================================================================
  function restoreFromLocalStorage() {
    const hist = normalizeHistoryItems(loadHistory());
    if (!hist.length) {
      renderSoapBlank();
      clearAiDiagnosisPaneUi();
      renderNoteHistoryList();
      return;
    }

    const activeId = loadActiveItemId();
    if (!activeId && hist.length) saveActiveItemId(hist[hist.length - 1].id);

    const ctx = getActiveHistoryContext();
    const noteData = ctx.item?.note?.data || loadLatestSoap() || {};
    state.latestSoapNote = noteData;

    if (!Object.keys(noteData).filter((k) => !k.startsWith('_')).length) {
      renderSoapBlank();
    } else {
      renderSoapNote(state.latestSoapNote);
      if (ctx.item) syncDropdownToActiveItem(ctx.item);
    }

    renderNoteHistoryList();
    clearAiDiagnosisPaneUi();
  }

  // =====================================================================================
  //  STYLES
  // =====================================================================================
  function ensureUiStyles() {
    if (document.getElementById('rhea-cockpit-css')) return;
    const s = document.createElement('style');
    s.id = 'rhea-cockpit-css';
    s.textContent = `
      #templateSelect {
        background: #0f1724 !important; color: #ffffff !important;
        border: 1px solid rgba(255,255,255,0.12) !important; border-radius: 8px;
        padding: 8px 10px; outline: none; width: 320px; max-width: 48vw;
        min-width: 220px; box-sizing: border-box; font-size: 14px; appearance: auto;
      }
      #templateSelect option { background: #0b1220 !important; color: #fff !important; }

      .rhea-live-transcript-hidden { display: none !important; visibility: hidden !important; height: 0 !important; overflow: hidden !important; }

      .scribe-soap-scroll { padding: 10px 12px; height: 100%; overflow: auto; background: #0b1220 !important; border-radius: 6px; }
      .scribe-section { margin: 10px 0; border: 1px solid rgba(148,163,184,0.25); border-radius: 10px; overflow: hidden; background: #111827 !important; }
      .scribe-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: #0b1220 !important; color: #e5e7eb !important; border-bottom: 1px solid rgba(148,163,184,0.25); }
      .scribe-section-head h3 { margin: 0; font-size: 14px; font-weight: 700; color: #e5e7eb !important; }
      .scribe-section-meta { font-size: 12px; color: #94a3b8 !important; white-space: nowrap; }
      .scribe-textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border: none; outline: none; resize: none; background: #111827 !important; color: #e5e7eb !important; font-size: 14px; line-height: 1.45; min-height: 80px; max-height: 220px; overflow-y: auto; }
      .scribe-ai-center { display: flex; align-items: center; justify-content: center; min-height: 80px; }
      .scribe-ai-empty { color: #94a3b8; font-size: 14px; text-align: center; padding: 16px; }
      .scribe-ai-error { color: #f87171; font-size: 14px; text-align: center; padding: 16px; }
      .scribe-ai-section { margin-bottom: 14px; padding: 10px 12px; border: 1px solid rgba(148,163,184,0.18); border-radius: 8px; background: #111827; }
      .scribe-ai-section-title { font-weight: 700; font-size: 13px; color: #e5e7eb; margin-bottom: 6px; }
      .scribe-ai-section-body { font-size: 13px; color: #cbd5e1; line-height: 1.6; white-space: pre-wrap; }
      ._scribe_total_edits { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,0.08); color: #e5e7eb; font-weight: 700; font-size: 12px; white-space: nowrap; }
      #_scribe_save { display: none !important; }
      .scribe-add-ehr-enabled { background: #1d4ed8 !important; color: #fff !important; opacity: 1; cursor: pointer; }
      .scribe-add-ehr-disabled { background: rgba(148,163,184,0.15) !important; color: rgba(255,255,255,0.4) !important; cursor: not-allowed; }
      .rhea-nh-item { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 10px 36px 10px 12px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; transition: background 0.15s; }
      .rhea-nh-item:hover { background: rgba(255,255,255,0.07); }
      .rhea-nh-item.active { background: rgba(37,99,235,0.18); border-color: rgba(37,99,235,0.45); }
      .rhea-nh-item-title { font-size: 13px; font-weight: 600; color: #e5e7eb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rhea-nh-item-meta { font-size: 11px; color: #94a3b8; }
      .rhea-nh-delete { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #f87171; font-size: 16px; cursor: pointer; padding: 4px 6px; border-radius: 4px; line-height: 1; opacity: 0.7; transition: opacity 0.15s; }
      .rhea-nh-delete:hover { opacity: 1; background: rgba(248,113,113,0.12); }
      .rhea-nh-empty { padding: 16px 12px; color: #94a3b8; font-size: 13px; text-align: center; }
    `;
    document.head.appendChild(s);
  }

  // =====================================================================================
  //  INIT
  // =====================================================================================
  function init() {
    ensureUiStyles();

    restoreFromLocalStorage();
    initTemplateDropdown();
    wireSoapActionButtons();
    wireEhrSidebar();
    wireNoteHistoryPanel();
    wireRheaSoapAiResize();

    clearAiDiagnosisPaneUi();
    if (dom.panelRoot) dom.panelRoot.classList.remove('active');
    syncPanelUi();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.RheaCockpit = {
    handleTranscript,
    generateAiDiagnosisForActiveTranscript,
    addNoteToHistory: async (item) => { await appendTranscriptItem(item); },
    setSocket: (socket, room) => { state.socket = socket; state.currentRoom = room; },
    setServerUrl: (url) => { state.SERVER_URL = url; },
  };
})();
