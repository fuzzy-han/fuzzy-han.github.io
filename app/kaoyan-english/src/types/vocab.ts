/* ==========================================================================
   词汇广场的数据模型

   数据源：https://github.com/kajweb/dict （开源词典数据）
   经 scripts/build-vocab.mjs 处理：考研 KaoYan 三分册为主表，
   加上 Level4_1 里考研表没有的词作为补充。
   ========================================================================== */

/** 词条在传输文件里的数组布局（见 build-vocab.mjs 的 encodeRow） */
export type VocabRow = [
  word: string,
  book: number,
  rank: number,
  usphone: string,
  ukphone: string,
  defs: [string, string][],
  sentences: [string, string][],
  phrases: [string, string][],
  syno: [string, string, string[]][],
  related: [string, string[]][],
]

export interface VocabDef {
  pos: string
  cn: string
}

export interface VocabSynoGroup {
  pos: string
  /** 这一组的共同释义 */
  tran: string
  words: string[]
}

export interface VocabRelatedGroup {
  pos: string
  /** 同根词形变化，如 short → shortly / shortish */
  words: string[]
}

export interface VocabWord {
  word: string
  /** kaoyan = 考研大纲词；extra = 补充词 */
  book: 'kaoyan' | 'extra'
  /** 考研词表内的序号，越小越核心；补充词为 0 */
  rank: number
  usphone: string
  ukphone: string
  defs: VocabDef[]
  sentences: { en: string; cn: string }[]
  phrases: { en: string; cn: string }[]
  syno: VocabSynoGroup[]
  related: VocabRelatedGroup[]
}

export interface VocabMeta {
  source: string
  builtAt: string
  total: number
  kaoyan: number
  extra: number
  format: string
}

export interface VocabData {
  meta: VocabMeta
  words: VocabWord[]
}

/**
 * 相似词的类型。
 * 「串联」不是一种关系，而是几种完全不同的关系，分开呈现对记忆更有用：
 * 同义（意思相同，可替换）、词形（同根，词性不同）、拼写（形近，容易混）。
 */
export type LinkKind = 'synonym' | 'form' | 'spelling'

export interface WordLink {
  word: string
  kind: LinkKind
  /** 关系说明，如 "adj. 同义" */
  note: string
  /** 该词是否也在词表内（在内才能点进去） */
  inDict: boolean
}

export const LINK_KIND_META: Record<LinkKind, { name: string; desc: string }> = {
  synonym: { name: '同义词', desc: '意思相近，可在写作中替换使用——但注意语域与搭配差异。' },
  form: { name: '同根词形', desc: '同一个词根的不同词性。记住一组，写作时就能自由换词性。' },
  spelling: { name: '形近词', desc: '拼写相近，最容易混淆。放在一起对比记，比单独记牢得多。' },
}
