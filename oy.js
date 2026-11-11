(function () {
    const SHEET_ID = '1grJ0TvZI_2iYKaEJSq0gU-Qs_hvHi7Rg8uP_sz8Rk0M';
    const url = n => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${n}`;
    const CACHE_KEY = 'oy-lookup-v1', PAGE = 50, FETCH_TIMEOUT = 8000,
        DIALS = [['Klal', 'Klal (Standard)'], ['NEY', 'NEY (Northeastern)'], ['CY', 'CY (Central)'], ['SEY', 'SEY (Southeastern)']];
    const root = document.getElementById('app-o'), $ = id => document.getElementById('o-' + id);

    function el(tag, cls, txt) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e
    }

    const {get: idbGet, set: idbSet} = kv('oy-lookup');

// ---- parsing
    const norm = s => (s || '').normalize('NFD').replace(/[\u0591-\u05C7]/g, '').replace(/\u05F0/g, 'וו').replace(/\u05F1/g, 'וי').replace(/\u05F2/g, 'יי').replace(/[\s\-()…]/g, '').toLowerCase();

    function table(csv) {
        const t = parseCSV(csv), head = t[0].map(h => h.trim().toLowerCase());
        return {
            head: t[0].map(h => h.trim()),
            rows: t.slice(1).filter(r => r.some(c => c.trim())),
            col: n => head.indexOf(n)
        }
    }

    function buildWords(csv) {
        const T = table(csv), g = n => T.col(n);
        const keys = ['word', 'gloss', 'component', 'group', 'klal', 'ney', 'cy', 'sey', 'notes'], ix = {};
        keys.forEach(k => ix[k] = g(k));
        return T.rows.filter(r => (r[ix.word] || '').trim()).map(r => {
            const o = {};
            keys.forEach(k => o[k] = ix[k] >= 0 ? (r[ix[k]] || '').trim() : '');
            o.nw = norm(o.word);
            o.ng = norm(o.gloss);
            return o
        })
    }

    function buildRules(csv) {
        const T = table(csv), c = n => T.col(n);
        return T.rows.map(r => ({
            code: (r[c('code')] || '').trim(),
            name: (r[c('rule')] || '').trim(),
            when: (r[c('applies when')] || '').trim(),
            pron: (r[c('pronunciation')] || '').trim()
        })).filter(r => r.name)
    }

    function buildPairs(csv) {
        const T = table(csv);
        return {head: T.head, rows: T.rows}
    }

    let words = [], rules = [], pairs = {head: [], rows: []}, matches = [], shown = 0;
    const gl = c => (c || '').replace(/^G(?=\d)/i, '');
    const gk = c => (c || '').trim().replace(/^G(?=\d)/i, '').toLowerCase();
    const ruleFor = code => gk(code) ? rules.find(r => gk(r.code) === gk(code)) : null;

    function parseDial(t) {
        const re = /\b(Klal|NEY|CY|SEY|SY)\s*:/g;
        let m;
        const pos = [];
        while ((m = re.exec(t))) pos.push([m[1], m.index, re.lastIndex]);
        if (!pos.length) return null;
        const o = {};
        pos.forEach((p, i) => {
            const v = t.slice(p[2], i + 1 < pos.length ? pos[i + 1][1] : t.length).trim().replace(/[.;]\s*$/, '');
            if (p[0] === 'SY') {
                o.CY = o.CY || v;
                o.SEY = o.SEY || v
            } else o[p[0]] = v
        });
        return o
    }

    // ---- loading
    function setStatus(m) {
        $('count').textContent = m
    }

    async function load(force) {
        if (!force) {
            try {
                const c = await idbGet(CACHE_KEY);
                if (c && c.words) {
                    ({words, rules, pairs} = c);
                    setStatus(`${words.length} words (saved ${new Date(c.at).toLocaleDateString()})`);
                    render()
                }
            } catch (e) {
            }
        }
        try {
            if (navigator.onLine === false) throw Object.assign(new Error('offline'), {name: 'Offline'});
            setStatus(words.length ? 'Updating…' : 'Loading data…');
            // Give up after FETCH_TIMEOUT ms so a bad connection never leaves the app waiting; saved data stays in use.
            const get = async n => {
                const ac = new AbortController(), tm = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
                try {
                    const r = await fetch(url(n), {signal: ac.signal});
                    if (!r.ok) throw new Error(r.status);
                    const t = await r.text();
                    if (t.trim().startsWith('<')) throw new Error('Sheet is not public');
                    return t
                } finally {
                    clearTimeout(tm)
                }
            };
            const [a, b, c] = await Promise.all([get('Oy'), get('Rules'), get('MinimalPairs')]);
            words = buildWords(a);
            rules = buildRules(b);
            pairs = buildPairs(c);
            try {
                await idbSet(CACHE_KEY, {at: Date.now(), words, rules, pairs})
            } catch (e) {
            }
            setStatus(`${words.length} words · up to date`);
            render();
        } catch (e) {
            const slow = e.name === 'AbortError', off = e.name === 'Offline' || slow || e instanceof TypeError;
            if (words.length) setStatus(`${slow ? 'Slow connection' : 'Offline'} — using saved data (${words.length} words)`);
            else if (off) setStatus(`${slow ? 'Connection too slow' : 'No connection'} and no saved data yet. Tap Refresh data to try again.`);
            else setStatus('Could not load the spreadsheet. Check that it is shared as “Anyone with the link can view”.')
        }
    }

    addEventListener('online', () => load(true));

    function render() {
        search();
        drawGroups();
        drawPairs()
    }

    // ---- search
    function search() {
        const raw = $('q').value.trim(), q = norm(raw), R = $('results');
        if (!q) {
            matches = [];
            R.innerHTML = words.length ? '<p class="msg">Type a Yiddish word to search. Partial matches are included. English glosses work too.</p>' : '';
            $('more').hidden = true;
            return
        }
        const latin = /[a-z]/i.test(raw), m = [];
        for (const w of words) {
            let best = -1, len = 0;
            const tryKey = s => {
                if (!s) return;
                const p = s.indexOf(q);
                if (p < 0) return;
                const sc = s === q ? 0 : p === 0 ? 1 : 2;
                if (best < 0 || sc < best) {
                    best = sc;
                    len = s.length
                }
            };
            if (latin) tryKey(w.ng); else tryKey(w.nw);
            if (best >= 0) m.push([best, len, w])
        }
        m.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        matches = m.map(x => x[2]);
        shown = 0;
        R.innerHTML = '';
        if (!matches.length) {
            noMatch(raw, q);
            $('more').hidden = true;
            return
        }
        more()
    }

    function more() {
        const f = document.createDocumentFragment();
        for (const w of matches.slice(shown, shown + PAGE)) f.append(card(w));
        shown = Math.min(shown + PAGE, matches.length);
        $('results').append(f);
        $('more').hidden = shown >= matches.length;
        $('more').textContent = `Show more (${matches.length - shown} left)`
    }

    function noMatch(raw, q) {
        const R = $('results');
        R.append(el('p', 'msg', 'No matches.'));
        if (/[a-z]/i.test(raw) || !q.includes('וי') || !ruleFor('2')) return;
        const r = ruleFor('2'), c = el('article', 'card');
        c.append(el('div', 'gt', 'Not in the lists'));
        c.append(el('p', null, 'Group 1 is close to exhaustive and Groups 4 and 5 are small, so a word with וי that is in none of them most likely follows Group 2.'));
        const b = el('button', 'rulelink', r.name);
        b.type = 'button';
        b.onclick = () => showRule(r);
        c.append(b);
        const d = parseDial(r.pron);
        if (d) c.append(dialBlock(d, {}));
        c.append(el('p', 'sub', 'This is the guide’s general pattern, not a lookup result. Check the word in a dictionary if it matters.'));
        R.append(c)
    }

    function dialBlock(der, own) {
        const dl = el('dl');
        let any = false;
        for (const [k, label] of DIALS) {
            const k2 = k.toLowerCase(), mine = own[k2] || '', d = der && der[k] || '', v = mine || d;
            dl.append(el('dt', null, label));
            const dd = el('dd', mine ? null : v ? 'der' : 'empty', v || '—');
            dd.dir = 'auto';
            dl.append(dd);
            if (v) any = true
        }
        return any ? dl : null
    }

    function card(w) {
        const c = el('article', 'card'), h = el('h2', 'word', w.word);
        h.lang = 'yi';
        c.append(h);
        const dl = el('dl'), row = (l, v, node) => {
            dl.append(el('dt', null, l));
            const d = el('dd');
            if (node) d.append(node); else if (v) {
                d.textContent = v
            } else {
                d.className = 'empty';
                d.textContent = '—'
            }
            dl.append(d)
        };
        row('Gloss', w.gloss);
        row('Component', w.component);
        const r = ruleFor(w.group);
        if (r) {
            const b = el('button', 'rulelink', `Group ${gl(w.group)}`);
            b.type = 'button';
            b.onclick = () => showRule(r);
            row('Group', null, b)
        } else row('Group', gl(w.group));
        c.append(dl);
        const der = r ? parseDial(r.pron) : null, own = {klal: w.klal, ney: w.ney, cy: w.cy, sey: w.sey},
            hasOwn = Object.values(own).some(Boolean), db = dialBlock(der, own);
        if (db) {
            c.append(el('div', 'sec', 'Pronunciation by dialect'));
            c.append(db);
            if (der && !hasOwn) c.append(el('p', 'sub', 'Values come from the group’s rule.'))
        } else if (r && r.pron) {
            c.append(el('div', 'sec', 'Pronunciation'));
            c.append(el('div', 'pre', r.pron))
        }
        if (w.notes) {
            c.append(el('div', 'sec', 'Notes'));
            c.append(el('div', 'pre', w.notes))
        }
        return c
    }

    // ---- rule modal
    function showRule(r) {
        const ov = el('div', 'ov'), m = el('div', 'modal'), x = el('button', 'x', '×');
        x.type = 'button';
        x.setAttribute('aria-label', 'Close');
        const close = () => ov.remove();
        x.onclick = close;
        ov.onclick = e => {
            if (e.target === ov) close()
        };
        m.append(x, el('h3', null, r.name));
        if (r.when) {
            m.append(el('div', 'rl', 'Applies when'), el('div', 'pre', r.when))
        }
        if (r.pron) {
            m.append(el('div', 'rl', 'Pronunciation'));
            const d = parseDial(r.pron), b = d && dialBlock(d, {});
            if (b) m.append(b); else m.append(el('div', 'pre', r.pron))
        }
        if (r.code && words.some(w => gk(w.group) === gk(r.code))) {
            const b = el('button', 'gb', 'See the words in this group');
            b.type = 'button';
            b.onclick = () => {
                close();
                setView('groups');
                const t = root.querySelector(`[data-code="${gk(r.code)}"] .gb`);
                if (t) {
                    t.click();
                    t.scrollIntoView({block: 'start'})
                }
            };
            m.append(b)
        }
        ov.append(m);
        root.append(ov)
    }

    // ---- tabs: groups, pairs
    function drawGroups() {
        const G = $('groups');
        G.innerHTML = '';
        if (!rules.length) {
            G.append(el('p', 'msg', 'No data yet.'));
            return
        }
        for (const r of rules) {
            const n = el('div', 'note');
            if (r.code) n.dataset.code = gk(r.code);
            n.append(el('div', 'gt', r.name));
            if (r.when) n.append(el('div', 'pre', r.when));
            if (r.pron) {
                n.append(el('div', 'rl', 'Pronunciation'));
                const d = parseDial(r.pron), b = d && dialBlock(d, {});
                if (b) n.append(b); else n.append(el('div', 'pre', r.pron))
            }
            const ws = r.code ? words.filter(w => gk(w.group) === gk(r.code)) : [];
            if (ws.length) {
                const b = el('button', 'gb', `Show words (${ws.length})`);
                b.type = 'button';
                const chips = el('div', 'chips');
                chips.hidden = true;
                b.onclick = () => {
                    if (!chips.childElementCount) for (const w of ws) {
                        const c = el('button', 'chip', w.word);
                        c.type = 'button';
                        c.lang = 'yi';
                        c.onclick = () => {
                            $('q').value = w.word;
                            setView('search');
                            search();
                            scrollTo(0, 0)
                        };
                        chips.append(c)
                    }
                    chips.hidden = !chips.hidden;
                    b.textContent = (chips.hidden ? 'Show' : 'Hide') + ` words (${ws.length})`
                };
                n.append(b, chips)
            }
            G.append(n)
        }
    }

    function drawPairs() {
        const P = $('pairs');
        P.innerHTML = '';
        if (!pairs.rows.length) {
            P.append(el('p', 'msg', 'No data yet.'));
            return
        }
        P.append(el('p', 'sub', 'Minimal and near-minimal pairs: Group 1 (U4) vs. Group 2 (cholam).'));
        const w = el('div', 'tw'), t = el('table'), hr = el('tr');
        for (const h of pairs.head) hr.append(el('th', null, h));
        t.append(hr);
        for (const r of pairs.rows) {
            const tr = el('tr');
            pairs.head.forEach((_, i) => {
                const td = el('td', null, r[i] || '');
                if (/[\u0590-\u05FF]/.test(r[i] || '')) {
                    td.className = 'he';
                    td.lang = 'yi'
                }
                tr.append(td)
            });
            t.append(tr)
        }
        w.append(t);
        P.append(w)
    }

    function setView(v) {
        $('tabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
        $('results').hidden = v !== 'search';
        $('more').hidden = v !== 'search' || shown >= matches.length;
        $('groups').hidden = v !== 'groups';
        $('pairs').hidden = v !== 'pairs'
    }

    $('tabs').querySelectorAll('button').forEach(b => b.onclick = () => setView(b.dataset.v));
    $('q').addEventListener('input', () => {
        setView('search');
        search()
    });
    $('more').onclick = more;
    $('refresh').onclick = () => load(true);
    YT.attach($('q'), $('yid-toggle'));


    // ---- export / import
    $('exp').onclick = () => {
        if (!words.length) {
            setStatus('Nothing to export yet.');
            return
        }
        const data = {app: 'oy-search', version: 1, exported: new Date().toISOString(), words, rules, pairs};
        const blob = new Blob([JSON.stringify(data)], {type: 'application/json'}), a = el('a');
        a.href = URL.createObjectURL(blob);
        a.download = `oy-search-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        setStatus(`Exported ${words.length} words.`)
    };
    $('imp').onclick = () => $('impfile').click();
    $('impfile').onchange = async e => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try {
            const j = JSON.parse(await f.text());
            if (j.app !== 'oy-search' || !Array.isArray(j.words) || !j.words.every(w => w && typeof w.word === 'string') || !Array.isArray(j.rules) || !j.pairs || !Array.isArray(j.pairs.rows)) throw new Error('not an Oy Search export');
            words = j.words.map(w => ({...w, nw: norm(w.word), ng: norm(w.gloss || '')}));
            rules = j.rules;
            pairs = {head: j.pairs.head || [], rows: j.pairs.rows};
            try {
                await idbSet(CACHE_KEY, {at: Date.now(), words, rules, pairs})
            } catch (_) {
            }
            setStatus(`${words.length} words (imported)`);
            render();
        } catch (err) {
            setStatus('Import failed: ' + err.message)
        }
    };

    load(false);

})();
