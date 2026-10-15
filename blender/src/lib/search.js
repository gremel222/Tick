/**
 * search.js — офлайн-поиск и «ответчик» по всему справочнику Blender.
 *
 * Механика:
 *   • BM25 по 4200 страницам руководства и Python API
 *   • индекс алиасов: точные названия функций/опций из официального словаря,
 *     поэтому «рентген» → X-Ray, «фокусное расстояние» → Focal Length
 *   • перевод русских запросов в термины Blender (ru.po + жаргонные синонимы)
 *   • поиск горячих клавиш: «ctrl+b», «shift a», «горячая клавиша рендера»
 *   • поиск определений: 39 570 карточек «опция → что делает»
 *   • исправление опечаток и подсказки
 */

import { tokenize, stem, normTerm, normKey, keyCanonical, parseKeyInput, editDistance, isCyr, aliasNorm } from './text.js';
import { SYNONYMS } from '../../content/synonyms.js';
import { KEY_TASKS } from '../../content/keys.js';

const K1 = 1.25;
const B = 0.72;
// без флага /g: stateful lastIndex ломает .test()/.replace() в analyze()
const HOTKEY_PATTERN = '(горяч[\\p{L}]*[\\s]+клавиш[\\p{L}]*|хоткей[\\p{L}]*|сочетани[\\p{L}]*[\\s]+клавиш[\\p{L}]*|shortcut|hotkey|keybind|keymap)';
const HOTKEY_RE = new RegExp(HOTKEY_PATTERN, 'iu');   // \p{L} обязателен: \w не матчит кириллицу
const QUESTION_WORDS = /^(что|что такое|что делает|что значит|для чего|зачем|как|где|почему|когда|сколько|расскажи|покажи|what|how|where|why|which)/i;
const WEAK_SECTIONS = { addons: 0.92, bpy_types_enum_items: 0.7, contribute: 0.6 };

export class Search {
  constructor(index, terms) {
    this.idx = index;
    this.docs = index.docs || [];
    this.postings = index.terms || {};
    this.df = index.df || {};
    this.N = index.N || this.docs.length;
    this.avgdl = index.avgdl || 100;
    this.anchors = index.anchors || [];
    this.keys = index.keys || [];
    this.aliases = index.aliases || {};
    this.aliasRu = index.aliasRu || {};
    this.terms = terms || { en2ru: {}, ru2en: {} };

    // RU-стемма → EN-термины
    this.ruTokenMap = new Map();
    this.ruLenIndex = new Map();
    for (const [normRu, enList] of Object.entries(this.terms.ru2en || {})) {
      for (const tok of normRu.split(' ')) {
        if (!tok) continue;
        if (!this.ruTokenMap.has(tok)) this.ruTokenMap.set(tok, new Set());
        for (const en of enList) this.ruTokenMap.get(tok).add(en);
      }
      const len = normRu.length;
      if (!this.ruLenIndex.has(len)) this.ruLenIndex.set(len, []);
      this.ruLenIndex.get(len).push(normRu);
    }

    // токен → якоря
    this.anchorVocab = new Set();
    this.anchorByToken = new Map();
    this.anchors.forEach((a, i) => {
      for (const tok of a.n.split(' ')) {
        this.anchorVocab.add(tok);
        if (!this.anchorByToken.has(tok)) this.anchorByToken.set(tok, []);
        const list = this.anchorByToken.get(tok);
        if (list.length < 500) list.push(i);
      }
    });

    // компактные названия страниц: «Sidebar» → editors/3dview/sidebar
    this.titleIndex = new Map();
    const putTitle = (key, i) => {
      if (!key) return;
      const prev = this.titleIndex.get(key);
      if (prev === undefined || (this.docs[i].id || '').split('/').length < (this.docs[prev].id || '').split('/').length) {
        this.titleIndex.set(key, i);
      }
    };
    this.docs.forEach((d, i) => {
      putTitle(String(d.t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''), i);
      putTitle(String(d.tr || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''), i);
    });

    // названия страниц: «боковая панель» → Sidebar, «3d cursor» → 3D Cursor
    this.titleIndex = new Map();
    const compact = (x) => String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const addTitle = (t, i) => {
      const key = compact(t);
      if (key.length < 3) return;
      if (!this.titleIndex.has(key)) this.titleIndex.set(key, []);
      const list = this.titleIndex.get(key);
      if (list.length < 40 && !list.includes(i)) list.push(i);
    };
    this.docs.forEach((d, i) => { addTitle(d.t, i); if (d.tr) addTitle(d.tr, i); });
    this.compact = compact;

    // термины по длине — для быстрого поиска опечаток
    this.termByLen = new Map();
    for (const t of Object.keys(this.postings)) {
      const l = t.length;
      if (!this.termByLen.has(l)) this.termByLen.set(l, []);
      this.termByLen.get(l).push(t);
    }
    this.curatedKeys = KEY_TASKS.map((t) => ({
      ...t,
      canon: keyCanonical(t.key),
      titleTokens: tokenize(t.task),
      textTokens: tokenize(`${t.task} ${t.detail || ''} ${t.why || ''}`),
    }));
    this.keyEntries = (index.keys || []).map((k) => ({ ...k, canon: keyCanonical(k.k), labelTokens: tokenize(k.l || '') }));
  }

  /** Варианты написания термина для индекса алиасов: «Regions» → regions/region, «renders» → renders/render. */
  aliasVariants(str, tokens = tokenize(str)) {
    const out = [];
    const push = (x) => {
      if (x && this.aliases[x] && !out.includes(x)) out.push(x);
    };
    push(aliasNorm(str));
    push(tokens.join('_'));
    push(tokens.join(' '));
    const stemmed = tokens.map((t) => stem(t));
    push(stemmed.join('_'));
    push(stemmed.join(' '));
    if (tokens.length && tokens[tokens.length - 1].endsWith('s')) {
      const sing = [...tokens.slice(0, -1), tokens[tokens.length - 1].replace(/s$/, '')];
      push(sing.join('_'));
      push(sing.map((t) => stem(t)).join('_'));
    }
    return out;
  }

  idf(term) {
    const df = this.df[term] || 0;
    return Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
  }

  /* ─────────────── разбор запроса ─────────────── */

  analyze(query) {
    const raw = String(query || '').trim();
    const norm = normTerm(raw);
    const wantsKey = HOTKEY_RE.test(raw);
    const subject = raw.replace(new RegExp(HOTKEY_PATTERN, 'giu'), ' ').replace(/[?!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
    const keyRaw = subject || raw;
    const keyInput = /^[a-z0-9+\-\s]+$/i.test(keyRaw) && keyRaw.length <= 16 ? keyCanonical(keyRaw) : '';

    const tokens = tokenize(subject || raw);
    const enTokens = [];
    const ruTokens = [];
    for (const t of tokens) (isCyr(t) ? ruTokens : enTokens).push(t);

    const rawWords = (subject || raw).toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter((w) => w.length >= 1);

    // расширения запроса: EN-термины, полученные из русского текста и синонимов
    const expansions = new Map();     // 'stemmed en term' → вес
    const aliasHits = new Map();      // aliasNorm → { weight, ru }

    const addExp = (enStr, w) => {
      const t = tokenize(enStr);
      if (!t.length) return;
      const key = t.join(' ');
      if ((expansions.get(key) || 0) < w) expansions.set(key, w);
      for (const a of this.aliasVariants(enStr, t)) {
        const prev = aliasHits.get(a);
        if (!prev || prev.weight < w) aliasHits.set(a, { weight: w, n: t.length, ru: this.aliasRu[a] || '' });
      }
    };

    // 1. n-граммы запроса напрямую в индексе алиасов (латиница: «clip start», «x-ray»)
    for (let n = 3; n >= 1; n--) {
      for (let i = 0; i + n <= rawWords.length; i++) {
        const gram = rawWords.slice(i, i + n);
        if (gram.every((w) => isCyr(w))) continue;
        const a = aliasNorm(gram.join(' '));
        if (a && this.aliases[a]) {
          const prev = aliasHits.get(a);
          let w = n === rawWords.length ? 1.35 : 0.95;
          w *= 1 + 0.18 * (n - 1);                       // длинные термины специфичнее
          if (n === 1 && rawWords.length > 1) w *= 0.5;  // одиночное слово в длинном запросе — слабый сигнал
          if (!prev || prev.weight < w) aliasHits.set(a, { weight: w, n, ru: this.aliasRu[a] || '' });
        }
      }
    }

    // 2. русские n-граммы → официальный словарь → EN-термины
    for (let n = 3; n >= 1; n--) {
      for (let i = 0; i + n <= rawWords.length; i++) {
        const gram = rawWords.slice(i, i + n);
        if (!gram.some((w) => isCyr(w))) continue;
        const key = normTerm(gram.join(' '));
        const ens = this.terms.ru2en?.[key];
        if (ens) for (const en of ens) addExp(en, n === rawWords.length ? 1.45 : 1.05);
      }
    }

    // 2.5 составные термины из соседних русских слов: «рендер региона» → Render Region
    for (let i = 0; i + 1 < rawWords.length; i++) {
      const w1 = rawWords[i];
      const w2 = rawWords[i + 1];
      if (!isCyr(w1) || !isCyr(w2)) continue;
      const set1 = this.ruTokenMap.get(normTerm(w1));
      const set2 = this.ruTokenMap.get(normTerm(w2));
      if (!set1 || !set2) continue;
      const roots1 = new Set([...set1].flatMap((e) => [e, stem(e)]));
      const roots2 = new Set([...set2].flatMap((e) => [e, stem(e)]));
      for (const x of roots1) {
        for (const y of roots2) {
          const cand = `${x}_${y}`;
          if (!this.aliases[cand]) continue;
          const prev = aliasHits.get(cand);
          const w = 1.5;
          if (!prev || prev.weight < w) aliasHits.set(cand, { weight: w, n: 2, ru: this.aliasRu[cand] || '' });
          const packedKey = `${normTerm(x)} ${normTerm(y)}`;
          if ((expansions.get(packedKey) || 0) < 1.2) expansions.set(packedKey, 1.2);
        }
      }
    }

    // 2.6 рукописные фразовые синонимы: «фокусное расстояние» → Focal Length
    for (let n = Math.min(3, rawWords.length); n >= 2; n--) {
      for (let i = 0; i + n <= rawWords.length; i++) {
        const phrase = rawWords.slice(i, i + n).join(' ');
        const syn = SYNONYMS.ru[phrase];
        if (syn) for (const en of syn) addExp(en, 1.7);
      }
    }

    // 3. отдельные русские токены (в том числе с опечатками)
    for (const t of ruTokens) {
      const direct = this.ruTokenMap.get(t);
      if (direct) for (const en of direct) addExp(en, 0.75);
      else {
        for (const len of [t.length - 1, t.length, t.length + 1]) {
          const bucket = this.ruLenIndex.get(len);
          if (!bucket) continue;
          let matched = false;
          for (const cand of bucket) {
            if (editDistance(t, cand, 1) <= 1) {
              const ens = this.terms.ru2en[cand];
              if (ens) for (const en of ens) addExp(en, 0.55);
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
      }
    }

    // 4. синонимы и жаргон
    for (const w of rawWords) {
      const syn = SYNONYMS.ru[w];
      if (syn) for (const en of syn) addExp(en, 1.15);
      const synEn = SYNONYMS.en[w];
      if (synEn) for (const en of synEn) addExp(en, 1.05);
    }

    // 5. ограничиваем расширение: держим самые уверенные и короткие термины
    const prunedExpansions = [...expansions.entries()]
      .sort((x, y) => y[1] - x[1] || x[0].split(' ').length - y[0].split(' ').length || x[0].length - y[0].length)
      .slice(0, 8);
    expansions.clear();
    for (const [k, v] of prunedExpansions) expansions.set(k, v);

    // не больше 12 алиасов — самые уверенные
    if (aliasHits.size > 12) {
      const keep = [...aliasHits.entries()]
        .sort((x, y) => y[1].weight - x[1].weight || (x[0].split('_').length - y[0].split('_').length))
        .slice(0, 12);
      aliasHits.clear();
      for (const [k, v] of keep) aliasHits.set(k, v);
    }

    // 5. термины с весами для BM25
    const weighted = new Map();
    for (const t of enTokens) weighted.set(t, Math.max(weighted.get(t) || 0, 1));
    for (const [packed, w] of expansions) {
      if (!weighted.has(packed) || weighted.get(packed) < w) weighted.set(packed, w);
      for (const part of packed.split(' ')) if (!weighted.has(part)) weighted.set(part, Math.max(0.35, w * 0.5));
    }

    const enSet = new Set(enTokens);
    for (const packed of expansions.keys()) for (const w of packed.split(' ')) enSet.add(w);

    return {
      raw, norm, subject, keyInput, wantsKey,
      isQuestion: QUESTION_WORDS.test(raw),
      tokens, enTokens, ruTokens,
      enSet: [...enSet],
      weighted, aliasHits: [...aliasHits.entries()].map(([a, v]) => ({ a, ...v })),
    };
  }

  /* ─────────────── горячие клавиши ─────────────── */

  searchKeys(a) {
    const out = [];
    const canon = a.keyInput || '';
    const subjectTokens = new Set([...a.tokens, ...a.rawWords?.map?.((w) => w) || []]);

    // 1. рукописные задания: понятный русский ответ + проверенная клавиша
    for (const t of this.curatedKeys) {
      let score = 0;
      if (canon && t.canon === canon) score = 14;
      else if (canon && canon.length === 1 && t.canon === canon) score = 14;
      if (!score && (a.wantsKey || a.isQuestion || a.tokens.length <= 4) && a.subject) {
        const q = [...new Set(tokenize(a.subject))];
        if (q.length) {
          // латинские токены сравниваем точно, русские — по основе слова
          const same = (x, y) => {
            if (x === y) return true;
            if (x.length < 4 || y.length < 4) return false;
            if (!isCyr(x) || !isCyr(y)) return false;
            const px = x.slice(0, 4);
            const py = y.slice(0, 4);
            return y.startsWith(px) || x.startsWith(py) || y.includes(px) || x.includes(py);
          };
          const hit = (arr) => q.filter((x) => arr.some((y) => same(x, y))).length;
          const inTitle = hit(t.titleTokens) / q.length;
          const inAll = hit(t.textTokens) / q.length;
          const titleHitTitle = t.titleTokens.filter((y) => q.some((x) => same(x, y))).length / t.titleTokens.length;
          if (a.wantsKey && inTitle >= 0.5) {
            score = 8 + inTitle * 2;
          } else if (inTitle === 1 && titleHitTitle >= 0.6 && t.titleTokens.length <= q.length + 2) {
            score = 9 + Math.max(0, 2 - (t.titleTokens.length - q.length) * 0.5);
          } else if (q.length >= 3 && inAll >= 0.75 && inTitle >= 0.5) {
            score = 4 + inAll * 3 + inTitle * 2;
          }
        }
      }
      if (score) out.push({ key: t.key, label: t.task, why: t.why, detail: t.detail, doc: this.docs.find((d) => d.id === t.doc), curated: true, score });
    }

    // 2. клавиши из справочника
    for (const k of this.keyEntries) {
      const nk = k.canon;
      let score = 0;
      if (canon && nk === canon) score = 10;
      else if (canon.length > 2 && nk.startsWith(canon)) score = 6;
      if (!score && a.wantsKey && a.subject) {
        const q = tokenize(a.subject);
        const label = k.labelTokens;
        const hit = q.filter((x) => label.includes(x)).length;
        if (hit && hit / q.length >= 0.5) score = 3 + hit;
      }
      if (score) out.push({ key: k.k, label: k.l, doc: this.docs[k.i], score });
      if (out.length > 120) break;
    }

    const seen = new Set();
    return out
      .sort((x, y) => y.score - x.score)
      .filter((x) => {
        const key = keyCanonical(x.key) + '|' + (x.label || '').slice(0, 40);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }

  /* ─────────────── определения опций ─────────────── */

  searchAnchors(a, docResults = []) {
    if (!a.norm && !a.aliasHits.length) return [];
    const qTokens = a.norm ? a.norm.split(' ').filter(Boolean) : [];
    const aliasTokenSets = a.aliasHits.map((h) => ({ tokens: h.a.split('_').flatMap((p) => tokenize(p)), weight: h.weight, alias: h.a }));
    const allQueryTokens = [...new Set([...qTokens, ...aliasTokenSets.flatMap((x) => x.tokens), ...a.enSet])];

    const scores = new Map();
    const bump = (idx, s) => scores.set(idx, Math.max(scores.get(idx) || 0, s));

    // точное совпадение с нормализованным термином опции
    if (qTokens.length) {
      const exactNorm = qTokens.join(' ');
      for (let i = 0; i < this.anchors.length; i++) {
        const an = this.anchors[i];
        if (an.n === exactNorm) bump(i, 9);
        else if (an.n.startsWith(exactNorm + ' ')) bump(i, 8.2);   // «Clip Start» → «Clip Start/End»
      }
    }

    // совпадение по алиасу (например, «x-ray» → опция X-Ray)
    for (const at of aliasTokenSets) {
      for (let i = 0; i < this.anchors.length; i++) {
        const an = this.anchors[i];
        const anTokens = an.n.split(' ');
        if (at.tokens.length && at.tokens.every((t) => anTokens.includes(t))) {
          bump(i, 6 + at.weight * 2 - Math.max(0, anTokens.length - at.tokens.length) * 0.4);
        }
      }
    }

    // частичное совпадение по токенам: учитываем только те токены, что вообще есть у якорей
    const usableTokens = allQueryTokens.filter((t) => this.anchorVocab.has(t));
    if (usableTokens.length && scores.size < 6) {
      const tokenLists = usableTokens.map((t) => this.anchorByToken.get(t) || []).filter((l) => l.length);
      if (tokenLists.length) {
        tokenLists.sort((x, y) => x.length - y.length);
        const smallest = tokenLists[0];
        for (const idx of smallest) {
          const an = this.anchors[idx];
          const anTokens = an.n.split(' ');
          const hit = usableTokens.filter((t) => anTokens.includes(t)).length;
          const covQ = hit / usableTokens.length;
          const covA = hit / anTokens.length;
          if (covQ >= 0.6 && covA >= 0.45) bump(idx, 3 + covQ * 3 + covA * 2 - Math.max(0, anTokens.length - usableTokens.length) * 0.3);
          if (scores.size > 300) break;
        }
      }
    }

    // якоря из страниц, которые лучше подходят по общему поиску, получают бонус
    const docRank = new Map();
    for (let r = 0; r < (docResults || []).length; r++) docRank.set(docResults[r].doc.i, r);
    const isApiQuery = /bpy\.|ops\.|python/i.test(a.raw);
    const aliasTokens = new Set(aliasTokenSets.flatMap((x) => x.tokens));

    const seen = new Set();
    return [...scores.entries()]
      .map(([i, score]) => {
        const an = this.anchors[i];
        const doc = this.docs[an.i];
        let sc = score;
        const rank = docRank.get(an.i);
        if (rank !== undefined) sc += rank < 3 ? 5 - rank * 0.6 : Math.max(0, 2.4 - rank * 0.15);
        else if (docResults.length >= 3) sc *= 0.35;
        // «якорь из нерелевантной страницы» — плохой ответ, помечаем его позицию
        const docIndex = rank !== undefined ? rank : (docResults.length >= 3 ? 99 : undefined);
        if (an.n === (a.norm || '')) sc += 2;
        // «3d cursor» → опция, которая так и называется
        const qc = this.compact ? this.compact(a.raw) : '';
        if (qc && (this.compact(an.t) === qc || this.compact(an.t) === this.compact(a.norm || ''))) sc += 4;
        if (aliasTokens.size) {
          const anTokens = an.n.split(' ');
          const inter = anTokens.filter((t) => aliasTokens.has(t)).length;
          if (!inter) sc *= 0.25;
          else sc += inter * 0.8;
        }
        if (isApiQuery && doc?.k === 'api') sc += 4;
        if (doc?.k === 'doc') sc += 0.5;
        // общие страницы важнее глубоко вложенных
        const depth = (doc?.id || '').split('/').length;
        sc += Math.max(0, 1.6 - Math.max(0, depth - 3) * 0.35);
        return { ...an, score: sc, doc, rank: docIndex };
      })
      .sort((x, y) => y.score - x.score || (x.doc?.k === 'doc' ? -1 : 1))
      .filter((x) => {
        const key = x.t + '|' + x.i;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
  }

  /* ─────────────── страницы ─────────────── */

  searchDocs(a, { limit = 18 } = {}) {
    const isApiQuery = /bpy\.|ops\.|python|модул/i.test(a.raw);
    const scores = new Map();
    const matched = new Map();
    const add = (di, s, term) => {
      scores.set(di, (scores.get(di) || 0) + s);
      if (term) {
        if (!matched.has(di)) matched.set(di, new Set());
        matched.get(di).add(term);
      }
    };

    // BM25
    for (const [termRaw, w] of a.weighted) {
      const variants = new Set();
      if (this.postings[termRaw]) variants.add(termRaw);
      for (const t of termRaw.split(' ')) if (this.postings[t]) variants.add(t);
      for (const t of variants) {
        const idf = this.idf(t);
        const ww = w / Math.sqrt(variants.size);
        for (const [di, tf] of this.postings[t]) {
          const dl = this.docs[di].len || this.avgdl;
          const norm2 = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * dl / this.avgdl));
          add(di, ww * idf * norm2, t);
        }
      }
    }

    // алиасы: точное название функции/опции. Берём лучшее совпадение, а не сумму —
    // иначе частый термин («clip») тянет за собой сотни страниц.
    const aliasBest = new Map();
    for (const h of a.aliasHits) {
      const list = this.aliases[h.a] || [];
      list.forEach(([di, rank], pos) => {
        const v = (rank / 10) * h.weight / (1 + pos * 0.02);
        const prev = aliasBest.get(di);
        if (!prev || prev.v < v) aliasBest.set(di, { v, alias: h.a });
        if (!matched.has(di)) matched.set(di, new Set());
        matched.get(di).add('alias:' + h.a);
      });
    }

    // страница, где искомый термин описан как отдельная опция (есть якорь) — сильная подсказка
    const anchorDocs = new Set();
    if (a.aliasHits.length) {
      const wanted = new Set(a.aliasHits.flatMap((h) => [h.a.replace(/_/g, ' '), h.a.replace(/_/g, '')]));
      for (const an of this.anchors) {
        if (wanted.has(an.n) || wanted.has(an.n.replace(/ /g, ''))) anchorDocs.add(an.i);
      }
    }

    const bmMax = Math.max(1e-6, ...scores.values());
    for (const di of new Set([...scores.keys(), ...aliasBest.keys()])) {
      const d = this.docs[di];
      const bm = (scores.get(di) || 0) / bmMax;
      const al = Math.min(1, (aliasBest.get(di)?.v || 0) / 1.3);
      let s = 100 * (0.62 * bm + 0.38 * al);
      if (anchorDocs.has(di)) s += 42;

      const qTokens = a.tokens;
      const titleToks = tokenize(d.t || '');
      const titleHits = qTokens.filter((t) => titleToks.includes(t)).length;
      if (titleHits) s *= 1 + 0.5 * (titleHits / Math.max(1, qTokens.length));
      const idPath = (d.id || '').toLowerCase();
      if (d.tr && a.raw.toLowerCase().includes(d.tr.toLowerCase())) s *= 1.25;
      if (d.k === 'doc') s *= isApiQuery ? 1.0 : 1.15;
      else if (!isApiQuery) s *= 0.7;
      const weak = WEAK_SECTIONS[d.s];
      if (weak) s *= weak;
      // общие страницы полезнее глубоко вложенных подстраниц
      const depth = (d.id || '').split('/').length;
      s *= 1 - Math.min(0.22, Math.max(0, depth - 3) * 0.06);
      if (isApiQuery && d.k === 'api') s *= 1.5;
      scores.set(di, s);
    }

    // прямое попадание в название страницы — самый понятный ответ («боковая панель» → Sidebar)
    const titleKeys = new Set();
    titleKeys.add(this.compact(a.raw));
    for (const t of a.tokens) titleKeys.add(this.compact(t));
    for (const packed of a.weighted.keys()) titleKeys.add(this.compact(packed));
    for (const key of titleKeys) {
      if (!key || key.length < 3) continue;
      const list = this.titleIndex.get(key);
      if (!list) continue;
      const bonus = key === this.compact(a.raw) ? 14 : 7;
      for (const di of list) add(di, bonus * (1 - Math.min(0.4, (this.docs[di].id.split('/').length - 1) * 0.1)), 'title');
    }

    // опечатки
    const suggestions = new Set();
    if (scores.size < 4 && aliasBest.size < 2) {
      for (const t of a.enTokens) {
        if (this.postings[t]) continue;
        const near = this.nearestTerms(t, 1);
        for (const n of near.slice(0, 3)) {
          suggestions.add(n);
          for (const [di, tf] of this.postings[n]) {
            const dl = this.docs[di].len || this.avgdl;
            add(di, 0.3 * this.idf(n) * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * dl / this.avgdl))), n);
          }
        }
      }
    }

    return {
      results: [...scores.entries()]
        .map(([di, score]) => ({ doc: this.docs[di], score, terms: [...(matched.get(di) || [])] }))
        .sort((x, y) => y.score - x.score)
        .slice(0, limit),
      suggestions: [...suggestions],
    };
  }

  nearestTerms(term, maxDist = 1) {
    const out = [];
    if (term.length < 3) return out;
    for (const len of [term.length - 1, term.length, term.length + 1]) {
      const bucket = this.termByLen.get(len);
      if (!bucket) continue;
      for (const t of bucket) {
        if (t[0] !== term[0]) continue;
        if (editDistance(term, t, maxDist) <= maxDist) out.push(t);
        if (out.length > 12) break;
      }
    }
    return out;
  }

  ask(query, opts = {}) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const a = this.analyze(query);
    const keys = this.searchKeys(a);
    const { results, suggestions } = this.searchDocs(a, opts);
    const anchors = this.searchAnchors(a, results);
    const took = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return { a, keys, anchors, results, suggestions, took };
  }

  suggest(prefix, limit = 8) {
    const p = String(prefix || '').trim().toLowerCase();
    if (p.length < 2) return [];
    const out = [];
    const seen = new Set();
    const push = (title, sub, url) => {
      const key = title.toLowerCase();
      if (seen.has(key) || out.length >= limit) return;
      seen.add(key);
      out.push({ title, sub, url });
    };

    // точные названия опций и функций
    const a = aliasNorm(p);
    for (const [alias, list] of Object.entries(this.aliases)) {
      if (out.length >= limit) break;
      if (alias.startsWith(a)) {
        const d = this.docs[list[0]?.[0]];
        if (d) push(this.aliasRu[alias] ? `${this.aliasRu[alias]} (${alias.replace(/_/g, ' ')})` : alias.replace(/_/g, ' '), d.t, `#/doc/${d.id}`);
      }
    }

    for (const d of this.docs) {
      if (out.length >= limit) break;
      const t = (d.t || '').toLowerCase();
      if (t.startsWith(p)) push(d.t, d.tr ? `${d.tr} · ${d.id}` : d.id, `#/doc/${d.id}`);
    }

    // русские подсказки: «панель» → Sidebar и другие термины
    const qStem = stem(p);
    const ruHits = this.ruTokenMap.get(qStem) || this.ruTokenMap.get(p);
    if (ruHits) for (const en of ruHits) push(en, 'термин интерфейса', `#/ask/${encodeURIComponent(en)}`);

    return out.slice(0, limit);
  }
}
