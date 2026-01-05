document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. CONFIGURATION & STATE
    // =========================================================================
    
    const STORAGE_KEY = 'trinh_hg_settings_v25_tech_upd';
    const INPUT_STATE_KEY = 'trinh_hg_input_state_v25';
  
    // MARKERS
    const MARK_REP_START  = '\uE000'; 
    const MARK_REP_END    = '\uE001';
    const MARK_CAP_START  = '\uE002'; 
    const MARK_CAP_END    = '\uE003';
    const MARK_BOTH_START = '\uE004'; 
    const MARK_BOTH_END   = '\uE005';
  
    const defaultState = {
      currentMode: 'default',
      activeTab: 'settings',
      dialogueMode: 0, 
      abnormalCapsMode: 0,
      regexMode: 'chapter',
      customRegex: '',
      modes: {
        default: { 
            pairs: [], 
            matchCase: false, 
            wholeWord: false, 
            autoCaps: false
        }
      }
    };
  
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!state.activeTab) state.activeTab = 'settings';
    
    // ANTI-FLICKER LOGIC
    document.querySelectorAll('.tab-button').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === state.activeTab);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.toggle('active', c.id === state.activeTab);
    });
    document.body.classList.remove('loading');

    // Ensure safe state
    if (state.dialogueMode === undefined) state.dialogueMode = 0;
    if (state.abnormalCapsMode === undefined) state.abnormalCapsMode = 0;
    if (!state.regexMode) state.regexMode = 'chapter';
    if (!state.modes || Object.keys(state.modes).length === 0) {
        state.modes = JSON.parse(JSON.stringify(defaultState.modes));
        state.currentMode = 'default';
    }
    if (!state.modes[state.currentMode]) state.currentMode = Object.keys(state.modes)[0] || 'default';
  
    let currentSplitMode = 2;
    let saveTimeout;
  
    // =========================================================================
    // 2. DOM ELEMENTS
    // =========================================================================
    const els = {
      tabButtons: document.querySelectorAll('.tab-button'),
      sidebarBtns: document.querySelectorAll('.sidebar-btn'),
      settingPanels: document.querySelectorAll('.setting-panel'),
      modeSelect: document.getElementById('mode-select'),
      list: document.getElementById('punctuation-list'),
      matchCaseBtn: document.getElementById('match-case'),
      wholeWordBtn: document.getElementById('whole-word'),
      autoCapsBtn: document.getElementById('auto-caps'), 
      renameBtn: document.getElementById('rename-mode'),
      deleteBtn: document.getElementById('delete-mode'),
      emptyState: document.getElementById('empty-state'),
      formatCards: document.querySelectorAll('.format-card:not(.ab-caps-card)'),
      abCapsCards: document.querySelectorAll('.ab-caps-card'),
      regexRadios: document.getElementsByName('regex-preset'),
      customRegexInput: document.getElementById('custom-regex-input'),
      saveRegexBtn: document.getElementById('save-regex-settings'),
      inputText: document.getElementById('input-text'),
      outputText: document.getElementById('output-text'),
      replaceBtn: document.getElementById('replace-button'),
      copyBtn: document.getElementById('copy-button'),
      splitInput: document.getElementById('split-input-text'),
      splitWrapper: document.getElementById('split-outputs-wrapper'),
      splitTypeRadios: document.getElementsByName('split-type'),
      splitControlCount: document.getElementById('split-type-count'),
      splitControlRegex: document.getElementById('split-type-regex'),
      splitActionBtn: document.getElementById('split-action-btn'),
      inputCount: document.getElementById('input-word-count'),
      outputCount: document.getElementById('output-word-count'),
      replaceCountBadge: document.getElementById('count-replace'),
      capsCountBadge: document.getElementById('count-caps'),
      splitInputCount: document.getElementById('split-input-word-count')
    };
  
    // =========================================================================
    // 3. HELPER FUNCTIONS & LOGIC
    // =========================================================================
    function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    
    function showNotification(msg, type = 'success') {
      const container = document.getElementById('notification-container');
      const note = document.createElement('div');
      note.className = `notification ${type}`;
      note.textContent = msg;
      container.appendChild(note);
      setTimeout(() => { note.style.opacity = '0'; setTimeout(() => note.remove(), 300); }, 2000); 
    }

    function showInlineNotify(btn, msg) {
        const originalText = btn.dataset.text || btn.textContent;
        if (!btn.dataset.text) btn.dataset.text = originalText;
        btn.textContent = msg;
        setTimeout(() => { btn.textContent = originalText; }, 1500);
    }
    
    function escapeHTML(str) { return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function preserveCase(o, r) {
        if (o === o.toUpperCase() && o !== o.toLowerCase()) return r.toUpperCase();
        if (o[0] === o[0].toUpperCase()) return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
        return r;
    }
    function countWords(str) { return str.trim() ? str.trim().split(/\s+/).length : 0; }
    function toTitleCase(word) { return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(); }

    function normalizeInput(text) {
        if (!text) return '';
        let normalized = text.normalize('NFC');
        normalized = normalized.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD]/g, '"');
        normalized = normalized.replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07]/g, "'");
        normalized = normalized.replace(/\u00A0/g, ' ');
        normalized = normalized.replace(/\u2026/g, '...');
        return normalized;
    }

    function formatDialogue(text, mode) {
        if (mode == 0) return text;
        const regex = /(^|[\n])([^:\n]+):\s*(?:\n\s*)?([“"'])([\s\S]*?)([”"'])/gm;
        return text.replace(regex, (match, p1, p2, p3, p4, p5) => {
            const context = p2.trim();
            let content = p4.trim();
            if (mode == 1) return `${p1}${context}: "${content}"`;
            else if (mode == 2) return `${p1}${context}:\n\n"${content}"`;
            else if (mode == 3) return `${p1}${context}:\n\n- ${content}`;
            return match;
        });
    }

    // =========================================================================
    // 4. CORE: FIND & REPLACE PIPELINE
    // =========================================================================
    
    function performReplaceAll() {
        const rawText = els.inputText.value;
        if (!rawText) { showInlineNotify(els.replaceBtn, "Chưa có nội dung!"); return; }

        try {
            let processedText = normalizeInput(rawText);
            const mode = state.modes[state.currentMode];
            let countReplace = 0;
            let countCaps = 0;

            // STEP 1: USER REPLACEMENTS
            if (mode.pairs && mode.pairs.length > 0) {
                const rules = mode.pairs
                    .filter(p => p.find && p.find.trim())
                    .map(p => ({ 
                        find: normalizeInput(p.find), 
                        replace: normalizeInput(p.replace || '') 
                    }))
                    .sort((a,b) => b.find.length - a.find.length);

                rules.forEach(rule => {
                    const pattern = escapeRegExp(rule.find);
                    const flags = mode.matchCase ? 'g' : 'gi';
                    const regex = mode.wholeWord 
                        ? new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, flags + 'u') 
                        : new RegExp(pattern, flags);
                    
                    processedText = processedText.replace(regex, (match) => {
                        countReplace++; 
                        let replacement = rule.replace;
                        if (!mode.matchCase) replacement = preserveCase(match, replacement);
                        return `${MARK_REP_START}${replacement}${MARK_REP_END}`;
                    });
                });
            }

            // STEP 2: ABNORMAL CAPS
            if (state.abnormalCapsMode > 0) {
                const abnormalRegex = /(?<=[\p{Ll},;]\s+)([\p{Lu}][\p{Ll}]+)/gum;
                processedText = processedText.replace(abnormalRegex, (match, p1) => {
                    if (state.abnormalCapsMode == 1) return p1.toLowerCase();
                    return match;
                });
            }

            // STEP 3: AUTO CAPS (FIXED FOR REQUIREMENT 1)
            if (mode.autoCaps) {
                // Regex Breakdown:
                // 1. Start of line (^)
                // 2. [.?!] + space
                // 3. : + (optional space) + " + (optional space)
                const autoCapsRegex = /(^|[.?!]\s+|:\s*["“]\s*)(?:(\uE000)(.*?)(\uE001)|([^\s\uE000\uE001]+))/gmu;

                processedText = processedText.replace(autoCapsRegex, (match, prefix, mStart, mContent, mEnd, rawWord) => {
                    let targetWord = mContent || rawWord;
                    if (!targetWord) return match;
                    
                    let cappedWord = targetWord.charAt(0).toUpperCase() + targetWord.slice(1);
                    
                    if (mStart) {
                        countCaps++;
                        return `${prefix}${MARK_BOTH_START}${cappedWord}${MARK_BOTH_END}`;
                    } else {
                        if (rawWord.charAt(0) === rawWord.charAt(0).toUpperCase()) return match; 
                        countCaps++;
                        return `${prefix}${MARK_CAP_START}${cappedWord}${MARK_CAP_END}`;
                    }
                });
            }

            // STEP 4: DIALOGUE FORMATTING
            processedText = formatDialogue(processedText, state.dialogueMode);

            // STEP 5: SPACING
            processedText = processedText.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '').join('\n\n');

            // RENDER HTML
            let finalHTML = ''; let buffer = '';
            for (let i = 0; i < processedText.length; i++) {
                const c = processedText[i];
                if (c === MARK_REP_START) { finalHTML += escapeHTML(buffer) + '<mark class="hl-yellow">'; buffer = ''; }
                else if (c === MARK_REP_END || c === MARK_CAP_END || c === MARK_BOTH_END) { finalHTML += escapeHTML(buffer) + '</mark>'; buffer = ''; }
                else if (c === MARK_CAP_START) { finalHTML += escapeHTML(buffer) + '<mark class="hl-blue">'; buffer = ''; }
                else if (c === MARK_BOTH_START) { finalHTML += escapeHTML(buffer) + '<mark class="hl-orange">'; buffer = ''; }
                else { buffer += c; }
            }
            finalHTML += escapeHTML(buffer);

            els.outputText.innerHTML = finalHTML;
            els.replaceCountBadge.textContent = `Replace: ${countReplace}`;
            els.capsCountBadge.textContent = `Auto-Caps: ${countCaps}`;
            updateCounters();
            
            els.inputText.value = ''; saveTempInput();
            showInlineNotify(els.replaceBtn, "Đã Xong!");
        } catch (e) { console.error(e); showNotification("Lỗi: " + e.message, "error"); }
    }

    // =========================================================================
    // 5. SPLITTER
    // =========================================================================
    function clearSplitOutputs() { els.splitWrapper.innerHTML = ''; }

    function updateSplitUI() {
        const isRegex = document.querySelector('input[name="split-type"][value="regex"]').checked;
        document.querySelector('input[name="split-type"][value="count"]').checked = !isRegex;
        els.splitControlCount.classList.toggle('hidden', isRegex);
        els.splitControlRegex.classList.toggle('hidden', !isRegex);
        clearSplitOutputs();
        if (!isRegex) renderSplitPlaceholders(currentSplitMode);
    }

    function renderSplitPlaceholders(count) {
        els.splitWrapper.innerHTML = ''; 
        for (let i = 1; i <= count; i++) {
             const div = document.createElement('div'); div.className = 'split-box';
             div.innerHTML = `
                <div class="split-header"><span>Phần ${i} (Chờ kết quả...)</span><span class="badge">0 W</span></div>
                <textarea id="out-split-${i-1}" class="custom-scrollbar" readonly placeholder="Kết quả phần ${i} sẽ hiện ở đây..."></textarea>
                <div class="split-footer"><button class="btn btn-success full-width copy-split-btn" data-target="out-split-${i-1}" data-seq="${i}">Sao chép ${i}</button></div>
            `;
            els.splitWrapper.appendChild(div);
        }
        bindCopyEvents();
    }

    function getRegexFromSettings() {
        if (state.regexMode === 'chapter') return /(?:Chương|Chapter)\s+\d+(?:[:.-]\s*.*)?/gi;
        if (state.regexMode === 'book') return /(?:Hồi|Quyển)\s+(?:\d+|[IVXLCDM]+)(?:[:.-]\s*.*)?/gi;
        if (state.regexMode === 'custom' && state.customRegex) {
            try { return new RegExp(state.customRegex, 'gmi'); } catch(e) { return null; }
        }
        return null; 
    }

    function performSplit() {
        const text = els.splitInput.value;
        if(!text.trim()) { showInlineNotify(els.splitActionBtn, "Chưa có nội dung!"); return; }
        const splitType = document.querySelector('input[name="split-type"]:checked').value;

        if (splitType === 'regex') {
            const regex = getRegexFromSettings();
            if (!regex) { showInlineNotify(els.splitActionBtn, "Lỗi Regex!"); return; }
            const matches = [...text.matchAll(regex)];
            if (matches.length === 0) { showInlineNotify(els.splitActionBtn, "Không tìm thấy chương!"); return; }
            
            let parts = [];
            for (let i = 0; i < matches.length; i++) {
                const start = matches[i].index;
                const end = (i < matches.length - 1) ? matches[i+1].index : text.length;
                let chunk = text.substring(start, end).trim().split(/\r?\n/).filter(l => l.trim()).join('\n\n');
                const title = chunk.split('\n')[0].trim();
                parts.push({ content: chunk, title: title || `Phần ${i+1}` });
            }
            renderFilledSplitGrid(parts); 
            showInlineNotify(els.splitActionBtn, `Đã chia ${parts.length} phần!`);
        } else {
            const lines = normalizeInput(text).split('\n');
            let chapterHeader = '', contentBody = normalizeInput(text);
            if (/^(Chương|Chapter|Hồi)\s+\d+/.test(lines[0].trim())) { chapterHeader = lines[0].trim(); contentBody = lines.slice(1).join('\n'); }
            const paragraphs = contentBody.split('\n').filter(p => p.trim());
            const targetWords = Math.ceil(countWords(contentBody) / currentSplitMode);
            let currentPart = [], currentCount = 0, rawParts = [];
            for (let p of paragraphs) {
                const wCount = countWords(p);
                if (currentCount + wCount > targetWords && rawParts.length < currentSplitMode - 1) { rawParts.push(currentPart.join('\n\n')); currentPart = [p]; currentCount = wCount; } 
                else { currentPart.push(p); currentCount += wCount; }
            }
            if (currentPart.length) rawParts.push(currentPart.join('\n\n'));
            clearSplitOutputs();
            for(let i = 0; i < currentSplitMode; i++) {
                let pContent = rawParts[i] || '';
                let h = `Phần ${i+1}`;
                if (chapterHeader && pContent) { h = chapterHeader.replace(/(\d+)/, (m, n) => `${n}.${i+1}`); pContent = h + '\n\n' + pContent; }
                const div = document.createElement('div'); div.className = 'split-box';
                div.innerHTML = `
                    <div class="split-header"><span>${pContent ? h : `Phần ${i+1} (Trống)`}</span><span class="badge">${countWords(pContent)} W</span></div>
                    <textarea id="out-split-${i}" class="custom-scrollbar" readonly>${pContent}</textarea>
                    <div class="split-footer"><button class="btn btn-success full-width copy-split-btn" data-target="out-split-${i}" data-seq="${i+1}">Sao chép ${i+1}</button></div>`;
                els.splitWrapper.appendChild(div);
            }
            bindCopyEvents();
            showInlineNotify(els.splitActionBtn, "Đã chia xong!");
        }
        els.splitInput.value = ''; saveTempInput();
    }

    function renderFilledSplitGrid(parts) {
        els.splitWrapper.innerHTML = '';
        parts.forEach((part, index) => {
            const div = document.createElement('div'); div.className = 'split-box';
            div.innerHTML = `
                <div class="split-header"><span>${part.title.substring(0,27)}...</span><span class="badge">${countWords(part.content)} W</span></div>
                <textarea id="out-split-${index}" class="custom-scrollbar" readonly>${part.content}</textarea>
                <div class="split-footer"><button class="btn btn-success full-width copy-split-btn" data-target="out-split-${index}" data-seq="${index+1}">Sao chép ${index+1}</button></div>`;
            els.splitWrapper.appendChild(div);
        });
        bindCopyEvents();
    }

    function bindCopyEvents() {
        els.splitWrapper.querySelectorAll('.copy-split-btn').forEach(b => {
            b.onclick = (e) => {
                const el = document.getElementById(e.target.dataset.target);
                if(el && el.value) { 
                    navigator.clipboard.writeText(el.value); 
                    showInlineNotify(e.target, "Đã chép!");
                } else showInlineNotify(e.target, "Trống!");
            };
        });
    }

    // =========================================================================
    // 6. UI & EVENTS
    // =========================================================================
    
    function renderModeSelect() {
      els.modeSelect.innerHTML = '';
      Object.keys(state.modes).sort().forEach(m => {
        const opt = document.createElement('option'); opt.value = m; opt.textContent = m;
        els.modeSelect.appendChild(opt);
      });
      if(!state.modes[state.currentMode]) state.currentMode = 'default';
      els.modeSelect.value = state.currentMode;
      updateModeUI();
    }
  
    function updateModeUI() {
      const mode = state.modes[state.currentMode];
      if(mode) {
          const upd = (btn, act, txt) => { btn.textContent = `${txt}: ${act ? 'BẬT' : 'Tắt'}`; btn.classList.toggle('active', act); };
          upd(els.matchCaseBtn, mode.matchCase, 'Match Case');
          upd(els.wholeWordBtn, mode.wholeWord, 'Whole Word');
          upd(els.autoCapsBtn, mode.autoCaps, 'Auto Caps');
      }
      
      els.formatCards.forEach(card => card.classList.toggle('active', parseInt(card.dataset.format) === state.dialogueMode));
      els.abCapsCards.forEach(card => card.classList.toggle('active', parseInt(card.dataset.abCaps) === state.abnormalCapsMode));
      
      document.querySelector(`input[name="regex-preset"][value="${state.regexMode}"]`).checked = true;
      els.customRegexInput.value = state.customRegex || '';
    }
  
    function renderList() {
        els.list.innerHTML = '';
        const mode = state.modes[state.currentMode];
        if (!mode || !mode.pairs) return;
        
        mode.pairs.forEach((p, realIndex) => {
            const displayIndex = realIndex + 1;
            const item = document.createElement('div'); item.className = 'punctuation-item';
            item.innerHTML = `
                <div class="index-label">${displayIndex}</div>
                <input type="text" class="find" placeholder="Tìm" value="${p.find.replace(/"/g, '&quot;')}">
                <input type="text" class="replace" placeholder="Thay thế" value="${(p.replace||'').replace(/"/g, '&quot;')}">
                <button class="remove" data-idx="${realIndex}" tabindex="-1">×</button>
            `;
            // Yêu cầu 3: LOẠI BỎ debounceSave() ở sự kiện input. Chỉ cập nhật object trong memory.
            item.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
                p.find = item.querySelector('.find').value;
                p.replace = item.querySelector('.replace').value;
                // KHÔNG GỌI saveState() Ở ĐÂY!
            }));
            item.querySelector('.remove').onclick = () => { mode.pairs.splice(realIndex, 1); saveState(); renderList(); };
            els.list.insertBefore(item, els.list.firstChild);
        });
        checkEmptyState();
    }
    
    function addNewPair() {
        state.modes[state.currentMode].pairs.push({ find: '', replace: '' });
        renderList();
        if(els.list.firstChild) els.list.firstChild.querySelector('.find').focus();
    }

    function checkEmptyState() { 
        els.emptyState.classList.toggle('hidden', state.modes[state.currentMode].pairs.length > 0); 
    }

    function parseCSVLine(text) {
        const result = []; let cell = ''; let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') { if (inQuotes && text[i+1] === '"') { cell += '"'; i++; } else { inQuotes = !inQuotes; } } 
            else if ((char === ',' || char === '\t') && !inQuotes) { result.push(cell.trim()); cell = ''; } 
            else { cell += char; }
        } result.push(cell.trim()); return result;
    }
    function importCSV(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result; const lines = text.split(/\r?\n/);
            if (!lines[0].toLowerCase().includes('find') || !lines[0].toLowerCase().includes('replace')) return showNotification('Lỗi Header CSV!', 'error');
            
            let tempPairs = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim(); if (!line) continue;
                const cols = parseCSVLine(line);
                let stt = 0, find = '', replace = '', modeName = 'default';
                if (!isNaN(parseInt(cols[0])) && cols.length >= 3) {
                     stt = parseInt(cols[0]); find = cols[1]; replace = cols[2]; modeName = cols[3] || 'default';
                } else {
                    find = cols[0]; replace = cols[1]; modeName = cols[2] || 'default'; stt = i;
                }
                if (find) tempPairs.push({ stt, find, replace, modeName });
            }
            tempPairs.sort((a, b) => a.stt - b.stt);
            let count = 0;
            tempPairs.forEach(p => {
                if (!state.modes[p.modeName]) state.modes[p.modeName] = JSON.parse(JSON.stringify(defaultState.modes.default));
                state.modes[p.modeName].pairs.push({ find: p.find, replace: p.replace });
                count++;
            });
            saveState(); renderModeSelect(); renderList(); showNotification(`Đã nhập ${count} cặp!`);
        }; reader.readAsText(file);
    }

    function exportCSV() {
        let csvContent = "\uFEFFstt,find,replace,mode\n"; 
        Object.keys(state.modes).forEach(modeName => {
            const mode = state.modes[modeName];
            let localStt = 1;
            if (mode.pairs) mode.pairs.forEach(p => { 
                csvContent += `${localStt},"${(p.find||'').replace(/"/g, '""')}","${(p.replace||'').replace(/"/g, '""')}","${modeName.replace(/"/g, '""')}"\n`; 
                localStt++;
            });
        });
        const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'settings_v25_tech.csv'; a.click();
    }

    function updateCounters() {
      els.inputCount.textContent = 'Words: ' + countWords(els.inputText.value);
      els.outputCount.textContent = 'Words: ' + countWords(els.outputText.innerText);
      els.splitInputCount.textContent = 'Words: ' + countWords(els.splitInput.value);
    }
    function debounceSave() { clearTimeout(saveTimeout); saveTimeout = setTimeout(() => { saveTempInput(); /* Lưu ý: Không lưu state cài đặt ở đây nữa cho danh sách */ if(state.activeTab !== 'settings') saveState(); }, 500); }
    function saveTempInput() { localStorage.setItem(INPUT_STATE_KEY, JSON.stringify({ inputText: els.inputText.value, splitInput: els.splitInput.value })); }
    function loadTempInput() {
      const saved = JSON.parse(localStorage.getItem(INPUT_STATE_KEY));
      if(saved) { els.inputText.value = saved.inputText || ''; els.splitInput.value = saved.splitInput || ''; }
      updateCounters();
    }
    
    function switchTab(tabId) {
        els.tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
        state.activeTab = tabId; saveState();
        if(tabId === 'split') updateSplitUI();
    }

    function switchSidebar(targetId) {
        els.sidebarBtns.forEach(b => b.classList.toggle('active', b.dataset.target === targetId));
        els.settingPanels.forEach(p => p.classList.toggle('active', p.id === targetId));
    }

    function initEvents() {
      els.tabButtons.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
      els.sidebarBtns.forEach(btn => btn.onclick = () => switchSidebar(btn.dataset.target));

      // Yêu cầu 4: Trạng thái nút theo chế độ
      const toggleHandler = (prop) => { const m = state.modes[state.currentMode]; m[prop] = !m[prop]; saveState(); updateModeUI(); };
      els.matchCaseBtn.onclick = () => toggleHandler('matchCase');
      els.wholeWordBtn.onclick = () => toggleHandler('wholeWord');
      els.autoCapsBtn.onclick = () => toggleHandler('autoCaps');
      
      els.modeSelect.onchange = (e) => { state.currentMode = e.target.value; saveState(); renderList(); };
      
      document.getElementById('add-mode').onclick = () => { 
          const n = prompt('Tên Mode mới:'); 
          if(n && !state.modes[n]) { state.modes[n] = JSON.parse(JSON.stringify(defaultState.modes.default)); state.currentMode = n; saveState(); renderModeSelect(); renderList(); }
      };
      document.getElementById('copy-mode').onclick = () => {
        const n = prompt('Tên Mode bản sao:'); 
        if(n && !state.modes[n]) { state.modes[n] = JSON.parse(JSON.stringify(state.modes[state.currentMode])); state.currentMode = n; saveState(); renderModeSelect(); renderList(); }
      };
      els.renameBtn.onclick = () => { 
          const n = prompt('Tên mới:', state.currentMode); 
          if(n && n !== state.currentMode && !state.modes[n]) { state.modes[n] = state.modes[state.currentMode]; delete state.modes[state.currentMode]; state.currentMode = n; saveState(); renderModeSelect(); renderList(); }
      };
      els.deleteBtn.onclick = () => { 
          if(confirm('Xóa chế độ này?')) { 
              delete state.modes[state.currentMode]; 
              const keys = Object.keys(state.modes);
              if (keys.length === 0) { state.modes['default'] = JSON.parse(JSON.stringify(defaultState.modes.default)); state.currentMode = 'default'; } else { state.currentMode = keys[0]; }
              saveState(); renderModeSelect(); renderList(); 
          }
      };

      document.getElementById('add-pair').onclick = addNewPair;
      // Yêu cầu 3: Chỉ lưu khi bấm nút này
      document.getElementById('save-settings').onclick = () => { saveState(); showNotification('Đã lưu tất cả!'); };
      document.getElementById('export-settings').onclick = exportCSV;
      document.getElementById('import-settings').onclick = () => { const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv'; inp.onchange = e => { if(e.target.files.length) importCSV(e.target.files[0]) }; inp.click(); };
      
      els.replaceBtn.onclick = performReplaceAll;
      els.copyBtn.onclick = () => { 
          if(els.outputText.innerText) { 
              navigator.clipboard.writeText(els.outputText.innerText).then(() => { showInlineNotify(els.copyBtn, 'Đã sao chép!'); }); 
          } else showInlineNotify(els.copyBtn, 'Trống!');
      };

      els.formatCards.forEach(card => {
          card.onclick = () => {
              state.dialogueMode = parseInt(card.dataset.format);
              saveState(); updateModeUI();
          };
      });

      els.abCapsCards.forEach(card => {
          card.onclick = () => {
              state.abnormalCapsMode = parseInt(card.dataset.abCaps);
              saveState(); updateModeUI();
          };
      });

      els.saveRegexBtn.onclick = () => {
          state.regexMode = document.querySelector('input[name="regex-preset"]:checked').value;
          state.customRegex = els.customRegexInput.value;
          saveState();
          showInlineNotify(els.saveRegexBtn, "Đã Lưu!");
      };

      els.splitTypeRadios.forEach(radio => radio.addEventListener('change', updateSplitUI));
      document.querySelectorAll('.split-mode-btn').forEach(btn => btn.onclick = () => { 
          document.querySelectorAll('.split-mode-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); 
          currentSplitMode = parseInt(btn.dataset.split); 
          if(document.querySelector('input[name="split-type"][value="count"]').checked) renderSplitPlaceholders(currentSplitMode);
      });
      els.splitActionBtn.onclick = performSplit;
      
      [els.inputText, els.splitInput].forEach(el => el.addEventListener('input', () => { updateCounters(); debounceSave(); }));
    }

    renderModeSelect(); 
    renderList(); 
    loadTempInput(); 
    if(state.activeTab) switchTab(state.activeTab); 
    updateSplitUI();
    initEvents();
});
