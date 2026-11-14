// Shared by the main app (length.js) and experimental.html:
// sheet addresses, parsing of the Database and Rules tabs, the order in which rules are asked,
// the rules that live on slides of guide.pptx, and the rule pop-ups.
// Needs shared.js (kv, parseCSV) loaded first, and jszip.min.js for reading guide.pptx.
const Rules = (function () {
    const SHEET_ID = '1Vip_J4QjpMBorfov15jmbXouSXQMAmMXT0EbYsYfPkc', GID = '671156978';
    const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&gid=${GID}`;
    const RULES_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=Rules`;
    const PPTX_URL = 'guide.pptx';
    const PLACE_URL = 'https://yivo.org/yiddishland-topo';

    const norm = s => (s || '').normalize('NFD').replace(/[\u0591-\u05C7]/g, '').replace(/\u05F0/g, 'וו').replace(/\u05F1/g, 'וי').replace(/\u05F2/g, 'יי').replace(/[\s\-()]/g, '').toLowerCase();
    const loose = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

    // ---- Database tab ----
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
    // Column U ("other group") is used for one thing only: the label "irregular comparative stems".
    // Such words get that label as their rule when column P has none ("n/a" or empty). Nothing else in column U is read.
    const OTHER = [['other group'], 20], OTHER_RULE = 'irregular comparative stems';

    function buildRows(csv) {
        const t = parseCSV(csv), head = t[0].map(h => h.trim().toLowerCase()), idx = {};
        for (const k in COLS) {
            const [names, fb] = COLS[k];
            const i = head.findIndex(h => names.includes(h));
            idx[k] = i >= 0 ? i : fb
        }
        const oi = head.findIndex(h => OTHER[0].includes(h)), otherIdx = oi >= 0 ? oi : OTHER[1];
        // Sound columns (E, F, H, I, K, L, N, O) are found by header; those letters are the fallback.
        const sNames = ['short [o]', 'long [o]', 'short [e]', 'long [e]', 'short [i]', 'long [i]', 'short [u]', 'long [u]'],
            sFound = sNames.map(n => head.indexOf(n)),
            sIdx = sFound.every(i => i >= 0) ? sFound : [4, 5, 7, 8, 10, 11, 13, 14];
        return t.slice(1).filter(r => (r[idx.word] || '').trim()).map(r => {
            const o = {};
            for (const k in idx) o[k] = (r[idx[k]] || '').trim();
            const u = (r[otherIdx] || '').trim();
            if (loose(u) === OTHER_RULE && (!o.rule || /^n\/?a$/i.test(o.rule))) o.rule = u;
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

    // ---- Rules tab ----
    function buildRules(text) {
        const t = parseCSV(text);
        return {
            head: [1, 2, 3].map(i => ((t[0] || [])[i] || '').trim()),
            rules: t.slice(1).filter(r => (r[1] || '').trim()).map(r => ({
                b: r[1].trim(),
                c: (r[2] || '').trim(),
                d: (r[3] || '').trim()
            }))
        }
    }

    // Downloads a sheet tab as text. Gives up after `ms` so a blocked connection cannot hang the page.
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

    const fetchRulesTab = async ms => buildRules(await fetchSheet(RULES_URL, ms));
    const fetchDatabase = async ms => buildRows(await fetchSheet(CSV_URL, ms));

    // ---- Reading guide.pptx ----
    const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main',
        NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main',
        NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
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

    // Opens a .pptx; slideXml(n) gives the XML of slide n (1-based).
    async function openPptx(buf) {
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
        return {slideXml}
    }

    // ---- Rules that live on slides, not in the Rules tab ----
    // title: heading of the pop-up. names: wording of the "Associated rule" cell (Database tab) that opens it.
    // slide: which slide holds it. find: matches the first cell of the table row (or of the heading row) with the rule.
    // seq: where it is asked in the guided questions (1 = right after Place names); a rule without seq is a pop-up only.
    // q: the question asked. outcome: the vowel length it gives. desc: description (default: the slide's own description).
    const SLIDE_RULES = [
        {
            title: 'Past participles with -orn',
            names: ['past participles with -orn'],
            slide: 7,
            find: /^participles with \[-oyrn\]/i
        },
        {
            title: 'Select verbs',
            names: ['select verbs', 'key verbs'],
            slide: 5,
            find: /^verb$/i,
            kind: 'verbs',
            seq: 1,
            q: 'Is the word one of the key verbs (זײַן, האָבן, געבן, נעמען, ליגן)?',
            outcome: 'It depends on the form. See the full rule.',
            desc: 'A few common verbs have vowel lengths that the rules do not predict. For these, the length depends on the form.'
        },
        {
            title: 'Short perfect stems',
            names: ['short perfect stems', 'short perfect stem patterns'],
            slide: 5,
            find: /^short perfect stem patterns/i,
            seq: 2,
            q: 'Is the word a past participle or derived noun that fits this pattern?',
            outcome: 'Short'
        },
        {
            title: 'Irregular comparative stems',
            names: ['irregular comparative stems', 'irregular comparative stem'],
            slide: 5,
            find: /^irregular comparative stems/i,
            seq: 3,
            q: 'Is the word an irregular comparative stem?',
            outcome: 'Short'
        }
    ];

    const para = r => ({l: 0, n: '', st: 1, r});
    const hasText = c => c && c.some(p => p.r.some(x => x.t.trim()));

    function slideRuleFrom(xml, spec) {
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        for (const tbl of doc.getElementsByTagNameNS(NS_A, 'tbl')) {
            const rows = kids(tbl, NS_A, 'tr').map(tr => kids(tr, NS_A, 'tc').map(tc => {
                const tb = kids(tc, NS_A, 'txBody')[0];
                return tb ? parasOf(tb).filter(p => p.r.some(x => x.t.trim())) : []
            }));
            const ri = rows.findIndex(r => r[0] && spec.find.test(textOf(r[0]).replace(/\s+/g, ' ')));
            if (ri < 0) continue;
            const parts = [], out = {title: spec.title, names: spec.names, parts};
            if (spec.kind === 'verbs') {
                // table with the columns Verb | Pattern | SHORT | LONG: one entry per verb
                if (spec.desc) parts.push({label: '', paras: [para([{t: spec.desc}])]});
                const n0 = parts.length;
                for (const row of rows.slice(ri + 1)) {
                    if (!hasText(row[0])) continue;
                    const ps = [{...para(joinParas(row[0]).map(x => ({...x, b: 1}))), dir: 'ltr'}];
                    if (hasText(row[1])) ps.push(para(joinParas(row[1])));
                    if (hasText(row[2])) ps.push(para([{t: 'Short: ', b: 1}, ...joinParas(row[2])]));
                    if (hasText(row[3])) ps.push(para([{t: 'Long: ', b: 1}, ...joinParas(row[3])]));
                    parts.push({label: '', paras: ps})
                }
                if (parts.length > n0) return out;
                continue
            }
            if (ri === 0) {
                // heading row of a one-column table: the rule's text is in the rows below it
                for (const row of rows.slice(1)) for (const c of row) if (c.length) parts.push({label: '', paras: c})
            } else {
                // a row of a table with column headings: the other cells hold the description, examples, etc.
                rows[ri].slice(1).forEach((c, i) => {
                    if (c.length) parts.push({label: textOf(rows[0][i + 1] || []), paras: c})
                })
            }
            if (parts.length) return out
        }
        return null
    }

    async function parseSlideRules(slideXml) {
        const out = [];
        for (const spec of SLIDE_RULES) {
            try {
                const r = slideRuleFrom(await slideXml(spec.slide), spec);
                if (r) out.push(r)
            } catch (e) {
            }
        }
        return out
    }

    // Fetches guide.pptx and returns just its slide rules (the experimental page uses this; the main app reads the whole file).
    async function loadSlideRules() {
        if (!window.JSZip) throw new Error('unzip library missing');
        const r = await fetch(PPTX_URL, {cache: 'no-cache'});
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return parseSlideRules((await openPptx(await r.arrayBuffer())).slideXml)
    }

    // Slide rules are matched loosely (case, dashes, punctuation and spacing ignored); the Rules tab always wins.
    function findSlideRule(srules, txt) {
        const k = loose(txt);
        if (!k || !srules) return null;
        return srules.find(r => r.names.some(n => {
            const m = loose(n);
            return k === m || k.startsWith(m + ' ')
        })) || null
    }

    // ---- Order of the guided questions ----
    const isLK = r => /^loshn-koydesh$/i.test(r.b || '');
    const plain = ps => ps.map(p => p.r.map(x => x.t).join('')).join('\n').trim();

    // The slide rules that are asked in the guided questions, shaped like Rules-tab entries (b, c, d) plus srule, q, names.
    function slideItems(srules) {
        const out = [];
        for (const spec of SLIDE_RULES.filter(s => s.seq).sort((a, b) => a.seq - b.seq)) {
            const sr = (srules || []).find(r => r.title === spec.title);
            if (!sr) continue;
            const c = spec.desc || (sr.parts[0] ? plain(sr.parts[0].paras) : '');
            out.push({b: sr.title, c, d: spec.outcome || '', srule: sr, q: spec.q, names: spec.names})
        }
        return out
    }

    // The verb forms listed in the Select verbs rule: under each verb, "Short: ..." and "Long: ..." give example forms,
    // sometimes with pronouns ("ער/זי איז" -> איז). Returns [{verb, len:'Short'|'Long', form, key, item}].
    const PRONOUNS = ['איך', 'דו', 'ער', 'זי', 'עס', 'מיר', 'איר', 'זײ', 'אונדז', 'דאָס', 'דער', 'די'].map(norm);

    function verbForms(srules) {
        const sr = (srules || []).find(r => r.title === 'Select verbs'), out = [];
        if (!sr) return out;
        for (const part of sr.parts) {
            const verb = part.paras[0] ? plain([part.paras[0]]) : '';
            for (const p of part.paras) {
                const m = /^(Short|Long):\s*([\s\S]*)$/.exec(p.r.map(x => x.t).join(''));
                if (!m) continue;
                for (const item of m[2].replace(/[….]+\s*$/, '').split(/[,;]/)) {
                    const it = item.trim();
                    if (!it) continue;
                    for (const alt of it.split(/\s+/).pop().split('/')) for (const piece of alt.split(/[׳'’]/)) {
                        const key = norm(piece);
                        if (key && !PRONOUNS.includes(key)) out.push({verb, len: m[1], form: piece, key, item: it})
                    }
                }
            }
        }
        return out
    }

    // Does the word match a form listed in Select verbs? Returns {verb, lens, hits} or null.
    // A bare form can be both (האָבן is short as מיר האָבן but long as דאָס האָבן).
    function matchVerbForm(srules, word) {
        const k = norm(word);
        if (!k) return null;
        const hits = verbForms(srules).filter(f => f.key === k);
        return hits.length ? {verb: hits[0].verb, lens: [...new Set(hits.map(h => h.len))], hits} : null
    }

    // Irregular comparative stems: a word counts if it is one of the comparatives given as Examples on the slide (שענער, קלענער, ...).
    // Adjective endings and superlatives are not checked. Returns {example, how} or null.
    function matchComparative(srules, word) {
        const sr = (srules || []).find(r => r.title === 'Irregular comparative stems'), k = norm(word);
        if (!sr || !k) return null;
        const part = sr.parts.find(p => /^examples?$/i.test(p.label)) || sr.parts[1];
        if (!part) return null;
        for (const ex of plain(part.paras).split(/[,;\n]/).map(x => x.trim()).filter(Boolean))
            if (norm(ex) === k) return {example: ex, how: 'is one of the comparatives listed in the guide'};
        return null
    }

    // Rules in the order they are asked. branch 'lk' = loshn-koydesh words, anything else = the rest.
    // For the rest, the slide rules come right after Place names. Returns null if the Rules tab lacks the expected sections.
    function sequence(rules, branch, srules) {
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
        const seq = [...intro.items.filter(r => !isLK(r) && !/^unique cases$/i.test(r.b)), ...main, ...late];
        const extra = slideItems(srules);
        if (extra.length) {
            const at = seq.findIndex(r => /^place names?$/i.test(r.b || ''));
            seq.splice(at + 1, 0, ...extra)
        }
        return seq
    }

    // ---- Pop-ups ----
    function el(tag, cls, txt) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e
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

    // Opens an empty pop-up with a title and close button (X, Escape, or a tap outside); returns its box.
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
        return box
    }

    function showRule(r, rhead, host) {
        const box = modal(host, r.b);
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
    }

    function showSlideRule(r, host) {
        const box = modal(host, r.title);
        for (const part of r.parts) {
            const p = el('div', 'rf');
            if (part.label) p.append(el('div', 'rl', part.label));
            const t = el('div', 'rt');
            for (const pr of part.paras) {
                const d = el('div', 'sp');
                fill(d, pr.r);
                if (pr.dir) d.dir = pr.dir;
                t.append(d)
            }
            p.append(t);
            box.append(p)
        }
    }

    return {
        SHEET_ID,
        CSV_URL,
        RULES_URL,
        PPTX_URL,
        PLACE_URL,
        norm,
        loose,
        buildRows,
        buildRules,
        fetchRulesTab,
        fetchDatabase,
        xml: {NS_A, NS_P, NS_R, kids, first, parasOf, joinParas, textOf, xfrm},
        SLIDE_RULES,
        openPptx,
        parseSlideRules,
        loadSlideRules,
        findSlideRule,
        sequence,
        verbForms,
        matchVerbForm,
        matchComparative,
        fill,
        setText,
        modal,
        showRule,
        showSlideRule
    }
})();
