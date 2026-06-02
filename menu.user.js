// ==UserScript==
// @name         Menu z Kodami QR & Barcode - Stacjonarne & Komórkowe (Centralna Baza)
// @namespace    http://tampermonkey.net/
// @version      22.0
// @description  Wersja z możliwością wyboru generowania kodu QR lub kodu kreskowego (Barcode). Podział na zakładki i sekcje. Centralna baza GitHub. Możliwość ukrywania wybranych kodów.
// @author       Kacper & AI
// @match        https://intranet.sbe-online.pl/dt/mitel/index.php*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js
// @require      https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js
//
// @updateURL    https://raw.githubusercontent.com/KapiJoker/SBETEST/main/menu.user.js
// @downloadURL  https://raw.githubusercontent.com/KapiJoker/SBETEST/main/menu.user.js
// ==/UserScript==

(function() {
    'use strict';

    const DATABASE_URL = "https://raw.githubusercontent.com/KapiJoker/SBETEST/refs/heads/main/testqr.json";

    const defaultDatabase = [
        { category: "stacjonarne", section: "---- TELEFONY ----", label: "6863i", value: "6863i 80C00001AAA-A", color: "#0dcaf0" }
    ];

    let customItems = JSON.parse(localStorage.getItem('qrCustomItems')) || defaultDatabase;
    let recentItems = JSON.parse(localStorage.getItem('qrRecentItems')) || [];
    let collapsedSections = JSON.parse(localStorage.getItem('qrCollapsedSections')) || {};
    let hiddenItems = JSON.parse(localStorage.getItem('qrHiddenItems')) || []; 
    let menuPosition = JSON.parse(localStorage.getItem('qrMenuPosition')) || { bottom: '20px', left: '20px', top: 'auto', right: 'auto' };
    let menuSize = JSON.parse(localStorage.getItem('qrMenuSize')) || { width: '240px', height: 'auto' };
    let themeMode = localStorage.getItem('qrThemeMode') || 'dark';
    let isCompactMode = localStorage.getItem('qrCompactMode') === 'true';
    let currentTab = localStorage.getItem('qrCurrentTab') || 'stacjonarne';
    let codeMode = localStorage.getItem('qrCodeMode') || 'qr'; 
    let selectedSearchIndex = -1;

    function fetchExternalDatabase() {
        if (typeof GM_xmlhttpRequest === 'undefined') return;

        const uniqueUrl = DATABASE_URL + "?t=" + new Date().getTime();

        GM_xmlhttpRequest({
            method: "GET",
            url: uniqueUrl,
            anonymous: true,
            headers: {
                "Accept": "application/json",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache"
            },
            onload: function(response) {
                if (response.status === 200) {
                    try {
                        const importedData = JSON.parse(response.responseText);
                        if (Array.isArray(importedData) && importedData.length > 0) {
                            customItems = importedData.filter(item => item.value !== "PLACEHOLDER_EMPTY");
                            localStorage.setItem('qrCustomItems', JSON.stringify(customItems));
                            console.log("Centralna baza danych została pomyślnie zaktualizowana z GitHuba.");
                            renderList();
                        }
                    } catch (e) { console.error("Błąd parsowania:", e); }
                }
            }
        });
    }

    function getAllSectionTitles() {
        const titles = [];
        customItems.forEach(item => { if (item.section && !titles.includes(item.section)) titles.push(item.section); });
        return titles;
    }

    function getMergedSections() {
        const sectionsMap = {};
        const filteredItems = customItems.filter(item => (item.category || 'stacjonarne') === currentTab && !hiddenItems.includes(item.value));

        filteredItems.forEach((cItem) => {
            if (!sectionsMap[cItem.section]) sectionsMap[cItem.section] = { title: cItem.section, items: [] };
            sectionsMap[cItem.section].items.push({ label: cItem.label, value: cItem.value, color: cItem.color || null, category: cItem.category });
        });
        return Object.values(sectionsMap);
    }

    const savedVisibility = localStorage.getItem('qrMenuVisibility') || 'block';
    let savedQRValue = localStorage.getItem('qrLastSelectedValue');

    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
        :root {
            --qr-bg-dark: rgba(33, 37, 41, 0.95);
            --qr-text-dark: #f8f9fa;
            --qr-border-dark: rgba(255, 255, 255, 0.1);
            --qr-input-dark: rgba(255, 255, 255, 0.06);
            --qr-btn-dark: rgba(255, 255, 255, 0.06);
            --qr-btn-hover-dark: rgba(255, 255, 255, 0.14);
            --qr-sec-header-dark: rgba(255, 255, 255, 0.03);
            --qr-sec-text-dark: #6c757d;

            --qr-bg-light: rgba(255, 255, 255, 0.98);
            --qr-text-light: #212529;
            --qr-border-light: rgba(0, 0, 0, 0.15);
            --qr-input-light: rgba(0, 0, 0, 0.04);
            --qr-btn-light: rgba(0, 0, 0, 0.05);
            --qr-btn-hover-light: rgba(0, 0, 0, 0.1);
            --qr-sec-header-light: rgba(0, 0, 0, 0.03);
            --qr-sec-text-light: #495057;
        }
        .qr-menu-container { transition: background-color 0.3s, color 0.3s, border-color 0.3s; }
        .qr-item-btn { transition: background 0.15s, color 0.15s, padding 0.1s, font-size 0.1s, margin 0.1s; font-size: 11px; padding: 3px 6px; margin: 2px 0; }
        .qr-tab-btn { transition: background 0.2s, color 0.2s, border-color 0.2s; border-bottom: 2px solid transparent; }
        .qr-tab-btn.active { border-bottom-color: #0d6efd !important; font-weight: bold; opacity: 1 !important; }
        .qr-scrollable-list::-webkit-scrollbar { width: 4px; }
        .qr-scrollable-list::-webkit-scrollbar-track { background: transparent; }
        .qr-scrollable-list::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.4); border-radius: 10px; }
    `;
    document.head.appendChild(styleEl);

    const menu = document.createElement('div');
    menu.className = 'qr-menu-container';
    menu.style.cssText = "position:fixed; min-width:160px; z-index:999999; backdrop-filter:blur(4px); padding:10px; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.3); font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-sizing:border-box;";
    menu.style.bottom = menuPosition.bottom;
    menu.style.left = menuPosition.left;
    menu.style.top = menuPosition.top;
    menu.style.right = menuPosition.right;
    menu.style.width = menuSize.width;
    menu.style.height = menuSize.height;
    menu.style.display = savedVisibility === 'none' ? 'none' : 'flex';
    menu.style.flexDirection = 'column';
    document.body.appendChild(menu);

    const floatingQR = document.createElement('div');
    floatingQR.style.cssText = "position:fixed; padding:8px; border-radius:8px; display:none; flex-direction:column; align-items:center; box-shadow:0 10px 25px rgba(0,0,0,0.3); z-index:9999999;";
    document.body.appendChild(floatingQR);

    const floatingQRWrapper = document.createElement('div');
    floatingQRWrapper.style.cssText = "background:#fff; padding:6px; border-radius:4px; display:inline-block; text-align:center;";
    floatingQR.appendChild(floatingQRWrapper);

    const infoStatus = document.createElement('div');
    infoStatus.style.cssText = "font-size:9px; color:#198754; font-weight:600; margin-top:4px; text-align:center; height:11px;";
    floatingQR.appendChild(infoStatus);

    const floatingClose = document.createElement('button');
    floatingClose.innerText = '✕ Zamknij';
    floatingClose.style.cssText = "margin-top:4px; width:100%; font-size:9px; padding:2px; cursor:pointer; border:none; background:rgba(255,255,255,0.1); border-radius:3px; font-weight:bold;";
    floatingClose.onclick = () => { floatingQR.style.display = 'none'; };
    floatingQR.appendChild(floatingClose);

    function updateFloatingQRPosition() {
        const rect = menu.getBoundingClientRect();
        if (codeMode === 'qr') {
            floatingQR.style.width = "115px";
            if (rect.left > window.innerWidth / 2) { floatingQR.style.left = (rect.left - 135) + 'px'; }
            else { floatingQR.style.left = (rect.right + 10) + 'px'; }
        } else {
            floatingQR.style.width = "270px";
            if (rect.left > window.innerWidth / 2) { floatingQR.style.left = (rect.left - 290) + 'px'; }
            else { floatingQR.style.left = (rect.right + 10) + 'px'; }
        }
        
        floatingQR.style.top = rect.top + 'px';
        floatingQR.style.backgroundColor = themeMode === 'dark' ? '#2b3035' : '#f8f9fa';
        floatingQR.style.border = themeMode === 'dark' ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.15)';
        floatingClose.style.color = themeMode === 'dark' ? '#fff' : '#000';
    }

    const headerRow = document.createElement('div');
    headerRow.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid var(--border-color); padding-bottom:4px; cursor:move; user-select:none; flex-shrink:0; gap:4px;";
    menu.appendChild(headerRow);

    const titleGroup = document.createElement('div');
    titleGroup.style.cssText = "display:flex; align-items:center; gap:4px;";
    headerRow.appendChild(titleGroup);

    const title = document.createElement('div');
    title.innerText = '📱 CODE';
    title.style.cssText = "font-weight:700; font-size:10px; letter-spacing:0.5px; opacity:0.7;";
    titleGroup.appendChild(title);

    const brakBtn = document.createElement('button');
    brakBtn.innerText = 'Brak';
    brakBtn.style.cssText = "padding:1px 5px; font-size:9px; font-weight:bold; cursor:pointer; border-radius:3px; border:none; background:#dc3545; color:#fff; line-height:1.1;";
    brakBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText('brak').then(() => {
            infoStatus.innerText = '📋 Brak!';
            setTimeout(() => { infoStatus.innerText = ''; }, 1000);
        });
        savedQRValue = 'brak';
        localStorage.setItem('qrLastSelectedValue', 'brak');
        showQR('brak');
    };
    titleGroup.appendChild(brakBtn);

    const modeToggleBtn = document.createElement('button');
    modeToggleBtn.innerText = codeMode === 'qr' ? '🔲 QR' : '📊 Paski';
    modeToggleBtn.style.cssText = "padding:1px 5px; font-size:9px; font-weight:bold; cursor:pointer; border-radius:3px; border:none; background:#0d6efd; color:#fff; line-height:1.1;";
    modeToggleBtn.onclick = (e) => {
        e.stopPropagation();
        codeMode = codeMode === 'qr' ? 'barcode' : 'qr';
        localStorage.setItem('qrCodeMode', codeMode);
        modeToggleBtn.innerText = codeMode === 'qr' ? '🔲 QR' : '📊 Paski';
        if (savedQRValue) showQR(savedQRValue);
    };
    titleGroup.appendChild(modeToggleBtn);

    const rightHeaderGroup = document.createElement('div');
    rightHeaderGroup.style.cssText = "display:flex; align-items:center; gap:6px; flex-shrink:0;";
    headerRow.appendChild(rightHeaderGroup);

    const compactBtn = document.createElement('button');
    compactBtn.innerText = isCompactMode ? '✨ Pełny' : '👓 Mini';
    compactBtn.style.cssText = "background:none; border:none; cursor:pointer; font-size:9px; font-weight:700; color:#0d6efd; outline:none; padding:2px;";
    rightHeaderGroup.appendChild(compactBtn);

    const themeBtn = document.createElement('button');
    themeBtn.style.cssText = "background:none; border:none; cursor:pointer; font-size:11px; padding:2px; line-height:1; outline:none;";
    rightHeaderGroup.appendChild(themeBtn);

    function applyTheme(theme) {
        themeMode = theme;
        localStorage.setItem('qrThemeMode', theme);
        if (theme === 'dark') {
            themeBtn.innerText = '🌙';
            menu.style.backgroundColor = 'var(--qr-bg-dark)';
            menu.style.color = 'var(--qr-text-dark)';
            menu.style.border = '1px solid var(--qr-border-dark)';
        } else {
            themeBtn.innerText = '☀️';
            menu.style.backgroundColor = 'var(--qr-bg-light)';
            menu.style.color = 'var(--qr-text-light)';
            menu.style.border = '1px solid var(--qr-border-light)';
        }
        updateTabsUI();
        renderList();
    }

    themeBtn.onclick = (e) => { e.stopPropagation(); applyTheme(themeMode === 'dark' ? 'light' : 'dark'); };
    compactBtn.onclick = (e) => {
        e.stopPropagation();
        isCompactMode = !isCompactMode;
        localStorage.setItem('qrCompactMode', isCompactMode);
        compactBtn.innerText = isCompactMode ? '✨ Pełny' : '👓 Mini';
        floatingQR.style.display = 'none';
        renderList();
    };

    let isDragging = false, startX, startY;
    headerRow.addEventListener('mousedown', (e) => {
        if(e.target.tagName === 'BUTTON') return;
        isDragging = true;
        startX = e.clientX - menu.offsetLeft;
        startY = e.clientY - menu.offsetTop;
        menu.style.bottom = 'auto'; menu.style.right = 'auto';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        menu.style.left = (e.clientX - startX) + 'px';
        menu.style.top = (e.clientY - startY) + 'px';
        if (floatingQR.style.display === 'flex') updateFloatingQRPosition();
    });
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            localStorage.setItem('qrMenuPosition', JSON.stringify({ left: menu.style.left, top: menu.style.top, bottom: 'auto', right: 'auto' }));
        }
    });

    const tabsContainer = document.createElement('div');
    tabsContainer.style.cssText = "display:flex; width:100%; margin-bottom:6px; border-bottom:1px solid rgba(128,128,128,0.15); flex-shrink:0;";
    menu.appendChild(tabsContainer);

    const tabStacjonarne = document.createElement('button');
    tabStacjonarne.className = 'qr-tab-btn';
    tabStacjonarne.innerText = '🖥️ Stacjonarne';
    tabStacjonarne.style.cssText = "flex:1; padding:4px; font-size:10px; background:none; border:none; cursor:pointer; outline:none; opacity:0.5;";

    const tabKomorkowe = document.createElement('button');
    tabKomorkowe.className = 'qr-tab-btn';
    tabKomorkowe.innerText = '📱 Komórkowe';
    tabKomorkowe.style.cssText = "flex:1; padding:4px; font-size:10px; background:none; border:none; cursor:pointer; outline:none; opacity:0.5;";

    tabsContainer.appendChild(tabStacjonarne);
    tabsContainer.appendChild(tabKomorkowe);

    function updateTabsUI() {
        [tabStacjonarne, tabKomorkowe].forEach(btn => {
            btn.classList.remove('active');
            btn.style.color = themeMode === 'dark' ? '#fff' : '#000';
        });
        if (currentTab === 'stacjonarne') tabStacjonarne.classList.add('active');
        else tabKomorkowe.classList.add('active');
    }

    function switchTab(tabName) {
        currentTab = tabName;
        localStorage.setItem('qrCurrentTab', tabName);
        searchInput.value = '';
        updateTabsUI();
        renderList();
    }

    tabStacjonarne.onclick = () => switchTab('stacjonarne');
    tabKomorkowe.onclick = () => switchTab('komorkowe');

    const customGenInput = document.createElement('input');
    customGenInput.type = 'text';
    customGenInput.placeholder = '✍️ Własny tekst...';
    customGenInput.style.cssText = "width:100%; box-sizing:border-box; padding:4px 6px; margin-bottom:4px; border-radius:4px; font-size:10px; outline:none; font-style:italic; flex-shrink:0;";
    menu.appendChild(customGenInput);

    customGenInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const val = customGenInput.value.trim();
            if (!val) return;
            navigator.clipboard.writeText(val).then(() => {
                infoStatus.innerText = '📋 Skopiowano!';
                setTimeout(() => { infoStatus.innerText = ''; }, 1000);
            });
            savedQRValue = val;
            localStorage.setItem('qrLastSelectedValue', val);
            showQR(val);
            customGenInput.value = '';
        }
    });

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 Szukaj kodu...';
    searchInput.style.cssText = "width:100%; box-sizing:border-box; padding:4px 6px; margin-bottom:6px; border-radius:4px; font-size:10px; outline:none; flex-shrink:0;";
    menu.appendChild(searchInput);

    function updateInputsStyle() {
        const bg = themeMode === 'dark' ? 'var(--qr-input-dark)' : 'var(--qr-input-light)';
        const border = themeMode === 'dark' ? '1px solid var(--qr-border-dark)' : '1px solid var(--qr-border-light)';
        const color = themeMode === 'dark' ? '#fff' : '#000';
        [searchInput, customGenInput].forEach(el => { el.style.background = bg; el.style.border = border; el.style.color = color; });
    }

    const listContainer = document.createElement('div');
    listContainer.className = 'qr-scrollable-list';
    listContainer.style.cssText = "flex-grow:1; overflow-y:auto; margin-bottom:6px; padding-right:2px; scrollbar-width:thin;";
    menu.appendChild(listContainer);

    let allButtons = [];

    function showQR(value) {
        if (!value) return;

        if (hiddenItems.includes(value)) {
            if (typeof floatingQR !== 'undefined') floatingQR.style.display = 'none';
            savedQRValue = '';
            localStorage.removeItem('qrLastSelectedValue');
            return;
        }

        if (menu && menu.style.display === 'none') {
            if (typeof floatingQR !== 'undefined') floatingQR.style.display = 'none';
            return;
        }

        floatingQRWrapper.innerHTML = '';
        try {
            if (codeMode === 'qr') {
                new QRCode(floatingQRWrapper, { text: value, width: 95, height: 95 });
            } else {
                const svgNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                floatingQRWrapper.appendChild(svgNode);
                
                let barWidth = 1.6;
                if (value.length > 15) barWidth = 1.1;
                else if (value.length > 10) barWidth = 1.3;

                JsBarcode(svgNode, value, {
                    format: "CODE128",
                    width: barWidth,
                    height: 55,         
                    displayValue: true,
                    fontSize: 11,
                    margin: 12,         
                    background: "#ffffff",
                    lineColor: "#000000"
                });
            }
            floatingQR.style.display = 'flex';
            updateFloatingQRPosition();
        } catch(e) { 
            console.error("Błąd generowania kodu:", e); 
            floatingQRWrapper.innerText = "Błąd formatu danych";
        }

        allButtons.forEach(btnObj => {
            if (btnObj.value === value) {
                btnObj.element.style.background = 'linear-gradient(135deg, #198754, #146c43)';
                btnObj.element.style.color = '#fff';
                btnObj.element.style.borderLeft = `3px solid ${btnObj.color || '#39d353'}`;
                btnObj.element.dataset.active = "true";
            } else {
                btnObj.element.style.background = themeMode === 'dark' ? 'var(--qr-btn-dark)' : 'var(--qr-btn-light)';
                btnObj.element.style.color = themeMode === 'dark' ? 'var(--qr-text-dark)' : 'var(--qr-text-light)';
                btnObj.element.style.borderLeft = btnObj.color ? `3px solid ${btnObj.color}` : '3px solid transparent';
                btnObj.element.dataset.active = "false";
            }
        });
    }

    function addToRecent(label, value, color, category) {
        navigator.clipboard.writeText(value).then(() => {
            infoStatus.innerText = '📋 Skopiowano!';
            setTimeout(() => { infoStatus.innerText = ''; }, 1000);
        });
        recentItems = recentItems.filter(item => item.value !== value);
        recentItems.unshift({ label, value, color, category: category || currentTab });
        if (recentItems.length > 3) recentItems.pop();
        localStorage.setItem('qrRecentItems', JSON.stringify(recentItems));
        savedQRValue = value;
        localStorage.setItem('qrLastSelectedValue', value);
        renderList();
    }

    function createButton(item) {
        const btn = document.createElement('button');
        btn.className = 'qr-item-btn';
        btn.innerText = item.label;
        btn.style.cssText = "display:block; width:100%; border:none; border-radius:3px; cursor:pointer; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
        btn.style.background = themeMode === 'dark' ? 'var(--qr-btn-dark)' : 'var(--qr-btn-light)';
        btn.style.color = themeMode === 'dark' ? 'var(--qr-text-dark)' : 'var(--qr-text-light)';
        btn.style.borderLeft = item.color ? `3px solid ${item.color}` : '3px solid transparent';
        btn.title = `Wartość: ${item.value}`;

        btn.onmouseover = () => { if (btn.dataset.active !== "true") btn.style.background = themeMode === 'dark' ? 'var(--qr-btn-hover-dark)' : 'var(--qr-btn-hover-light)'; };
        btn.onmouseout = () => { if (btn.dataset.active !== "true") btn.style.background = themeMode === 'dark' ? 'var(--qr-btn-dark)' : 'var(--qr-btn-light)'; };
        btn.onclick = (e) => { e.stopPropagation(); addToRecent(item.label, item.value, item.color, item.category); };

        allButtons.push({ value: item.value, label: item.label.toLowerCase(), element: btn, color: item.color });
        return btn;
    }

    function renderList() {
        listContainer.innerHTML = '';
        allButtons = [];
        updateInputsStyle();

        listContainer.style.maxHeight = isCompactMode ? '240px' : '350px';

        if (isCompactMode) {
            menu.style.width = '170px';
            menu.style.height = 'auto';
            tabsContainer.style.display = 'flex';
            customGenInput.style.display = 'none';
            manageBtn.style.display = 'none';
            resizer.style.display = 'none';

            customItems.forEach(item => {
                if (item.value === "PLACEHOLDER_EMPTY" || hiddenItems.includes(item.value)) return;

                const itemCategory = item.category ? item.category.trim().toLowerCase() : 'stacjonarne';
                const activeTab = currentTab ? currentTab.trim().toLowerCase() : 'stacjonarne';

                if (itemCategory === activeTab) {
                    const btn = createButton(item);
                    btn.style.padding = "4px 6px";
                    btn.style.fontSize = "10px";
                    btn.style.margin = "2px 0";
                    listContainer.appendChild(btn);
                }
            });

        } else {
            menu.style.width = menuSize.width;
            menu.style.height = menuSize.height;
            tabsContainer.style.display = 'flex';
            customGenInput.style.display = 'block';
            manageBtn.style.display = 'block';
            resizer.style.display = 'flex';

            const filteredRecent = recentItems.filter(item => (item.category || 'stacjonarne') === currentTab && !hiddenItems.includes(item.value));
            if (filteredRecent.length > 0) {
                const recentWrapper = document.createElement('div');
                const recentHeader = document.createElement('div');
                recentHeader.innerText = "⭐ OSTATNIE";
                recentHeader.style.cssText = "font-size:9px; font-weight:700; color:#fd7e14; margin:2px 0 4px 0; text-align:center;";
                recentWrapper.appendChild(recentHeader);
                filteredRecent.forEach(item => recentWrapper.appendChild(createButton(item)));
                listContainer.appendChild(recentWrapper);
            }

            getMergedSections().forEach((section) => {
                if (section.items.length === 0) return;

                const sectionWrapper = document.createElement('div');
                sectionWrapper.className = 'qr-section-wrapper';
                const buttonsContainer = document.createElement('div');

                const isCollapsed = collapsedSections[section.title];
                const header = document.createElement('div');
                header.innerHTML = `<span>${isCollapsed ? '▶' : '▼'}</span> ${section.title}`;
                header.style.cssText = "font-size:9px; font-weight:700; border-radius:3px; cursor:pointer; user-select:none; display:flex; gap:4px; align-items:center; padding:4px; margin:6px 0 3px 0;";
                header.style.background = themeMode === 'dark' ? 'var(--qr-sec-header-dark)' : 'var(--qr-sec-header-light)';
                header.style.color = themeMode === 'dark' ? 'var(--qr-sec-text-dark)' : 'var(--qr-sec-text-light)';

                if (isCollapsed) { buttonsContainer.style.display = 'none'; header.style.opacity = '0.6'; }

                header.onclick = (e) => {
                    e.stopPropagation();
                    const hidden = buttonsContainer.style.display === 'none';
                    buttonsContainer.style.display = hidden ? 'block' : 'none';
                    header.querySelector('span').innerText = hidden ? '▼' : '▶';
                    header.style.opacity = hidden ? '1' : '0.6';
                    collapsedSections[section.title] = !hidden;
                    localStorage.setItem('qrCollapsedSections', JSON.stringify(collapsedSections));
                };
                sectionWrapper.appendChild(header);

                section.items.forEach(item => {
                    if (item.value === "PLACEHOLDER_EMPTY") return;
                    const btn = createButton(item);
                    btn.style.padding = "5px 8px";
                    btn.style.fontSize = "11px";
                    btn.style.margin = "3px 0";
                    buttonsContainer.appendChild(btn);
                });

                sectionWrapper.appendChild(buttonsContainer);
                listContainer.appendChild(sectionWrapper);
            });
        }

        if (savedQRValue && !hiddenItems.includes(savedQRValue)) showQR(savedQRValue);
    }

    const manageBtn = document.createElement('div');
    manageBtn.innerText = '⚙️ Ustawienia bazy';
    manageBtn.style.cssText = "font-size:10px; color:#6c757d; cursor:pointer; text-align:center; margin-top:6px; border-top:1px solid rgba(128,128,128,0.2); padding-top:6px; font-weight:600; flex-shrink:0;";
    menu.appendChild(manageBtn);

    const resizer = document.createElement('div');
    resizer.style.cssText = "position:absolute; right:2px; bottom:2px; width:10px; height:10px; cursor:se-resize; user-select:none; font-size:8px; color:#6c757d; display:flex; align-items:flex-end; justify-content:flex-end;";
    resizer.innerText = "◢";
    menu.appendChild(resizer);

    resizer.addEventListener('mousedown', function(e) {
        e.preventDefault(); e.stopPropagation();
        window.addEventListener('mousemove', resizeMenu);
        window.addEventListener('mouseup', stopResizeMenu);
    });
    function resizeMenu(e) {
        if(isCompactMode) return;
        menu.style.width = (e.clientX - menu.getBoundingClientRect().left) + 'px';
        menu.style.height = (e.clientY - menu.getBoundingClientRect().top) + 'px';
    }
    function stopResizeMenu() {
        window.removeEventListener('mousemove', resizeMenu);
        window.removeEventListener('mouseup', stopResizeMenu);
        localStorage.setItem('qrMenuSize', JSON.stringify({ width: menu.style.width, height: menu.style.height }));
    }

    const modalOverlay = document.createElement('div');
    modalOverlay.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,17,20,0.6); backdrop-filter:blur(4px); z-index:9999999; display:none; justify-content:center; align-items:center; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;";
    const modalContainer = document.createElement('div');
    modalContainer.style.cssText = "width:520px; padding:24px; box-shadow:0 20px 50px rgba(0,0,0,0.4); max-height:85vh; overflow-y:auto; border-radius:14px; scrollbar-width:thin;";
    modalOverlay.appendChild(modalContainer);
    document.body.appendChild(modalOverlay);

    function renderModalContent() {
        modalContainer.innerHTML = '';
        let sectionSelect, labelInput, valueInput, colorInput, categorySelect;

        if (themeMode === 'dark') { modalContainer.style.background = '#1e222b'; modalContainer.style.color = '#f8f9fa'; modalContainer.style.border = '1px solid rgba(255,255,255,0.08)'; }
        else { modalContainer.style.background = '#ffffff'; modalContainer.style.color = '#212529'; modalContainer.style.border = '1px solid rgba(0,0,0,0.1)'; }

        const mHeader = document.createElement('div');
        mHeader.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid rgba(128,128,128,0.2); padding-bottom:12px;";
        const mTitle = document.createElement('h3'); mTitle.innerText = '⚙️ Konfiguracja bazy QR / Barcode'; mTitle.style.cssText = "margin:0; font-size:16px; font-weight:600;";
        const closeBtn = document.createElement('button'); closeBtn.innerText = '✕'; closeBtn.style.cssText = "background:none; border:none; font-size:18px; color:#6c757d; cursor:pointer;";
        closeBtn.onclick = () => { modalOverlay.style.display = 'none'; };
        mHeader.appendChild(mTitle); mHeader.appendChild(closeBtn); modalContainer.appendChild(mHeader);

        const currentSections = getAllSectionTitles();
        const gridForms = document.createElement('div'); gridForms.style.cssText = "display:grid; grid-template-columns: 1fr; gap:16px; margin-bottom:20px;";
        modalContainer.appendChild(gridForms);

        const cardStyle = `padding:14px; border-radius:8px; background:${themeMode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'}; border:1px solid ${themeMode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'};`;
        const inputStyle = `width:100%; padding:8px; box-sizing:border-box; border-radius:5px; font-size:12px; margin-bottom:8px; outline:none; background:${themeMode === 'dark' ? '#11141a' : '#fff'}; border:1px solid ${themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.2)'}; color:${themeMode === 'dark' ? '#fff' : '#000'};`;

        const cardSec = document.createElement('div'); cardSec.style.cssText = cardStyle;
        cardSec.innerHTML = `<div style="font-size:12px; font-weight:600; margin-bottom:10px; color:#0dcaf0;">📁 Krok 1: Utwórz nową grupę/sekcję</div>`;
        const catSecSelect = document.createElement('select'); catSecSelect.style.cssText = inputStyle; catSecSelect.innerHTML = `<option value="stacjonarne">🖥️ Stacjonarne</option><option value="komorkowe">📱 Komórkowe</option>`;
        cardSec.appendChild(catSecSelect);
        const secInput = document.createElement('input'); secInput.placeholder = 'Nazwa sekcji (np. BATERIE)'; secInput.style.cssText = inputStyle; cardSec.appendChild(secInput);
        const secBtn = document.createElement('button'); secBtn.innerText = 'Utwórz sekcję'; secBtn.style.cssText = "width:100%; padding:8px; background:#0dcaf0; color:#000; border:none; border-radius:5px; font-weight:700; cursor:pointer;";
        secBtn.onclick = () => {
            const raw = secInput.value.trim(); if (!raw) return;
            const formatted = raw.startsWith('----') ? raw : `---- ${raw.toUpperCase()} ----`;
            customItems.push({ category: catSecSelect.value, section: formatted, label: `[Pusta sekcja]`, value: "PLACEHOLDER_EMPTY", color: null });
            localStorage.setItem('qrCustomItems', JSON.stringify(customItems));
            renderList(); renderModalContent();
        };
        cardSec.appendChild(secBtn); gridForms.appendChild(cardSec);

        const cardRec = document.createElement('div'); cardRec.style.cssText = cardStyle;
        cardRec.innerHTML = `<div style="font-size:12px; font-weight:600; margin-bottom:10px; color:#198754;">➕ Krok 2: Dodaj przycisk</div>`;
        categorySelect = document.createElement('select'); categorySelect.style.cssText = inputStyle; categorySelect.innerHTML = `<option value="stacjonarne">🖥️ Typ: Stacjonarne</option><option value="komorkowe">📱 Typ: Komórkowe</option>`;
        cardRec.appendChild(categorySelect);
        sectionSelect = document.createElement('select'); sectionSelect.style.cssText = inputStyle;
        currentSections.forEach(title => { const opt = document.createElement('option'); opt.value = title; opt.innerText = title; sectionSelect.appendChild(opt); });
        cardRec.appendChild(sectionSelect);
        labelInput = document.createElement('input'); labelInput.placeholder = 'Nazwa przycisku'; labelInput.style.cssText = inputStyle; cardRec.appendChild(labelInput);
        valueInput = document.createElement('input'); valueInput.placeholder = 'Tekst / wartość kodu'; valueInput.style.cssText = inputStyle; cardRec.appendChild(valueInput);

        const colorContainer = document.createElement('div'); colorContainer.style.cssText = "display:flex; align-items:center; gap:10px; margin-bottom:10px;"; colorContainer.innerHTML = `<span style="font-size:11px;">🎨 Kolor paska:</span>`;
        colorInput = document.createElement('input'); colorInput.type = 'color'; colorInput.value = '#0d6efd'; colorInput.style.cssText = "border:none; background:none; cursor:pointer; width:40px; height:24px;";
        colorContainer.appendChild(colorInput); cardRec.appendChild(colorContainer);

        const saveBtn = document.createElement('button'); saveBtn.innerText = 'Zapisz do bazy'; saveBtn.style.cssText = "width:100%; padding:8px; color:#fff; border:none; border-radius:5px; font-weight:700; cursor:pointer; background:#198754;";
        saveBtn.onclick = () => {
            const category = categorySelect.value; const section = sectionSelect.value; const label = labelInput.value.trim(); const value = valueInput.value.trim(); const color = colorInput.value;
            if (!section || !label || !value) { alert('Wypełnij pola!'); return; }
            customItems = customItems.filter(item => !(item.section === section && item.value === "PLACEHOLDER_EMPTY"));
            customItems.push({ category, section, label, value, color });
            localStorage.setItem('qrCustomItems', JSON.stringify(customItems));
            renderList(); renderModalContent();
        };
        cardRec.appendChild(saveBtn); gridForms.appendChild(cardRec);

        const listHeader = document.createElement('div');
        listHeader.innerText = "📋 Wszystkie kody (Pokaż / Ukryj / Usuń):";
        listHeader.style.cssText = "font-size:12px; font-weight:600; margin-bottom:6px; color:#6c757d;";
        modalContainer.appendChild(listHeader);

        const itemsScrollContainer = document.createElement('div'); itemsScrollContainer.style.cssText = "max-height:180px; overflow-y:auto; border-radius:8px; padding:4px; margin-bottom:20px; scrollbar-width:thin;";
        itemsScrollContainer.style.background = themeMode === 'dark' ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.03)';
        modalContainer.appendChild(itemsScrollContainer);

        customItems.forEach((item, index) => {
            if(item.value === "PLACEHOLDER_EMPTY") return;
            
            const isHidden = hiddenItems.includes(item.value);
            
            const itemRow = document.createElement('div'); itemRow.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:6px; border-bottom:1px solid rgba(128,128,128,0.1); font-size:11px;";
            if (isHidden) itemRow.style.opacity = '0.4';

            itemRow.innerHTML = `<div>${item.category === 'komorkowe' ? '📱' : '🖥️'} <span style="background:${item.color || '#6c757d'}; color:#fff; padding:1px 4px; border-radius:3px;">${item.section}</span> <b>${item.label}</b></div>`;
            
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = "display:flex; gap:12px; align-items:center;";

            const hideBtn = document.createElement('button');
            hideBtn.innerText = isHidden ? '🙈' : '👁️';
            hideBtn.title = isHidden ? "Pokaż w menu" : "Ukryj z menu";
            hideBtn.style.cssText = "background:none; border:none; cursor:pointer; font-size:13px; padding:2px;";
            hideBtn.onclick = () => {
                if (isHidden) {
                    hiddenItems = hiddenItems.filter(v => v !== item.value);
                } else {
                    hiddenItems.push(item.value);
                }
                localStorage.setItem('qrHiddenItems', JSON.stringify(hiddenItems));
                renderList();
                renderModalContent();
            };

            const delBtn = document.createElement('button'); delBtn.innerText = '❌'; delBtn.style.cssText = "background:none; border:none; cursor:pointer;";
            delBtn.onclick = () => { if (confirm("Usunąć?")) { customItems.splice(index, 1); localStorage.setItem('qrCustomItems', JSON.stringify(customItems)); renderList(); renderModalContent(); } };
            
            btnContainer.appendChild(hideBtn);
            btnContainer.appendChild(delBtn);
            itemRow.appendChild(btnContainer); 
            itemsScrollContainer.appendChild(itemRow);
        });

        const backupBtnGrid = document.createElement('div'); backupBtnGrid.style.cssText = "display:grid; grid-template-columns: 1fr 1fr; gap:8px;";
        const exportBtn = document.createElement('button'); exportBtn.innerText = '📥 Eksport'; exportBtn.style.cssText = "padding:6px; cursor:pointer;";
        exportBtn.onclick = () => { const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(customItems, null, 2)); const dl = document.createElement('a'); dl.setAttribute("href", dataStr); dl.setAttribute("download", "baza.json"); dl.click(); };
        const resetBtn = document.createElement('button'); resetBtn.innerText = '🚨 Reset Fabryczny'; resetBtn.style.cssText = "padding:6px; background:#dc3545; color:#fff; border:none; border-radius:4px; cursor:pointer;";
        resetBtn.onclick = () => { if (confirm("Zresetować pamięć i wymusić ponowne pobranie z GitHub?")) { localStorage.removeItem('qrCustomItems'); localStorage.removeItem('qrHiddenItems'); hiddenItems = []; customItems = JSON.parse(JSON.stringify(defaultDatabase)); fetchExternalDatabase(); modalOverlay.style.display = 'none'; } };
        backupBtnGrid.appendChild(exportBtn); backupBtnGrid.appendChild(resetBtn); modalContainer.appendChild(backupBtnGrid);
    }

    manageBtn.onclick = () => { renderModalContent(); modalOverlay.style.display = 'flex'; };
    modalOverlay.onclick = (e) => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; };

    function getVisibleButtons() { return Array.from(listContainer.querySelectorAll('.qr-item-btn')).filter(b => b.style.display !== 'none'); }

    function updateSearchFocus() {
        const visibleButtons = getVisibleButtons();
        visibleButtons.forEach((btn, index) => {
            if (index === selectedSearchIndex) {
                btn.style.outline = '2px solid #fd7e14'; btn.style.background = 'rgba(13, 110, 253, 0.3)'; btn.scrollIntoView({ block: 'nearest' });
            } else {
                btn.style.outline = 'none'; btn.style.background = btn.dataset.active === "true" ? 'linear-gradient(135deg, #198754, #146c43)' : (themeMode === 'dark' ? 'var(--qr-btn-dark)' : 'var(--qr-btn-light)');
            }
        });
    }

    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase().trim();
        const buttons = listContainer.querySelectorAll('.qr-item-btn');
        const wrappers = listContainer.querySelectorAll('.qr-section-wrapper');
        selectedSearchIndex = -1;

        if (isCompactMode) {
            buttons.forEach(btn => {
                const btnData = allButtons.find(b => b.element === btn);
                if (btnData && (btnData.label.includes(query) || btnData.value.toLowerCase().includes(query))) { btn.style.display = 'block'; }
                else { btn.style.display = 'none'; }
            });
        } else {
            wrappers.forEach(wrapper => {
                const sectionBtns = wrapper.querySelectorAll('.qr-item-btn');
                let hasVisibleItems = false;
                sectionBtns.forEach(btn => {
                    const btnData = allButtons.find(b => b.element === btn);
                    if (btnData && (btnData.label.includes(query) || btnData.value.toLowerCase().includes(query))) { btn.style.display = 'block'; hasVisibleItems = true; }
                    else { btn.style.display = 'none'; }
                });
                wrapper.style.display = hasVisibleItems ? 'block' : 'none';
            });
        }
    });

    searchInput.addEventListener('keydown', function(e) {
        const visibleButtons = getVisibleButtons(); if (visibleButtons.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); selectedSearchIndex = (selectedSearchIndex + 1) % visibleButtons.length; updateSearchFocus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); selectedSearchIndex = (selectedSearchIndex - 1 + visibleButtons.length) % visibleButtons.length; updateSearchFocus(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (visibleButtons[selectedSearchIndex || 0]) visibleButtons[selectedSearchIndex || 0].click(); }
    });

    window.addEventListener('keydown', function(e) {
        if (e.key === 'F3') {
            e.preventDefault();
            if (menu.style.display === 'none') {
                menu.style.display = 'flex';
                localStorage.setItem('qrMenuVisibility', 'flex');
                searchInput.focus();
                if (typeof savedQRValue !== 'undefined' && savedQRValue && !hiddenItems.includes(savedQRValue)) {
                    showQR(savedQRValue);
                }
            }
            else {
                menu.style.display = 'none';
                localStorage.setItem('qrMenuVisibility', 'none');
                if (typeof floatingQR !== 'undefined') floatingQR.style.display = 'none';
            }
        }
    });

    applyTheme(themeMode);
    fetchExternalDatabase();
})();
