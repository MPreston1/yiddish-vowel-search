// ---- shared helpers ----
function kv(name) {
    const open = () => new Promise((res, rej) => {
        const r = indexedDB.open(name, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error)
    });
    return {
        async get(k) {
            const db = await open();
            return new Promise((res, rej) => {
                const r = db.transaction('kv').objectStore('kv').get(k);
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error)
            })
        },
        async set(k, v) {
            const db = await open();
            return new Promise((res, rej) => {
                const t = db.transaction('kv', 'readwrite');
                t.objectStore('kv').put(v, k);
                t.oncomplete = () => res();
                t.onerror = () => rej(t.error)
            })
        }
    }
}

function parseCSV(t) {
    const out = [];
    let r = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (q) {
            if (c == '"') {
                if (t[i + 1] == '"') {
                    f += '"';
                    i++
                } else q = false
            } else f += c
        } else if (c == '"') q = true;
        else if (c == ',') {
            r.push(f);
            f = ''
        } else if (c == '\n') {
            r.push(f);
            out.push(r);
            r = [];
            f = ''
        } else if (c != '\r') f += c
    }
    if (f || r.length) {
        r.push(f);
        out.push(r)
    }
    return out
}

// ---- helpers shared by rules.js, length.js and oy.js (kept in one object so they cannot clash with names on other pages) ----
const Shared = (() => {
    // Creates an element with an optional class and text.
    function el(tag, cls, txt) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e
    }

    // Search key for Yiddish words with all vowel and letter marks removed (ligatures spelled out; spaces, hyphens, brackets and … ignored).
    const norm = s => (s || '').normalize('NFD').replace(/[\u0591-\u05C7]/g, '').replace(/\u05F0/g, 'וו').replace(/\u05F1/g, 'וי').replace(/\u05F2/g, 'יי').replace(/[\s\-()…]/g, '').toLowerCase();

    // Downloads a sheet tab as text. Gives up after `ms` (default 15 s) so a blocked connection cannot hang the page.
    async function fetchSheet(url, ms) {
        const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms || 15000);
        try {
            const res = await fetch(url, {signal: ctl.signal});
            if (!res.ok) throw new Error(res.status);
            const text = await res.text();
            if (text.trim().startsWith('<')) throw new Error('Sheet is not public');
            return text
        } finally {
            clearTimeout(timer)
        }
    }

    // Opens an empty pop-up with a title and close button (X, Escape, or a tap outside) inside host; returns its box.
    function modal(host, title) {
        const ov = el('div', 'ov'), box = el('div', 'modal'), h = el('h3');
        h.dir = 'auto';
        h.textContent = title;
        const x = el('button', 'x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Close');
        const esc = e => {
            if (e.key === 'Escape') close()
        }, close = () => {
            ov.remove();
            document.removeEventListener('keydown', esc)
        };
        x.onclick = close;
        ov.addEventListener('click', e => {
            if (e.target === ov) close()
        });
        document.addEventListener('keydown', esc);
        box.append(x, h);
        ov.append(box);
        host.append(ov);
        box.close = close;   // lets the caller close the pop-up itself (for example from a button inside it)
        return box
    }

    // Adds the search keys nw (word) and ng (gloss) to a row, with all vowel and letter marks removed; returns the row.
    function addKeys(r) {
        r.nw = norm(r.word);
        r.ng = norm(r.gloss);
        return r
    }

    // Search results: the items whose key contains q, best first (exact match, then starts with q, then contains q; shorter keys first).
    // keyOf(item) gives the text to look in; find(key, q) can replace the default indexOf.
    function rankMatches(items, q, keyOf, find) {
        const m = [];
        for (const it of items) {
            const s = keyOf(it);
            if (!s) continue;
            const p = find ? find(s, q) : s.indexOf(q);
            if (p < 0) continue;
            m.push([s === q ? 0 : p === 0 ? 1 : 2, s.length, it])
        }
        m.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        return m.map(x => x[2])
    }

    // Shows the next page of results (cards for items[shown .. shown+page)) and updates the "Show more" button.
    // Returns the new number of items shown.
    function showMore(results, moreBtn, items, shown, page, card) {
        const frag = document.createDocumentFragment();
        for (const x of items.slice(shown, shown + page)) frag.append(card(x));
        shown = Math.min(shown + page, items.length);
        results.append(frag);
        moreBtn.hidden = shown >= items.length;
        moreBtn.textContent = `Show more (${items.length - shown} left)`;
        return shown
    }

    // Saves text as a .json file. With share=true, tries the phone's share sheet first (Save to Files, AirDrop, ...);
    // otherwise, or if sharing is not available, it downloads the file. Returns false if the person cancelled the share sheet.
    async function saveJSON(name, text, share) {
        const file = new File([text], name, {type: 'application/json'});
        if (share) {
            try {
                if (navigator.canShare && navigator.canShare({files: [file]})) {
                    await navigator.share({files: [file]});
                    return true
                }
            } catch (e) {
                if (e.name === 'AbortError') return false
            }
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        return true
    }

    return {el, norm, addKeys, rankMatches, showMore, fetchSheet, modal, saveJSON}
})();

// ---- Yiddish typing mode (Yiddish Klal layout), shared by both tools: type ~ to toggle, ~~ for a literal ~
// Maps physical keys (event.code) to [plain, shift, option, shift+option]; other keys type normally.
const YK_MAP = {
    KeyA: ['אַ', 'א'],
    KeyS: ['ס', 'ת'],
    KeyD: ['ד', 'דזש'],
    KeyF: ['פֿ', 'ף'],
    KeyG: ['ג', 'דזש'],
    KeyH: ['ה', 'ח'],
    KeyJ: ['ײ', 'דזש'],
    KeyK: ['ק', 'כּ'],
    KeyL: ['ל', 'ל'],
    KeyQ: ['ק', 'כּ'],
    KeyW: ['ש', 'שׂ'],
    KeyE: ['ע', 'ײ'],
    KeyR: ['ר', 'טש'],
    KeyT: ['ט', 'תּ', 'תֿ'],
    KeyY: ['ײַ', 'ױ'],
    KeyU: ['ו', 'וּ'],
    KeyI: ['י', 'יִ'],
    KeyO: ['אָ', 'ױ'],
    KeyP: ['פּ', 'פ'],
    KeyZ: ['ז', 'זש'],
    KeyX: ['כ', 'ך', 'כֿ'],
    KeyC: ['צ', 'ץ'],
    KeyV: ['װ', 'בֿ'],
    KeyB: ['ב', 'בּ'],
    KeyN: ['נ', 'ן'],
    KeyM: ['מ', 'ם'],
    Minus: ['־', '-', '–', '—'],
    Equal: ['=', '+', '⸗'],
    BracketLeft: ['[', '„', '{', '’'],
    BracketRight: [']', '“', '}', '”'],
    Backslash: ['\\', '|', '׳', '״'],
    Quote: ["'", '"', '′', '″'],
    Semicolon: [';', ':', '…']
};

const YT = (() => {
    let on = false, lastTilde = false;
    const pairs = [];
    try {
        const v = localStorage.getItem('yiddishTyping');
        on = v !== null ? v === '1' : (localStorage.getItem('lokshnYiddishTyping') === '1' || localStorage.getItem('oyYiddishTyping') === '1')
    } catch (e) {
    }

    function paint() {
        for (const [inp, b] of pairs) {
            b.textContent = on ? 'א' : 'A';
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', on);
            inp.classList.toggle('yid-on', on)
        }
    }

    function set(v) {
        on = v;
        try {
            localStorage.setItem('yiddishTyping', v ? '1' : '0')
        } catch (e) {
        }
        paint()
    }

    function insert(inp, text) {
        let ok = false;
        try {
            ok = document.execCommand('insertText', false, text)
        } catch (e) {
        }
        if (!ok) {
            const a = inp.selectionStart == null ? inp.value.length : inp.selectionStart,
                b = inp.selectionEnd == null ? a : inp.selectionEnd;
            inp.setRangeText(text, a, b, 'end');
            inp.dispatchEvent(new Event('input', {bubbles: true}))
        }
    }

    function attach(inp, btn) {
        pairs.push([inp, btn]);
        inp.addEventListener('keydown', e => {
            if (e.isComposing || e.ctrlKey || e.metaKey) return;
            if (e.key === '~') {
                e.preventDefault();
                if (e.repeat) return;
                if (lastTilde) {
                    lastTilde = false;
                    set(!on);
                    insert(e.target, '~')
                } else {
                    lastTilde = true;
                    set(!on)
                }
                return
            }
            if (['Shift', 'Alt', 'Control', 'Meta', 'CapsLock'].includes(e.key)) return;
            lastTilde = false;
            if (!on || e.getModifierState('CapsLock')) return;
            const m = YK_MAP[e.code];
            if (!m) return;
            const out = e.altKey ? (e.shiftKey ? m[3] : m[2]) : (e.shiftKey ? m[1] : m[0]);
            if (!out) return;
            e.preventDefault();
            insert(e.target, out)
        });
        btn.addEventListener('mousedown', e => e.preventDefault());
        btn.addEventListener('click', () => {
            set(!on);
            inp.focus()
        });
        paint()
    }

    return {attach}
})();

// ---- mode switch: Vowel length / Oy vowel ----
(function () {
    const NAMES = {l: 'length', o: 'oy'}, COLORS = {l: '#16324f', o: '#4a2a73'}, H = document.documentElement;

    function paint(m) {
        for (const b of document.querySelectorAll('#modebar button')) b.setAttribute('aria-selected', b.dataset.m === m);
        const t = document.querySelector('meta[name=theme-color]');
        if (t) t.content = COLORS[m]
    }

    function setMode(m, fromHash) {
        H.dataset.mode = m;
        paint(m);
        try {
            localStorage.setItem('vowelMode', m)
        } catch (e) {
        }
        if (!fromHash) history.replaceState(null, '', '#' + NAMES[m]);
        window.scrollTo(0, 0);
        if (matchMedia('(pointer:fine)').matches) {
            const q = document.getElementById(m + '-q');
            if (q) q.focus()
        }
    }

    document.getElementById('modebar').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (b && b.dataset.m && b.dataset.m !== H.dataset.mode) setMode(b.dataset.m)
    });
    addEventListener('hashchange', () => {
        const h = location.hash.slice(1), m = h === 'oy' ? 'o' : h === 'length' ? 'l' : null;
        if (m && m !== H.dataset.mode) setMode(m, true)
    });
    paint(H.dataset.mode);
})();

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {
}));