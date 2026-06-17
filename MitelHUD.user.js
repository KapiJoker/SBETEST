// ==UserScript==
// @name         Mitel Intelligence System HUD
// @namespace    http://tampermonkey.net/
// @version      24.10
// @description  Zaawansowany system HUD z kompaktowym kalendarzem oraz możliwością zmiany strony ekranu (Lewo/Prawo)
// @author       Gemini Player
// @match        *https://intranet.sbe-online.pl/dt/mitel/index.php**
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @connect      raw.githubusercontent.com
//
// @updateURL    https://raw.githubusercontent.com/KapiJoker/SBETEST/main/MitelHUD.user.js
// @downloadURL  https://raw.githubusercontent.com/KapiJoker/SBETEST/main/MitelHUD.user.js
// ==/UserScript==

window.MITEL_DEBUG = {
    skanuj: skanujTabeleWPoszukiwaniuPowrotow,
    dane: () => daneDzis,
    testModel: wykryjModelTelefonu
};

    // ==========================================
    // SEKCJA 1: KONFIGURACJA I STATE
    // ==========================================
    const KLUCZ_DNIA = "mitel_stats_" + new Date().toISOString().split('T')[0];
    const KLUCZ_HISTORIA = "mitel_stats_history";
    const KLUCZ_SKROTU = "mitel_hud_shortcut";
    const KLUCZ_MOTYWU = "mitel_hud_theme";
    const KLUCZ_PRZETWORZONE_TOKENY = "mitel_processed_tokens";
    const KLUCZ_POZYCJI = "mitel_hud_position";

    const KLUCZ_GODZIN = "mitel_hud_godziny";
    const KLUCZ_DATA_GODZIN = "mitel_hud_godziny_data";

    function pobierzKlawiszSkrotu() { return localStorage.getItem(KLUCZ_SKROTU) || "F2"; }
    function zapiszKlawiszSkrotu(k) { localStorage.setItem(KLUCZ_SKROTU, k); }
    function pobierzMotyw() { return localStorage.getItem(KLUCZ_MOTYWU) || "dark"; }
    function zapiszMotyw(m) { localStorage.setItem(KLUCZ_MOTYWU, m); }
    function pobierzCelDzienny() { return parseInt(localStorage.getItem('mitel_daily_goal'), 10) || 32; }
    function zapiszCelDzienny(v) { localStorage.setItem('mitel_daily_goal', v); }
    function pobierzCzyKalendarzRozwiniety() { return localStorage.getItem('mitel_hud_cal_expanded') === 'yes'; }
    function zapiszCzyKalendarzRozwiniety(v) { localStorage.setItem('mitel_hud_cal_expanded', v ? 'yes' : 'no'); }
    function pobierzPozycjeHUD() { return localStorage.getItem(KLUCZ_POZYCJI) || "right"; }
    function zapiszPozycjeHUD(p) { localStorage.setItem(KLUCZ_POZYCJI, p); }

    function pobierzDaneDnia(klucz) {
        let domyslne = { razem: 0, ber: 0, powroty: 0, streak: 0, czasStartu: null, listaNapraw: [], modele: {} };
        try {
            let zrzut = localStorage.getItem(klucz);
            return zrzut ? JSON.parse(zrzut) : domyslne;
        } catch(e) { return domyslne; }
    }
    function zapiszDaneDnia(klucz, dane) { localStorage.setItem(klucz, JSON.stringify(dane)); }

    let daneDzis = pobierzDaneDnia(KLUCZ_DNIA);

    let czyJestPrzerwa = false;
    let czyWidokMinimalny = localStorage.getItem('mitel_hud_minimal') === 'yes';
    let daneGodzinowe = (function() {
        const dzisYMD = new Date().toISOString().split('T')[0];
        const zapisanaData = localStorage.getItem(KLUCZ_DATA_GODZIN);

        if (zapisanaData !== dzisYMD) {
            localStorage.setItem(KLUCZ_DATA_GODZIN, dzisYMD);
            localStorage.setItem(KLUCZ_GODZIN, JSON.stringify({}));
            return {};
        }

        try {
            return JSON.parse(localStorage.getItem(KLUCZ_GODZIN)) || {};
        } catch(e) { return {}; }
    })();

    function zarejestrujSztukeWGodzinie() {
        const aktualnaGodzina = new Date().getHours();
        const klucz = aktualnaGodzina + ':00';

        if (!daneGodzinowe[klucz]) {
            daneGodzinowe[klucz] = 0;
        }

        daneGodzinowe[klucz] += 1;
        localStorage.setItem(KLUCZ_GODZIN, JSON.stringify(daneGodzinowe));
    }

   function pobierzSumeDzisZHtml() {
        try {
            // 1. Sprawdzamy sekcję z .user-actions na podstawie zaktualizowanego HTML
            const actionsDiv = document.querySelector('.user-actions');
            if (actionsDiv) {
                // Wyciąga cały tekst (ignorując tagi HTML takie jak <strong>)
                // i szuka wzorca "Dzisiaj: [dowolne znaki] (CYFRA)"
                const dopasowanie = actionsDiv.textContent.match(/Dzisiaj:[^\d]*(\d+)/i);
                if (dopasowanie && dopasowanie[1]) {
                    const wynik = parseInt(dopasowanie[1], 10);
                    if (!isNaN(wynik)) return wynik;
                }
            }

            // 2. Metoda zapasowa (starsze selektory, jeśli kiedyś wrócą)
            const selektory = ['#total-repairs-count', '.repairs-sum-value', '#dzisiejsze-naprawy'];
            for (let sel of selektory) {
                const el = document.querySelector(sel);
                if (el) {
                    let dopasowanie = el.textContent.match(/(\d+)/);
                    if (dopasowanie && dopasowanie[1]) {
                        let wynik = parseInt(dopasowanie[1], 10);
                        if (!isNaN(wynik)) return wynik;
                    }
                }
            }
        } catch (err) {
            console.error("Mitel HUD: Błąd odczytu sumy", err);
        }
        return null;
    }

    function wykryjModelTelefonu(wyszukajWElementie = document.body) {
        let selectModel = wyszukajWElementie.querySelector('select[name="model_id"]');

        if (!selectModel && document.getElementById('myModal')) {
            selectModel = document.getElementById('myModal').querySelector('select[name="model_id"]');
        }

        let naglowekTekst = "";
        if (selectModel && selectModel.options[selectModel.selectedIndex]) {
            naglowekTekst = selectModel.options[selectModel.selectedIndex].text.toUpperCase();
        } else if (wyszukajWElementie) {
            naglowekTekst = wyszukajWElementie.innerText.toUpperCase();
        }

        if (!naglowekTekst || naglowekTekst.includes("-- WYBIERZ --")) {
            return "Nieznany Model";
        }

        const modele = [
            "612D V2", "612DT", "612D",
            "622D V2", "622DT", "622D",
            "632DT", "632D V2", "632D",
            "650C", "610D", "620D", "630D",
            "5370", "5380", "5361 IP", "5361",
            "6869I", "6867I", "6865I", "6863I",
            "6869", "6867", "6865", "6863",
            "6940I", "6930I", "6920I", "6930L",
            "6940W", "6920W", "6940", "6930", "6920",
            "RFP 35", "RFP 43", "RFP 44", "RFP 45", "RFP35", "RFP43", "RFP44", "RFP45",
            "UNIFY S6", "142 EU", "142D", "112 DECT"
        ];

        for (let m of modele) {
            const regex = new RegExp("\\b" + m.replace(" ", "\\s*") + "\\b", "i");
            if (regex.test(naglowekTekst)) {
                if (m.includes(" V2")) return "Mitel " + m.replace(" V2", " v2");
                if (m.includes("DT")) return "Mitel " + m.replace("DT", "dt");
                if (m.endsWith("I") && (m.startsWith("68") || m.startsWith("69"))) return "Mitel " + m.slice(0, -1) + "i";
                return "Mitel " + m;
            }
        }

        if (naglowekTekst.includes("UNIFY")) return "Urządzenie Unify";
        return "Nieznany Model";
    }

    function pobierzKategorieDlaModelu(nazwaModelu) {
        let m = nazwaModelu.toUpperCase();
        if (m.includes("612D") || m.includes("612DT") || m.includes("612D V2") ||
            m.includes("622D") || m.includes("622DT") || m.includes("622D V2") ||
            m.includes("632D") || m.includes("632DT") || m.includes("632D V2") ||
            m.includes("650C") || m.includes("610D") || m.includes("620D") || m.includes("630D") ||
            m.includes("112") || m.includes("142")) {
            return "Urządzenia DECT";
        }
        if (m.includes("RFP")) return "Urządzenia RFP";
        if (m.includes("UNIFY")) return "Urządzenia Unify";
        if (m.includes("5370") || m.includes("5380") || m.includes("5361") || m.includes("6863") || m.includes("6865") || m.includes("6867") || m.includes("6869") || m.includes("6920") || m.includes("6930") || m.includes("6940")) return "Urządzenia przewodowe";
        return "Inne / Nieznane";
    }

    function przechwycNumerSeryjny(wyszukajWElementie = document.body) {
        let inputSN = wyszukajWElementie.querySelector('input[name="sn"]');
        if (!inputSN && document.getElementById('myModal')) {
            inputSN = document.getElementById('myModal').querySelector('select[name="sn"]');
        }

        if (inputSN && inputSN.value.trim() !== "") {
            return inputSN.value.trim();
        }

        const regexy = [/([^A-Z0-9]|^)([0-9A-F]{12})([^A-Z0-9]|$)/i, /([^A-Z0-9]|^)(RE[0-9]{10})([^A-Z0-9]|$)/i];
        const kodZrodlowy = wyszukajWElementie.innerText || "";
        for (let r of regexy) {
            let m = kodZrodlowy.match(r);
            if (m) return m[2] || m[0];
        }
        return "Brak SN";
    }

    function dodajWpisDoTimeline(typ, model, sn) {
        if (!daneDzis.listaNapraw) daneDzis.listaNapraw = [];
        const t = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
        daneDzis.listaNapraw.unshift({ czas: t, typ: typ, model: model, sn: sn });
    }

    function skanujTabeleWPoszukiwaniuPowrotow() {
    let flagaZmiany = false;

    document.querySelectorAll('#general tr').forEach(row => {
        let selectStatus = row.querySelector('.status-select');
        if (!selectStatus || selectStatus.value !== 'POWRÓT') return;

        let sn = row.innerText.match(/([0-9A-F]{12})|(RE[0-9]{10})/i);
        let idWiersza = sn ? sn[0] : 'row_' + row.rowIndex;

        // Jeśli już mamy ten wpis w historii – pomijamy, żeby nie dublować
        if (daneDzis.historia && daneDzis.historia.some(wpis => wpis.sn === idWiersza)) {
            return;
        }

        // Sprawdzamy czy wiersz nie był już zeskanowany w bieżącej sesji
        if (!row.dataset.mitelScanned) {
            row.dataset.mitelScanned = "true";

            let m = wykryjModelTelefonu(row);
            if (m === "Nieznany Model") return;

            // Inicjalizacja jeśli nie istnieje
            if (!daneDzis.modele[m]) {
                daneDzis.modele[m] = { ber: 0, powroty: 0, razem: 0 };
            }

            // Zwiększamy liczniki TYLKO RAZ
            daneDzis.modele[m].powroty++;
            daneDzis.powroty++;

            // Dodanie do historii
            dodajWpisDoTimeline('QC', m, idWiersza); // Używamy idWiersza zamiast "Z rejestru"

            flagaZmiany = true;
        }
    });

    if (flagaZmiany) {
        zapiszDaneDnia(KLUCZ_DNIA, daneDzis);
        odswiezWidokHUD(); // Dodajemy odświeżenie tutaj, żeby HUD zareagował od razu
    }
}

    function obliczDaneOkresu(dni, archiwum) {
        let res = { razem: 0, ber: 0, powroty: 0, modele: {} };
        let teraz = new Date();
        for (let i = 0; i <= dni; i++) {
            let dStr = new Date(teraz.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            let k = "mitel_stats_" + dStr;
            let d = archiwum[k] || (k === KLUCZ_DNIA ? daneDzis : null);
            if (d) {
                res.razem += (d.razem || 0);
                res.ber += (d.ber || 0);
                res.powroty += (d.powroty || 0);
                if (d.modele) {
                    for (let m in d.modele) {
                        if (!res.modele[m]) res.modele[m] = { ber: 0, powroty: 0, razem: 0 };
                        res.modele[m].razem += (d.modele[m].razem || 0);
                        res.modele[m].ber += (d.modele[m].ber || 0);
                        res.modele[m].powroty += (d.modele[m].powroty || 0);
                    }
                }
            }
        }
        return res;
    }

    function obliczStatystykiCzasu() {
        if (!daneDzis.czasStartu) return { statusCzasu: "Brak danych", godzinaSukcesu: "--:--" };
        let start = new Date(daneDzis.czasStartu);
        let teraz = new Date();
        let diffMin = (teraz - start) / 1000 / 60;
        let cel = pobierzCelDzienny();
        let czyste = (daneDzis.razem - daneDzis.ber) < 0 ? 0 : (daneDzis.razem - daneDzis.ber);

        if (czyste === 0 || diffMin < 1) return { statusCzasu: "Obliczanie...", godzinaSukcesu: "Czekam na ';'" };

        let tempoSztukaNaMin = czyste / diffMin;
        let tempoGodzinowe = Math.round(tempoSztukaNaMin * 60 * 10) / 10;
        let pozostalo = cel - czyste;

        if (pozostalo <= 0) return { statusCzasu: `Sukces! (${tempoGodzinowe}/h)`, godzinaSukcesu: "WYKONANO 🎉" };

        let minDoKonca = pozostalo / tempoSztukaNaMin;
        let dataSukcesu = new Date(teraz.getTime() + minDoKonca * 60 * 1000);

        return {
            statusCzasu: `${tempoGodzinowe} szt./h`,
            godzinaSukcesu: dataSukcesu.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
        };
    }

    function wstrzyknijStyleOgnia() {
        if (document.getElementById('mitel-fire-styles')) return;
        const style = document.createElement('style');
        style.id = 'mitel-fire-styles';
        style.textContent = `
            @keyframes mitelFireEffect {
                0% { text-shadow: 0 0 4px #ff3f00, 0 -2px 8px #ff7b00, 0 -4px 12px #ffb700; transform: scale(1); }
                50% { text-shadow: 0 0 6px #ff2a00, 0 -4px 12px #ff9d00, 0 -8px 18px #ffe600; transform: scale(1.05); }
                100% { text-shadow: 0 0 4px #ff3f00, 0 -2px 8px #ff7b00, 0 -4px 12px #ffb700; transform: scale(1); }
            }
            .mitel-on-fire {
                animation: mitelFireEffect 1.2s infinite ease-in-out;
                color: #fff !important;
                font-weight: 900 !important;
                background: linear-gradient(180deg, #ff9d00, #ff2a00);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .hud-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin: 4px 0; }
            .hud-cal-cell { padding: 3px 0; border-radius: 3px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 8px; font-weight: bold; cursor: pointer; transition: transform 0.1s; position: relative; border: 1px solid rgba(128,128,128,0.12); }
            .hud-cal-cell:hover { transform: scale(1.1); z-index: 2; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
            .hud-cal-cell .tooltip { display: none; position: absolute; bottom: 120%; background: #000; color: #fff; padding: 4px 6px; border-radius: 4px; font-size: 9px; white-space: nowrap; z-index: 10; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.5); left: 50%; transform: translateX(-50%); }
            .hud-cal-cell:hover .tooltip { display: block; }
        `;
        document.head.appendChild(style);
    }

    function stworzPanelHUD() {
        if (document.getElementById('mitel-hud-container')) return;
        wstrzyknijStyleOgnia();

        const hud = document.createElement('div');
        hud.id = 'mitel-hud-container';

        const bokiStyle = pobierzPozycjeHUD() === 'left' ? 'left:10px;' : 'right:10px;';
        hud.style.cssText = `position:fixed; bottom:10px; ${bokiStyle} width:155px; z-index:999999; font-family:system-ui,sans-serif; user-select:none; border-radius:10px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.3); overflow:hidden; transition:all 0.2s;`;

        const naglowek = document.createElement('div');
        naglowek.id = 'mitel-hud-header';
        naglowek.style.cssText = 'padding:6px 10px; display:flex; justify-content:space-between; align-items:center; font-size:10px; font-weight:800; cursor:pointer; background:#0284c7; color:white;';

        const zawartosc = document.createElement('div');
        zapytajZawartosc(zawartosc);

        hud.appendChild(naglowek);
        hud.appendChild(zawartosc);
        document.body.appendChild(hud);

        naglowek.addEventListener('click', (e) => {
            if (e.target.closest('#hud-change-side-btn') || e.target.closest('#hud-manual-update-btn') || e.target.closest('#hud-toggle-size-btn')) return;

            zawartosc.style.display = zawartosc.style.display === 'none' ? 'flex' : 'none';
            localStorage.setItem('mitel_hud_collapsed', zawartosc.style.display === 'none' ? 'yes' : 'no');
            odswiezWidokHUD();
        });

        if (localStorage.getItem('mitel_hud_collapsed') === 'yes') zawartosc.style.display = 'none';
        if (localStorage.getItem('mitel_hud_hidden') === 'yes') hud.style.display = 'none';

        window.addEventListener('keydown', (e) => {
            if (e.key === pobierzKlawiszSkrotu() && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
                e.preventDefault();
                if (hud.style.display === 'none') {
                    hud.style.display = 'block';
                    localStorage.setItem('mitel_hud_hidden', 'no');
                } else {
                    hud.style.display = 'none';
                    localStorage.setItem('mitel_hud_hidden', 'yes');
                }
            }
        });
    }

    function zapytajZawartosc(zawartosc) {
        zawartosc.id = 'mitel-hud-content';
        zawartosc.style.cssText = 'padding:8px; display:flex; flex-direction:column; gap:4px; font-size:10px;';
    }

    function generujMiniWykresHTML() {
        try {
            if (typeof daneGodzinowe === 'undefined' || !daneGodzinowe) {
                return '<div style="opacity:0.5; text-align:center; font-size:9px; margin-top:5px;">Wykres: brak danych</div>';
            }

            const klucze = Object.keys(daneGodzinowe).sort((a, b) => parseInt(a) - parseInt(b));

            if (klucze.length === 0) {
                return '<div style="opacity:0.5; text-align:center; font-size:9px; margin-top:5px;">📊 Brak danych z dziś</div>';
            }

            let wykresHTML = '<div style="margin-top:5px; background:rgba(0,0,0,0.15); padding:6px; border-radius:6px; font-size:9px; font-family:monospace;">';
            wykresHTML += '<div style="font-weight:bold; text-align:center; margin-bottom:4px; color:#38bdf8;">📊 WYDAJNOŚĆ GODZINOWA</div>';

            klucze.forEach(godzina => {
                const ilosc = daneGodzinowe[godzina] || 0;
                const paski = ilosc > 0 ? '🟩'.repeat(Math.min(ilosc, 10)) : '⬜';
                const plus = ilosc > 10 ? '+' : '';

                wykresHTML += `<div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                    <span style="color:#94a3b8;">${godzina}:</span>
                    <span style="letter-spacing:-1px;">${paski}${plus}</span>
                    <strong style="color:#22c55e;">(${ilosc})</strong>
                </div>`;
            });

            wykresHTML += '</div>';
            return wykresHTML;
        } catch (error) {
            console.error("Błąd wykresu:", error);
            return '<div style="opacity:0.5; text-align:center; font-size:9px; margin-top:5px;">Wykres niedostępny</div>';
        }
    }

    function odswiezStyleHUD() {
        const container = document.getElementById('mitel-hud-container');
        const zawartosc = document.getElementById('mitel-hud-content');
        if (!container || !zawartosc) return;
        if (pobierzMotyw() === 'dark') {
            container.style.background = '#0f172a';
            container.style.border = '1px solid #1e293b';
            zawartosc.style.color = '#f8fafc';
        } else {
            container.style.background = '#ffffff';
            container.style.border = '1px solid #cbd5e1';
            zawartosc.style.color = '#1e293b';
        }
    }

    function odswiezWidokHUD() {
        const naglowek = document.getElementById('mitel-hud-header');
        const zawartosc = document.getElementById('mitel-hud-content');
        const hudContainer = document.getElementById('mitel-hud-container');
        if (!naglowek || !zawartosc || !hudContainer) return;

        let modelePowrotyHTML = '';
        for (let m in daneDzis.modele) {
        if (daneDzis.modele[m].powroty > 0) {
            modelePowrotyHTML += `<div style="font-size:9px; color:#818cf8; padding-left:10px;">• ${m}: ${daneDzis.modele[m].powroty}</div>`;
         }
        }

        odswiezStyleHUD();

        const otwarte = zawartosc.style.display !== 'none';
        const cel = pobierzCelDzienny();
        const czyste = (daneDzis.razem - daneDzis.ber) < 0 ? 0 : (daneDzis.razem - daneDzis.ber);
        const tStats = obliczStatystykiCzasu();

        if (czyste >= cel && cel > 0) {
            if (typeof window.odpalAutorskieConfetti === 'function') window.odpalAutorskieConfetti();
        }

        const aktStreak = daneDzis.streak || 0;
        let streakKropki = "🔥".repeat(Math.min(aktStreak, 3));
        let fireClass = "";
        if (aktStreak >= 8) {
            fireClass = 'class="mitel-on-fire" style="display:inline-block;"';
        }

        naglowek.innerHTML = `
            <div style="display:flex; align-items:center; gap:4px;">
                <button id="hud-change-side-btn" title="Zmień stronę ekranu" style="background:rgba(255,255,255,0.2); color:white; border:none; border-radius:3px; padding:1px 4px; font-size:8px; font-weight:bold; cursor:pointer; line-height:1; font-family:monospace;">< ></button>
                <button id="hud-toggle-size-btn" title="Przełącz tryb minimalny" style="background:rgba(255,255,255,0.2); color:white; border:none; border-radius:3px; padding:1px 4px; font-size:8px; cursor:pointer; line-height:1;">${czyWidokMinimalny ? '📺' : '🗜️'}</button>
                <button id="hud-manual-update-btn" title="Sprawdź aktualizacje" style="background:rgba(255,255,255,0.2); color:white; border:none; border-radius:3px; padding:1px 4px; font-size:8px; cursor:pointer; line-height:1;">🔄</button>
                <span>🧠 Mitel HUD</span>
            </div>
            <span id="hud-update-status" style="font-size:8px; color:#fef08a; margin-left:auto; margin-right:4px; white-space:nowrap; font-weight:bold;"></span>
            <span>${otwarte ? '▼' : '▲'}</span>
        `;

        const btnSide = document.getElementById('hud-change-side-btn');
        if (btnSide) {
            btnSide.addEventListener('click', (e) => {
                e.stopPropagation();
                localStorage.removeItem('mitel_hud_drag_pozycja');
                const obecnaPozycja = pobierzPozycjeHUD();
                const nowaPozycja = obecnaPozycja === 'right' ? 'left' : 'right';
                zapiszPozycjeHUD(nowaPozycja);
                if (nowaPozycja === 'left') {
                    hudContainer.style.right = 'auto'; hudContainer.style.bottom = '10px'; hudContainer.style.top = 'auto'; hudContainer.style.left = '10px';
                } else {
                    hudContainer.style.left = 'auto'; hudContainer.style.bottom = '10px'; hudContainer.style.top = 'auto'; hudContainer.style.right = '10px';
                }
            });
        }

        const btnSize = document.getElementById('hud-toggle-size-btn');
        if (btnSize) {
            btnSize.addEventListener('click', (e) => {
                e.stopPropagation();
                czyWidokMinimalny = !czyWidokMinimalny;
                localStorage.setItem('mitel_hud_minimal', czyWidokMinimalny ? 'yes' : 'no');
                odswiezWidokHUD();
            });
        }

        const btnUpdate = document.getElementById('hud-manual-update-btn');
        const lblStatus = document.getElementById('hud-update-status');
        if (btnUpdate && lblStatus) {
            btnUpdate.addEventListener('click', (e) => {
                e.stopPropagation();
                lblStatus.innerText = "Sprawdzam...";
                btnUpdate.disabled = true;
                btnUpdate.style.opacity = "0.5";

                if (typeof GM_xmlhttpRequest === 'undefined') {
                    lblStatus.innerText = "Brak uprawnień";
                    btnUpdate.disabled = false;
                    btnUpdate.style.opacity = "1";
                    return;
                }

                GM_xmlhttpRequest({
                    method: "GET",
                    url: "https://raw.githubusercontent.com/KapiJoker/SBETEST/main/MitelHUD.user.js?t=" + new Date().getTime(),
                    anonymous: true,
                    headers: { "Cache-Control": "no-cache" },
                    onload: function(response) {
                        btnUpdate.disabled = false;
                        btnUpdate.style.opacity = "1";

                        const remoteVersionMatch = response.responseText.match(/\/\/\s*@version\s+([\d\.]+)/i);
                        const remoteVersion = remoteVersionMatch ? remoteVersionMatch[1].trim() : null;
                        const localVersion = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) ? GM_info.script.version.trim() : "24.10";

                        if (remoteVersion && remoteVersion !== localVersion) {
                            lblStatus.innerHTML = `<a href="https://raw.githubusercontent.com/KapiJoker/SBETEST/main/MitelHUD.user.js" target="_blank" style="color:#ef4444; text-decoration:underline;">Nowa (${remoteVersion})!</a>`;
                            alert("Wykryto nową wersję (" + remoteVersion + ")! Rozpoczynam pobieranie...");
                            window.location.href = "https://raw.githubusercontent.com/KapiJoker/SBETEST/main/MitelHUD.user.js";
                        } else if (remoteVersion) {
                            lblStatus.innerText = "Wersja aktualna";
                            setTimeout(() => { if(lblStatus) lblStatus.innerText = ""; }, 4000);
                        } else {
                            lblStatus.innerText = "Błąd pliku";
                        }
                    },
                    onerror: function() {
                        btnUpdate.disabled = false;
                        btnUpdate.style.opacity = "1";
                        lblStatus.innerText = "Błąd sieci";
                    }
                });
            });
        }

        const staryZegar = document.getElementById('hud-live-clock');
        const aktualnyCzasTekst = staryZegar ? staryZegar.textContent : new Date().toLocaleTimeString('pl-PL');

        if (czyWidokMinimalny) {
            zawartosc.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-size:11px;"><span><strong style="color:#0284c7;">Suma:</strong></span><strong style="color:#0284c7;">${daneDzis.razem}</strong></div>
                <div style="display:flex; justify-content:space-between; font-size:11px;"><span><strong style="color:#22c55e;">Czyste:</strong></span><strong style="color:#22c55e;">${czyste}</strong></div>
                <div style="display:flex; justify-content:space-between; font-size:11px;"><span><strong style="color:#f87171;">Ber:</strong></span><strong style="color:#f87171;">${daneDzis.ber}</strong></div>
                <div style="display:flex; justify-content:space-between; font-size:11px;"><span><strong style="color:#818cf8;">Zwroty:</strong></span><strong style="color:#818cf8;">${daneDzis.powroty}</strong></div>
           `;
        } else {

            let modelePowrotyHTML = '';
              if (daneDzis.modele) {
                for (let m in daneDzis.modele) {
             if (daneDzis.modele[m].powroty > 0) {
                modelePowrotyHTML += `<div style="display:flex; justify-content:space-between; font-size:10px; color:#a5b4fc; padding:1px 0 1px 10px;">
                <span>• ${m}</span>
                <span>${daneDzis.modele[m].powroty}</span>
                </div>`;
               }
             }
            }

            zawartosc.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-weight:bold;"><span>Zegar:</span><span id="hud-live-clock" style="color:#38bdf8; font-family:monospace;">${aktualnyCzasTekst}</span></div>
                <div style="height:1px; background:rgba(128,128,128,0.2); margin:2px 0;"></div>
                <div style="display:flex; justify-content:space-between;"><span><strong style="color:#0284c7;">Suma :</strong></span><strong style="color:#0284c7;">${daneDzis.razem}</strong></div>
                <div style="display:flex; justify-content:space-between;"><span><strong style="color:#22c55e;">Czyste :</strong></span><strong style="color:#22c55e;">${czyste} / ${cel}</strong></div>
                <div style="display:flex; justify-content:space-between;"><span><strong style="color:#f87171;">BER </strong>/ <strong style="color:#818cf8;">Zwroty:</strong></span><span><strong style="color:#f87171;">${daneDzis.ber}</strong> / <strong style="color:#818cf8;" title="Informacyjnie">${daneDzis.powroty} ℹ️</strong></span></div>
                ${aktStreak > 0 ? `<div style="font-weight:bold; text-align:center; margin: 2px 0;">Seria: <span ${fireClass}>${aktStreak} ${streakKropki}</span></div>` : ''}
                <div style="height:1px; background:rgba(128,128,128,0.2); margin:2px 0;"></div>
                <div style="display:flex; justify-content:space-between;"><span>Tempo:</span><strong>${tStats.statusCzasu}</strong></div>
                <div style="display:flex; justify-content:space-between;"><span>Koniec celu:</span><strong style="color:#eab308;">${tStats.godzinaSukcesu}</strong></div>
                <div style="height:1px; background:rgba(128,128,128,0.2); margin:2px 0;"></div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
                    <span style="opacity:0.8;">Cel:</span>
                    <input type="number" id="hud-goal-input" value="${cel}" min="1" max="150" style="width:40px; background:rgba(0,0,0,0.1); border:1px solid rgba(128,128,128,0.3); color:inherit; text-align:center; border-radius:4px; font-size:10px; font-weight:bold; padding:2px 0;">
                </div>
                <button id="hud-open-stats-btn" style="background:#0284c7; color:white; border:none; padding:5px 0; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer; width:100%; box-shadow:0 2px 4px rgba(2,132,199,0.3); margin-top:2px;">📊 Otwórz Panel Statystyk</button>

                <div style="height:1px; background:rgba(128,128,128,0.2); margin:4px 0;"></div>
                <button id="hud-break-btn" style="background:${czyJestPrzerwa ? '#ef4444' : '#10b981'}; color:white; border:none; padding:4px 0; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer; width:100%; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                    ${czyJestPrzerwa ? '☕ TRWA PRZERWA (Wznów)' : '⏱️ Idę na przerwę'}
                </button>
                ${typeof generujMiniWykresHTML === 'function' ? generujMiniWykresHTML() : ''}
             ${modelePowrotyHTML}`;

            const btnStats = document.getElementById('hud-open-stats-btn');
            if (btnStats) btnStats.addEventListener('click', (e) => { e.stopPropagation(); stworzPelnyEkranStats(); });

            const btnBreak = document.getElementById('hud-break-btn');
            if (btnBreak) {
                btnBreak.addEventListener('click', (e) => {
                    e.stopPropagation();
                    czyJestPrzerwa = !czyJestPrzerwa;
                    odswiezWidokHUD();
                });
            }

            const goalInput = document.getElementById('hud-goal-input');
            if (goalInput) {
                goalInput.addEventListener('click', (e) => e.stopPropagation());
                goalInput.addEventListener('change', (e) => {
                    let val = parseInt(e.target.value, 10);
                    if (isNaN(val) || val < 1) val = 32;
                    zapiszCelDzienny(val);
                    odswiezWidokHUD();
                });
            }
        }

        if (!hudContainer.classList.contains('hud-state-dragging')) {
            const zapisanaMyszka = localStorage.getItem('mitel_hud_drag_pozycja');
            if (zapisanaMyszka) {
                const pos = JSON.parse(zapisanaMyszka);
                hudContainer.style.right = 'auto';
                hudContainer.style.bottom = 'auto';
                hudContainer.style.left = pos.x + 'px';
                hudContainer.style.top = pos.y + 'px';
            }
        }
    }

    // ==========================================
    // SEKCJA 2: WIDOKI SZCZEGÓŁOWE I PANEL
    // ==========================================

    function inicjujMenedzerAktualizacji() {
        const rightHeaderGroup = document.querySelector('.twoja-klasa-naglowka');
        if (!rightHeaderGroup) return;

        const updateBtn = document.createElement('button');
        updateBtn.innerText = '⟲';
        updateBtn.style.cssText = "background:none; border:none; cursor:pointer; font-size:11px; padding:2px; line-height:1;";
        rightHeaderGroup.appendChild(updateBtn);

        updateBtn.onclick = (e) => {
            e.stopPropagation();
            updateBtn.classList.add('qr-spin');
            updateBtn.style.pointerEvents = 'none';

            checkScriptUpdate((isUpToDate) => {
                updateBtn.classList.remove('qr-spin');
                updateBtn.style.pointerEvents = 'auto';
                if (isUpToDate) {
                    console.log("Wersja aktualna");
                }
            });
        };
    }

    function checkScriptUpdate(onComplete) {
        if (typeof GM_xmlhttpRequest === 'undefined') { if(onComplete) onComplete(); return; }
        if (typeof SCRIPT_URL === 'undefined') { if(onComplete) onComplete(); return; }

        const uniqueScriptUrl = SCRIPT_URL + "?t=" + new Date().getTime();

        GM_xmlhttpRequest({
            method: "GET",
            url: uniqueScriptUrl,
            anonymous: true,
            headers: { "Cache-Control": "no-cache" },
            onload: function(response) {
                const remoteVersion = parseVersion(response.responseText);
                const localVersion = GM_info.script.version.trim();

                if (remoteVersion && remoteVersion !== localVersion) {
                    alert("Nowa wersja dostępna! Instaluję...");
                    window.location.href = SCRIPT_URL;
                } else {
                    if (onComplete) onComplete(true);
                }
            }
        });
    }

    function parseVersion(text) {
        const match = text.match(/\/\/\s*@version\s+([\d\.]+)/i);
        return match ? match[1].trim() : null;
    }

    function stworzPelnyEkranStats(e) {
        let archiwum = {};
        e = e || { target: null, stopPropagation: () => {} };
        try {
            for (let i = 0; i < localStorage.length; i++) {
                let k = localStorage.key(i);
                if (k && k.startsWith("mitel_stats_") && k !== KLUCZ_DNIA) {
                    archiwum[k] = JSON.parse(localStorage.getItem(k));
                }
            }
        } catch(e) {}

        let daneOkresow = {
            dzis: daneDzis,
            tydzien: obliczDaneOkresu(7, archiwum),
            miesiac: obliczDaneOkresu(30, archiwum)
        };

        let wybranaDataFiltr = null;

        document.addEventListener('click', function(e) {
            if (!e.target) return;

            if (e.target.id === 'zamknij-stats-btn') {
                const overlay = document.getElementById('mitel-stats-overlay');
                if (overlay) overlay.remove();
            }

            if (e.target.id === 'hud-cal-reset-btn') {
                wybranaDataFiltr = null;
                odswiezWidokHUD();
            }

            if (e.target.id === 'hud-cal-toggle-view-btn') {
                let stan = pobierzCzyKalendarzRozwiniety();
                localStorage.setItem('mitel_cal_expanded', !stan);
                odswiezWidokHUD();
            }
        });

        document.addEventListener('click', function(e) {
            const calCell = e.target.closest('.hud-cal-cell');
            if (calCell) {
                wybranaDataFiltr = calCell.getAttribute('data-date');
                odswiezWidokHUD();
            }
        });

        function generujHtmlAutomatyzacji() {
            let skrot = pobierzKlawiszSkrotu();
            return `
                <div class="themed-card" style="border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:10px; font-size:11px;">
                    <strong>⚙️ Konfiguracja & Skróty klawiszowe</strong>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.06); padding:6px 10px; border-radius:6px; border:1px solid var(--border-card);">
                        <span>Przełączanie widoczności HUD:</span>
                        <input type="text" id="mitel-key-config-input" value="${skrot}" readonly style="width:70px; text-align:center; background:var(--bg-main); border:1px solid var(--border); color:var(--text-main); font-weight:bold; padding:2px; border-radius:4px; cursor:pointer;">
                    </div>
                    <div style="height:1px; background:rgba(128,128,128,0.2); margin:4px 0;"></div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>📋 Log i historia napraw (Dzisiaj)</strong>
                        <input type="text" id="mitel-sn-search-input" placeholder="Szukaj po SN / Modelu..." style="width:160px; padding:4px 8px; font-size:10px; border-radius:4px; background:var(--bg-main); border:1px solid var(--border); color:var(--text-main);">
                    </div>
                    <div style="max-height:160px; overflow-y:auto; border:1px solid var(--border-card); border-radius:6px; background: var(--bg-card) !important;">
                        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:10px; background: var(--bg-card) !important; color: var(--text-main) !important;">
                            <thead class="themed-dark-bg" style="position:sticky; top:0; font-weight:bold; background: var(--bg-darker) !important;">
                                <tr>
                                    <th style="padding:6px; border-bottom:1px solid var(--border-card);">Czas</th>
                                    <th style="padding:6px; border-bottom:1px solid var(--border-card);">Typ</th>
                                    <th style="padding:6px; border-bottom:1px solid var(--border-card);">Model</th>
                                    <th style="padding:6px; border-bottom:1px solid var(--border-card);">Numer Seryjny</th>
                                </tr>
                            </thead>
                            <tbody id="mitel-repair-table-body" style="background: var(--bg-card) !important;">
                                ${renderujWierszeNapraw()}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        function renderujWierszeNapraw(filtr = '') {
            if (!daneDzis.listaNapraw || daneDzis.listaNapraw.length === 0) {
                return `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:10px; background: var(--bg-card) !important;">Brak wpisów w historii na dziś.</td></tr>`;
            }
            let f = filtr.toUpperCase();
            let tab = daneDzis.listaNapraw.filter(x => x.model.toUpperCase().includes(f) || x.sn.toUpperCase().includes(f) || x.typ.toUpperCase().includes(f));
            if (tab.length === 0) {
                return `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:10px; background: var(--bg-card) !important;">Brak wyników spełniających kryteria.</td></tr>`;
            }
            return tab.map(x => {
                let cTyp = '#4ade80';
                if(x.typ === 'BER') cTyp = '#f87171';
                if(x.typ === 'QC') cTyp = '#818cf8';
                return `
                    <tr style="border-bottom:1px solid var(--border-card); background: var(--bg-card) !important; color: var(--text-main) !important;">
                        <td style="padding:6px; font-family:monospace; opacity:0.8; color: var(--text-main) !important;">${x.czas}</td>
                        <td style="padding:6px; font-weight:bold; color:${cTyp} !important;">${x.typ}</td>
                        <td style="padding:6px; font-weight:600; color: var(--text-main) !important;">${x.model}</td>
                        <td style="padding:6px; font-family:monospace; display:flex; justify-content:space-between; align-items:center; gap:4px; color: var(--text-main) !important;">
                            <span>${x.sn}</span>
                            ${x.sn !== 'Brak SN' && x.sn !== 'Z rejestru' ? `<button class="hud-copy-trigger-btn" data-sn="${x.sn}" style="background:rgba(128,128,128,0.15); border:1px solid var(--border); color:var(--text-main) !important; font-size:8px; padding:1px 4px; border-radius:3px; cursor:pointer;">📋 Kopiuj</button>` : ''}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function generujHtmlKarty(daneOkresowe, tytulOkresu, czyPokazacCel = false, liczbaDniKalendarza = 0) {
            let daneDoWyswietlenia = daneOkresowe;
            let naglowekOkresu = tytulOkresu;

            const isDark = pobierzMotyw() === 'dark';
            const koldysk = isDark ? '#1e293b' : '#e2e8f0';

            if (wybranaDataFiltr) {
                let kluczWybrany = "mitel_stats_" + wybranaDataFiltr;
                daneDoWyswietlenia = archiwum[kluczWybrany] || (kluczWybrany === KLUCZ_DNIA ? daneDzis : { razem: 0, ber: 0, powroty: 0, modele: {} });
                naglowekOkresu = `Dzień: ${wybranaDataFiltr}`;
            }

            const aktualnyCel = pobierzCelDzienny();
            const czysteGlobalne = (daneDoWyswietlenia.razem - daneDoWyswietlenia.ber) < 0 ? 0 : (daneDoWyswietlenia.razem - daneDoWyswietlenia.ber);
            const statusySumaZgłoszeń = czysteGlobalne + daneDoWyswietlenia.ber;

            const pCzyste = statusySumaZgłoszeń > 0 ? Math.round((czysteGlobalne / statusySumaZgłoszeń) * 100) : 0;
            const pBer = statusySumaZgłoszeń > 0 ? Math.round((daneDoWyswietlenia.ber / statusySumaZgłoszeń) * 100) : 0;

            let wykresKolowyStyle = `background: ${koldysk};`;
            if(statusySumaZgłoszeń > 0) {
                wykresKolowyStyle = `background: conic-gradient(#4ade80 0% ${pCzyste}%, #f87171 ${pCzyste}% 100%);`;
            }

            const tStats = obliczStatystykiCzasu();

            let htmlPaceInsights = '';
            if (czyPokazacCel && !wybranaDataFiltr) {
                htmlPaceInsights = `
                    <div class="themed-subcard" style="padding: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; border-radius: 8px;">
                        <div><span class="text-muted">Status tempa:</span><br><strong style="color:#38bdf8;">${tStats.statusCzasu}</strong></div>
                        <div><span class="text-muted">Estymowana godzina celu:</span><br><strong style="color:#4ade80;">${tStats.godzinaSukcesu}</strong></div>
                    </div>
                `;
            }

            let htmlKalendarz = '';
            if (liczbaDniKalendarza > 0) {
                let teraz = new Date();
                let komorkiHtml = [];
                const jestRozwiniety = pobierzCzyKalendarzRozwiniety();

                for (let i = liczbaDniKalendarza - 1; i >= 0; i--) {
                    let d = new Date(teraz.getTime() - i * 24 * 60 * 60 * 1000);
                    let dStr = d.toISOString().split('T')[0];
                    let dKlucz = "mitel_stats_" + dStr;
                    let dData = archiwum[dKlucz] || (dKlucz === KLUCZ_DNIA ? daneDzis : null);

                    let sztuk = dData ? dData.razem : 0;
                    let bery = dData ? dData.ber : 0;
                    let czysteDnia = (sztuk - bery) < 0 ? 0 : (sztuk - bery);

                    let bgKomp = isDark ? '#1e293b' : '#e2e8f0';
                    let kolorTekst = 'var(--text-main)';
                    if (sztuk > 0) {
                        kolorTekst = '#000000';
                        if (sztuk < 15) bgKomp = '#bbf7d0';
                        else if (sztuk < 32) bgKomp = '#4ade80';
                        else bgKomp = '#22c55e';
                    }

                    let aktywneZaznaczenie = (wybranaDataFiltr === dStr) ? 'border: 2px solid #0284c7 !important; transform: scale(1.05);' : '';

                    komorkiHtml.push(`
                        <div class="hud-cal-cell" data-date="${dStr}" style="background: ${bgKomp}; color: ${kolorTekst}; ${aktywneZaznaczenie}">
                            ${d.getDate()}
                            <div class="tooltip">
                                <strong>${dStr}</strong><br>
                                Suma: ${sztuk} szt.<br>
                                Czyste: ${czysteDnia} | BER: ${bery}
                            </div>
                        </div>
                    `);
                }

                htmlKalendarz = `
                    <div class="themed-dark-bg" style="border-radius: 8px; padding: 6px 10px; margin-bottom: 4px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:bold;">
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span>📅 Kalendarz (${liczbaDniKalendarza} dni)</span>
                                <button id="hud-cal-toggle-view-btn" style="background:rgba(2,132,199,0.2); color:#38bdf8; border:1px solid #0284c7; padding:1px 6px; font-size:9px; border-radius:4px; cursor:pointer;">
                                    ${jestRozwiniety ? '[Zwiń]' : '[Rozwiń]'}
                                </button>
                            </div>
                            ${wybranaDataFiltr ? `<button id="hud-cal-reset-btn" style="background:#0284c7; color:white; border:none; padding:2px 6px; font-size:9px; border-radius:4px; cursor:pointer;">Pokaż całość</button>` : ''}
                        </div>
                        <div class="hud-cal-grid" id="hud-cal-grid-wrapper" style="display: ${jestRozwiniety ? 'grid' : 'none'};">
                            ${komorkiHtml.join('')}
                        </div>
                    </div>
                `;
            }

            let katStat = {};
            let sumaZrobionychModeli = 0;
            if (daneDoWyswietlenia.modele) {
                for (let m in daneDoWyswietlenia.modele) {
                    let kName = pobierzKategorieDlaModelu(m);
                    if (!katStat[kName]) katStat[kName] = 0;
                    katStat[kName] += (daneDoWyswietlenia.modele[m].razem || 0);
                    sumaZrobionychModeli += (daneDoWyswietlenia.modele[m].razem || 0);
                }
            }

            let htmlWykresKategorii = `
                <div class="themed-dark-bg" style="border-radius: 8px; padding: 10px;">
                    <strong style="font-size:11px;" class="text-muted">📈 Wykres efektywności według typów urządzeń:</strong>
                    <div style="display:flex; flex-direction:column; gap:6px; margin-top:5px;">
            `;

            if (sumaZrobionychModeli === 0) {
                htmlWykresKategorii += `<div style="color:#64748b; text-align:center; font-size:11px;">Brak danych urządzeń.</div>`;
            } else {
                const koloryKat = {
                    "Urządzenia przewodowe": "#38bdf8", "Urządzenia DECT": "#eab308",
                    "Urządzenia RFP": "#c084fc", "Urządzenia Unify": "#f472b6", "Inne / Nieznane": "#64748b"
                };
                for (let kat in katStat) {
                    if (katStat[kat] > 0) {
                        let proc = Math.round((katStat[kat] / sumaZrobionychModeli) * 100);
                        let kolor = koloryKat[kat] || "#64748b";
                        htmlWykresKategorii += `
                            <div style="font-size:11px;">
                                <div style="display:flex; justify-content:space-between; margin-bottom:2px; font-weight:600;">
                                    <span>• ${kat}</span><span>${katStat[kat]} szt. (${proc}%)</span>
                                </div>
                                <div style="width:100%; background:${isDark?'#1e293b':'#e2e8f0'}; height:5px; border-radius:3px; overflow:hidden;">
                                    <div style="width:${proc}%; background:${kolor}; height:100%;"></div>
                                </div>
                            </div>
                        `;
                    }
                }
            }
            htmlWykresKategorii += `</div></div>`;

            let htmlCelDzienny = '';
            if (czyPokazacCel || wybranaDataFiltr) {
                const procCelu = Math.min(Math.round((czysteGlobalne / aktualnyCel) * 100), 100);
                htmlCelDzienny = `
                    <div class="themed-dark-bg" style="border-radius: 8px; padding: 8px; margin-bottom: 4px;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold; margin-bottom:4px;">
                            <span>🎯 Realizacja normy czystych napraw (Cel: ${aktualnyCel} szt.)</span>
                            <span style="color:#22c55e;">${czysteGlobalne} / ${aktualnyCel} szt. (${procCelu}%)</span>
                        </div>
                        <div style="width:100%; background:${isDark?'#1e293b':'#e2e8f0'}; height:8px; border-radius:4px; overflow:hidden; border:1px solid ${isDark?'#334155':'#slate-700'};">
                            <div style="width:${procCelu}%; background:${procCelu === 100 ? '#22c55e' : '#10b981'}; height:100%;"></div>
                        </div>
                    </div>
                `;
            }

            let htmlModele = '';
            if (daneDoWyswietlenia.modele && Object.keys(daneDoWyswietlenia.modele).length > 0) {
                htmlModele = `<div style="margin-top: 4px; padding-top: 6px; border-top: 1px dashed ${isDark?'#334155':'#e2e8f0'}; font-size: 11px;">
                                <strong class="text-muted" style="display:block; margin-bottom:6px;">📱 Modele szczegółowo w tym okresie:</strong>
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; max-height:140px; overflow-y:auto; padding-right:5px;">`;
                for (const mod in daneDoWyswietlenia.modele) {
                    const mInfo = daneDoWyswietlenia.modele[mod];
                    const mTotal = mInfo.razem || 0;
                    const mPowroty = mInfo.powroty || 0;
                    const mQcStatus = mInfo.qc || 0;

                    if (mTotal > 0 || mPowroty > 0 || mQcStatus > 0) {
                        const mBer = mInfo.ber || 0;

                        let mCzyste = mTotal - mBer - mQcStatus;
                        if (mCzyste < 0) mCzyste = 0;

                        const lacznieQc = mQcStatus + mPowroty;

                        const sumaPaska = mCzyste + mBer + mQcStatus;
                        const pMczyste = sumaPaska > 0 ? Math.round((mCzyste / sumaPaska) * 100) : 0;
                        const pMqc = sumaPaska > 0 ? Math.round((lacznieQc / sumaPaska) * 100) : 0;
                        const pMber = sumaPaska > 0 ? Math.round((mBer / sumaPaska) * 100) : 0;




                        htmlModele += `
                            <div class="themed-dark-bg" style="padding:6px 8px; border-radius:8px; display:flex; flex-direction:column; gap:4px;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-weight:700; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:110px;">${mod}</span>
                                    <span style="background:${isDark?'#1e293b':'#e2e8f0'}; color:#38bdf8; font-size:9px; padding:1px 5px; border-radius:4px; font-weight:bold; border:1px solid ${isDark?'#334155':'#cbd5e1'};">Suma: ${mTotal}</span>
                                </div>
                                <div style="display:flex; justify-content:space-between; font-size:9px; opacity:0.8; line-height:1;">
                                    <span>🟢 Czyste: ${mCzyste}</span><span>🔴 BER: ${mBer}</span><span style="color:#818cf8; font-weight:bold;">🔄 QC: ${lacznieQc}</span>
                                </div>
                                ${sumaPaska > 0 ? `
                                <div style="width:100%; height:4px; background:${isDark?'#334155':'#e2e8f0'}; border-radius:2px; overflow:hidden; display:flex;">
                                    <div style="width:${pMczyste}%; background:#4ade80; height:100%;" title="Czyste: ${pMczyste}%"></div>
                                    <div style="width:${pMqc}%; background:#818cf8; height:100%;" title="QC: ${pMqc}%"></div>
                                    <div style="width:${pMber}%; background:#f87171; height:100%;" title="BER: ${pMber}%"></div>
                                </div>` : '<div style="height:4px;"></div>'}
                            </div>`;
                    }
                }
                htmlModele += `</div></div>`;
            }

            return `
                ${htmlCelDzienny}
                ${htmlKalendarz}
                <div class="themed-card" style="border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display:flex; justify-content:space-between; font-weight:bold; border-bottom:1px solid ${isDark?'#334155':'#e2e8f0'}; padding-bottom:6px; font-size:12px;">
                        <span>📊 Raport: ${naglowekOkresu}</span>
                        <span style="background:#0284c7; color:white; padding:1px 8px; border-radius:10px; font-size:10px;">Suma napraw: ${daneDoWyswietlenia.razem} szt.</span>
                    </div>

                    <div style="display: flex; align-items: center; gap: 20px; margin-top: 2px;">
                        <div style="width: 74px; height: 74px; border-radius: 50%; ${wykresKolowyStyle} box-shadow: 0 4px 10px rgba(0,0,0,0.15); flex-shrink: 0; position: relative; display: flex; align-items: center; justify-content: center;">
                            <div style="width: 44px; height: 44px; background: ${isDark?'#1e293b':'#ffffff'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; border:1px solid ${isDark?'#334155':'#cbd5e1'};">${daneDoWyswietlenia.razem}</div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr; gap: 4px; flex-grow: 1; font-size: 11px;">
                            <div style="display:flex; justify-content:space-between; background:rgba(74,222,128,0.06); padding:4px 8px; border-radius:6px; border-left:4px solid #4ade80; border:1px solid rgba(74,222,128,0.12); border-left-width:4px;">
                                <span style="color:#22c55e; font-weight:600;">✅ Czyste:</span><span><strong>${czysteGlobalne}</strong> (${pCzyste}%)</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; background:rgba(248,113,113,0.06); padding:4px 8px; border-radius:6px; border-left:4px solid #f87171; border:1px solid rgba(248,113,113,0.12); border-left-width:4px;">
                                <span style="color:#f87171; font-weight:600;">🛠️ Spisane BER:</span><span><strong>${daneDoWyswietlenia.ber}</strong> (${pBer}%)</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; background:rgba(129,140,248,0.04); padding:4px 8px; border-radius:6px; border-left:4px solid #818cf8; border:1px solid rgba(129,140,248,0.08); border-left-width:4px; opacity:0.85;">
                                <span style="color:#818cf8; font-weight:600;">ℹ️ Powroty QC (Info):</span><span><strong style="color:#818cf8;">${daneDoWyswietlenia.powroty} szt.</strong></span>
                            </div>
                        </div>
                    </div>
                    ${htmlPaceInsights}
                    ${htmlWykresKategorii}
                    ${htmlModele}
                </div>
            `;
        }

        const overlay = document.createElement('div');
        overlay.id = 'mitel-stats-overlay';

        function odswiezStyleOverlay() {
            const currentTheme = pobierzMotyw();
            let styleCss = "";
            if (currentTheme === 'dark') {
                styleCss = `
                    --bg-main: #0f172a; --bg-top: #111827; --bg-card: #1e293b; --bg-darker: #111827;
                    --text-main: #f8fafc; --text-muted: #94a3b8; --border: #1e293b; --border-card: #334155;
                `;
            } else {
                styleCss = `
                    --bg-main: #f1f5f9; --bg-top: #ffffff; --bg-card: #ffffff; --bg-darker: #f8fafc;
                    --text-main: #1e293b; --text-muted: #64748b; --border: #cbd5e1; --border-card: #e2e8f0;
                `;
            }
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(3, 7, 18, 0.7);
                z-index: 1000000; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif;
                backdrop-filter: blur(4px); ${styleCss}
            `;
            odswiezStyleHUD();
        }

        odswiezStyleOverlay();

        overlay.innerHTML = `
            <style>
                #mitel-stats-overlay .main-container { background: var(--bg-main) !important; color: var(--text-main) !important; border: 1px solid var(--border) !important; }
                #mitel-stats-overlay .top-bar { background: var(--bg-top) !important; border-bottom: 1px solid var(--border) !important; }
                #mitel-stats-overlay .themed-card { background: var(--bg-card) !important; border: 1px solid var(--border-card) !important; }
                #mitel-stats-overlay .themed-subcard { background: var(--bg-main) !important; border: 1px solid var(--border) !important; }
                #mitel-stats-overlay .themed-dark-bg { background: var(--bg-darker) !important; color: var(--text-main) !important; }
                #mitel-stats-overlay .text-muted { color: var(--text-muted) !important; }
                #mitel-stats-overlay .tab-btn { padding: 6px 10px; border: 1px solid transparent; border-bottom: none; border-top-left-radius: 6px; border-top-right-radius: 6px; font-size: 10px; font-weight: bold; cursor: pointer; background: transparent; color: var(--text-muted); }
                #mitel-stats-overlay .tab-btn.active { background: var(--bg-card) !important; color: var(--text-main) !important; border-color: var(--border) !important; }
                #mitel-stats-overlay table tbody tr:hover { background: rgba(128,128,128,0.05); }
                #mitel-stats-overlay table, #mitel-stats-overlay tr, #mitel-stats-overlay td, #mitel-stats-overlay th { background: transparent; color: inherit; }
            </style>
            <div class="main-container" style="width: 610px; max-height: 95%; border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4);">
                <div class="top-bar" style="padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin:0; font-size:12px; font-weight:800; letter-spacing:0.8px; color:#0284c7;">🧠 PANEL SYSTEMOWY MITEL INTELLIGENCE</h2>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <button id="theme-toggle-btn" style="background: var(--bg-darker); border: 1px solid var(--border); padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: bold; cursor: pointer; color: var(--text-main); display:flex; align-items:center; gap:4px;">
                            ${pobierzMotyw() === 'dark' ? '☀️ Day Mode' : '🌙 Dark Mode'}
                        </button>
                        <button id="zamknij-stats-btn" style="background: transparent; border: none; color: var(--text-muted); font-size: 22px; cursor: pointer; line-height:1;">&times;</button>
                    </div>
                </div>

                <div class="top-bar" style="display: flex; padding: 4px 12px 0 12px; gap: 4px;">
                    <button id="tab-dzis" class="tab-btn active">📆 OPERACJE DZIŚ</button>
                    <button id="tab-tydzien" class="tab-btn">📅 OSTATNIE 7 DNI</button>
                    <button id="tab-miesiac" class="tab-btn">🗓️ OSTATNIE 30 DNI</button>
                    <button id="tab-auto" class="tab-btn" style="color:#0284c7;">⚙️ USTAWIENIA / SN</button>
                </div>

                <div id="obszar-kart-stats" style="padding: 10px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 8px;">
                    ${generujHtmlKarty(daneOkresow.dzis, "Dzisiaj", true)}
                </div>

                <div class="top-bar" style="padding: 8px 16px; display:flex; justify-content:space-between; align-items:center; font-size:10px;">
                    <button id="btn-reset-db" style="background: transparent; color: #f87171; border: 1px solid #f87171; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 9px; cursor: pointer;">🧹 Resetuj bazę danych</button>
                    <strong class="text-muted">v24.07 Placement Edition</strong>
                    <button id="btn-manual-update" style="background: transparent; color: #38bdf8; border: 1px solid #38bdf8; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 9px; cursor: pointer; margin-right: 10px;">🔄 Aktualizuj ręcznie</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            // FIX: Obsługa przycisku manualnego wewnątrz popupu
            if (e.target.id === 'btn-manual-update') {
               const btn = e.target;
               btn.innerText = "🔄 Odświeżam...";
               btn.style.opacity = "0.7";
               setTimeout(() => location.reload(), 500);
               return;
            }

            if (e.target.classList.contains('hud-copy-trigger-btn')) {
                const snDoSkopiowania = e.target.getAttribute('data-sn');
                if (snDoSkopiowania) {
                    navigator.clipboard.writeText(snDoSkopiowania).then(() => {
                        e.target.innerText = "✅ Skopiowano!";
                        setTimeout(() => e.target.innerText = "📋 Kopiuj", 2000);
                    }).catch(err => console.error("Błąd kopiowania: ", err));
                }
                return;
            }

            if (e.target.id === 'hud-cal-toggle-view-btn') {
                const stan = pobierzCzyKalendarzRozwiniety();
                zapiszCzyKalendarzRozwiniety(!stan);
                const grid = document.getElementById('hud-cal-grid-wrapper');
                if (grid) {
                    grid.style.display = !stan ? 'grid' : 'none';
                }
                e.target.textContent = !stan ? '[Zwiń]' : '[Rozwiń]';
                return;
            }

            const cell = e.target.closest('.hud-cal-cell');
            if (cell) {
                wybranaDataFiltr = cell.getAttribute('data-date');
                odswiezBiezacaKarte();
                return;
            }

            if (e.target.id === 'hud-cal-reset-btn') {
                wybranaDataFiltr = null;
                odswiezBiezacaKarte();
                return;
            }
        });

        const tabDzis = document.getElementById('tab-dzis');
        const tabTydzien = document.getElementById('tab-tydzien');
        const tabMiesiac = document.getElementById('tab-miesiac');
        const tabAuto = document.getElementById('tab-auto');
        const obszarKarty = document.getElementById('obszar-kart-stats');
        const themeBtn = document.getElementById('theme-toggle-btn');

        function odswiezBiezacaKarte() {
            const activeTab = document.querySelector('#mitel-stats-overlay .tab-btn.active');
            if (activeTab === tabDzis) aktywujKarte(tabDzis, generujHtmlKarty(obliczDaneOkresu(0, archiwum), "Dzisiaj", true, 0));
            if (activeTab === tabTydzien) aktywujKarte(tabTydzien, generujHtmlKarty(obliczDaneOkresu(7, archiwum), "Ostatnie 7 dni", false, 7));
            if (activeTab === tabMiesiac) aktywujKarte(tabMiesiac, generujHtmlKarty(obliczDaneOkresu(30, archiwum), "Ostatnie 30 dni", false, 30));
        }

        themeBtn.addEventListener('click', () => {
            const current = pobierzMotyw();
            const nextTheme = current === 'dark' ? 'light' : 'dark';
            zapiszMotyw(nextTheme);
            odswiezStyleOverlay();
            themeBtn.innerHTML = nextTheme === 'dark' ? '☀️ Day Mode' : '🌙 Dark Mode';

            const basins = document.querySelector('#mitel-stats-overlay .tab-btn.active');
            if (basins === tabDzis) tabDzis.click();
            if (basins === tabTydzien) tabTydzien.click();
            if (basins === tabMiesiac) tabMiesiac.click();
            if (basins === tabAuto) tabAuto.click();
        });

        function podepnijSluchaczeAutomatyzacji() {
            const inputSzukaj = document.getElementById('mitel-sn-search-input');
            const tbody = document.getElementById('mitel-repair-table-body');
            if (inputSzukaj && tbody) {
                inputSzukaj.addEventListener('input', function() {
                    tbody.innerHTML = renderujWierszeNapraw(inputSzukaj.value);
                });
            }

            const inputKlawisz = document.getElementById('mitel-key-config-input');
            if (inputKlawisz) {
                inputKlawisz.addEventListener('keydown', function(e) {
                    e.preventDefault();
                    let wybranyKlawisz = e.key;
                    if (wybranyKlawisz === " ") wybranyKlawisz = "Space";
                    inputKlawisz.value = wybranyKlawisz;
                    zapiszKlawiszSkrotu(wybranyKlawisz);
                    odswiezWidokHUD();
                });
            }
        }

        function aktywujKarte(elementTab, htmlWskazany, czyAuto = false) {
            [tabDzis, tabTydzien, tabMiesiac, tabAuto].forEach(t => t.classList.remove('active'));
            elementTab.classList.add('active');
            obszarKarty.innerHTML = htmlWskazany;
            if (czyAuto) podepnijSluchaczeAutomatyzacji();
        }

        tabDzis.addEventListener('click', () => { wybranaDataFiltr = null; aktywujKarte(tabDzis, generujHtmlKarty(obliczDaneOkresu(0, archiwum), "Dzisiaj", true, 0)); });
        tabTydzien.addEventListener('click', () => { wybranaDataFiltr = null; aktywujKarte(tabTydzien, generujHtmlKarty(obliczDaneOkresu(7, archiwum), "Ostatnie 7 dni", false, 7)); });
        tabMiesiac.addEventListener('click', () => { wybranaDataFiltr = null; aktywujKarte(tabMiesiac, generujHtmlKarty(obliczDaneOkresu(30, archiwum), "Ostatnie 30 dni", false, 30)); });
        tabAuto.addEventListener('click', () => { wybranaDataFiltr = null; aktywujKarte(tabAuto, generujHtmlAutomatyzacji(), true); });

        document.getElementById('btn-reset-db').addEventListener('click', function() {
            if(confirm("Czy chcesz wyczyścić historię?")) {
                localStorage.clear();
                window.location.reload();
            }
        });

        document.getElementById('zamknij-stats-btn').addEventListener('click', () => overlay.remove());
    }

    // ==========================================
    // SEKCJA 3: REJESTRACJA I PROCESOWANIE
    // ==========================================

    let tymczasowyWierszTabeli = null;

    function sprawdzZapisPrzedPrzeladowaniem() {
        function przygotujZapisSesji(elementKlikniety, wymuszoneCzysteQC = false) {
            let czyZmienionoNaBER = false;
            let czyZmienionoNaQC = wymuszoneCzysteQC;
            let czyToJestPowrot = false;
            let kontenerDanych = document.getElementById('myModal') || document;

            const aktualnyWiersz = elementKlikniety.closest('tr') || tymczasowyWierszTabeli;
            const form = elementKlikniety.closest('form') || kontenerDanych;

            if (!czyZmienionoNaQC) {
                const selectStatus = form.querySelector('select[name="status"]');
                if (selectStatus && selectStatus.options[selectStatus.selectedIndex]) {
                    const wartoscStatusu = selectStatus.options[selectStatus.selectedIndex].value.toUpperCase();
                    if (wartoscStatusu.includes("QC") || wartoscStatusu.includes("KONTROL")) {
                        czyZmienionoNaQC = true;
                    }
                }
            }

            const selectIssue = form.querySelector('select[name="issue"]');
            if (selectIssue && selectIssue.options[selectIssue.selectedIndex]) {
                const opcja = selectIssue.options[selectIssue.selectedIndex];
                const optGroup = opcja.closest('optgroup');
                if ((optGroup && optGroup.label.toUpperCase() === "BER") ||
                    opcja.value.toUpperCase() === "U100" || opcja.text.toUpperCase().includes("CIECH")) {
                    czyZmienionoNaBER = true;
                }
            }

            if (aktualnyWiersz) {
                if (aktualnyWiersz.classList.contains('fail')) {
                    czyToJestPowrot = true;
                } else {
                    const selectStatus = aktualnyWiersz.querySelector('select[name="status"]');
                    if (selectStatus && selectStatus.innerHTML.toUpperCase().includes('POWRÓT')) {
                        czyToJestPowrot = true;
                    }
                }
            }

            let surowyModel = wykryjModelTelefonu(kontenerDanych);
            let wyciagnietySN = przechwycNumerSeryjny(kontenerDanych);

            if ((surowyModel === "Nieznany Model" || !surowyModel) && aktualnyWiersz) {
                const komorki = aktualnyWiersz.getElementsByTagName('td');
                if (komorki.length >= 3) {
                    surowyModel = komorki[1].textContent.replace('ℹ️', '').replace(/[\s\xa0]+/g, ' ').trim();
                    wyciagnietySN = komorki[2].textContent.replace(/[\s\xa0]+/g, ' ').trim();
                }
            }

            if (surowyModel === "Nieznany Model" || !surowyModel) {
                console.warn("MitelHUD: Nie udało się zidentyfikować modelu urządzenia.");
                return;
            }

            let aktywnyModel = surowyModel;
            if (!aktywnyModel.toUpperCase().includes("MITEL") && !aktywnyModel.toUpperCase().includes("DECT")) {
                aktywnyModel = "Mitel " + aktywnyModel;
            }

            const unikalnyToken = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);

            sessionStorage.setItem('mitel_pending_model', aktywnyModel);
            sessionStorage.setItem('mitel_pending_sn', wyciagnietySN);
            sessionStorage.setItem('mitel_pending_token', unikalnyToken);
            sessionStorage.setItem('sztuka_pending_increment', '1');

            if (czyToJestPowrot) {
                sessionStorage.setItem('mitel_pending_is_return', '1');
            } else {
                sessionStorage.removeItem('mitel_pending_is_return');
            }

            if (czyZmienionoNaBER) {
                sessionStorage.setItem('ber_pending_increment', '1');
            } else {
                sessionStorage.removeItem('ber_pending_increment');
            }

            if (czyZmienionoNaQC) {
                sessionStorage.setItem('qc_pending_increment', '1');
            } else {
                sessionStorage.removeItem('qc_pending_increment');
            }
        }

        document.addEventListener('click', function(e) {
            const el = e.target;
            const czyGlownySubmit = el.closest('input[type="submit"], button[type="submit"]') ||
                                    (el.tagName === 'INPUT' && el.value.toUpperCase().includes('DODAJ'));
            const czyKomentarzSubmit = el.id === 'confirmComment';

            if (!czyGlownySubmit && !czyKomentarzSubmit) return;

            if (czyKomentarzSubmit) {
                const selectBer = document.getElementById('berIssueSelect');
                if (selectBer && selectBer.options[selectBer.selectedIndex] && selectBer.options[selectBer.selectedIndex].value !== "") {
                    if (tymczasowyWierszTabeli) {
                        procesujBerLiveZTablei(tymczasowyWierszTabeli);
                        tymczasowyWierszTabeli = null;
                        return;
                    }
                }
            }

            przygotujZapisSesji(el);
        });

        document.addEventListener('change', function(e) {
            const el = e.target;
            if (el.name === 'status' && el.classList.contains('status-select')) {
                const wybranaOpcja = el.options[el.selectedIndex].value.toUpperCase();
                tymczasowyWierszTabeli = el.closest('tr');

                if (wybranaOpcja.includes("QC") || wybranaOpcja.includes("KONTROL")) {
                    przygotujZapisSesji(el, true);
                }
            }
        });
    }

    function podepnijMonitorowanieStatusuLive() {
        const tabelaGlowna = document.getElementById('general');
        if (!tabelaGlowna) return;

        tabelaGlowna.addEventListener('change', function(e) {
            const selectEl = e.target;
            if (!selectEl.classList.contains('status-select') || selectEl.name !== 'status') return;

            const wiersz = selectEl.closest('tr');
            if (wiersz) {
                tymczasowyWierszTabeli = wiersz;
            }
        });

        document.addEventListener('click', function(e) {
            if (e.target.id === 'cancelComment' || e.target.id === 'closeComment') {
                setTimeout(() => { tymczasowyWierszTabeli = null; }, 100);
            }
        });
    }

    function procesujBerLiveZTablei(wiersz) {
        const komorki = wiersz.getElementsByTagName('td');
        if (komorki.length < 3) return;

        let surowyModel = komorki[1].textContent.replace('ℹ️', '').trim();
        let wyciagnietySN = komorki[2].textContent.trim();

        if (!surowyModel || surowyModel === "") surowyModel = "Nieznany Model";
        if (!wyciagnietySN || wyciagnietySN === "") wyciagnietySN = "Brak SN";

        let aktywnyModel = surowyModel;
        if (!aktywnyModel.toUpperCase().includes("MITEL") && !aktywnyModel.toUpperCase().includes("DECT")) {
            aktywnyModel = "Mitel " + aktywnyModel;
        }

        const kluczBlokadyLive = `live_ber_auth_${aktywnyModel}_${wyciagnietySN}`;
        if (sessionStorage.getItem(kluczBlokadyLive)) return;

        if (!daneDzis.czasStartu) daneDzis.czasStartu = new Date().toISOString();

        daneDzis.ber = (daneDzis.ber || 0) + 1;

        const sumaZHtml = pobierzSumeDzisZHtml();
        if (sumaZHtml === null) {
            daneDzis.razem = (daneDzis.razem || 0) + 1;
        }

        daneDzis.streak = 0;

        if (!daneDzis.modele[aktywnyModel]) {
            daneDzis.modele[aktywnyModel] = { ber: 0, powroty: 0, qc: 0, razem: 0 };
        }

        daneDzis.modele[aktywnyModel].ber = (daneDzis.modele[aktywnyModel].ber || 0) + 1;
        daneDzis.modele[aktywnyModel].razem = (daneDzis.modele[aktywnyModel].razem || 0) + 1;

        if (typeof dodajWpisDoTimeline === 'function') {
            dodajWpisDoTimeline('BER', aktywnyModel, wyciagnietySN);
        }

        sessionStorage.setItem(kluczBlokadyLive, '1');

        if (typeof zapiszDaneDnia === 'function') zapiszDaneDnia(KLUCZ_DNIA, daneDzis);
        if (typeof odswiezWidokHUD === 'function') odswiezWidokHUD();

        const aktifTab = document.querySelector('.top-bar-tabs .active, [id^="tab"].active') || document.getElementById('tabDzis');
        if (aktifTab && typeof aktifTab.click === 'function') {
            aktifTab.click();
        }
    }

    function sprawdzMultiZapisyWTabeli() {
        const tabelaGlowna = document.getElementById('general');
        if (!tabelaGlowna) return;

        const wiersze = tabelaGlowna.querySelectorAll('tbody tr');
        const mapaSN = {};

        wiersze.forEach(wiersz => {
            const komorki = wiersz.getElementsByTagName('td');
            if (komorki.length < 3) return;
            const sn = komorki[2].textContent.trim();

            if (sn && sn !== "" && sn !== "Brak SN" && sn.length > 4) {
                mapaSN[sn] = (mapaSN[sn] || 0) + 1;
            }
        });

        wiersze.forEach(wiersz => {
            const komorki = wiersz.getElementsByTagName('td');
            if (komorki.length < 3) return;
            const sn = komorki[2].textContent.trim();

            if (mapaSN[sn] > 1) {
                if (!komorki[2].querySelector('.multi-icon')) {
                    komorki[2].innerHTML = `<span class="multi-icon" style="color:#a855f7; font-weight:bold; margin-right:4px;" title="Ten SN występuje dzisiaj ${mapaSN[sn]}x! (Multi-zapis)">🔁</span>` + komorki[2].innerHTML;
                    wiersz.style.borderLeft = "3px solid #a855f7";
                }
            }
        });
    }

    function uruchomZegar() {
        setInterval(() => {
            const clockBox = document.getElementById('hud-live-clock');
            if (clockBox) clockBox.textContent = new Date().toLocaleTimeString('pl-PL');
        }, 1000);
    }

    function procesujStatePoPrzeladowaniu() {
        try {
            const sumaZHtml = pobierzSumeDzisZHtml();
            const staraSumaZPamieci = daneDzis.razem || 0;

            let zmiana = false;
            const zapamietanyModel = sessionStorage.getItem('mitel_pending_model');
            const zapamietanySN = sessionStorage.getItem('mitel_pending_sn') || "Brak SN";
            const pendingToken = sessionStorage.getItem('mitel_pending_token');
            const czyZwiekszyc = sessionStorage.getItem('sztuka_pending_increment');

            const czyZgloszonoJakoPowrot = sessionStorage.getItem('mitel_pending_is_return') === '1';

            const kluczBlokadyLive = `live_ber_auth_${zapamietanyModel}_${zapamietanySN}`;
            const czyBylPrzetworzonyLive = sessionStorage.getItem(kluczBlokadyLive) === '1';

            sessionStorage.removeItem('sztuka_pending_increment');

            let przetworzoneTokeny = [];
            try { przetworzoneTokeny = JSON.parse(localStorage.getItem(KLUCZ_PRZETWORZONE_TOKENY)) || []; } catch(e) {}

            if (sumaZHtml !== null) {
                daneDzis.razem = sumaZHtml;
            }

            const czySumaWzrosla = sumaZHtml === null || sumaZHtml > staraSumaZPamieci;

            if (czyZwiekszyc === '1' && zapamietanyModel && zapamietanyModel !== "Nieznany Model") {
                if (!przetworzoneTokeny.includes(pendingToken)) {

                    if (!daneDzis.czasStartu) daneDzis.czasStartu = new Date().toISOString();
                    if (sumaZHtml === null && czySumaWzrosla) daneDzis.razem++;

                    if (!daneDzis.modele[zapamietanyModel]) {
                        daneDzis.modele[zapamietanyModel] = { ber: 0, powroty: 0, qc: 0, czyste: 0, razem: 0 };
                    }

                    if (sessionStorage.getItem('ber_pending_increment') === '1') {
                        if (!czyBylPrzetworzonyLive && czySumaWzrosla) {
                            daneDzis.ber = (daneDzis.ber || 0) + 1;
                            daneDzis.modele[zapamietanyModel].ber++;
                            daneDzis.modele[zapamietanyModel].razem++;
                            daneDzis.streak = 0;
                            dodajWpisDoTimeline('BER', zapamietanyModel, zapamietanySN);
                        }

                    } else if (sessionStorage.getItem('qc_pending_increment') === '1') {

                        if (czyZgloszonoJakoPowrot) {
                            daneDzis.qc = (daneDzis.qc || 0) + 1;
                            daneDzis.modele[zapamietanyModel].qc = (daneDzis.modele[zapamietanyModel].qc || 0) + 1;
                            daneDzis.modele[zapamietanyModel].powroty = (daneDzis.modele[zapamietanyModel].powroty || 0) + 1;

                            daneDzis.streak = (daneDzis.streak || 0) + 1;
                            dodajWpisDoTimeline('QC', zapamietanyModel, zapamietanySN);
                        } else {
                            daneDzis.modele[zapamietanyModel].czyste = (daneDzis.modele[zapamietanyModel].czyste || 0) + 1;
                            daneDzis.streak = (daneDzis.streak || 0) + 1;
                            dodajWpisDoTimeline('Czyste', zapamietanyModel, zapamietanySN);
                        }

                        if (czySumaWzrosla) {
                            daneDzis.modele[zapamietanyModel].razem++;
                        }

                    } else {
                        if (czySumaWzrosla) {
                            daneDzis.modele[zapamietanyModel].razem++;
                            daneDzis.modele[zapamietanyModel].czyste = (daneDzis.modele[zapamietanyModel].czyste || 0) + 1;
                            daneDzis.streak = (daneDzis.streak || 0) + 1;
                            dodajWpisDoTimeline('Czyste', zapamietanyModel, zapamietanySN);
                        }
                    }

                    if (pendingToken) {
                        przetworzoneTokeny.push(pendingToken);
                        if (przetworzoneTokeny.length > 100) przetworzoneTokeny.shift();
                        localStorage.setItem(KLUCZ_PRZETWORZONE_TOKENY, JSON.stringify(przetworzoneTokeny));
                    }
                    zmiana = true;
                }
            }

            sessionStorage.removeItem('ber_pending_increment');
            sessionStorage.removeItem('qc_pending_increment');
            sessionStorage.removeItem('mitel_pending_model');
            sessionStorage.removeItem('mitel_pending_sn');
            sessionStorage.removeItem('mitel_pending_token');
            sessionStorage.removeItem('mitel_pending_is_return');
            sessionStorage.removeItem(kluczBlokadyLive);

            zapiszDaneDnia(KLUCZ_DNIA, daneDzis);

        } catch(err) {
            console.error("MitelHUD error state recovery:", err);
        }
    }

    let czyTrwaPrzeciaganie = false;

    function wlaczPrzeciaganieHUD() {
        const hud = document.getElementById('mitel-hud-container');
        const handle = document.getElementById('mitel-hud-header');

        if (!hud || !handle) return;

        let startX = 0, startY = 0;
        let initialLeft = 0, initialTop = 0;
        let czyPrzesunieto = false;

        handle.addEventListener('mousedown', dragMouseDown);

        function dragMouseDown(e) {
            if (e.target.closest('#hud-change-side-btn') || ['BUTTON', 'INPUT', 'SELECT'].includes(e.target.tagName)) return;

            e.preventDefault();
            czyPrzesunieto = false;

            hud.classList.add('hud-state-dragging');

            startX = e.clientX;
            startY = e.clientY;
            initialLeft = hud.offsetLeft;
            initialTop = hud.offsetTop;

            document.addEventListener('mouseup', closeDragElement);
            document.addEventListener('mousemove', elementDrag);
        }

        function elementDrag(e) {
            e.preventDefault();
            czyPrzesunieto = true;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            hud.style.right = 'auto';
            hud.style.bottom = 'auto';
            hud.style.left = (initialLeft + deltaX) + 'px';
            hud.style.top = (initialTop + deltaY) + 'px';
        }

        function closeDragElement(e) {
            document.removeEventListener('mouseup', closeDragElement);
            document.removeEventListener('mousemove', elementDrag);

            hud.classList.remove('hud-state-dragging');

            if (czyPrzesunieto) {
                e.stopPropagation();

                const pozycja = {
                    x: hud.offsetLeft,
                    y: hud.offsetTop
                };
                localStorage.setItem('mitel_hud_drag_pozycja', JSON.stringify(pozycja));
                localStorage.removeItem('mitel_hud_side');
            }
        }
    }

    function zaladujBibliotekeConfetti() {
        if (window.confetti) return;
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/input.min.js';
        script.async = true;
        document.head.appendChild(script);
    }

    function odpalAutorskieConfetti() {
        if (sessionStorage.getItem('mitel_norma_celebrated') === 'yes') return;
        sessionStorage.setItem('mitel_norma_celebrated', 'yes');

        const canvas = document.createElement('canvas');
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.zIndex = '9999999';
        canvas.style.pointerEvents = 'none';
        document.body.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const kolory = ['#f43f5e', '#3b82f6', '#10b981', '#eab308', '#a855f7', '#ff7849', '#06b6d4', '#f43f5e'];

        const czasteczkiKonfetti = [];
        const fajerwerki = [];
        const iskryFajerwerkow = [];

        for (let i = 0; i < 120; i++) {
            czasteczkiKonfetti.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height - canvas.height,
                r: Math.random() * 6 + 4,
                d: Math.random() * canvas.height,
                color: kolory[Math.floor(Math.random() * kolory.length)],
                tilt: Math.random() * 10 - 5,
                tiltAngleIncremental: Math.random() * 0.07 + 0.02,
                tiltAngle: 0
            });
        }

        function stworzFajerwerk() {
            if (fajerwerki.length < 3) {
                fajerwerki.push({
                    x: Math.random() * (canvas.width * 0.6) + (canvas.width * 0.2),
                    y: canvas.height,
                    targetY: Math.random() * (canvas.height * 0.4) + (canvas.height * 0.1),
                    speed: Math.random() * 4 + 7,
                    color: kolory[Math.floor(Math.random() * kolory.length)]
                });
            }
        }

        function stworzRozblysk(x, y, kolor) {
            const iloscIskier = 40;
            for (let i = 0; i < iloscIskier; i++) {
                const kat = (Math.PI * 2 / iloscIskier) * i + Math.random() * 0.5;
                const moc = Math.random() * 4 + 2;
                iskryFajerwerkow.push({
                    x: x,
                    y: y,
                    vx: Math.cos(kat) * moc,
                    vy: Math.sin(kat) * moc,
                    alpha: 1,
                    fade: Math.random() * 0.015 + 0.01,
                    color: kolor
                });
            }
        }

        let animationFrameId;
        const startTime = Date.now();

        function rysuj() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (Date.now() - startTime < 3500 && Math.random() < 0.05) {
                stworzFajerwerk();
            }

            for (let i = fajerwerki.length - 1; i >= 0; i--) {
                const f = fajerwerki[i];
                f.y -= f.speed;

                ctx.beginPath();
                ctx.arc(f.x, f.y, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();

                if (f.y <= f.targetY) {
                    stworzRozblysk(f.x, f.y, f.color);
                    fajerwerki.splice(i, 1);
                }
            }

            for (let i = iskryFajerwerkow.length - 1; i >= 0; i--) {
                const iskra = iskryFajerwerkow[i];
                iskra.x += iskra.vx;
                iskra.y += iskra.vy;
                iskra.vy += 0.04;
                iskra.alpha -= iskra.fade;

                if (iskra.alpha <= 0) {
                    iskryFajerwerkow.splice(i, 1);
                    continue;
                }

                ctx.beginPath();
                ctx.arc(iskra.x, iskra.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = iskra.color;
                ctx.globalAlpha = iskra.alpha;
                ctx.fill();
                ctx.globalAlpha = 1;
            }

            let spadajaceKonfetti = 0;
            czasteczkiKonfetti.forEach((p) => {
                p.tiltAngle += p.tiltAngleIncremental;
                p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
                p.x += Math.sin(p.tiltAngle);
                p.tilt = Math.sin(p.tiltAngle - spadajaceKonfetti / 3) * 15;

                if (p.y < canvas.height) spadajaceKonfetti++;

                ctx.beginPath();
                ctx.lineWidth = p.r;
                ctx.strokeStyle = p.color;
                ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
                ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
                ctx.stroke();
            });

            const aktywneElementy = spadajaceKonfetti + fajerwerki.length + iskryFajerwerkow.length;
            if (Date.now() - startTime < 5500 && aktywneElementy > 0) {
                animationFrameId = requestAnimationFrame(rysuj);
            } else {
                cancelAnimationFrame(animationFrameId);
                canvas.remove();
            }
        }

        rysuj();
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================
    function init() {
        try {
            zaladujBibliotekeConfetti();
            procesujStatePoPrzeladowaniu();
            stworzPanelHUD();
            inicjujMenedzerAktualizacji();

            setTimeout(wlaczPrzeciaganieHUD, 50);

            sprawdzZapisPrzedPrzeladowaniem();
            podepnijMonitorowanieStatusuLive();
            skanujTabeleWPoszukiwaniuPowrotow();

            sprawdzMultiZapisyWTabeli();

            uruchomZegar();
            odswiezWidokHUD();
        } catch(err) {
            console.error("Critical fail in Mitel HUD initialization:", err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
