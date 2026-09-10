/* ==========================================================================
   报告数据结构 —— 与 instruction 里的「结构化输出契约」逐字对应
   作文与翻译共用外层，逐句部分各走一套 schema。
   ========================================================================== */

import type { TaskType } from './domain'

/* -------------------------------------------------------------------------- */
/*  输入侧：图片与转录                                                         */
/* -------------------------------------------------------------------------- */

/** 已压缩、可直接送进视觉模型的图片 */
export interface InputImage {
  dataUrl: string
  name: string
  width: number
  height: number
  compressedBytes: number
  originalBytes: number
  /** 该图承载的内容：题目/写作要求，还是学生的作文 */
  role: 'prompt' | 'essay'
  /** 视觉模型转录出来的文字（作文图必填，用于让批改模型看到「学生原文」） */
  transcript?: string
}

/* -------------------------------------------------------------------------- */
/*  作文：逐句批改                                                             */
/* -------------------------------------------------------------------------- */

/** 严重度：必须修改 / 可选优化 / 正确无误 */
export type FeedbackLevel = 'must' | 'optional' | 'ok'

export interface EssaySentence {
  index: number
  /** 原句，逐字照抄 */
  original: string
  /** 问题描述，无问题则空数组 */
  problems: string[]
  /** 修改后的句子；正确的句子原样返回 */
  revised: string
  /** 针对这句的中文解释 */
  explanation: string
  level: FeedbackLevel
  /** 问题类型标签：主谓一致 / 时态 / 搭配 / 指代 / 中式表达…… */
  labels: string[]
}

/* -------------------------------------------------------------------------- */
/*  翻译：按采分点给分                                                         */
/* -------------------------------------------------------------------------- */

/** 采分点命中情况 */
export type PointStatus = 'hit' | 'partial' | 'mistranslated' | 'missed' | 'over'

export const POINT_STATUS_LABEL: Record<PointStatus, string> = {
  hit: '命中',
  partial: '部分命中',
  mistranslated: '误译',
  missed: '漏译',
  over: '多译',
}

export interface TranslationPoint {
  /** 采分点对应的英文片段 */
  point: string
  /** 该采分点应表达的意思 + 分值 */
  meaning: string
  /** 分值 */
  score: number
  /** 学生在此采分点的得分 */
  earned: number
  /** 学生在译文里对应的部分 */
  yourRendering: string
  status: PointStatus
  note: string
}

export interface TranslationSentence {
  index: number
  /** 英文原句，逐字照抄 */
  original: string
  /** 单句得分，满分 2 */
  score: number
  /** 采分点划分（模拟划分，需注明） */
  points: TranslationPoint[]
  /** 错误分析：误译、漏译、表达问题 */
  problems: string[]
  /** 关键词含义、句子主干、修饰或指代关系的讲解 */
  explanation: string
  /** 学生这一句的译文 */
  yourTranslation: string
  /** 修改译文：保留学生正确表达，给出准确完整自然的译文 */
  revised: string
  level: FeedbackLevel
}

/* -------------------------------------------------------------------------- */
/*  共用外层                                                                   */
/* -------------------------------------------------------------------------- */

export interface DimensionScore {
  /** 对应 TASK_SPECS 里的维度 key */
  key: string
  score: number
  comment: string
  /** 引用的原文片段 */
  evidence: string[]
}

export interface PhraseItem {
  phrase: string
  meaning: string
  usage: string
  scene: string
}

export interface StructureNote {
  /** 各段思路 */
  outline: string[]
  /** 可替换句式框架 */
  frameworks: { name: string; example: string }[]
}

/** 翻译专有：错别字累计扣分 */
export interface TypoDeduction {
  count: number
  deducted: number
  note: string
}

export interface ReportBase {
  band: string
  total: number
  isOnTopic: boolean
  topicNote: string
  dimensions: DimensionScore[]
  revisedWordCount: number
  phrases: PhraseItem[]
  structure: StructureNote
  topFixes: string[]
  practice: string[]
  /** 需要用户确认的地方：照片模糊、词数无法统计、缺少题目等 */
  notes: string[]
}

export interface EssayReport extends ReportBase {
  sentences: EssaySentence[]
  revisedEssay: string
}

export interface TranslationReport extends ReportBase {
  sentences: TranslationSentence[]
  /** 翻译任务里放「整合后的参考译文」 */
  revisedEssay: string
  /** 错别字累计扣分 */
  typoDeduction?: TypoDeduction
}

export type GradingReport = EssayReport | TranslationReport

export function isTranslationReport(
  taskType: TaskType,
  report: GradingReport,
): report is TranslationReport {
  void report
  return taskType === 'eng1_translation'
}
