(() => {
    'use strict';

    const dom = {
        transcript: document.getElementById('liveTranscript'),
        templateSelect: document.getElementById('templateSelect'),
        soapScroller: document.getElementById('soapScroller'),

        btnClear: document.getElementById('_scribe_clear'),
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
        panelRoot: document.getElementById('rheaCockpitRoot'),
        panelToggle: document.getElementById('rheaPanelToggle')
    };

    const CONFIG = {
        SOAP_NOTE_TEMPLATE_ID: '20',
        AI_DIAGNOSIS_ENDPOINT: '/ehr/ai/diagnosis',
        SUMMARY_NOTE_ID: 'summary'
    };

    const state = {
        transcriptItems: [],
        activeTranscriptId: null,
        latestSoapNote: {},
        templateKeywords: new Map(),
        templatesLoaded: false,
        currentPatient: null,
        currentNotes: [],
        selectedNoteId: null,
        noteCache: new Map(),
        summaryCacheByMrn: new Map(),
        aiDiagnosisInFlight: false,
        aiDiagnosisLastError: null
    };
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
        return s || CONFIG.SOAP_NOTE_TEMPLATE_ID;
    }

    function templateIdToApiValue(v) {
        const n = Number(normalizeTemplateId(v));
        return Number.isFinite(n) && n > 0 ? n : Number(CONFIG.SOAP_NOTE_TEMPLATE_ID);
    }

    function ensureUiStyles() {
        if (document.getElementById('rhea-cockpit-inline-css')) return;

        const MAIN_BG = '#0b1220';
        const BOX_BG = '#111827';
        const TEXT = '#e5e7eb';
        const MUTED = '#94a3b8';
        const BORDER = 'rgba(148,163,184,0.25)';

        const s = document.createElement('style');
        s.id = 'rhea-cockpit-inline-css';
        s.textContent = `
    #templateSelect {
      background: #0f1724 !important;
      color: #ffffff !important;
      border: 1px solid rgba(255,255,255,0.12) !important;
      border-radius: 8px !important;
      padding: 8px 10px !important;
      outline: none !important;
      width: 320px !important;
      max-width: 48vw !important;
      min-width: 220px !important;
      box-sizing: border-box !important;
      font-size: 14px !important;
      appearance: auto !important;
      -webkit-appearance: menulist !important;
      -moz-appearance: menulist !important;
    }

    #templateSelect:hover {
      background: rgba(55, 65, 81, 0.75) !important;
    }

    #templateSelect:focus {
      box-shadow: 0 0 0 2px rgba(96,165,250,0.35) !important;
    }

    #templateSelect option {
      background: ${MAIN_BG} !important;
      color: #ffffff !important;
      padding: 6px 10px !important;
    }

    .scribe-soap-header {
      width: 100% !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
    }

    .scribe-soap-title {
      margin: 0 !important;
      font-size: 16px !important;
      font-weight: 700 !important;
      color: rgba(255,255,255,0.95) !important;
      min-width: 0 !important;
    }

    #soapScroller {
      background: ${MAIN_BG} !important;
      color: ${TEXT} !important;
    }

    .scribe-soap-scroll {
      padding: 10px 12px !important;
      height: 100% !important;
      overflow: auto !important;
      background: ${MAIN_BG} !important;
      border-radius: 6px !important;
    }

    .scribe-section {
      margin: 10px 0 !important;
      border: 1px solid ${BORDER} !important;
      border-radius: 10px !important;
      overflow: hidden !important;
      background: ${BOX_BG} !important;
    }

    .scribe-section-head {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
      padding: 10px 12px !important;
      background: ${MAIN_BG} !important;
      color: ${TEXT} !important;
      border-bottom: 1px solid ${BORDER} !important;
    }

    .scribe-section-head h3 {
      margin: 0 !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      color: ${TEXT} !important;
    }

    .scribe-section-meta {
      font-size: 12px !important;
      color: ${MUTED} !important;
      white-space: nowrap !important;
      opacity: 0.95 !important;
    }

    .scribe-textarea {
      width: 100% !important;
      box-sizing: border-box !important;
      padding: 10px 12px !important;
      border: none !important;
      outline: none !important;
      resize: none !important;
      background: ${BOX_BG} !important;
      color: ${TEXT} !important;
      font-size: 14px !important;
      line-height: 1.45 !important;
      min-height: 80px !important;
      max-height: 220px !important;
      overflow-y: auto !important;
    }
          .ehr-note-item.active {
      background: #6d5efc !important;
      color: #ffffff !important;
      border-color: rgba(255,255,255,0.16) !important;
    }
  `;

        document.head.appendChild(s);

    }

    function normalizeMRN(rawInput) {
        if (!rawInput || typeof rawInput !== 'string') return null;

        let normalized = rawInput
            .trim()
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .replace(/\s*-\s*/g, '-')
            .replace(/\bDASH\b/gi, '-')
            .replace(/\bHYPHEN\b/gi, '-');

        const patterns = [
            /\bM\s*R\s*N\s*-\s*([A-Z0-9]{3,})\b/i,
            /\bMRN-([A-Z0-9]{3,})\b/i,
        ];

        for (const pattern of patterns) {
            const match = normalized.match(pattern);
            if (match && match[1]) {
                const code = match[1].replace(/\s+/g, '');
                if (/^[A-Z0-9]{3,}$/.test(code)) {
                    return `MRN-${code}`;
                }
            }
        }

        return null;
    }

    function detectMRNFromText(text) {
        if (!text || typeof text !== 'string') return null;

        const preprocessed = text
            .replace(/\bDASH\b/gi, '-')
            .replace(/\bHYPHEN\b/gi, '-')
            .replace(/\s*-\s*/g, '-');

        const stopWords = /^(ON|IN|AT|TO|FOR|WITH|FROM|BY|PATIENT|DOCTOR|NOTE|FILE|CONSULTATION|HI|HELLO)$/i;

        const variations = [
            /\bMRN\s+NUMBER\s+IS\s+MRN\s+([A-Z0-9]+(?:\s+[A-Z0-9]+)*)/i,
            /\bMEDICAL\s+RECORD\s+NUMBER\s+IS\s+([A-Z0-9]+(?:\s+[A-Z0-9]+)*)/i,
            /\bMRN\s+NUMBER\s+IS\s+([A-Z0-9]+(?:\s+[A-Z0-9]+)*)/i,
            /\bPATIENT\s+ID\s+IS\s+MRN\s+([A-Z0-9]+(?:\s+[A-Z0-9]+)*)/i,
            /\bMRNA\s+([A-Z0-9]+(?:\s+[A-Z0-9]+)*)/i,
            /\bMRN\s+IS\s+([A-Z0-9]+(?:\s+[A-Z0-9]+)*)/i,
            /\bMRN-([A-Z0-9]+(?:\s+[A-Z0-9]+)*)/i,
            /\bMRN\s+([A-Z0-9]+(?:\s+[A-Z0-9]+)*)/i,
            /\bM\s+R\s+N\s+([A-Z0-9]+(?:\s+[A-Z0-9]+)*)/i,
        ];

        for (const pattern of variations) {
            const match = preprocessed.match(pattern);
            if (match && match[1]) {
                const words = match[1].trim().split(/\s+/);
                const validWords = [];
                for (const w of words) {
                    if (!w) continue;
                    if (stopWords.test(w)) break;
                    validWords.push(w);
                }
                const code = validWords.join('').toUpperCase();
                if (/^[A-Z0-9]{3,}$/.test(code)) {
                    return `MRN-${code}`;
                }
            }
        }

        return normalizeMRN(text);
    }

    function matchTemplateByKeywords(text) {
        if (!text || state.templateKeywords.size === 0) return null;

        const normalizedText = text.toLowerCase().trim();
        for (const [templateId, keywords] of state.templateKeywords.entries()) {
            for (const keyword of keywords) {
                if (normalizedText.includes(String(keyword).toLowerCase().trim())) {
                    return templateId;
                }
            }
        }
        return null;
    }

    function autoDetectFromTranscript(text) {
        const textLower = String(text || '').toLowerCase();
        const result = { noteType: null, mrn: null };

        const matchedTemplate = matchTemplateByKeywords(text);
        if (matchedTemplate) {
            result.noteType = matchedTemplate;
        } else if (textLower.includes('soap note') || textLower.includes('soap-note')) {
            result.noteType = CONFIG.SOAP_NOTE_TEMPLATE_ID;
        }

        const detectedMrn = detectMRNFromText(text);
        if (detectedMrn) {
            result.mrn = detectedMrn;
        }

        return result;
    }

    async function initTemplateDropdown() {
        if (!dom.templateSelect) return;

        dom.templateSelect.innerHTML = '';

        const optPlaceholder = document.createElement('option');
        optPlaceholder.value = '';
        optPlaceholder.textContent = 'Select note type...';
        optPlaceholder.disabled = true;
        optPlaceholder.selected = true;
        dom.templateSelect.appendChild(optPlaceholder);

        const optSoap = document.createElement('option');
        optSoap.value = CONFIG.SOAP_NOTE_TEMPLATE_ID;
        optSoap.textContent = 'SOAP Note';
        dom.templateSelect.appendChild(optSoap);

        try {
            const resp = await fetch('/api/templates', { credentials: 'include' });
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
                    if (keywords.length > 0) {
                        state.templateKeywords.set(id, keywords);
                    }
                });
            }
        } catch (err) {
            console.warn('[RHEA-COCKPIT] Failed to load templates:', err);
        }

        state.templateKeywords.set(CONFIG.SOAP_NOTE_TEMPLATE_ID, [
            'soap note',
            'soap',
            'subjective objective assessment plan',
            'summary',
            'summary note',
            'ai summary',
            'ai summary note'
        ]);

        state.templatesLoaded = true;

        dom.templateSelect.addEventListener('change', async () => {
            const item = getActiveTranscriptItem();
            if (!item) return;
            const selectedTemplateId = dom.templateSelect.value || CONFIG.SOAP_NOTE_TEMPLATE_ID;
            await applyTemplateToActiveTranscript(selectedTemplateId);
        });
    }

    function renderTranscriptList() {
        if (!dom.transcript) return;

        dom.transcript.innerHTML = '';

        if (!state.transcriptItems.length) {
            dom.transcript.innerHTML = `
        <div class="scribe-ai-empty">No transcript yet.</div>
      `;
            return;
        }

        state.transcriptItems.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'scribe-card' + (item.id === state.activeTranscriptId ? ' scribe-card-active' : '');
            card.dataset.id = item.id;

            const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

            card.innerHTML = `
        <div class="text-sm mb-1">
          🗣️ <span class="font-bold">${escapeHtml(item.from || 'Provider')}</span>
          <span class="opacity-60">(${escapeHtml(time)})</span>
        </div>
        <div class="text-sm leading-6 text-gray-100">${escapeHtml(item.text || '')}</div>
      `;

            card.addEventListener('click', () => {
                state.activeTranscriptId = item.id;
                renderTranscriptList();

                if (item.note && Object.keys(item.note).length) {
                    state.latestSoapNote = item.note;
                    renderSoapNote(state.latestSoapNote);
                } else {
                    renderSoapBlank();
                }

                renderAiDiagnosisUi();
            });

            dom.transcript.appendChild(card);
        });

        dom.transcript.scrollTop = dom.transcript.scrollHeight;
    }

    function getActiveTranscriptItem() {
        return state.transcriptItems.find((x) => x.id === state.activeTranscriptId) || null;
    }

    function getCachedSummaryTextForMrn(mrn) {
        const key = String(mrn || '').trim();
        if (!key) return '';
        const cached = state.summaryCacheByMrn.get(key);
        return String(cached?.text || '').trim();
    }

    function renderSoapBlank() {
        if (!dom.soapScroller) return;

        dom.soapScroller.innerHTML = `
      <div style="
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        height:100%;
        min-height:240px;
        padding:40px 20px;
        text-align:center;
        color:#9ca3af;
      ">
        <div style="font-size:48px; margin-bottom:16px;">📝</div>
        <div style="font-size:18px; font-weight:600; margin-bottom:8px; color:#e5e7eb;">
          No Note Generated
        </div>
        <div style="font-size:14px; max-width:400px; line-height:1.6;">
          Select a note type from the dropdown above to generate a note for this transcription.
        </div>
      </div>
    `;

        if (dom.btnAddEhr) {
            dom.btnAddEhr.disabled = true;
            dom.btnAddEhr.classList.add('scribe-add-ehr-disabled');
        }
    }

    function renderSoapNote(soap) {
        if (!dom.soapScroller) return;

        state.latestSoapNote = soap || {};
        const sections = Object.keys(state.latestSoapNote).filter((k) => !k.startsWith('_'));

        if (!sections.length) {
            renderSoapBlank();
            return;
        }

        dom.soapScroller.innerHTML = '';

        sections.forEach((section) => {
            const wrap = document.createElement('div');
            wrap.className = 'scribe-section';
            wrap.dataset.section = section;

            const head = document.createElement('div');
            head.className = 'scribe-section-head';
            head.innerHTML = `
        <h3>${escapeHtml(section)}</h3>
        <div class="scribe-section-meta">Edits: 0</div>
      `;

            const box = document.createElement('textarea');
            box.className = 'scribe-textarea';
            box.dataset.section = section;

            const rawVal = state.latestSoapNote[section];
            box.value = Array.isArray(rawVal) ? rawVal.join('\n') : String(rawVal || '');

            wrap.appendChild(head);
            wrap.appendChild(box);
            dom.soapScroller.appendChild(wrap);
        });

        const currentMrn = String(state.currentPatient?.mrn_no || dom.mrnInput?.value || '').trim();
        if (currentMrn) {
            state.summaryCacheByMrn.delete(currentMrn);
        }

        if (dom.btnAddEhr) {
            dom.btnAddEhr.disabled = false;
            dom.btnAddEhr.classList.remove('scribe-add-ehr-disabled');
        }
    }

    function renderDiagnosisSectionsHtml(sections) {
        const list = Array.isArray(sections) ? sections : [];
        if (!list.length) return '';

        return `
      <div class="scribe-ai-sections">
        ${list.map((sec) => {
            const title = escapeHtml(sec?.component || sec?.title || sec?.name || 'Section');
            const raw = String(sec?.text || sec?.content || '').trim();
            const safe = escapeHtml(raw).replace(/\n/g, '<br/>');

            return `
            <div class="scribe-section scribe-ai-section">
              <div class="scribe-section-head">
                <h3>${title}</h3>
              </div>
              <div class="scribe-ai-comp-scroll">${safe || '<span class="scribe-muted">No data</span>'}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    }

    function clearAiDiagnosisPaneUi() {
        if (!dom.aiDiagnosisBody) return;
        dom.aiDiagnosisBody.innerHTML = `
      <div class="scribe-ai-center">
        <div class="scribe-ai-empty">No data available</div>
      </div>
    `;
    }

    function renderAiDiagnosisUi(diag = null) {
        if (!dom.aiDiagnosisBody) return;

        if (state.aiDiagnosisInFlight) {
            dom.aiDiagnosisBody.innerHTML = `
        <div class="scribe-ai-center">
          <div class="scribe-ai-loading">
            <div style="margin-top:12px;">AI is working in the background...</div>
          </div>
        </div>
      `;
            return;
        }

        if (!diag || !Array.isArray(diag.sections) || !diag.sections.length) {
            clearAiDiagnosisPaneUi();
            return;
        }

        dom.aiDiagnosisBody.innerHTML = `
      <div class="scribe-ai-pane-scroll">
        ${renderDiagnosisSectionsHtml(diag.sections)}
      </div>
    `;
    }

    async function requestNoteGenerationForActiveTranscript(templateId) {
        const item = getActiveTranscriptItem();
        if (!item) return;

        const transcript = String(item.text || '').trim();
        if (!transcript) return;

        renderSoapBlank();

        try {
            const resp = await fetch('/api/notes/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    transcript,
                    templateId: templateIdToApiValue(templateId)
                }),
            });

            if (!resp.ok) {
                throw new Error(`Server returned ${resp.status} ${resp.statusText || ''}`);
            }

            const data = await resp.json();
            const note = data.note || {};

            item.note = note;
            state.latestSoapNote = note;
            renderSoapNote(note);
        } catch (e) {
            console.error('[RHEA-COCKPIT] Note generation failed:', e);
            if (dom.soapScroller) {
                dom.soapScroller.innerHTML = `
          <div class="scribe-section" style="text-align:center; color:#f87171; padding:16px;">
            Error generating note: ${escapeHtml(String(e?.message || e))}
          </div>
        `;
            }
        }
    }

    async function applyTemplateToActiveTranscript(newTemplateId) {
        const templateId = normalizeTemplateId(newTemplateId);

        state.latestSoapNote = {};
        renderSoapBlank();
        clearAiDiagnosisPaneUi();

        await requestNoteGenerationForActiveTranscript(templateId);
    }

    async function searchPatientByMrn(mrn) {
        const normalized = String(mrn || '').trim();
        if (!normalized) return;

        try {
            if (dom.ehrError) {
                dom.ehrError.style.display = 'none';
                dom.ehrError.textContent = '';
            }

            const resp = await fetch(`/ehr/patient/${encodeURIComponent(normalized)}`, {
                credentials: 'include'
            });

            if (!resp.ok) {
                throw new Error(`Failed to load patient (${resp.status})`);
            }

            const data = await resp.json();
            state.currentPatient = data?.patient || null;
            state.currentNotes = Array.isArray(data?.notes) ? data.notes : [];
            state.selectedNoteId = null;

            if (!state.currentPatient) {
                throw new Error('Patient not found');
            }

            renderPatientState();
            renderClinicalNotes(state.currentNotes);

            setActiveNote(CONFIG.SUMMARY_NOTE_ID);
            await loadSummary();

            openEhrSidebar();
        } catch (e) {
            console.error('[RHEA-COCKPIT] MRN search failed:', e);
            if (dom.ehrError) {
                dom.ehrError.style.display = 'block';
                dom.ehrError.textContent = String(e?.message || e);
            }
        }
    }

    function renderPatientState() {
        const patient = state.currentPatient;
        if (!patient) return;

        if (dom.ehrInitialState) dom.ehrInitialState.style.display = 'none';
        if (dom.ehrPatientState) dom.ehrPatientState.style.display = 'block';

        if (dom.patientNameDisplay) dom.patientNameDisplay.textContent = patient.full_name || patient.name || 'N/A';
        if (dom.patientMRNDisplay) dom.patientMRNDisplay.textContent = patient.mrn_no || 'N/A';
        if (dom.patientEmailDisplay) dom.patientEmailDisplay.textContent = patient.email || 'N/A';
        if (dom.patientMobileDisplay) dom.patientMobileDisplay.textContent = patient.contact_no_primary || patient.mobile_number || patient.mobile || 'N/A';

        renderClinicalNotes(state.currentNotes);
    }

    function renderClinicalNotes(notes) {
        if (!dom.notesList) return;

        dom.notesList.innerHTML = '';

        const summaryBtn = document.createElement('button');
        summaryBtn.className = 'ehr-note-item' + (state.selectedNoteId === CONFIG.SUMMARY_NOTE_ID ? ' active' : '');
        summaryBtn.textContent = 'Summary';
        summaryBtn.dataset.noteId = CONFIG.SUMMARY_NOTE_ID;
        summaryBtn.title = 'Summary';

        summaryBtn.addEventListener('click', async () => {
            setActiveNote(CONFIG.SUMMARY_NOTE_ID);
            await loadSummary();
        });

        dom.notesList.appendChild(summaryBtn);

        if (!Array.isArray(notes) || !notes.length) {
            return;
        }

        notes.forEach((note) => {
            const noteId = String(note?.note_id || note?.patient_note_id || note?.id || '');
            if (!noteId) return;

            const shortName = String(note?.short_name || '').trim();
            const templateName = String(note?.template || note?.template_title || note?.title || '').trim();

            const btn = document.createElement('button');
            btn.className = 'ehr-note-item' + (state.selectedNoteId === noteId ? ' active' : '');
            btn.textContent = shortName || templateName || `Note ${noteId}`;
            btn.dataset.noteId = noteId;
            btn.title = templateName || shortName || `Note ${noteId}`;

            btn.addEventListener('click', async () => {
                setActiveNote(noteId);
                await loadNote(noteId);
            });

            dom.notesList.appendChild(btn);
        });
    }

    function setActiveNote(noteId) {
        state.selectedNoteId = String(noteId || '');

        if (!dom.notesList) return;

        Array.from(dom.notesList.querySelectorAll('.ehr-note-item')).forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.noteId === state.selectedNoteId);
        });
    }

    async function loadSummary() {
        if (!dom.noteDetail) return;

        const mrn = String(state.currentPatient?.mrn_no || '').trim();
        if (!mrn) {
            dom.noteDetail.innerHTML = `<div class="ehr-placeholder">MRN not selected.</div>`;
            return;
        }

        const cached = state.summaryCacheByMrn.get(mrn);
        if (cached && cached.text) {
            renderSummaryDetail(cached.text, cached.template_title || 'Summary Note');
            return;
        }

        dom.noteDetail.innerHTML = `<div class="ehr-placeholder">Generating summary...</div>`;

        try {
            const res = await fetch('/ehr/ai/summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ mrn })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || `Failed to load summary (${res.status})`);
            }

            state.summaryCacheByMrn.set(mrn, data);
            renderSummaryDetail(data.text || '', data.template_title || 'Summary Note');
        } catch (e) {
            console.error('[RHEA-COCKPIT] Summary load failed:', e);
            dom.noteDetail.innerHTML = `<div class="ehr-placeholder">${escapeHtml(String(e?.message || e))}</div>`;
        }
    }

    function renderSummaryDetail(text, title) {
        if (!dom.noteDetail) return;

        dom.noteDetail.innerHTML = `
      <div class="scribe-section" style="margin-bottom:10px;">
        <div class="scribe-section-head">
          <h3>${escapeHtml(title || 'Summary Note')}</h3>
        </div>
        <div class="scribe-ai-comp-scroll">${escapeHtml(String(text || '')).replace(/\n/g, '<br/>')}</div>
      </div>
    `;
    }

    async function loadNote(noteId) {
        if (!noteId || !dom.noteDetail) return;

        try {
            if (state.noteCache.has(noteId)) {
                renderNoteDetail(state.noteCache.get(noteId));
                return;
            }

            const resp = await fetch(`/ehr/notes/${encodeURIComponent(noteId)}`, {
                credentials: 'include'
            });

            if (!resp.ok) {
                throw new Error(`Failed to load note (${resp.status})`);
            }

            const data = await resp.json();
            state.noteCache.set(noteId, data);
            renderNoteDetail(data);
        } catch (e) {
            console.error('[RHEA-COCKPIT] Note detail load failed:', e);
            dom.noteDetail.innerHTML = `<div class="ehr-placeholder">${escapeHtml(String(e?.message || e))}</div>`;
        }
    }

    function renderNoteDetail(data) {
        if (!dom.noteDetail) return;

        const rows = Array.isArray(data?.note_content)
            ? data.note_content
            : Array.isArray(data?.sections)
                ? data.sections
                : [];

        if (!rows.length) {
            dom.noteDetail.innerHTML = `<div class="ehr-placeholder">No note detail available</div>`;
            return;
        }

        dom.noteDetail.innerHTML = rows.map((row) => `
      <div class="scribe-section" style="margin-bottom:10px;">
        <div class="scribe-section-head">
          <h3>${escapeHtml(row.section || row.component || 'Section')}</h3>
        </div>
        <div class="scribe-ai-comp-scroll">${escapeHtml(String(row.text || row.content || '')).replace(/\n/g, '<br/>')}</div>
      </div>
    `).join('');
    }

    function openEhrSidebar() {
        openPanel();
        if (dom.ehrSidebar) {
            dom.ehrSidebar.classList.add('active');
            dom.ehrSidebar.setAttribute('aria-hidden', 'false');
        }
        if (dom.ehrOverlay) {
            dom.ehrOverlay.classList.add('active');
            dom.ehrOverlay.setAttribute('aria-hidden', 'false');
        }
        if (dom.ehrButton) {
            dom.ehrButton.setAttribute('aria-expanded', 'true');
        }
    }

    function closeEhrSidebar() {
        if (dom.ehrSidebar) {
            dom.ehrSidebar.classList.remove('active');
            dom.ehrSidebar.setAttribute('aria-hidden', 'true');
        }
        if (dom.ehrOverlay) {
            dom.ehrOverlay.classList.remove('active');
            dom.ehrOverlay.setAttribute('aria-hidden', 'true');
        }
        if (dom.ehrButton) {
            dom.ehrButton.setAttribute('aria-expanded', 'false');
        }
    }

    function syncPanelUi() {
        const open = !!dom.panelRoot?.classList.contains('active');
        if (dom.panelToggle) {
            dom.panelToggle.classList.toggle('is-open', open);
            dom.panelToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            dom.panelToggle.setAttribute('title', open ? 'Close AI panel' : 'Open AI panel');
        }
    }

    function openPanel() {
        if (dom.panelRoot) dom.panelRoot.classList.add('active');
        syncPanelUi();
    }

    function closePanel() {
        if (dom.panelRoot) dom.panelRoot.classList.remove('active');
        closeEhrSidebar();
        syncPanelUi();
    }

    function togglePanel() {
        if (!dom.panelRoot) return;
        dom.panelRoot.classList.toggle('active');
        if (!dom.panelRoot.classList.contains('active')) {
            closeEhrSidebar();
        }
        syncPanelUi();
    }

    function wireEhrEvents() {
        if (dom.panelToggle) {
            dom.panelToggle.addEventListener('click', togglePanel);
        }
        if (dom.ehrButton) {
            dom.ehrButton.addEventListener('click', () => {
                openEhrSidebar();
            });
        }

        if (dom.ehrCloseButton) {
            dom.ehrCloseButton.addEventListener('click', closeEhrSidebar);
        }

        if (dom.ehrOverlay) {
            dom.ehrOverlay.addEventListener('click', closeEhrSidebar);
        }

        if (dom.mrnSearchButton) {
            dom.mrnSearchButton.addEventListener('click', () => {
                searchPatientByMrn(dom.mrnInput?.value || '');
            });
        }
    }

    function wireSoapActionButtons() {
        if (dom.btnClear) {
            dom.btnClear.addEventListener('click', () => {
                state.latestSoapNote = {};
                const item = getActiveTranscriptItem();
                if (item) item.note = {};
                renderSoapBlank();
                clearAiDiagnosisPaneUi();
            });
        }

        if (dom.btnGenerate) {
            dom.btnGenerate.addEventListener('click', async () => {
                const item = getActiveTranscriptItem();
                if (!item) return;

                const selectedTemplateId = dom.templateSelect?.value || CONFIG.SOAP_NOTE_TEMPLATE_ID;
                await applyTemplateToActiveTranscript(selectedTemplateId);

                const typedMrn = String(dom.mrnInput?.value || '').trim();
                if (typedMrn) {
                    await searchPatientByMrn(typedMrn);
                } else if (state.currentPatient?.mrn_no) {
                    await searchPatientByMrn(state.currentPatient.mrn_no);
                }
            });
        }

        if (dom.btnAddEhr) {
            dom.btnAddEhr.addEventListener('click', () => {
                openEhrSidebar();
            });
        }
    }

    async function generateAiDiagnosisForActiveTranscript() {
        const item = getActiveTranscriptItem();
        if (!item) return;

        const note = item.note || state.latestSoapNote || {};
        const sections = Object.keys(note)
            .filter((k) => !k.startsWith('_'))
            .map((k) => ({
                component: k,
                text: Array.isArray(note[k]) ? note[k].join('\n') : String(note[k] || '')
            }))
            .filter((x) => normalizeTextBlock(x.text));

        const mrn = String(state.currentPatient?.mrn_no || '').trim() || null;
        const summaryText = mrn ? getCachedSummaryTextForMrn(mrn) : '';

        if (!sections.length && !summaryText) {
            clearAiDiagnosisPaneUi();
            return;
        }

        state.aiDiagnosisInFlight = true;
        renderAiDiagnosisUi();

        try {
            const resp = await fetch(CONFIG.AI_DIAGNOSIS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    mrn,
                    transcript_id: item.id,
                    template_id: templateIdToApiValue(dom.templateSelect?.value || CONFIG.SOAP_NOTE_TEMPLATE_ID),
                    note_sections: sections,
                    summary_text: summaryText || null
                })
            });

            const data = await resp.json();
            if (!resp.ok) {
                throw new Error(data?.error || `Failed to generate AI diagnosis (${resp.status})`);
            }

            const normalized = {
                sections: Array.isArray(data?.sections) ? data.sections : []
            };

            state.aiDiagnosisInFlight = false;
            renderAiDiagnosisUi(normalized);
        } catch (e) {
            state.aiDiagnosisInFlight = false;
            state.aiDiagnosisLastError = String(e?.message || e);
            console.error('[RHEA-COCKPIT] AI diagnosis failed:', e);
            clearAiDiagnosisPaneUi();
        }
    }

    async function appendTranscriptItem({ from, to, text, timestamp }) {
        if (!dom.transcript || !text) return;

        const item = {
            id: uid(),
            from: from || 'Provider',
            to: to || 'AIERIA',
            text: String(text || '').trim(),
            timestamp: timestamp || Date.now(),
            note: null
        };

        state.transcriptItems.push(item);
        state.activeTranscriptId = item.id;

        addNoteToHistory(item);
        renderTranscriptList();
        openPanel();

        const detected = autoDetectFromTranscript(text);

        if (detected.mrn) {
            if (dom.mrnInput) dom.mrnInput.value = detected.mrn;
            await searchPatientByMrn(detected.mrn);
        }

        if (detected.noteType && dom.templateSelect) {
            dom.templateSelect.value = detected.noteType;
            dom.templateSelect.dispatchEvent(new Event('change'));
        } else {
            renderSoapBlank();
            clearAiDiagnosisPaneUi();
        }
    }

    async function handleTranscript(payload) {
        if (!payload?.text || !payload?.final) return;
        await appendTranscriptItem(payload);
    }

    function wireNoteHistoryPanel() {
        const nhPanel = document.getElementById('rheaNoteHistory');
        const nhToggle = document.getElementById('rheaNoteHistoryToggle');
        const nhResize = document.getElementById('rheaNhResize');

        if (!nhPanel || !nhToggle) return;

        nhToggle.addEventListener('click', function () {
            const isCollapsed = nhPanel.classList.toggle('collapsed');
            nhToggle.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
            nhToggle.title = isCollapsed ? 'Expand Note History' : 'Collapse Note History';
        });

        if (!nhResize) return;

        var dragging = false;
        var startX = 0;
        var startW = 0;

        nhResize.addEventListener('pointerdown', function (e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            nhResize.setPointerCapture(e.pointerId);
            dragging = true;
            startX = e.clientX;
            startW = nhPanel.getBoundingClientRect().width;
            document.body.classList.add('is-resizing');
            document.body.setAttribute('data-resize-orientation', 'vertical');
        });

        nhResize.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var dx = e.clientX - startX;
            var newW = Math.max(120, Math.min(400, startW + dx));
            document.documentElement.style.setProperty('--rhea-nh-w', newW + 'px');
            if (newW < 130 && !nhPanel.classList.contains('collapsed')) {
                nhPanel.classList.add('collapsed');
            } else if (newW >= 130 && nhPanel.classList.contains('collapsed')) {
                nhPanel.classList.remove('collapsed');
            }
        });

        nhResize.addEventListener('pointerup', function () {
            dragging = false;
            document.body.classList.remove('is-resizing');
            document.body.removeAttribute('data-resize-orientation');
        });
    }

    function wireRheaSoapAiResize() {
        var handle = document.querySelector('.rhea-soap-ai-resize');
        var soapPane = document.getElementById('soapPane');
        if (!handle || !soapPane) return;

        var dragging = false;
        var startY = 0;
        var startH = 0;

        handle.addEventListener('pointerdown', function (e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            handle.setPointerCapture(e.pointerId);
            dragging = true;
            startY = e.clientY;
            startH = soapPane.getBoundingClientRect().height;
            document.body.classList.add('is-resizing');
            document.body.setAttribute('data-resize-orientation', 'horizontal');
        });

        handle.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            var dy = e.clientY - startY;
            var newH = Math.max(160, Math.min(600, startH + dy));
            document.documentElement.style.setProperty('--rhea-soap-h', newH + 'px');
        });

        handle.addEventListener('pointerup', function () {
            dragging = false;
            document.body.classList.remove('is-resizing');
            document.body.removeAttribute('data-resize-orientation');
        });
    }

    function addNoteToHistory(item) {
        var list = document.getElementById('rheaNoteHistoryList');
        if (!list) return;

        var empty = list.querySelector('.rhea-nh-empty');
        if (empty) empty.remove();

        var time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        var preview = String(item.text || '').slice(0, 60);

        var el = document.createElement('div');
        el.className = 'rhea-nh-item' + (item.id === state.activeTranscriptId ? ' active' : '');
        el.dataset.id = item.id;
        el.innerHTML =
            '<div class="rhea-nh-item-title">' + escapeHtml(time || 'Note') + '</div>' +
            '<div class="rhea-nh-item-meta">' + escapeHtml(preview) + '</div>';

        el.addEventListener('click', function () {
            state.activeTranscriptId = item.id;
            list.querySelectorAll('.rhea-nh-item').forEach(function (n) { n.classList.remove('active'); });
            el.classList.add('active');
            if (item.note && Object.keys(item.note).length) {
                state.latestSoapNote = item.note;
                renderSoapNote(state.latestSoapNote);
            } else {
                renderSoapBlank();
            }
            renderAiDiagnosisUi();
        });

        list.insertBefore(el, list.firstChild);
    }

    function init() {
        ensureUiStyles();
        initTemplateDropdown();
        wireEhrEvents();
        wireSoapActionButtons();
        wireNoteHistoryPanel();
        wireRheaSoapAiResize();
        renderSoapBlank();
        clearAiDiagnosisPaneUi();
        if (dom.panelRoot) {
            dom.panelRoot.classList.remove('active');
        }
        syncPanelUi();
    }

    document.addEventListener('DOMContentLoaded', init);

    window.RheaCockpit = {
        handleTranscript,
        generateAiDiagnosisForActiveTranscript,
        addNoteToHistory
    };
})();