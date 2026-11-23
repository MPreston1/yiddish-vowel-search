#!/usr/bin/env node
// Compares the loshn-koydesh rule engine (lk-engine.js), fed with real Nakdan output,
// against the Database tab of the companion spreadsheet.
//
//   npm install xlsx            (once, next to this file)
//   node test-lk.js Companion_database_for_L_O_K_SH_N_Guide_to_Vowel_Length.xlsx
//
// Options:
//   --genre=rabbinic|modern|poetry   Nakdan style (default rabbinic)
//   --limit=N                        only the first N words (handy for a first try)
//   --refresh                        ignore the cache and ask Nakdan again
//   --compounds                      also test entries with spaces, hyphens or brackets (skipped by default)
//   --nativized                      also include "loshn-koydesh, nativized"
//   --out=report.csv                 where to write the full report (default lk-report.csv)
//   --delay=MS                       pause between Nakdan requests (default 250)
//   --debug                          print the raw Nakdan answer for the first word, to check the format
//
// Nakdan answers are cached in nakdan-cache.json, so later runs are instant and repeatable.
// Needs Node 18+ (built-in fetch) and network access to nakdan-2-0.loadbalancer.dicta.org.il.

const fs = require('fs');
const XLSX = require('xlsx');
const E = require('./lk-engine.js');

const args = process.argv.slice(2);
const flag = n => args.includes('--' + n);
const opt = (n, d) => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const file = args.find(a => !a.startsWith('--')) || 'Companion_database_for_L_O_K_SH_N_Guide_to_Vowel_Length.xlsx';
const GENRE = opt('genre', 'rabbinic'), LIMIT = +opt('limit', 0), OUT = opt('out', 'lk-report.csv'), DELAY = +opt('delay', 250);
const CACHE = 'nakdan-cache.json', API = 'https://nakdan-2-0.loadbalancer.dicta.org.il/api';

// ---- read the Database tab ----
const wb = XLSX.readFile(file);
if (!wb.Sheets['Database']) { console.error('No "Database" tab in ' + file); process.exit(1); }
const T = XLSX.utils.sheet_to_json(wb.Sheets['Database'], {header: 1, defval: ''});
const head = T[0].map(h => String(h).trim().toLowerCase());
const col = (...names) => head.findIndex(h => names.includes(h));
const C = {word: col('word'), comp: col('component'), rule: col('associated rule'), follows: col('follows rule?', 'follows rule')};
const SND = ['short [o]', 'long [o]', 'short [e]', 'long [e]', 'short [i]', 'long [i]', 'short [u]', 'long [u]'].map(n => ({n, i: head.indexOf(n)}));
if (Object.values(C).some(i => i < 0) || SND.some(x => x.i < 0)) { console.error('Could not find all expected columns in the Database tab.'); process.exit(1); }

let rows = T.slice(1).filter(r => String(r[C.word]).trim() && /^LK:/i.test(String(r[C.rule]).trim())).map(r => {
  const exp = [];
  for (const s of SND) if (String(r[s.i]).trim()) { const m = /^(short|long) \[(.)\]$/.exec(s.n); exp.push({len: m[1] === 'short' ? 'Short' : 'Long', v: m[2]}); }
  return {word: String(r[C.word]).trim(), comp: String(r[C.comp]).trim().toLowerCase(), rule: String(r[C.rule]).trim(),
    follows: String(r[C.follows]).trim().toLowerCase() || 'yes', exp};
});
rows = rows.filter(r => r.comp === 'loshn-koydesh' || (flag('nativized') && r.comp.startsWith('loshn-koydesh')));
if (!flag('compounds')) rows = rows.filter(r => !/[\s\-־()]/.test(r.word));
if (LIMIT) rows = rows.slice(0, LIMIT);
console.log(`${rows.length} loshn-koydesh words to test (genre: ${GENRE})`);

// ---- Nakdan (cached) ----
const bare = s => s.normalize('NFD').replace(/[\u0591-\u05C7]/g, '').replace(/\u05F0/g, 'וו').replace(/\u05F1/g, 'וי').replace(/\u05F2/g, 'יי').replace(/[\s\-()…]/g, '');
let cache = {};
if (!flag('refresh') && fs.existsSync(CACHE)) cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function nakdan(w) {
  const res = await fetch(API, {
    method: 'POST', headers: {'Content-Type': 'text/plain;charset=UTF-8'},
    body: JSON.stringify({task: 'nakdan', data: w, genre: GENRE, addmorph: true, matchpartial: true, keepmetagim: false,
      keepqq: false, nodageshdefmem: false, patachma: false})
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  if (flag('debug') && !nakdan.shown) { nakdan.shown = true; console.log('Raw Nakdan answer for ' + w + ':\n' + JSON.stringify(j, null, 1).slice(0, 1500)); }
  const tokens = Array.isArray(j) ? j : (j.data || []);
  const tok = tokens.find(t => t && t.options && t.options.length);
  const seen = [];
  for (const o of tok ? tok.options : []) {
    // an option is either an array whose first element is the pointed word, or an object with the word in .w
    const raw = Array.isArray(o) ? o[0] : (typeof o === 'string' ? o : o && o.w);
    const x = (raw || '').replace(/\|/g, '').replace(/\u05BD/g, '');
    if (x && !seen.includes(x)) seen.push(x);
  }
  if (!seen.length) throw new Error('answer had no readable options (run with --debug --limit=1 to see it)');
  return seen.slice(0, 5);
}

async function fetchAll() {
  let n = 0;
  for (const r of rows) {
    const key = GENRE + '|' + bare(r.word);
    if (cache[key] && cache[key].length) continue;   // empty or failed answers are tried again
    try { cache[key] = await nakdan(bare(r.word)); }
    catch (e) { console.error(`  ${r.word}: ${e.message}`); cache[key] = null; if (++n > 5 && Object.values(cache).filter(Boolean).length === 0) { console.error('Nakdan is not answering; stopping.'); break; } }
    if (++n % 25 === 0) { fs.writeFileSync(CACHE, JSON.stringify(cache)); process.stdout.write(`  ${n} fetched\r`); }
    await sleep(DELAY);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
}

// ---- compare ----
const DBV = {o: ['o'], e: ['e', 'ey'], i: ['i'], u: ['u']};   // engine sounds that count as the database's vowel

function run(U, p, der) {
  const res = E.evaluate(U, p, der), w = res.find(x => x.match);
  return {rule: w.r.name, len: w.r.out, k: w.r.k};
}

function analyse(row) {
  const key = GENRE + '|' + bare(row.word), raw = cache[key], readings = raw && raw.length ? E.adapt(row.word, raw) : raw;
  const out = {row, readings: readings || [], status: '', engine: null, oracle: null, anyOk: false};
  if (!readings || !readings.length) { out.status = 'no nakdan result'; return out; }
  const der = /Derived, syllable-opening/.test(row.rule) ? 'open' : /Derived, all others/.test(row.rule) ? 'other' : 'no';
  if (der === 'other') { out.status = 'skipped (derived, needs base length)'; return out; }
  const isExc = row.follows.startsWith('exception');
  // Derived rules come late in the rule order, so an earlier rule may claim the word: for those rows only the length is compared.
  const lenOk = r => row.exp.some(e => e.len === r.len);
  const ok = r => der === 'open' ? lenOk(r) : r.rule === row.rule && (isExc || lenOk(r));
  let first = true;
  for (const reading of readings) {
    const U = E.parse(reading), p = E.guessStress(U);
    if (p < 0) { if (first) out.status = 'no vowel in reading'; first = false; continue; }
    const eng = run(U, p, der);
    // oracle stress: the vowel whose sound is the one the database lists
    let orc = null;
    for (const e of row.exp) {
      const idx = U.map((u, i) => i).filter(i => U[i].t === 'V' && !U[i].furtive && DBV[e.v].includes(U[i].v));
      if (idx.length) { const si = idx.includes(p) ? p : idx[0]; orc = Object.assign(run(U, si, der), {stressIdx: si, vowel: e.v}); break; }
    }
    const good = ok(eng) , goodOrc = orc && ok(orc);
    if (first) {
      out.reading = reading; out.engine = eng; out.oracle = orc;
      out.status = good ? 'ok'
        : goodOrc ? 'stress guess wrong (right with the database vowel)'
        : eng.rule === row.rule ? 'rule ok, length differs'
        : !orc ? 'database vowel not found in reading'
        : 'rule differs';
    }
    if (good || goodOrc) out.anyOk = true;
    first = false;
  }
  if (!out.anyOk && out.status !== 'ok') out.anyOk = false;
  else if (out.anyOk && out.status !== 'ok') out.status += ' [another Nakdan reading agrees]';
  return out;
}

function csv(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

(async () => {
  await fetchAll();
  const R = rows.map(analyse);
  const by = {};
  for (const r of R) by[r.status] = (by[r.status] || 0) + 1;
  console.log('\nResult per word (first Nakdan reading, default stress guess):');
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);

  // per database rule
  const pr = {};
  for (const r of R) { const x = pr[r.row.rule] = pr[r.row.rule] || {n: 0, ok: 0}; x.n++; if (r.status === 'ok') x.ok++; }
  console.log('\nPer database rule (ok / total):');
  for (const [k, v] of Object.entries(pr).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(v.ok).padStart(4)} / ${String(v.n).padEnd(4)} ${k}`);

  // confusion: database rule -> engine rule, where they differ
  const cf = {};
  for (const r of R) if (r.engine && r.engine.rule !== r.row.rule) { const k = r.row.rule + '  →  ' + r.engine.rule; cf[k] = (cf[k] || 0) + 1; }
  console.log('\nMost common disagreements (database rule → engine rule):');
  for (const [k, v] of Object.entries(cf).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(v).padStart(4)}  ${k}`);

  const bad = R.filter(r => r.status !== 'ok' && !/^skipped/.test(r.status));
  console.log('\nFirst disagreements:');
  for (const r of bad.slice(0, 15)) console.log(`  ${r.row.word}  [${r.reading || '-'}]  db: ${r.row.rule} (${r.row.follows})  engine: ${r.engine ? r.engine.rule + ' ' + r.engine.len : '-'}  — ${r.status}`);

  const lines = [['word', 'nakdan_reading', 'other_readings', 'db_rule', 'db_follows', 'db_vowel_length', 'engine_rule', 'engine_length', 'oracle_rule', 'oracle_length', 'status'].join(',')];
  for (const r of R) lines.push([r.row.word, r.reading || '', r.readings.slice(1).join(' | '), r.row.rule, r.row.follows,
    r.row.exp.map(e => `${e.len} [${e.v}]`).join(' + '), r.engine ? r.engine.rule : '', r.engine ? r.engine.len : '',
    r.oracle ? r.oracle.rule : '', r.oracle ? r.oracle.len : '', r.status].map(csv).join(','));
  fs.writeFileSync(OUT, '\ufeff' + lines.join('\n'));
  console.log(`\nFull report: ${OUT}   (open in Excel or Numbers and filter on "status")`);
})();
