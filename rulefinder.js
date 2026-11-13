// Experimental: guess the stressed syllable and the applicable rule from a word's spelling.
// Works in the browser (window.RuleFinder) and in Node (module.exports).
(function (root) {
  const PAS = '\u05B7', KOM = '\u05B8';
  const FINAL = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  const DENTAL = ['ד', 'ט', 'נ', 'ל'];
  const PKF = ['פ', 'ק', 'צ', 'טש', 'ש', 'דזש', 'זש'];

  function tokens(word) {
    const s = word.normalize('NFD').replace(/[\u05BE\-\s()]/g, '');
    const toks = [];
    for (const ch of s) {
      if (/[\u0591-\u05C7]/.test(ch) && toks.length) toks[toks.length - 1].m += ch;
      else toks.push({ o: ch, l: FINAL[ch] || ch, m: '' });
    }
    return toks;
  }
  const textOf = (toks, a, b) => toks.slice(a, b).map(t => t.o + t.m).join('');

  // Split a word into vowel units {t:'V', v} and consonant units {t:'C', c}.
  // A final ל or ן right after a consonant (with a vowel earlier in the word) is syllabic, so it counts as a vowel unit.
  // Pass {syllabic:false} to turn this off.
  function units(word, opts) {
    const T = tokens(word), out = [];
    const has = (t, c) => t && t.m.includes(c);
    const nucleusStart = t => t && (t.l === 'ע' || (t.l === 'א' && (has(t, PAS) || has(t, KOM))) || t.l === 'ו' || t.l === 'ײ' || t.l === 'ױ');
    let carry = '';
    for (let i = 0; i < T.length; i++) {
      const t = T[i], n = T[i + 1], n2 = T[i + 2], L = t.l, a = i;
      let u = null;
      if (L === 'א' && has(t, KOM)) u = { t: 'V', v: 'o' };
      else if (L === 'א' && has(t, PAS)) u = { t: 'V', v: 'a' };
      else if (L === 'ײ') u = { t: 'V', v: has(t, PAS) ? 'ay' : 'ey' };
      else if (L === 'י' && n && n.l === 'י') { u = { t: 'V', v: has(n, PAS) ? 'ay' : 'ey' }; i++; }
      else if (L === 'ױ') u = { t: 'V', v: 'oy' };
      else if (L === 'װ') u = { t: 'C', c: 'װ' };
      else if (L === 'ו' && n && n.l === 'ו') { u = { t: 'C', c: 'װ' }; i++; }
      else if (L === 'ו' && n && n.l === 'י' && !nucleusStart(n2)) { u = { t: 'V', v: 'oy' }; i++; }
      else if (L === 'ע') u = { t: 'V', v: 'e' };
      else if (L === 'ו') u = { t: 'V', v: 'u' };
      else if (L === 'י') u = nucleusStart(n) ? { t: 'C', c: 'י' } : { t: 'V', v: 'i' };
      else if (L === 'ט' && n && n.l === 'ש') { u = { t: 'C', c: 'טש' }; i++; }
      else if (L === 'ז' && n && n.l === 'ש') { u = { t: 'C', c: 'זש' }; i++; }
      else if (L === 'ד' && n && n.l === 'ז' && n2 && n2.l === 'ש') { u = { t: 'C', c: 'דזש' }; i += 2; }
      else if (L === 'א') { carry += textOf(T, i, i + 1); continue; }   // bare alef: silent, shown with the next sound
      else u = { t: 'C', c: L };
      u.s = carry + textOf(T, a, i + 1); carry = '';
      out.push(u);
    }
    if (carry && out.length) out[out.length - 1].s += carry;
    if (!(opts && opts.syllabic === false) && out.length >= 3) {
      const last = out[out.length - 1], prev = out[out.length - 2];
      if (last.t === 'C' && (last.c === 'ל' || last.c === 'נ') && prev.t === 'C' && out.some(u => u.t === 'V')) {
        last.v = last.c === 'ל' ? 'l' : 'n'; last.t = 'V'; last.syl = true; delete last.c;
      }
    }
    return out;
  }

  // Display syllables: each holds one vowel; consonants between vowels are split V.CV or VC.CV.
  function analyze(word, boundary, opts) {
    boundary = boundary || 0;
    const U = units(word, opts), nuclei = [];
    U.forEach((u, i) => { if (u.t === 'V') nuclei.push(i); });
    const cuts = [0];
    for (let k = 0; k + 1 < nuclei.length; k++) {
      const a = nuclei[k], b = nuclei[k + 1], c = b - a - 1;
      // a syllabic ל/ן is a syllable by itself: every consonant before it stays with the previous syllable
      cuts.push(boundary > a && boundary <= b ? boundary : (U[b].syl ? b : (c <= 1 ? a + 1 : a + 2)));
    }
    cuts.push(U.length);
    const syllables = [];
    for (let k = 0; k + 1 < cuts.length; k++) syllables.push(U.slice(cuts[k], cuts[k + 1]).map(u => u.s).join(''));
    return { units: U, nuclei, syllables, boundary, plain: word.normalize('NFD').replace(/[\u0591-\u05C7\u05BE\-\s()]/g, '') };
  }

  // Unstressed prefixes, written as sounds: a vowel is its sound name, a consonant is its letter.
  // The vowel mark matters: באַ- and פֿאַר- (pasekh) are prefixes, but באָבע and פֿאָרהאַנג (komets) are not.
  const PREFIXES = [['ג', 'e'], ['ב', 'a'], ['פ', 'a', 'ר'], ['צ', 'e'], ['ד', 'e', 'ר'], ['e', 'נ', 'ט'], ['a', 'נ', 'ט']];
  const soundKey = u => (u.t === 'V' ? u.v : u.c);
  // Which syllable is stressed (index into nuclei)? Default: second to last, after an unstressed prefix.
  function guessStress(a, opts) {
    const n = a.nuclei.length;
    if (n <= 1 || a.boundary) return 0;           // one syllable, or a stressed prefix marked by the user
    let pfx = 0, off = 0, again = !(opts && opts.noPrefix);
    while (again) {                                // prefixes can stack: פֿאַר-גע-
      again = false;
      for (const p of PREFIXES) {
        if (n - pfx - 1 >= 1 && p.every((k, i) => a.units[off + i] && soundKey(a.units[off + i]) === k)) { pfx++; off += p.length; again = true; break; }
      }
    }
    let idx = pfx + Math.max(n - pfx - 2, 0);
    while (a.syllables[idx] === 'גע' && idx + 1 < n) idx++;   // a syllable גע is never stressed
    return idx;
  }

  // Evaluate every spelling-based rule for the stressed vowel. Each result says whether the rule matches and why.
  const VL = { e: 'ע', o: 'אָ', a: 'אַ', i: 'י', u: 'ו', ey: 'ײ', ay: 'ײַ', oy: 'ױ', l: 'ל', n: 'ן' };
  function context(a, p) {
    const U = a.units, v = U[p].v; let j = p + 1; const cons = [];
    const lim = a.boundary && p < a.boundary ? a.boundary : U.length;   // a root boundary after a stressed prefix
    while (j < lim && U[j].t === 'C') { cons.push(U[j].c); j++; }
    let nextV = j < lim;
    const prefixEnd = !nextV && lim < U.length;
    if (!nextV && lim === U.length && cons.length >= 2 && ['נ', 'ל', 'מ'].includes(cons[cons.length - 1])) { cons.pop(); nextV = true; }   // final syllabic consonant
    // (t)sh and (d)zh count as two consonants when counting clusters.
    const nC = cons.reduce((n, c) => n + (c === 'טש' || c === 'דזש' ? 2 : 1), 0);
    return { v, cons, nextV, prefixEnd, atEnd: !nextV, first: cons[0], last: cons[cons.length - 1], nC, eo: v === 'e' || v === 'o' };
  }
  function evaluate(a, stressIdx, opts) {
    const p = a.nuclei[stressIdx];
    if (p == null) return null;
    const c = context(a, p), germanic = !!(opts && opts.germanic), slavic = !!(opts && opts.slavic);
    const vl = VL[c.v] || c.v, f = c.first || 'nothing', L = [];
    const add = (name, m, why) => L.push({ name, match: !!m, why });
    const endTxt = c.atEnd ? (c.prefixEnd ? 'the end of the prefix (a root boundary)' : 'the end of the word') : 'a vowel';
    add('V + {V, #}', c.cons.length === 0,
      c.cons.length === 0 ? `no consonant after the vowel; next comes ${endTxt}` : `the consonant ${f} follows the vowel`);
    add('{e, o} + {s, kh}', c.eo && ['ס', 'כ', 'ח'].includes(c.first),
      !c.eo ? `the vowel ${vl} is not ע or אָ` : ['ס', 'כ', 'ח'].includes(c.first) ? `${vl} is followed by ${f}` : `${vl} is followed by ${f}, not ס or כ`);
    add('or + {dental, V, #}', c.v === 'o' && c.first === 'ר' && (c.cons.length === 1 || ['ד', 'ט', 'נ', 'ל'].includes(c.cons[1])),
      c.v !== 'o' ? `the vowel ${vl} is not אָ` : c.first !== 'ר' ? `אָ is followed by ${f}, not ר` : c.cons.length === 1 ? `אָר followed by ${endTxt}` : `אָר followed by ${c.cons[1]}`);
    add('Vr + #', ['u', 'i', 'e'].includes(c.v) && c.first === 'ר' && c.cons.length === 1 && c.atEnd,
      c.first !== 'ר' ? `the vowel is followed by ${f}, not ר` : !['u', 'i', 'e'].includes(c.v) ? `the vowel ${vl} is not ו, י or ע` : c.cons.length !== 1 ? `ר is followed by another consonant (${c.cons[1]})` : !c.atEnd ? 'ר is followed by a vowel, not the end of the word' : `${vl} + ר + end of the word`);
    add('er + {dental, V}', c.v === 'e' && c.first === 'ר' && ((c.cons.length === 1 && c.nextV) || ['ד', 'ט', 'נ', 'ל'].includes(c.cons[1])),
      c.v !== 'e' ? `the vowel ${vl} is not ע` : c.first !== 'ר' ? `ע is followed by ${f}, not ר` : c.cons.length === 1 ? `ער followed by ${endTxt}` : `ער followed by ${c.cons[1]}`);
    add('Vr + C', c.first === 'ר' && c.cons.length >= 2,
      c.first !== 'ר' ? `the vowel is followed by ${f}, not ר` : c.cons.length < 2 ? `ר is followed by ${endTxt}, not a consonant` : `ר followed by the consonant ${c.cons[1]}`);
    add('VCC + {C, #}', c.nC >= 3 || (c.nC === 2 && c.atEnd && !['ל', 'נ'].includes(c.last)),
      `${c.nC} consonant${c.nC === 1 ? '' : 's'} (${c.cons.join(' ') || 'none'}) before ${endTxt}; needs 3, or 2 plus the end of the word with a non-syllabic second one`);
    add('V + {m, n, l} + C', ['מ', 'נ', 'ל'].includes(c.first) && c.cons.length >= 2 && c.cons[1] !== 'י',
      !['מ', 'נ', 'ל'].includes(c.first) ? `the first consonant is ${f}, not מ נ or ל` : c.cons.length < 2 ? `${f} is not followed by another consonant` : c.cons[1] === 'י' ? 'the following י is a glide, not a consonant' : `${f} followed by the consonant ${c.cons[1]}`);
    add('V + C(C)yV', (c.cons.length === 2 || c.cons.length === 3) && c.last === 'י' && c.nextV,
      `consonants after the vowel: ${c.cons.join(' ') || 'none'}; needs 1-2 consonants, then י, then a vowel`);
    add('V + {p, k, f, ts, (t)sh, (d)zh}', PKF.includes(c.first), PKF.includes(c.first) ? `the first consonant is ${f}` : `the first consonant is ${f}, not one of פ ק צ טש ש דזש זש`);
    add('{i, u} + m', (c.v === 'i' || c.v === 'u') && c.first === 'מ',
      !(c.v === 'i' || c.v === 'u') ? `the vowel ${vl} is not י or ו` : `${vl} is followed by ${f}`);
    add('{eb, id}', (c.v === 'e' && c.first === 'ב') || (c.v === 'i' && c.first === 'ד'), `${vl} followed by ${f}`);
    add('Gmc: {e, o} + {g, d, v, z}', germanic && c.eo && ['ג', 'ד', 'װ', 'ז'].includes(c.first),
      !germanic ? 'the source is not Germanic' : !c.eo ? `the vowel ${vl} is not ע or אָ` : `${vl} is followed by ${f}`);
    add('Gmc: ot', germanic && c.v === 'o' && c.first === 'ט',
      !germanic ? 'the source is not Germanic' : `${vl} is followed by ${f}`);
    add('Slavic', slavic, slavic ? 'the source is Slavic' : 'the source is not Slavic');
    return { ctx: { text: `stressed vowel ${vl}; after it: ${c.cons.length ? c.cons.join(' · ') : 'no consonants'}, then ${endTxt}` }, list: L };
  }
  // The first matching rule name, or null.
  function findRule(a, stressIdx, opts) {
    const e = evaluate(a, stressIdx, opts);
    const w = e && e.list.find(x => x.match);
    return w ? w.name : null;
  }

  const api = { units, analyze, guessStress, evaluate, findRule };
  if (typeof module !== 'undefined') module.exports = api; else root.RuleFinder = api;
})(typeof window !== 'undefined' ? window : globalThis);
