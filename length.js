(function () {
    const SHEET_ID = '1Vip_J4QjpMBorfov15jmbXouSXQMAmMXT0EbYsYfPkc', GID = '671156978';
    const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&gid=${GID}`;
    const CACHE_KEY = 'vowel-lookup-v1', PAGE = 50;
// Slide 2 tables and footnotes are read from this PowerPoint file (same folder as index.html).
    const PPTX_URL = 'guide.pptx', SLIDE_NO = 2, INTRO_NO = 1;
// Columns are found by header name; letter positions (A,B,C,D,P,Q,R) are the fallback.
    const COLS = {
        word: [['word'], 0],
        gloss: [['gloss'], 1],
        comp: [['component'], 2],
        pos: [['part of speech'], 3],
        rule: [['associated rule'], 15],
        follows: [['follows rule?', 'follows rule'], 16],
        notes: [['notes'], 17]
    };
    const {get: idbGet, set: idbSet} = kv('vowel-lookup');
    let rows = [], matches = [], shown = 0, sheetAt = 0;
    const root = document.getElementById('app-l'), $ = id => document.getElementById('l-' + id);


    const norm = s => (s || '').normalize('NFD').replace(/[\u0591-\u05C7]/g, '').replace(/\u05F0/g, 'וו').replace(/\u05F1/g, 'וי').replace(/\u05F2/g, 'יי').replace(/[\s\-()]/g, '').toLowerCase();

    function build(csv) {
        const t = parseCSV(csv), head = t[0].map(h => h.trim().toLowerCase()), idx = {};
        for (const k in COLS) {
            const [names, fb] = COLS[k];
            const i = head.findIndex(h => names.includes(h));
            idx[k] = i >= 0 ? i : fb
        }
        // Sound columns (E, F, H, I, K, L, N, O) are found by header; those letters are the fallback.
        const sNames = ['short [o]', 'long [o]', 'short [e]', 'long [e]', 'short [i]', 'long [i]', 'short [u]', 'long [u]'],
            sFound = sNames.map(n => head.indexOf(n)),
            sIdx = sFound.every(i => i >= 0) ? sFound : [4, 5, 7, 8, 10, 11, 13, 14];
        return t.slice(1).filter(r => (r[idx.word] || '').trim()).map(r => {
            const o = {};
            for (const k in idx) o[k] = (r[idx[k]] || '').trim();
            o.sounds = [];
            for (const i of sIdx) {
                const v = (r[i] || '').trim();
                if (v) o.sounds.push([(t[0][i] || '').trim(), v])
            }
            o.nw = norm(o.word);
            o.ng = norm(o.gloss);
            return o
        })
    }

    function setStatus(msg) {
        $('count').textContent = msg
    }

    async function load(force) {
        if (!force) {
            try {
                const c = await idbGet(CACHE_KEY);
                if (c && c.rows) {
                    rows = c.rows;
                    sheetAt = c.at;
                    setStatus(`${rows.length} entries (saved ${new Date(c.at).toLocaleDateString()})`);
                    search()
                }
            } catch (e) {
            }
        }
        try {
            setStatus(rows.length ? 'Updating…' : 'Loading data…');
            const res = await fetch(CSV_URL);
            if (!res.ok) throw new Error(res.status);
            const text = await res.text();
            if (text.trim().startsWith('<')) throw new Error('Sheet is not public');
            rows = build(text);
            sheetAt = Date.now();
            try {
                await idbSet(CACHE_KEY, {at: sheetAt, rows})
            } catch (e) {
            }
            setStatus(`${rows.length} entries · up to date`);
            search();
        } catch (e) {
            setStatus(rows.length ? `Offline — using saved data (${rows.length} entries)` : 'Could not load the spreadsheet. Check that it is shared as “Anyone with the link can view”.');
        }
    }

    function search() {
        const raw = $('q').value.trim(), q = norm(raw);
        if (!q) {
            matches = [];
            $('results').innerHTML = rows.length ? '<p class="msg">Type a Yiddish word to search. Partial matches are included.</p>' : '';
            $('more').hidden = true;
            return
        }
        const latin = /[a-z]/i.test(raw), key = latin ? 'ng' : 'nw', m = [];
        for (const r of rows) {
            const s = r[key];
            if (!s) continue;
            const p = s.indexOf(q);
            if (p < 0) continue;
            m.push([s === q ? 0 : p === 0 ? 1 : 2, s.length, r])
        }
        m.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        matches = m.map(x => x[2]);
        shown = 0;
        $('results').innerHTML = '';
        if (!matches.length) {
            const R = $('results');
            R.innerHTML = '';
            R.append(el('p', 'msg', 'No matches.'));
            $('more').hidden = true;
            return
        }
        more();
    }

    function more() {
        const frag = document.createDocumentFragment();
        for (const r of matches.slice(shown, shown + PAGE)) frag.append(card(r));
        shown = Math.min(shown + PAGE, matches.length);
        $('results').append(frag);
        $('more').hidden = shown >= matches.length;
        $('more').textContent = `Show more (${matches.length - shown} left)`;
    }

    function el(tag, cls, txt) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e
    }

    function card(r) {
        const c = el('article', 'card'), w = el('h2', 'word', r.word);
        w.lang = 'yi';
        c.append(w);
        const dl = el('dl');
        const row = (label, val, node) => {
            dl.append(el('dt', null, label));
            const d = el('dd');
            if (node) d.append(node); else if (val) d.textContent = val; else {
                d.className = 'empty';
                d.textContent = '—'
            }
            dl.append(d)
        };
        row('Gloss', r.gloss);
        row('Component', r.comp);
        row('Part of speech', r.pos);
        const sn = (r.sounds || []).length ? el('div') : null;
        if (sn) for (const [h, v] of r.sounds) sn.append(el('div', null, h ? `${h} - ${v}` : v));
        row('Sound', null, sn);
        const rl = r.rule ? findRule(r.rule) : null, sr = !rl && r.rule ? findSlideRule(r.rule) : null;
        if (rl || sr) {
            const rb = el('button', 'rulelink', r.rule);
            rb.type = 'button';
            rb.dir = 'auto';
            rb.onclick = () => rl ? showRule(rl) : showSlideRule(sr);
            row('Associated rule', null, rb)
        } else row('Associated rule', r.rule);
        let fb = null;
        if (r.follows) {
            const v = r.follows.toLowerCase();
            fb = el('span', 'badge ' + (v.startsWith('yes') ? 'yes' : v.startsWith('exception') ? 'exc' : 'na'), r.follows)
        }
        row('Follows rule?', null, fb);
        row('Notes', r.notes);
        c.append(dl);
        return c
    }


// ---- Slide 2: tables and footnotes, read from the .pptx ----
    const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main',
        NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main',
        NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    let slide = null, slideErr = '';

// "What is vowel length?" pop-up, opened from the words "Vowel Length" in the title; text comes from the first slide of guide.pptx
    function showIntro() {
        const ov = el('div', 'ov'), box = el('div', 'modal'), h = el('h3', null, 'What is vowel length?');
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
        if (slide && slide.intro && slide.intro.length) {
            const t = el('div', 'intro');
            fill(t, slide.intro);
            box.append(t)
        } else box.append(el('p', 'msg', slideErr ? `Could not load the explanation (${slideErr}).` : 'The explanation is not available yet. Check that guide.pptx is loading and has a “What is vowel length?” heading on its first slide.'));
        ov.append(box);
        root.append(ov)
    }

// Slide rules are matched loosely (case, dashes, punctuation and spacing ignored); the Rules tab always wins.
    const loose = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

    function findSlideRule(txt) {
        const k = loose(txt);
        if (!k || !slide) return null;
        return (slide.srules || []).find(r => r.names.some(n => {
            const m = loose(n);
            return k === m || k.startsWith(m + ' ')
        })) || null
    }

    function showSlideRule(r) {
        const ov = el('div', 'ov'), box = el('div', 'modal'), h = el('h3');
        h.dir = 'auto';
        h.textContent = r.title;
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
        for (const part of r.parts) {
            const p = el('div', 'rf');
            if (part.label) p.append(el('div', 'rl', part.label));
            const t = el('div', 'rt');
            for (const para of part.paras) {
                const d = el('div', 'sp');
                fill(d, para.r);
                t.append(d)
            }
            p.append(t);
            box.append(p)
        }
        ov.append(box);
        root.append(ov)
    }

    const kids = (n, ns, name) => [...n.children].filter(c => c.localName === name && c.namespaceURI === ns);
    const first = (n, ns, name) => n.getElementsByTagNameNS(ns, name)[0];

    function parasOf(body) {
        return kids(body, NS_A, 'p').map(p => {
            const pPr = kids(p, NS_A, 'pPr')[0], an = pPr && kids(pPr, NS_A, 'buAutoNum')[0], r = [];
            for (const c of p.children) {
                if (c.namespaceURI !== NS_A) continue;
                if (c.localName === 'r') {
                    const rp = kids(c, NS_A, 'rPr')[0], t = kids(c, NS_A, 't')[0];
                    r.push({
                        t: t ? t.textContent : '',
                        b: rp && rp.getAttribute('b') === '1' ? 1 : 0,
                        i: rp && rp.getAttribute('i') === '1' ? 1 : 0,
                        u: rp && rp.getAttribute('u') && rp.getAttribute('u') !== 'none' ? 1 : 0,
                        s: rp && +rp.getAttribute('baseline') > 0 ? 1 : 0
                    })
                } else if (c.localName === 'br') r.push({t: '\n'})
            }
            return {
                l: +((pPr && pPr.getAttribute('lvl')) || 0),
                n: an ? an.getAttribute('type') : '',
                st: an ? +(an.getAttribute('startAt') || 1) : 1,
                r
            }
        })
    }

    const joinParas = ps => ps.flatMap((p, i) => i ? [{t: '\n'}, ...p.r] : p.r);
    const textOf = ps => ps.map(p => p.r.map(x => x.t).join('')).join('\n').trim();

    function xfrm(el) {
        const o = first(el, NS_A, 'off'), e = first(el, NS_A, 'ext');
        return o ? {x: +o.getAttribute('x'), y: +o.getAttribute('y'), w: e ? +e.getAttribute('cx') : 0} : {
            x: 0,
            y: 0,
            w: 0
        }
    }

    function parseSlideXml(xml) {
        const doc = new DOMParser().parseFromString(xml, 'application/xml'), tree = first(doc, NS_P, 'spTree'),
            shapes = [], frames = [];
        for (const c of tree.children) {
            if (c.namespaceURI !== NS_P) continue;
            if (c.localName === 'sp') {
                const tb = kids(c, NS_P, 'txBody')[0];
                if (!tb) continue;
                const ps = parasOf(tb);
                shapes.push({...xfrm(c), ps, text: textOf(ps)})
            } else if (c.localName === 'graphicFrame') {
                const tbl = first(c, NS_A, 'tbl');
                if (tbl) frames.push({...xfrm(c), tbl})
            }
        }
        const tables = frames.sort((a, b) => Math.floor(a.y / 400000) - Math.floor(b.y / 400000) || a.x - b.x).map(f => {
            const rows = kids(f.tbl, NS_A, 'tr').map(tr => kids(tr, NS_A, 'tc').filter(tc => tc.getAttribute('hMerge') !== '1' && tc.getAttribute('vMerge') !== '1').map(tc => {
                const tb = kids(tc, NS_A, 'txBody')[0], pr = kids(tc, NS_A, 'tcPr')[0];
                return {
                    r: tb ? joinParas(parasOf(tb)) : [],
                    cs: +tc.getAttribute('gridSpan') || 1,
                    rs: +tc.getAttribute('rowSpan') || 1,
                    h: pr && kids(pr, NS_A, 'solidFill').length ? 1 : 0
                }
            }));
            // caption: the closest text box just above the table, roughly in line with its left edge
            const cands = shapes.filter(s => s.text && Math.abs(s.x - f.x) < 400000 && s.y < f.y && f.y - s.y < 700000).sort((a, b) => (f.y - a.y) - (f.y - b.y));
            return {cap: cands[0] ? joinParas(cands[0].ps) : [], rows}
        });
        // footnotes: the text box with the most numbered paragraphs
        const count = s => s.ps.filter(p => p.n).length, box = [...shapes].sort((a, b) => count(b) - count(a))[0];
        const notes = box && count(box) ? box.ps.filter(p => p.r.map(x => x.t).join('').trim()).map(p => ({
            l: p.l,
            n: p.n,
            st: p.st,
            r: p.r
        })) : [];
        // lead-in paragraph: first paragraph of the text box just under the "HOW THE VOWELS ARE PRONOUNCED" heading
        // (falls back to a text box that starts "In the tables below")
        const heading = shapes.find(s => /^how the vowels are pronounced$/i.test(s.text.replace(/\s+/g, ' ').trim()));
        const leadBox = (heading && shapes.filter(s => s !== heading && s.text && s.y > heading.y).sort((a, b) => a.y - b.y)[0])
            || shapes.find(s => /^in the tables below/i.test(s.text));
        const leadP = leadBox && leadBox.ps.find(p => p.r.some(x => x.t.trim()));
        const lead = leadP ? leadP.r : [];
        return {tables, notes, lead}
    }

// ---- Rules that live on slides, not in the Rules tab ----
// title: heading of the pop-up. names: wording of the "Associated rule" cell (Database tab) that should open it.
// slide: which slide holds it. find: matches the first cell of the table row (or the heading of a one-column table) with the rule.
    const SLIDE_RULES = [
        {title: 'Past participles with -orn', names: ['past participles with -orn'], slide: 7, find: /^participles with \[-oyrn\]/i},
        {title: 'Short perfect stems', names: ['short perfect stems', 'short perfect stem patterns'], slide: 5, find: /^short perfect stem patterns/i}
    ];

    function slideRuleFrom(xml, spec) {
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        for (const tbl of doc.getElementsByTagNameNS(NS_A, 'tbl')) {
            const rows = kids(tbl, NS_A, 'tr').map(tr => kids(tr, NS_A, 'tc').map(tc => {
                const tb = kids(tc, NS_A, 'txBody')[0];
                return tb ? parasOf(tb).filter(p => p.r.some(x => x.t.trim())) : []
            }));
            const ri = rows.findIndex(r => r[0] && spec.find.test(textOf(r[0]).replace(/\s+/g, ' ')));
            if (ri < 0) continue;
            const parts = [];
            if (ri === 0) {
                // heading row of a one-column table: the rule's text is in the rows below it
                for (const row of rows.slice(1)) for (const c of row) if (c.length) parts.push({label: '', paras: c})
            } else {
                // a row of a table with column headings: the other cells hold the description, examples, etc.
                rows[ri].slice(1).forEach((c, i) => {
                    if (c.length) parts.push({label: textOf(rows[0][i + 1] || []), paras: c})
                })
            }
            if (parts.length) return {title: spec.title, names: spec.names, parts}
        }
        return null
    }

    async function parsePptx(buf) {
        const zip = await JSZip.loadAsync(buf),
            read = async f => new DOMParser().parseFromString(await zip.file(f).async('string'), 'application/xml');
        const pres = await read('ppt/presentation.xml'), rels = await read('ppt/_rels/presentation.xml.rels');
        const slideXml = async n => {
            const id = pres.getElementsByTagNameNS(NS_P, 'sldId')[n - 1];
            if (!id) throw new Error('slide ' + n + ' not found');
            const rid = id.getAttributeNS(NS_R, 'id'),
                rel = [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
            const tg = rel.getAttribute('Target'), path = tg.startsWith('/') ? tg.slice(1) : 'ppt/' + tg;
            return zip.file(path).async('string')
        };
        const out = parseSlideXml(await slideXml(SLIDE_NO));
        try {
            out.intro = parseIntro(await slideXml(INTRO_NO))
        } catch (e) {
            out.intro = null
        }
        out.srules = [];
        for (const spec of SLIDE_RULES) {
            try {
                const r = slideRuleFrom(await slideXml(spec.slide), spec);
                if (r) out.srules.push(r)
            } catch (e) {
            }
        }
        return out
    }

// Intro: the first paragraph of the text box sitting just under the "WHAT IS VOWEL LENGTH?" heading on the first slide
    function parseIntro(xml) {
        const doc = new DOMParser().parseFromString(xml, 'application/xml'), tree = first(doc, NS_P, 'spTree'),
            shapes = [];
        for (const c of tree.children) {
            if (c.namespaceURI !== NS_P || c.localName !== 'sp') continue;
            const tb = kids(c, NS_P, 'txBody')[0];
            if (!tb) continue;
            const ps = parasOf(tb);
            shapes.push({...xfrm(c), ps, text: textOf(ps)})
        }
        const h = shapes.find(x => /^what is vowel length\??$/i.test(x.text.replace(/\s+/g, ' ').trim()));
        if (!h) return null;
        const below = shapes.filter(x => x !== h && x.text && x.y > h.y).sort((a, b) => a.y - b.y)[0];
        if (!below) return null;
        const p = below.ps.find(q => q.r.some(x => x.t.trim()));
        return p ? p.r : null
    }

    async function loadSlide() {
        try {
            slide = (await idbGet('slide-v3')) || null
        } catch (e) {
        }
        if (slide) renderSlide();
        try {
            if (!window.JSZip) throw new Error('unzip library missing');
            const r = await fetch(PPTX_URL, {cache: 'no-cache'});
            if (!r.ok) throw new Error('HTTP ' + r.status);
            slide = await parsePptx(await r.arrayBuffer());
            slide.at = Date.now();
            slideErr = '';
            try {
                await idbSet('slide-v3', slide)
            } catch (e) {
            }
        } catch (e) {
            slideErr = String(e.message || e)
        }
        renderSlide();
    }

    function fill(node, runs) {
        for (const x of runs || []) {
            const n = document.createElement(x.s ? 'sup' : 'span');
            n.textContent = x.t;
            if (x.b) n.style.fontWeight = '700';
            if (x.i) n.style.fontStyle = 'italic';
            if (x.u) n.style.textDecoration = 'underline';
            node.append(n)
        }
        if (node.lastChild) node.lastChild.textContent = node.lastChild.textContent.replace(/\n+$/, '');
        node.dir = 'auto'
    }

    function tableEl(t) {
        const tb = el('table');
        t.rows.forEach(row => {
            const tr = el('tr');
            for (const c of row) {
                const cell = el(c.h ? 'th' : 'td');
                if (c.cs > 1) cell.colSpan = c.cs;
                if (c.rs > 1) cell.rowSpan = c.rs;
                fill(cell, c.r);
                tr.append(cell)
            }
            tb.append(tr)
        });
        const box = el('div');
        if (t.cap && t.cap.length) {
            const cp = el('p', 'cap');
            fill(cp, t.cap);
            box.append(cp)
        }
        const w = el('div', 'tw');
        w.append(tb);
        box.append(w);
        return box
    }

    function label(type, v) {
        if (type === 'alphaLcPeriod') return String.fromCharCode(96 + v) + '.';
        if (type === 'alphaUcPeriod') return String.fromCharCode(64 + v) + '.';
        return v + '.'
    }

    function renderSlide() {
        const T = $('tables'), N = $('notes');
        T.innerHTML = '';
        N.innerHTML = '';
        const say = t => {
            for (const P of [T, N]) P.append(el('p', 'msg', t))
        };
        if (!slide) return say(slideErr ? `Could not load the slide (${slideErr}).` : 'Loading slide…');
        if (slide.lead && slide.lead.length) {
            const d = el('div', 'lead');
            fill(d, slide.lead);
            T.append(d)
        }
        if (!slide.tables.length) T.append(el('p', 'msg', 'No tables found on the slide.'));
        for (const t of slide.tables) T.append(tableEl(t));
        if (!slide.notes.length) N.append(el('p', 'msg', 'No footnotes found on the slide.'));
        else {
            const card = el('div', 'note'), ctr = [];
            for (const n of slide.notes) {
                let lb = '';
                if (n.n) {
                    ctr[n.l] = ctr[n.l] == null ? n.st : ctr[n.l] + 1;
                    ctr.length = n.l + 1;
                    lb = label(n.n, ctr[n.l])
                }
                const d = el('div', 'fn');
                d.style.paddingLeft = (n.l * 1.6) + 'em';
                d.append(el('span', 'lb', lb));
                const tx = el('div', 'tx');
                fill(tx, n.r);
                d.append(tx);
                card.append(d)
            }
            N.append(card)
        }
        if (slideErr) {
            for (const P of [T, N]) P.append(el('p', 'msg', `Showing saved copy (${slideErr}).`))
        }
        if ($('q').value.trim()) search()
    }

    function view(v) {
        for (const b of $('tabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v);
        $('qrow').hidden = v !== 'search';
        $('helpbtn').hidden = v !== 'search';
        $('results').hidden = v !== 'search';
        $('more').hidden = v !== 'search' || shown >= matches.length;
        $('tables').hidden = v !== 'tables';
        $('notes').hidden = v !== 'notes';
        window.scrollTo(0, 0)
    }

    $('tabs').addEventListener('click', e => {
        const v = e.target.dataset && e.target.dataset.v;
        if (v) view(v)
    });


// ---- Rules tab: popup for the associated rule ----
    const RULES_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=Rules`;
    let rules = [], rhead = ['', '', ''], ruleExact = new Map(), ruleLoose = new Map();
    const clean = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase(),
        noSlash = s => clean((s || '').replace(/\//g, ''));

    function buildRuleIdx() {
        ruleExact = new Map();
        ruleLoose = new Map();
        for (const r of rules) {
            const a = clean(r.b), b = noSlash(r.b);
            if (!ruleExact.has(a)) ruleExact.set(a, r);
            if (!ruleLoose.has(b)) ruleLoose.set(b, r)
        }
    }

// Exact match first; otherwise compare with the slashes removed ("/o/ ↔ NHG /a/" finds "o ↔ NHG a").
    function findRule(txt) {
        const k = clean(txt);
        if (!k) return null;
        return ruleExact.get(k) || ruleLoose.get(noSlash(k)) || null
    }

    async function loadRules() {
        try {
            const c = await idbGet('rules-v1');
            if (c && c.rules) {
                rules = c.rules;
                rhead = c.head || rhead;
                buildRuleIdx()
            }
        } catch (e) {
        }
        try {
            const res = await fetch(RULES_URL);
            if (!res.ok) throw new Error(res.status);
            const text = await res.text();
            if (text.trim().startsWith('<')) throw new Error('Sheet is not public');
            const t = parseCSV(text);
            rhead = [1, 2, 3].map(i => ((t[0] || [])[i] || '').trim());
            rules = t.slice(1).filter(r => (r[1] || '').trim()).map(r => ({
                b: r[1].trim(),
                c: (r[2] || '').trim(),
                d: (r[3] || '').trim()
            }));
            buildRuleIdx();
            try {
                await idbSet('rules-v1', {at: Date.now(), head: rhead, rules})
            } catch (e) {
            }
        } catch (e) {
        }
        if ($('q').value.trim()) search();
    }

    const PLACE_URL = 'https://yivo.org/yiddishland-topo';

// Shows text in a node; for the Place names rule, the word "here" becomes a link.
    function setText(node, text, ruleName) {
        const m = /^place names$/i.test(ruleName || '') ? /\bhere\b/i.exec(text) : null;
        if (!m) {
            node.textContent = text;
            return
        }
        node.textContent = '';
        node.append(text.slice(0, m.index));
        const a = document.createElement('a');
        a.href = PLACE_URL;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = m[0];
        node.append(a, text.slice(m.index + m[0].length))
    }

    function showRule(r) {
        const ov = el('div', 'ov'), box = el('div', 'modal'), h = el('h3');
        h.dir = 'auto';
        h.textContent = r.b;
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
        for (const [lab, txt, isOut] of [[rhead[1], r.c, false], [rhead[2], r.d, true]]) {
            if (!txt) continue;
            const p = el('div', 'rf');
            if (lab) p.append(el('div', 'rl', lab));
            const t = el('div', 'rt');
            t.dir = 'auto';
            if (isOut) setText(t, txt, r.b); else t.textContent = txt;
            p.append(t);
            box.append(p)
        }
        ov.append(box);
        root.append(ov)
    }

// ---- Guided questions: which rule applies? (offered when a search has no matches) ----
// Walks the Rules tab in sheet order: the first rule that describes the word is the one that applies.
    const isLK = r => /^loshn-koydesh$/i.test(r.b || '');
    const isGmc = r => /^gmc:/i.test(r.b || '') || /applies only to words from the germanic component/i.test(r.c || '');

    function wizSeq(branch) {
        const secs = [];
        let cur = {head: '', items: []};
        secs.push(cur);
        for (const r of rules) {
            if (!r.c && !r.d) {
                if (/^from now on/i.test(r.b)) cur.items.push({note: r.b});
                else {
                    cur = {head: r.b, items: []};
                    secs.push(cur)
                }
            } else cur.items.push(r)
        }
        const intro = secs.find(x => /^introductory$/i.test(x.head)), lk = secs.find(x => isLK({b: x.head})),
            non = secs.find(x => /^non-loshn-koydesh$/i.test(x.head));
        if (!intro || !lk || !non) return null;
        if (branch === 'lk') return lk.items;
        // A rule that says it is only marked when no later rule applies (Slavic) is asked last.
        const main = [], late = [];
        for (const it of non.items) (it.c && /not covered by any of the subsequent rules/i.test(it.c) ? late : main).push(it);
        return [...intro.items.filter(r => !isLK(r) && !/^unique cases$/i.test(r.b)), ...main, ...late]
    }

    function wizNext(branch, i, notes) {
        const seq = wizSeq(branch);
        if (!seq) return {
            t: 'msg',
            text: 'The rules have not loaded yet. Open the app online once so they can be saved.'
        };
        for (; i < seq.length; i++) {
            const it = seq[i];
            if (it.note) {
                notes = [...notes, it.note];
                continue
            }
            if (isGmc(it)) {
                if (wz.germanic === null) return {t: 'gate', branch, i, notes};
                if (!wz.germanic) continue
            }
            if (branch === 'lk' && i === seq.length - 1 && /all others/i.test(it.b)) return {
                t: 'result',
                rule: it,
                auto: true,
                notes
            };
            return {t: 'rule', branch, i, notes, rule: it}
        }
        return {t: 'none', notes}
    }

    let wz = null;

    function startWizard(word) {
        $('more').hidden = true;
        wz = {word, hist: [], germanic: null, cur: {t: 'q0'}};
        renderWizard()
    }

    function wizGo(next) {
        wz.hist.push(wz.cur);
        wz.cur = next;
        renderWizard()
    }

// Question wording for each rule. Matched by rule name (or description); the first four rules of the
// non-loshn-koydesh path fall back to place name / unstressed / derived / English borrowing by position.
    function wizQuestion(s) {
        const r = s.rule, b = r.b || '', c = r.c || '';
        if (/place name/i.test(b)) return 'Is the word a place name?';
        if (/unstress/i.test(b)) return 'Is the vowel unstressed?';
        if (/^derived$/i.test(b)) return 'Is the word derived?';
        if (/english/i.test(b)) return 'Is the word a borrowing from English?';
        if (/slavic/i.test(b) || /not covered by any of the subsequent rules/i.test(c)) return 'Is the word of Slavic origin?';
        if (s.branch === 'non') {
            const n = wz.hist.filter(h => h.t === 'rule' && h.branch === 'non').length;
            if (n < 4) return ['Is the word a place name?', 'Is the vowel unstressed?', 'Is the word derived?', 'Is the word a borrowing from English?'][n]
        }
        return 'Does this rule apply?'
    }

    function renderWizard() {
        const R = $('results'), s = wz.cur, notes = s.notes || [];
        R.innerHTML = '';
        const box = el('div', 'wiz');
        if (wz.word) {
            const w = el('p', 'wmut', 'Searching for: ' + wz.word);
            w.dir = 'auto';
            box.append(w)
        }
        for (const n of notes) box.append(el('p', 'wn', n));
        const yn = (onYes, onNo) => {
            const row = el('div', 'wrow');
            for (const [l, f] of [['Yes', onYes], ['No', onNo]]) {
                const b = el('button', 'wbtn', l);
                b.type = 'button';
                b.onclick = f;
                row.append(b)
            }
            box.append(row)
        };
        if (s.t === 'q0') {
            box.append(el('p', 'wq', 'Is this a loshn-koydesh word?'));
            yn(() => wizGo(wizNext('lk', 0, [])), () => wizGo(wizNext('non', 0, [])))
        } else if (s.t === 'gate') {
            box.append(el('p', 'wq', 'Is the word of Germanic origin?'));
            yn(() => {
                wz.germanic = true;
                wizGo(wizNext(s.branch, s.i, notes))
            }, () => {
                wz.germanic = false;
                wizGo(wizNext(s.branch, s.i, notes))
            })
        } else if (s.t === 'rule') {
            const r = s.rule;
            box.append(el('p', 'wh', r.b));
            const d = el('p', 'wd', r.c);
            d.dir = 'auto';
            box.append(d);
            box.append(el('p', 'wq', wizQuestion(s)));
            yn(() => wizGo({t: 'result', rule: r, notes}), () => wizGo(wizNext(s.branch, s.i + 1, notes)))
        } else if (s.t === 'result') {
            const r = s.rule;
            box.append(el('p', 'wlab', s.auto ? 'No other rule applied, so the rule is:' : 'The rule that applies is:'));
            box.append(el('p', 'wh', r.b));
            box.append(el('p', 'wlab', r.d ? (rhead[2] || 'Outcome') : (rhead[1] || 'Description')));
            const o = el('p', 'wo');
            setText(o, r.d || r.c, r.b);
            o.dir = 'auto';
            box.append(o);
            if (/^derived$/i.test(r.b)) box.append(el('p', 'wn', 'Next, find the vowel length of the root word: start over with the root.'));
            const row = el('div', 'wrow'), fb = el('button', 'wbtn', 'Show the full rule');
            fb.type = 'button';
            fb.onclick = () => showRule(r);
            row.append(fb);
            box.append(row)
        } else if (s.t === 'none') box.append(el('p', 'wq', 'None of the rules matched this word.'));
        else box.append(el('p', 'wq', s.text));
        const nav = el('div', 'wnav');
        if (wz.hist.length) {
            const bk = el('button', null, 'Back');
            bk.type = 'button';
            bk.onclick = () => {
                wz.cur = wz.hist.pop();
                renderWizard()
            };
            nav.append(bk);
            const so = el('button', null, 'Start over');
            so.type = 'button';
            so.onclick = () => startWizard(wz.word);
            nav.append(so)
        }
        const bs = el('button', null, 'Back to search');
        bs.type = 'button';
        bs.onclick = search;
        nav.append(bs);
        box.append(nav);
        R.append(box);
        window.scrollTo(0, 0)
    }

    YT.attach($('q'), $('yid-toggle'));

// ---- Export / import of the saved data ----
    async function exportData() {
        if (!rows.length && !slide) {
            alert('There is no saved data to export yet.');
            return
        }
        const data = {
            app: 'lokshn-search',
            version: 1,
            exported: new Date().toISOString(),
            sheet: rows.length ? {at: sheetAt, rows} : null,
            slide,
            rules: rules.length ? {head: rhead, rules} : null
        };
        const name = `lokshn-search-${data.exported.slice(0, 10)}.json`,
            file = new File([JSON.stringify(data)], name, {type: 'application/json'});
        try {
            if (navigator.canShare && navigator.canShare({files: [file]})) {
                await navigator.share({files: [file]});
                return
            }
        } catch (e) {
            if (e.name === 'AbortError') return
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    }

    async function importData(file) {
        try {
            const j = JSON.parse(await file.text());
            const okSheet = !!(j.sheet && Array.isArray(j.sheet.rows) && j.sheet.rows.every(r => r && typeof r.word === 'string'));
            const okSlide = !!(j.slide && Array.isArray(j.slide.tables) && Array.isArray(j.slide.notes));
            const okRules = !!(j.rules && Array.isArray(j.rules.rules));
            if (!okSheet && !okSlide && !okRules) throw new Error('this is not a LOKSHN Search export');
            const what = [okSheet ? `${j.sheet.rows.length} entries` : '', okSlide ? 'the slide tables and footnotes' : '', okRules ? `${j.rules.rules.length} rules` : ''].filter(Boolean).join(' and ');
            if (!confirm(`Replace the saved data with ${what} from this file?`)) return;
            if (okSheet) {
                rows = j.sheet.rows.map(r => ({...r, nw: norm(r.word), ng: norm(r.gloss || '')}));
                sheetAt = j.sheet.at || Date.now();
                await idbSet(CACHE_KEY, {at: sheetAt, rows});
                setStatus(`${rows.length} entries (imported)`);
                search()
            }
            if (okSlide) {
                slide = j.slide;
                slideErr = '';
                await idbSet('slide-v3', slide);
                renderSlide()
            }
            if (okRules) {
                rules = j.rules.rules;
                rhead = j.rules.head || rhead;
                buildRuleIdx();
                await idbSet('rules-v1', {at: Date.now(), head: rhead, rules});
                search()
            }
        } catch (err) {
            alert('Could not import: ' + (err.message || err))
        }
    }

    $('exp').addEventListener('click', exportData);
    $('imp').addEventListener('click', () => $('impfile').click());
    $('impfile').addEventListener('change', e => {
        const f = e.target.files[0];
        e.target.value = '';
        if (f) importData(f)
    });

    $('q').addEventListener('input', search);
    $('helpbtn').addEventListener('click', () => {
        view('search');
        startWizard($('q').value.trim())
    });
    $('more').addEventListener('click', more);
    $('refresh').addEventListener('click', () => {
        load(true);
        loadRules();
        loadSlide()
    });
    $('vlbtn').onclick = showIntro;
    load(false);
    loadSlide();
    loadRules();

})();
