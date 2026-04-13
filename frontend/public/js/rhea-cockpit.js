.mrnSearchButton) {
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