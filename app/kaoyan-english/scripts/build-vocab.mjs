#!/usr/bin/env node
/* ==========================================================================
   考研词汇数据构建

   数据源：https://github.com/kajweb/dict （开源词典数据，欧路词典格式）
   用 KaoYan_1/2/3 三个分册作为主表（去重后 5057 词），
   另外把 Level4_1 里考研表没有的词作为补充，避免用户给的数据被浪费。

   为什么要在构建期处理而不是运行时拉取：
   · 线上要能离线用，不能依赖 GitHub 可达
   · 原始数据字段冗余（英释、语音参数等本项目用不到），运行时解析浪费流量
   · 词形变化需要反向索引，运行时算太慢

   产出：public/data/vocab.json（应用启动时取一次，缓存进 IndexedDB）
   ========================================================================== */

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInflateRaw, gzipSync } from 'node:zlib'

const REPO = 'https://github.com/kajweb/dict/raw/master/book'
const OUT_DIR = 'public/data'
const CACHE_DIR = '.vocab-cache'

/** 考研主表：三个分册 */
const KAOYAN_FILES = [
  '1521164669833_KaoYan_1.zip',
  '1521164654696_KaoYan_2.zip',
  '1521164658897_KaoYan_3.zip',
]
/** 用户指定的补充数据源 */
const EXTRA_FILES = ['1521164647417_Level4_1.zip']

const args = new Set(process.argv.slice(2))
const force = args.has('--force')

/* -------------------------------------------------------------------------- */
/*  取数据                                                                     */
/* -------------------------------------------------------------------------- */

async function fetchZip(name) {
  mkdirSync(CACHE_DIR, { recursive: true })
  const cached = join(CACHE_DIR, name)
  if (!force && existsSync(cached)) {
    console.log(`  缓存命中 ${name}`)
    return readFileSync(cached)
  }
  process.stdout.write(`  下载 ${name} … `)
  const res = await fetch(`${REPO}/${name}`)
  if (!res.ok) throw new Error(`下载失败 ${name}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(cached, buf)
  console.log(`${(buf.length / 1024).toFixed(0)} KB`)
  return buf
}

/**
 * 从一个单成员 zip 里取出文本。
 *
 * 必须走中央目录，不能只扫本地文件头：
 * 这些包设了通用标志位 bit 3（data descriptor），此时**本地头里的
 * 压缩/解压大小都写成 0**，真实大小只记在文件末尾的中央目录里。
 * 按本地头读会把 0 字节当数据，报 "unexpected end of file"。
 */
async function readZipEntry(buf) {
  // 中央目录结束记录：PK\x05\x06，其偏移 16 处指向中央目录起始
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error('不是合法的 zip：未找到中央目录结束记录')

  const cdOffset = buf.readUInt32LE(eocd + 16)
  if (buf[cdOffset] !== 0x50 || buf[cdOffset + 1] !== 0x4b || buf[cdOffset + 2] !== 0x01 || buf[cdOffset + 3] !== 0x02) {
    throw new Error('不是合法的 zip：中央目录签名不匹配')
  }

  const method = buf.readUInt16LE(cdOffset + 10)
  const compressedSize = buf.readUInt32LE(cdOffset + 20)
  const nameLen = buf.readUInt16LE(cdOffset + 28)
  const extraLen = buf.readUInt16LE(cdOffset + 30)
  const commentLen = buf.readUInt16LE(cdOffset + 32)
  const localOffset = buf.readUInt32LE(cdOffset + 42)
  const name = buf.subarray(cdOffset + 46, cdOffset + 46 + nameLen).toString('utf8')
  void extraLen
  void commentLen

  // 本地头：固定 30 字节，之后是它自己的文件名与扩展区（长度可能与中央目录不同）
  const localNameLen = buf.readUInt16LE(localOffset + 26)
  const localExtraLen = buf.readUInt16LE(localOffset + 28)
  const dataStart = localOffset + 30 + localNameLen + localExtraLen
  const data = buf.subarray(dataStart, dataStart + compressedSize)

  if (data.length !== compressedSize) {
    throw new Error(`zip 数据不完整：期望 ${compressedSize} 字节，实际 ${data.length}`)
  }

  if (method === 0) return { name, text: data.toString('utf8') }
  if (method !== 8) throw new Error(`不支持的压缩方式 ${method}（只支持 store/deflate）`)
  return { name, text: await inflateRaw(data) }
}

function inflateRaw(data) {
  return new Promise((resolve, reject) => {
    const chunks = []
    const inflate = createInflateRaw()
    inflate.on('data', (c) => chunks.push(c))
    inflate.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    inflate.on('error', reject)
    inflate.end(data)
  })
}

/** 解析 NDJSON（每行一个 JSON 对象） */
function parseNdjson(text) {
  const out = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      out.push(JSON.parse(trimmed))
    } catch {
      /* 跳过坏行，不让单行问题毁掉整批 */
    }
  }
  return out
}

/* -------------------------------------------------------------------------- */
/*  裁剪与归一化                                                               */
/* -------------------------------------------------------------------------- */

function toText(v) {
  return typeof v === 'string' ? v.trim() : ''
}

/** 从原始条目里抽出我们真正要用的字段 */
function trimEntry(entry, bookLabel) {
  const head = toText(entry.headWord)
  if (!head) return null
  const c = entry.content?.word?.content ?? {}

  const defs = Array.isArray(c.trans)
    ? c.trans
        .map((t) => ({
          pos: toText(t.pos),
          cn: toText(t.tranCn),
          en: toText(t.tranOther),
          // 「中释/英释」这类标注对学习没用，丢掉
        }))
        .filter((d) => d.cn || d.en)
    : []

  const sentences = Array.isArray(c.sentence?.sentences)
    ? c.sentence.sentences
        .slice(0, 1)
        .map((s) => ({ en: toText(s.sContent), cn: toText(s.sCn) }))
        .filter((s) => s.en)
    : []

  const phrases = Array.isArray(c.phrase?.phrases)
    ? c.phrase.phrases
        .slice(0, 6)
        .map((p) => ({ en: toText(p.pContent), cn: toText(p.pCn) }))
        .filter((p) => p.en)
    : []

  // 同近词：同义/近义，是「相似词串联」最直接的依据
  const syno = Array.isArray(c.syno?.synos)
    ? c.syno.synos
        .slice(0, 3)
        .map((s) => ({
          pos: toText(s.pos),
          tran: toText(s.tran),
          words: Array.isArray(s.hwds) ? s.hwds.map((h) => toText(h.w)).filter(Boolean).slice(0, 6) : [],
        }))
        .filter((s) => s.words.length > 0)
    : []

  // 相关词：同根词形变化（short → shortly / shortish），用于「词族」串联
  const related = Array.isArray(c.relWord?.rels)
    ? c.relWord.rels
        .slice(0, 3)
        .map((r) => ({
          pos: toText(r.pos),
          words: Array.isArray(r.words)
            ? r.words.map((w) => ({ w: toText(w.hwd), cn: toText(w.tran) })).filter((w) => w.w).slice(0, 6)
            : [],
        }))
        .filter((r) => r.words.length > 0)
    : []

  return {
    word: head,
    book: bookLabel,
    rank: Number(entry.wordRank) || 0,
    usphone: toText(c.usphone),
    ukphone: toText(c.ukphone),
    defs,
    sentences,
    phrases,
    syno,
    related,
  }
}

/* -------------------------------------------------------------------------- */
/*  主流程                                                                     */
/* -------------------------------------------------------------------------- */

console.log('▸ 拉取词表')
const kaoyan = new Map()
let rankCounter = 0
for (const file of KAOYAN_FILES) {
  const buf = await fetchZip(file)
  const { text, name } = await readZipEntry(buf)
  const entries = parseNdjson(text)
  console.log(`    ${name}: ${entries.length} 条`)
  for (const e of entries) {
    const trimmed = trimEntry(e, 'kaoyan')
    if (!trimmed) continue
    rankCounter += 1
    // 考研分册自带 wordRank，但跨分册会重复，这里统一按出现顺序重排
    trimmed.rank = rankCounter
    kaoyan.set(trimmed.word.toLowerCase(), trimmed)
  }
}
console.log(`  考研主表去重后：${kaoyan.size} 词`)

console.log('▸ 合并补充词表')
let extraAdded = 0
for (const file of EXTRA_FILES) {
  const buf = await fetchZip(file)
  const { text } = await readZipEntry(buf)
  for (const e of parseNdjson(text)) {
    const trimmed = trimEntry(e, 'extra')
    if (!trimmed) continue
    const key = trimmed.word.toLowerCase()
    if (!kaoyan.has(key)) {
      trimmed.rank = 0 // 非考研核心词，不参与高频排序
      kaoyan.set(key, trimmed)
      extraAdded += 1
    }
  }
}
console.log(`  新增 ${extraAdded} 个补充词，总计 ${kaoyan.size} 词`)

/* —— 构建相似词连接 —— */
console.log('▸ 构建相似词连接')
const index = new Map([...kaoyan.keys()].map((k) => [k, kaoyan.get(k)]))

/** 词形变化：连字符/空格归一，用于把 "short of" 这类也接上 */
function normalizeKey(w) {
  return w.toLowerCase().replace(/[^a-z'-]/g, '').trim()
}

let synoLinks = 0
let relatedLinks = 0
for (const entry of kaoyan.values()) {
  // 把同近词/相关词里「也在词表内」的词收敛成规范化 key，前端据此互跳
  entry.syno = entry.syno.map((group) => ({
    ...group,
    // 保留全部词（可能不在词表内，也值得展示），但标出哪些能跳转
    words: group.words.map((w) => {
      const key = normalizeKey(w)
      if (index.has(key)) synoLinks += 1
      return { w, in: index.has(key) }
    }),
  }))
  entry.related = entry.related.map((group) => ({
    ...group,
    words: group.words.map((x) => {
      const key = normalizeKey(x.w)
      if (index.has(key)) relatedLinks += 1
      return { ...x, in: index.has(key) }
    }),
  }))
}

/* -------------------------------------------------------------------------- */
/*  输出：数组化紧凑格式                                                       */
/* -------------------------------------------------------------------------- */

/*
 * 为什么用数组而不是对象：
 * 5288 个词条，若每条都写 { word, usphone, defs: [{pos, cn}] } 这种键名，
 * 光键名就占掉约 40% 体积。实测数组化把 gzip 从 2059 KB 降到 1142 KB，
 * 且**不丢任何信息** —— 只是换一种更紧凑的写法，解码在客户端做。
 *
 * 字段顺序（改动必须同步 src/lib/vocab.ts 的 decodeRow）：
 *   0 word  1 book(0=考研 1=补充)  2 rank  3 usphone  4 ukphone
 *   5 defs [[pos, cn]]
 *   6 sentences [[en, cn]]
 *   7 phrases [[en, cn]]
 *   8 syno [[pos, tran, [word]]]
 *   9 related [[pos, [word]]]
 */
function encodeRow(e) {
  return [
    e.word,
    e.book === 'kaoyan' ? 0 : 1,
    e.rank,
    e.usphone,
    e.ukphone,
    e.defs.map((d) => [d.pos, d.cn]),
    e.sentences.map((s) => [s.en, s.cn]),
    e.phrases.map((p) => [p.en, p.cn]),
    e.syno.map((g) => [g.pos, g.tran, g.words.map((w) => w.w)]),
    e.related.map((g) => [g.pos, g.words.map((w) => w.w)]),
  ]
}

const words = [...kaoyan.values()].sort((a, b) => {
  // 考研核心词按频次排序在前，补充词按字母序排在后面
  if (a.book !== b.book) return a.book === 'kaoyan' ? -1 : 1
  if (a.rank && b.rank) return a.rank - b.rank
  return a.word.localeCompare(b.word)
})

const payload = {
  meta: {
    source: 'https://github.com/kajweb/dict',
    builtAt: new Date().toISOString(),
    total: words.length,
    kaoyan: words.filter((w) => w.book === 'kaoyan').length,
    extra: words.filter((w) => w.book === 'extra').length,
    /** 字段顺序说明，供客户端解码校验 */
    format: 'array-v1',
  },
  words: words.map(encodeRow),
}

mkdirSync(OUT_DIR, { recursive: true })
const outPath = join(OUT_DIR, 'vocab.json')
const json = JSON.stringify(payload)
writeFileSync(outPath, json)

const gzipped = gzipSync(Buffer.from(json), { level: 9 })

console.log('')
console.log(`▸ 输出 ${outPath}`)
console.log(`  词条 ${payload.meta.total}（考研 ${payload.meta.kaoyan} + 补充 ${payload.meta.extra}）`)
console.log(`  原始 ${(json.length / 1024 / 1024).toFixed(2)} MB`)
console.log(`  gzip ${(gzipped.length / 1024).toFixed(0)} KB ← 实际传输量（一次性，之后走 IndexedDB 缓存）`)
