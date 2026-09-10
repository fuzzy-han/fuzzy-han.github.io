/* ==========================================================================
   词汇数据加载、解码、检索与相似词串联

   设计取舍：
   · 数据文件按需加载（不是打进主 bundle），首次约 1.1 MB gzip，
     之后缓存进 IndexedDB，离线也能用
   · 检索全在内存里做，5288 个词条遍历一次是毫秒级，不需要引入搜索引擎
   · 相似词分三类（同义 / 同根 / 形近），因为它们的记忆价值完全不同
   ========================================================================== */

import { idb, STORES } from './storage'
import type {
  LinkKind,
  VocabData,
  VocabMeta,
  VocabRow,
  VocabWord,
  WordLink,
} from '@/types/vocab'

/** 数据文件的地址（跟随部署基路径） */
const DATA_URL = `${import.meta.env.BASE_URL}data/vocab.json`

/** IndexedDB 里的缓存键，单条记录存整份数据 */
const CACHE_KEY = 'vocab'

interface CacheRecord {
  id: string
  meta: VocabMeta
  rows: VocabRow[]
}

/* -------------------------------------------------------------------------- */
/*  解码                                                                       */
/* -------------------------------------------------------------------------- */

function decodeRow(row: VocabRow): VocabWord {
  const [word, book, rank, usphone, ukphone, defs, sentences, phrases, syno, related] = row
  return {
    word,
    book: book === 0 ? 'kaoyan' : 'extra',
    rank,
    usphone,
    ukphone,
    defs: (defs ?? []).map(([pos, cn]) => ({ pos, cn })),
    sentences: (sentences ?? []).map(([en, cn]) => ({ en, cn })),
    phrases: (phrases ?? []).map(([en, cn]) => ({ en, cn })),
    syno: (syno ?? []).map(([pos, tran, words]) => ({ pos, tran, words })),
    related: (related ?? []).map(([pos, words]) => ({ pos, words })),
  }
}

/* -------------------------------------------------------------------------- */
/*  加载                                                                       */
/* -------------------------------------------------------------------------- */

export interface LoadProgress {
  stage: 'cache' | 'download' | 'decode' | 'done'
  message: string
}

let memoryCache: VocabData | null = null

/**
 * 取词汇数据：内存 → IndexedDB → 网络。
 * 三级缓存是因为这份数据不小，而用户可能反复进出词汇页。
 */
export async function loadVocab(onProgress?: (p: LoadProgress) => void): Promise<VocabData> {
  if (memoryCache) {
    onProgress?.({ stage: 'done', message: '已就绪' })
    return memoryCache
  }

  onProgress?.({ stage: 'cache', message: '正在读取本地词汇库…' })
  const cached = await idb.get<CacheRecord>(STORES.vocab, CACHE_KEY)
  if (cached?.rows?.length) {
    onProgress?.({ stage: 'decode', message: `正在解码 ${cached.rows.length} 个词条…` })
    memoryCache = { meta: cached.meta, words: cached.rows.map(decodeRow) }
    onProgress?.({ stage: 'done', message: `已就绪（本地缓存，${cached.rows.length} 词）` })
    return memoryCache
  }

  onProgress?.({ stage: 'download', message: '首次使用，正在下载词汇库（约 1.1 MB）…' })
  const res = await fetch(DATA_URL)
  if (!res.ok) {
    throw new Error(`词汇数据下载失败（HTTP ${res.status}）。请检查网络后重试。`)
  }
  const payload = (await res.json()) as { meta: VocabMeta; words: VocabRow[] }

  onProgress?.({ stage: 'decode', message: `正在解码 ${payload.words.length} 个词条…` })
  const data: VocabData = { meta: payload.meta, words: payload.words.map(decodeRow) }

  // 缓存失败不该影响本次使用
  try {
    await idb.put(STORES.vocab, { id: CACHE_KEY, meta: payload.meta, rows: payload.words })
  } catch {
    /* 忽略：只是下次还要重新下载 */
  }

  memoryCache = data
  onProgress?.({ stage: 'done', message: `已就绪（${data.words.length} 词）` })
  return data
}

export function clearVocabMemoryCache(): void {
  memoryCache = null
}

/* -------------------------------------------------------------------------- */
/*  检索                                                                       */
/* -------------------------------------------------------------------------- */

export interface SearchHit {
  word: VocabWord
  /** 命中方式，用于在结果里说明「为什么这个词被搜出来」 */
  matchedBy: 'word' | 'exact' | 'prefix' | 'def' | 'phrase' | 'synonym'
  /** 命中的具体文本片段 */
  snippet: string
  /** 排序分，越小越靠前 */
  score: number
}

function lower(s: string): string {
  return s.toLowerCase().trim()
}

/**
 * 全局检索：一次遍历覆盖 词形 / 释义 / 短语 / 同近词 四个维度。
 *
 * 为什么不做倒排索引：5288 个词条、每个词条几个字段，
 * 全量遍历在现代浏览器上是毫秒级；建索引反而增加内存与复杂度。
 * 若将来词表规模上到十万级再考虑换实现。
 */
export function searchVocab(words: VocabWord[], query: string, limit = 60): SearchHit[] {
  const q = lower(query)
  if (!q) return []

  const hits: SearchHit[] = []

  for (const word of words) {
    const lw = lower(word.word)

    // 完全匹配永远排最前
    if (lw === q) {
      hits.push({ word, matchedBy: 'exact', snippet: word.defs[0]?.cn ?? '', score: 0 })
      continue
    }
    if (lw.startsWith(q)) {
      hits.push({ word, matchedBy: 'prefix', snippet: word.defs[0]?.cn ?? '', score: 1 + lw.length / 100 })
      continue
    }
    if (lw.includes(q)) {
      hits.push({ word, matchedBy: 'word', snippet: word.defs[0]?.cn ?? '', score: 3 + lw.length / 100 })
      continue
    }

    // 释义命中：中文查词的主要方式
    const def = word.defs.find((d) => lower(d.cn).includes(q))
    if (def) {
      hits.push({ word, matchedBy: 'def', snippet: def.cn, score: 5 + word.word.length / 100 })
      continue
    }

    // 短语命中
    const phrase = word.phrases.find((p) => lower(p.en).includes(q) || lower(p.cn).includes(q))
    if (phrase) {
      hits.push({ word, matchedBy: 'phrase', snippet: `${phrase.en} ${phrase.cn}`, score: 7 })
      continue
    }

    // 同近词命中：搜 "insufficient" 时也希望带出 short
    const syno = word.syno.find((g) => g.words.some((w) => lower(w).includes(q)))
    if (syno) {
      hits.push({ word, matchedBy: 'synonym', snippet: syno.words.join(' / '), score: 9 })
    }
  }

  // 同一分内按考研频次排，核心词优先
  hits.sort((a, b) => a.score - b.score || (a.word.rank || 99999) - (b.word.rank || 99999))
  return hits.slice(0, limit)
}

/* -------------------------------------------------------------------------- */
/*  相似词串联                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * 为一个词构建相似词列表。
 *
 * 三类关系分开返回，因为记忆价值不同：
 * · 同义：写作可替换，但要注意语域
 * · 同根：换词性用
 * · 形近：最容易混，必须对比记
 */
export function buildLinks(word: VocabWord, index: Map<string, VocabWord>): WordLink[] {
  const links: WordLink[] = []
  const seen = new Set<string>([lower(word.word)])

  const push = (raw: string, kind: LinkKind, note: string) => {
    const key = lower(raw)
    if (!key || seen.has(key)) return
    seen.add(key)
    links.push({ word: raw, kind, note, inDict: index.has(key) })
  }

  // 同义词
  for (const group of word.syno) {
    for (const w of group.words) {
      push(w, 'synonym', `${group.pos || ''} 同义 · ${group.tran || ''}`.trim())
    }
  }

  // 同根词形
  for (const group of word.related) {
    for (const w of group.words) {
      push(w, 'form', `${group.pos || ''} 同根`.trim())
    }
  }

  // 形近词：前缀相同且长度接近时最容易混。
  // 用「去掉末 2 个字母后相同」作为粗略判据，够用且不用建额外索引。
  const base = lower(word.word)
  if (base.length >= 4) {
    const stem = base.slice(0, Math.max(3, base.length - 2))
    for (const other of index.values()) {
      const lo = lower(other.word)
      if (lo === base || seen.has(lo)) continue
      if (Math.abs(lo.length - base.length) > 2) continue
      if (!lo.startsWith(stem)) continue
      push(other.word, 'spelling', '拼写相近')
      if (links.filter((l) => l.kind === 'spelling').length >= 8) break
    }
  }

  // 顺序：同义 → 同根 → 形近
  const order: Record<LinkKind, number> = { synonym: 0, form: 1, spelling: 2 }
  return links.sort((a, b) => order[a.kind] - order[b.kind])
}

/** 建立小写词形 → 词条 的索引，供跳转与形近词计算 */
export function buildWordIndex(words: VocabWord[]): Map<string, VocabWord> {
  const map = new Map<string, VocabWord>()
  for (const w of words) map.set(lower(w.word), w)
  return map
}

/* -------------------------------------------------------------------------- */
/*  掌握度                                                                     */
/* -------------------------------------------------------------------------- */

const MASTERED_KEY = 'kaoyan-writing-coach:vocab-mastered'

export function loadMasteredWords(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(MASTERED_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

export function saveMasteredWords(map: Record<string, boolean>): void {
  try {
    localStorage.setItem(MASTERED_KEY, JSON.stringify(map))
  } catch {
    /* 存不下也不影响本次会话 */
  }
}

/** 按首字母分组，用于浏览 */
export function groupByLetter(words: VocabWord[]): Map<string, VocabWord[]> {
  const map = new Map<string, VocabWord[]>()
  for (const w of words) {
    const letter = /^[a-z]/i.test(w.word) ? w.word[0].toUpperCase() : '#'
    const list = map.get(letter) ?? []
    list.push(w)
    map.set(letter, list)
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)))
}
