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