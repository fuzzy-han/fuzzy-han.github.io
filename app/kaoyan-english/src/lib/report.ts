/* ==========================================================================
   报告规范化与校验

   模型返回的 JSON 不能直接信：字段可能缺失、类型可能串（分数给成字符串）、
   维度可能漏给、总分可能与维度和对不上。这里统一收敛成界面可安全消费的结构，
   并把发现的问题作为「诊断」返回，在报告页如实展示——而不是悄悄修好装作没事。
   ========================================================================== */

import type { TaskType } from '@/types/domain'
import { TASK_SPECS } from './tasks'
import type {
  DimensionScore,
  EssaySentence,
  FeedbackLevel,
  GradingReport,
  PhraseItem,
  PointStatus,
  TranslationPoint,
  TranslationSentence,
} from '@/types/report'

export interface ReportDiagnostic {
  level: 'info' | 'warn'
  message: string
}

/* -------------------------------------------------------------------------- */
/*  基础类型收敛                                                               */
/* -------------------------------------------------------------------------- */

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    // 模型有时会写 "15分" 或 "15/20"
    const matched = /-?\d+(\.\d+)?/.exec(value)
    if (matched) return Number(matched[0])
  }
  return fallback
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function toTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(toText).map((s) => s.trim()).filter(Boolean)
  }
  const single = toText(value).trim()
  return single ? [single] : []
}

function toLevel(value: unknown): FeedbackLevel {
  const text = toText(value).toLowerCase()
  if (text === 'must' || text.includes('必须')) return 'must'
  if (text === 'optional' || text.includes('可选')) return 'optional'
  return 'ok'
}

function toPointStatus(value: unknown): PointStatus {
  const text = toText(value).toLowerCase()
  if (text === 'hit' || text.includes('命中') || text.includes('正确')) return 'hit'
  if (text === 'partial' || text.includes('部分')) return 'partial'
  if (text === 'mistranslated' || text.includes('误译')) return 'mistranslated'
  if (text === 'missed' || text.includes('漏译') || text.includes('漏')) return 'missed'
  if (text === 'over' || text.includes('多译')) return 'over'
  return 'partial'
}

/* -------------------------------------------------------------------------- */
/*  逐句                                                                       */
/* -------------------------------------------------------------------------- */

function normalizeEssaySentences(raw: unknown): EssaySentence[] {
  if (!Array.isArray(raw)) return []

  return raw.map((item, i) => {
    const s = (item ?? {}) as Record<string, unknown>
    return {
      index: toNumber(s.index, i + 1),
      original: toText(s.original),
      problems: toTextList(s.problems),
      revised: toText(s.revised) || toText(s.original),
      explanation: toText(s.explanation),
      level: toLevel(s.level),
      labels: toTextList(s.labels),
    }
  })
}

function normalizeTranslationSentences(raw: unknown): TranslationSentence[] {
  if (!Array.isArray(raw)) return []

  return raw.map((item, i) => {
    const s = (item ?? {}) as Record<string, unknown>
    const points: TranslationPoint[] = Array.isArray(s.points)
      ? s.points.map((p, pi) => {
          const point = (p ?? {}) as Record<string, unknown>
          return {
            point: toText(point.point) || `采分点 ${pi + 1}`,
            meaning: toText(point.meaning),
            score: toNumber(point.score),
            earned: toNumber(point.earned),
            yourRendering: toText(point.yourRendering),
            status: toPointStatus(point.status),
            note: toText(point.note),
          }
        })
      : []

    return {
      index: toNumber(s.index, i + 1),
      original: toText(s.original),
      score: toNumber(s.score),
      points,
      problems: toTextList(s.problems),
      explanation: toText(s.explanation),
      yourTranslation: toText(s.yourTranslation),
      revised: toText(s.revised),
      level: toLevel(s.level),
    }
  })
}

/* -------------------------------------------------------------------------- */
/*  主入口                                                                     */
/* -------------------------------------------------------------------------- */

export interface NormalizeResult {
  report: GradingReport
  diagnostics: ReportDiagnostic[]
}

export function normalizeReport(
  raw: unknown,
  taskType: TaskType,
): NormalizeResult {
  const spec = TASK_SPECS[taskType]
  const diagnostics: ReportDiagnostic[] = []
  const r = (raw ?? {}) as Record<string, unknown>

  /* —— 维度分 —— */
  const rawDims = Array.isArray(r.dimensions) ? r.dimensions : []
  const byKey = new Map<string, Record<string, unknown>>()
  for (const d of rawDims) {
    const item = (d ?? {}) as Record<string, unknown>
    const key = toText(item.key).trim()
    if (key) byKey.set(key, item)
  }

  const dimensions: DimensionScore[] = spec.dimensions.map((dim) => {
    const found = byKey.get(dim.key)
    if (!found) {
      diagnostics.push({
        level: 'warn',
        message: `模型没有给出「${dim.name}」这一维度的分数，已按 0 分显示。若经常出现，建议在细则里再强调一次维度清单。`,
      })
    }
    const score = Math.max(0, Math.min(dim.max, toNumber(found?.score)))
    return {
      key: dim.key,
      score,
      comment: toText(found?.comment),
      evidence: toTextList(found?.evidence),
    }
  })

  const dimSum = dimensions.reduce((sum, d) => sum + d.score, 0)
  let total = toNumber(r.total, dimSum)

  if (Math.abs(dimSum - total) > 0.01) {
    diagnostics.push({
      level: 'warn',
      message: `模型给的总分 ${total} 与四个维度之和 ${dimSum} 对不上。报告以维度分之和为准（${dimSum} 分），总分已按此校正。`,
    })
    total = dimSum
  }

  total = Math.max(0, Math.min(spec.total, total))

  /* —— 档位 —— */
  const rawBand = toText(r.band)
  const matchedBand = spec.bands.find((b) => total >= b.min && total <= b.max)
  let band = rawBand
  if (!band) {
    band = matchedBand ? `${matchedBand.label} ${matchedBand.min}–${matchedBand.max}` : ''
  } else if (matchedBand) {
    // 档位与分数冲突时以分数为准，并提示
    const bandText = band
    const claimed = spec.bands.find((b) => bandText.includes(String(b.min)))
    if (claimed && (total < claimed.min || total > claimed.max)) {
      diagnostics.push({
        level: 'warn',
        message: `模型声称档位为「${bandText}」，但总分 ${total} 落在「${matchedBand.label} ${matchedBand.min}–${matchedBand.max}」。已按分数重新标注档位。`,
      })
      band = `${matchedBand.label} ${matchedBand.min}–${matchedBand.max}`
    }
  }

  /* —— 通用字段 —— */
  const base = {
    band,
    total,
    isOnTopic: r.isOnTopic === true || toText(r.isOnTopic) === 'true',
    topicNote: toText(r.topicNote),
    dimensions,
    revisedWordCount: toNumber(r.revisedWordCount),
    phrases: Array.isArray(r.phrases)
      ? (r.phrases as Record<string, unknown>[]).map((p) => {
          const item = (p ?? {}) as Record<string, unknown>
          return {
            phrase: toText(item.phrase),
            meaning: toText(item.meaning),
            usage: toText(item.usage),
            scene: toText(item.scene),
          } satisfies PhraseItem
        })
      : [],
    structure: {
      outline: toTextList((r.structure as Record<string, unknown> | undefined)?.outline),
      frameworks: Array.isArray((r.structure as Record<string, unknown> | undefined)?.frameworks)
        ? ((r.structure as Record<string, unknown>).frameworks as Record<string, unknown>[]).map(
            (f) => ({
              name: toText((f ?? {}).name),
              example: toText((f ?? {}).example),
            }),
          )
        : [],
    },
    topFixes: toTextList(r.topFixes),
    practice: toTextList(r.practice),
    notes: toTextList(r.notes),
  }

  /* —— 逐句 —— */
  if (spec.reportMode === 'translation') {
    const sentences = normalizeTranslationSentences(r.sentences)

    if (sentences.length === 0) {
      diagnostics.push({ level: 'warn', message: '模型没有返回逐句结果，本次无法按采分点展示。' })
    } else {
      const sentenceSum = sentences.reduce((sum, s) => sum + s.score, 0)
      const typo = (r.typoDeduction ?? {}) as Record<string, unknown>
      const typoDeducted = toNumber(typo.deducted)

      const expected = Math.max(0, sentenceSum - typoDeducted)
      if (Math.abs(expected - total) > 0.51) {
        diagnostics.push({
          level: 'warn',
          message: `各句得分合计 ${sentenceSum} 分、错别字扣 ${typoDeducted} 分，与总分 ${total} 不一致。已以总分显示，逐句得分保持模型原值，请对照检查。`,
        })
      }
    }

    return {
      report: {
        ...base,
        sentences,
        revisedEssay: toText(r.revisedEssay),
        typoDeduction: {
          count: toNumber((r.typoDeduction as Record<string, unknown> | undefined)?.count),
          deducted: toNumber((r.typoDeduction as Record<string, unknown> | undefined)?.deducted),
          note: toText((r.typoDeduction as Record<string, unknown> | undefined)?.note),
        },
      },
      diagnostics,
    }
  }

  const sentences = normalizeEssaySentences(r.sentences)
  if (sentences.length === 0) {
    diagnostics.push({ level: 'warn', message: '模型没有返回逐句批改，本次只有总评。' })
  }

  return {
    report: {
      ...base,
      sentences,
      revisedEssay: toText(r.revisedEssay),
    },
    diagnostics,
  }
}

/* -------------------------------------------------------------------------- */
/*  展示用小工具                                                               */
/* -------------------------------------------------------------------------- */

export const LEVEL_LABEL: Record<FeedbackLevel, string> = {
  must: '必须修改',
  optional: '可选优化',
  ok: '正确无误',
}

export function countByLevel(sentences: { level: FeedbackLevel }[]): {
  must: number
  optional: number
  ok: number
} {
  return {
    must: sentences.filter((s) => s.level === 'must').length,
    optional: sentences.filter((s) => s.level === 'optional').length,
    ok: sentences.filter((s) => s.level === 'ok').length,
  }
}
