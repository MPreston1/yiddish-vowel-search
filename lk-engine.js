// Rule engine for loshn-koydesh vowel length: Hebrew pointing -> units -> the rules of the Rules tab.
// Works in the browser (window.LKEngine) and in Node (module.exports).
(function (root) {
  const api = (function () {
  // ---- Step 3: rule engine (rules copied from the "Loshn-koydesh" section of the Rules tab, in the same order) ----
  const FINAL = {'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ'};
  const VM = {'\u05B1': ['e', 'hsegol'], '\u05B2': ['a', 'hpatah'], '\u05B3': ['o', 'hqamats'], '\u05B4': ['i', 'hiriq'],
    '\u05B5': ['e', 'tsere'], '\u05B6': ['e', 'segol'], '\u05B7': ['a', 'patah'], '\u05B8': ['o', 'qamats'],
    '\u05C7': ['o', 'qamats'], '\u05B9': ['oy', 'holam'], '\u05BB': ['u', 'qubuts']};
  const HOLAM_MALE = (typeof process !== 'undefined' && process.env.LK_HOLAM) || 'u';   // sound given to a vav with holam
  const SOUNDS = ['a', 'e', 'ey', 'i', 'o', 'oy', 'u', 'ay'];
  const DAG = '\u05BC', SPIR = ['ב', 'כ', 'פ', 'ת'];

  // Hebrew pointing -> units: {t:'V', v:sound, src, s:text, g?:guttural that carried it} and {t:'C', c, dag, silentG?}
  function parse(word) {
    const L = [];
    for (const ch of word.normalize('NFD')) {
      if (/[\u0591-\u05C7]/.test(ch) && L.length) { L[L.length - 1].m.push(ch); L[L.length - 1].txt += ch; }
      else if (/[\u05D0-\u05EA]/.test(ch)) L.push({c: FINAL[ch] || ch, m: [], txt: ch});
    }
    const U = [];
    const vowelOf = l => { for (const m of l.m) if (VM[m]) return VM[m]; return null; };
    const V = (vm, s, extra) => U.push(Object.assign({t: 'V', v: vm[0], src: vm[1], s}, extra));
    for (let i = 0; i < L.length; i++) {
      const l = L[i], c = l.c, vm = vowelOf(l), dag = l.m.includes(DAG), end = i === L.length - 1, pu = U[U.length - 1];
      if (c === 'ו') {
        if (vm && vm[1] === 'holam' && pu && (pu.t === 'C' || pu.yodDag)) V([HOLAM_MALE, 'holam'], l.txt);   // holam male
        else if (!vm && dag && pu && (pu.t === 'C' || pu.yodDag)) V(['u', 'shuruk'], l.txt);                     // shuruk
        else { U.push({t: 'C', c: 'װ', dag}); if (vm) V(vm, l.txt); }
        continue;
      }
      if (c === 'י') {
        if (vm) { U.push({t: 'C', c: 'י', dag}); V(vm, l.txt); }
        else if (dag && pu && pu.t === 'V' && pu.src === 'hiriq' && L[i + 1] && L[i + 1].c === 'ו' && !vowelOf(L[i + 1]) === !L[i + 1].m.includes('\u05B9') && (L[i + 1].m.includes(DAG) || L[i + 1].m.includes('\u05B9'))) {
          pu.s += l.txt; pu.yodDag = true;                                                          // ִיּוּ / ִיּוֹ: the yod is a vowel letter and the vav is a vowel (Yiddish ציון, חיוב, איוב)
        }
        else if (dag) U.push({t: 'C', c: 'י', dag});                                                // yod with dagesh is a doubled consonant, not a vowel letter
        else if (pu && pu.t === 'V' && ['hiriq', 'tsere', 'segol'].includes(pu.src)) pu.s += l.txt;   // mater
        else if (pu && pu.t === 'V' && !pu.furtive && ['patah', 'qamats', 'holam'].includes(pu.src)) {
          pu.s += l.txt; pu.v = pu.src === 'patah' ? 'ay' : 'oy';                                   // diphthong
        } else U.push({t: 'C', c: 'י', dag});
        continue;
      }
      if (c === 'ה' || c === 'א' || c === 'ע') {
        if (vm) {
          if (end && vm[1] === 'patah' && c !== 'א' && pu && pu.t === 'V') {                        // furtive patah
            U.push({t: 'V', v: 'a', src: 'patah', furtive: true, s: ''});
            U.push({t: 'C', c, silentG: true});
          } else if (['hsegol', 'hpatah', 'hqamats'].includes(vm[1]) && U.some(u => u.t === 'V')) {
            U.push({t: 'C', c, silentG: true});     // a reduced vowel on a guttural inside the word is not a syllable in Yiddish (נֶאֱמָן: the א is silent)
          } else V(vm, l.txt, {g: c});                                                               // the guttural is silent; its vowel stays
        } else if (end && c === 'ה') {
          let k = U.length - 1;
          while (k >= 0 && U[k].t === 'C' && U[k].silentG) k--;
          const pv = U[k], open = ['qamats', 'segol', 'tsere', 'hqamats'];
          if (pv && pv.t === 'V' && k === U.length - 1 && open.includes(pv.src)) { pv.v = 'e'; pv.s += l.txt; }   // final -ה: ָה = [e]
          else if (pv && pv.t === 'V' && open.includes(pv.src)) V(['e', 'he'], l.txt);
          else if (pv && pv.t === 'V') pv.s += l.txt;
        } else if (end && c === 'א' && pu && pu.t === 'V') pu.s += l.txt;
        else U.push({t: 'C', c, silentG: true});
        continue;
      }
      if (end && c === 'ח' && vm && vm[1] === 'patah' && pu && pu.t === 'V') {                      // furtive patah under final ח
        U.push({t: 'V', v: 'a', src: 'patah', furtive: true, s: ''});
        U.push({t: 'C', c, dag});
        continue;
      }
      U.push({t: 'C', c, dag});
      if (vm) V(vm, l.txt);
    }
    return U;
  }

  const RULES = [
    {k: 'oye', name: 'LK: {oye, o(y)i} with komets', out: 'Long',
      desc: 'The sequence transcribed [oye], [oyi], or [oi] where the first part of the diphthong is represented by a komets, not by a vov or khoylem.',
      exc: 'אפֿרים, ־ ָיון (בזיון, נסיון), כּלא־היה, מעשׂה־שהיה, תּנאָים (=פֿאַרקנסונג)'},
    {k: 'vv', name: 'LK: V + {V, #}', out: 'Long',
      desc: 'The transcribed vowel is either word-final or followed by another vowel.', exc: 'None'},
    {k: 'sg', name: 'LK: V + {silent guttural}', out: 'Long',
      desc: 'The vowel is immediately followed by א, ה, ע. (The ה may be non-silent in the transcription.)', exc: 'none'},
    {k: 'cl', name: 'LK: Closed by consonant', out: 'Short',
      desc: 'The vowel is followed by 1 consonant word-finally, or by 2 consonants word-medially, where the second consonant can be <י> or even silent <ע, א, ה> — but not syllabic <נ> or <ל>.',
      exc: 'Names of letters (װאָװ, יוד, כּף, נון, קוף, שין, שׂין, תװ, תּװ); אָבֿ, איש*, בעל־הבית, גבֿיר, יריד*, (אױף צו) להכעיס, מין, רבֿ, שיר. Not covered because the second consonant is syllabic: רגל, קרן, שכן, חתן'},
    {k: 'e', name: 'LK: e', out: 'Long', desc: 'The vowel is transcribed as [e].',
      exc: 'אמת, אדום, אלא, (פּרשת) אמור, אנוש, אלול, גיהנום, היזק, היסב־בעט, היסח־הדעת, היתּר, עשׂה, רבי, תּירוץ'},
    {k: 'o', name: 'LK: o', out: 'Long', desc: 'The vowel is transcribed as [o] (excluding [oy]).',
      exc: 'מסתּמא*, (יצר־, לשון־, עין־)הרע*, יוסף /יאָסעפֿ/'},
    {k: 'spd', name: 'LK: V + {spirant + dagesh}', out: 'Short', desc: 'The vowel is followed by <ב, כּ, פּ, תּ>.', exc: 'none'},
    {k: 'spn', name: 'LK: V + {spirant, no dagesh}', out: 'Long', desc: 'The vowel is followed by <בֿ, כ, פֿ, ת>.', exc: 'none'},
    {k: 'ng', name: 'LK: V + non-silent guttural', out: 'Long', desc: 'The vowel is followed by ר or ח (plus another vowel).', exc: ''},
    {k: 'cd', name: 'LK: Closed by dagesh', out: 'Short',
      desc: 'The vowel is followed by a consonant that is written in Masoretic Hebrew with a dagesh. Common patterns include CiCuC.',
      exc: 'בתולה*, חוקים, מחיצה*, מיושבֿ'},
    {k: 'dopen', name: 'LK: Derived, syllable-opening', out: 'Long',
      desc: 'A noun or adjective derived from a base noun whose final consonant is followed by a vowel in the derivation. Does not include diminutives.', exc: 'גופֿים*'},
    {k: 'dother', name: 'LK: Derived, all others', out: 'Same length as base form',
      desc: 'All other derivations: diminutives, prefixed forms, adjectives, verbs, etc.', exc: ''},
    {k: 'all', name: 'LK: All others', out: 'Long',
      desc: 'After applying all the above rules, assume the vowel in the remaining words is long.',
      exc: 'אמונה, מהומה, מומר, מוסף, מוסר, מזוזה, ניסן, סימן, קדושה*, קינה*, שכינה*, שמיטה*'}
  ];

  function evaluate(U, p, der) {
    const v = U[p].v, src = U[p].src, cons = [];
    let j = p + 1;
    while (j < U.length && U[j].t === 'C') cons.push(U[j++]);
    const nxt = U[j], atEnd = !nxt, f = cons[0], fc = f ? f.c : null;
    const eff = cons.slice();
    while (atEnd && eff.length > 1 && eff[eff.length - 1].silentG) eff.pop();   // a silent final א ה ע does not count (חֵטְא: one consonant)
    const nC = eff.length + (nxt && nxt.g && cons.length ? 1 : 0);   // a guttural that carries the next vowel still counts as a consonant after a real one
    const after = cons.length ? cons.map(x => x.c).join(' ') : (atEnd ? 'the end of the word' : 'a vowel');
    const n1 = U[p + 1], n2 = U[p + 2];
    const T = {
      oye: () => {
        const ok = (v === 'o' && (src === 'qamats' || src === 'hqamats')) &&
          ((n1 && n1.t === 'V' && n1.g) || (n1 && n1.t === 'C' && n1.silentG && n2 && n2.t === 'V'));
        return [ok, ok ? 'komets followed by a guttural and another vowel' : (v !== 'o' || src !== 'qamats' ? 'the vowel is not a komets (אָ)' : 'no א, ה or ע between this vowel and the next')];
      },
      vv: () => [cons.length === 0, cons.length === 0 ? (atEnd ? 'the vowel is word-final' : 'the next unit is a vowel') : `followed by ${after}`],
      sg: () => [!!(f && f.silentG), f && f.silentG ? `followed by a silent ${fc}` : `followed by ${after}, not a silent א ה ע`],
      cl: () => {
        const ok = !(f && f.silentG) && ((atEnd && nC === 1) || (!atEnd && nC === 2));
        return [ok, `${nC} consonant${nC === 1 ? '' : 's'} (${after}) before ${atEnd ? 'the end of the word' : 'a vowel'}; needs 1 at the end, or 2 in the middle`];
      },
      e: () => [v === 'e', `the vowel is [${v}]`],
      o: () => [v === 'o', `the vowel is [${v}]`],
      spd: () => [!!(f && SPIR.includes(fc) && f.dag), f && SPIR.includes(fc) ? (f.dag ? `${fc} has a dagesh` : `${fc} has no dagesh`) : `followed by ${after}, not ב כ פ ת`],
      spn: () => [!!(f && SPIR.includes(fc) && !f.dag), f && SPIR.includes(fc) ? (f.dag ? `${fc} has a dagesh` : `${fc} has no dagesh`) : `followed by ${after}, not ב כ פ ת`],
      ng: () => [!!(cons.length === 1 && !atEnd && (fc === 'ר' || fc === 'ח')), `followed by ${after}`],
      cd: () => [!!(f && f.dag), f ? (f.dag ? `${fc} has a dagesh` : `${fc} has no dagesh`) : 'no consonant follows'],
      dopen: () => [der === 'open', der === 'open' ? 'you said it is derived and syllable-opening' : 'you did not mark it as a syllable-opening derivation'],
      dother: () => [der === 'other', der === 'other' ? 'you said it is derived in another way' : 'you did not mark it as another derivation'],
      all: () => [true, 'no earlier rule applied']
    };
    return RULES.map(r => { const [m, why] = T[r.k](); return {r, match: m, why}; });
  }

  // Default stress: second to last vowel. Furtive patah and reduced (hataf) vowels do not count,
  // except a hataf vowel at the very start of the word (אֱמת, אֲדם), which is a full syllable in Yiddish.
  // Returns an index into units, or -1.
  function guessStress(U) {
    const nuclei = [];
    U.forEach((u, i) => { if (u.t === 'V' && !u.furtive) nuclei.push(i); });
    if (!nuclei.length) return -1;
    const fur = U.findIndex(u => u.furtive);
    if (fur > 0) {
      // stress the vowel before the furtive patah only if it is a plene vowel (shuruk, holam, hiriq + yod: בטוּחַ, משיחַ);
      // after a plain e (מְשֻׁגֵּעַ, נוֹסֵחַ) the e is the unstressed ending and the usual second-to-last rule applies
      const before = nuclei.filter(i => i < fur), lastB = before[before.length - 1];
      if (lastB !== undefined) {
        const v = U[lastB];
        if (v.src === 'shuruk' || v.src === 'holam' || (v.src === 'hiriq' && /י/.test(v.s))) return lastB;
      }
    }
    // the article הַ- before a doubled consonant (הַשֵּׁם) is an unstressed prefix, not a stress candidate
    const art = nuclei.length >= 2 && nuclei[0] === 0 && U[0].g === 'ה' && U[0].src === 'patah' && U[1] && U[1].t === 'C' && U[1].dag;
    const cand = nuclei.filter((i, k) => (!['hsegol', 'hpatah', 'hqamats'].includes(U[i].src) || k === 0) && !(art && k === 0));
    return cand.length >= 2 ? cand[cand.length - 2] : cand[0];
  }

  // ---- making Nakdan's pointing agree with the marks the person typed (אָ, אַ, rafe) ----
  const VOWEL_MARKS = /[\u05B0-\u05BB\u05C7]/g;
  function lettersOf(word) {
    const L = [];
    for (const ch of word.normalize('NFD')) {
      if (/[\u0591-\u05C7]/.test(ch) && L.length) L[L.length - 1].m.push(ch);
      else if (/[\u05D0-\u05EA]/.test(ch)) L.push({o: ch, m: []});
    }
    return L;
  }

  // Returns the reading with the typed marks laid over it, or null if the reading has different letters from the typed word.
  function adaptOne(input, reading) {
    const A = lettersOf(input), B = lettersOf(reading);
    if (A.length !== B.length || A.some((l, i) => l.o !== B[i].o)) return null;
    B.forEach((l, i) => {
      const a = A[i];
      const v = a.m.find(m => m === '\u05B7' || m === '\u05B8');   // אַ or אָ typed on this letter
      if (a.o === 'א' && v) l.m = l.m.filter(m => !/[\u05B0-\u05BB\u05C7]/.test(m)).concat(v);
      if (a.m.includes('\u05BF')) l.m = l.m.filter(m => m !== '\u05BC');                 // typed rafe: no dagesh
      else if (a.m.includes('\u05BC') && !l.m.includes('\u05BC')) l.m.push('\u05BC');   // typed dagesh
    });
    return B.map(l => l.o + l.m.join('')).join('').normalize('NFC');
  }

  // Adapted readings in Nakdan's order; readings with different letters from the typed word go last (or stay, if none agrees).
  function adapt(input, readings) {
    const good = [], rest = [];
    for (const r of readings) {
      const x = adaptOne(input, r);
      if (x) { if (!good.includes(x)) good.push(x); } else rest.push(r);
    }
    return good.length ? good : rest;
  }

  return {SOUNDS, parse, RULES, evaluate, guessStress, adapt, adaptOne};
  })();
  if (typeof module !== 'undefined') module.exports = api; else root.LKEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
