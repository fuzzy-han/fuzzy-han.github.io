/* ==========================================================================
   备份文件的格式与合并规则

   为什么把「格式」与「读写」拆成两个文件（本文件 vs backupIO.ts）：
   合并规则写错时不会报错、也不会崩溃，唯一的表现是「导入之后记录少了」，
   而这种少是静默的 —— 用户以为自己备份好了，换台电脑才发现批改记录全没了。
   把纯函数单独放，就可以直接在 Node 里跑断言把每一条规则钉死，
   不必每次都启动浏览器。

   备份包含什么，是本文件最重要的设计决定：
   平台的数据分散在三处 —— localStorage（设置、草稿、掌握标记）、
   IndexedDB（批改记录、模板）、以及可再下载的词表缓存。
   一开始只导出了第一处里最小的那部分（模型与细则），
   结果换浏览器时批改记录与总结全部丢失。因此这里的原则是：
   凡是使用者自己产生的数据一律进备份，凡是能重新获取的一律不进。
   词表缓存属于后者（1.1 MB，重新下载即可），因此被显式排除。
   ========================================================================== */

import type { AppSettings, ModelConfig, Rubric, TaskType } from '@/types/domain'
import type { StoredReport } from './reports'
import type { WritingTemplate } from '@/types/template'

/* -------------------------------------------------------------------------- */
/*  格式                                                                      */
/* -------------------------------------------------------------------------- */

export const BACKUP_KIND = 'kaoyan-writing-coach-backup'

/**
 * 版本 1：只有设置、模型配置与评分细则。
 * 版本 2：补上批改记录、模板、输入草稿与掌握标记，并保留逐句批改结论。
 */
export const BACKUP_VERSION = 2

/** 批改台草稿：按题型存一份，含上传的题目/作文图片 */
export type DraftMap = Record<string, unknown>

export interface MasteryMap {
  /** 模板 id → 已掌握 */
  templates: Record<string, boolean>
  /** 单词 → 已掌握 */
  words: Record<string, boolean>
}

export interface BackupPayload {
  kind: string
  version: number
  exportedAt: string
  includesSecrets: boolean
  settings: Partial<AppSettings>
  models: ModelConfig[]
  rubrics: Partial<Record<TaskType, Rubric>>
  drafts: DraftMap
  mastery: MasteryMap
  reports: StoredReport[]
  templates: WritingTemplate[]
}

export function emptyMastery(): MasteryMap {
  return { templates: {}, words: {} }
}

export function emptyBackup(): BackupPayload {
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date(0).toISOString(),
    includesSecrets: false,
    settings: {},
    models: [],
    rubrics: {},
    drafts: {},
    mastery: emptyMastery(),
    reports: [],
    templates: [],
  }
}

/* -------------------------------------------------------------------------- */
/*  校验                                                                      */
/* -------------------------------------------------------------------------- */

export type ParseResult =
  | { ok: true; payload: BackupPayload; warnings: string[] }
  | { ok: false; reason: string }

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asBoolMap(value: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const [key, flag] of Object.entries(asRecord(value))) {
    if (flag === true) out[key] = true
  }
  return out
}

/**
 * 把任意 JSON 规范成一份可用的备份。
 * 不抛异常：导入的是文件，文件是用户给的，格式不可信。
 */
export function normalizeBackup(raw: unknown): ParseResult {
  const obj = asRecord(raw)

  if (obj.kind !== BACKUP_KIND) {
    return { ok: false, reason: '这不是本平台的备份文件' }
  }

  const version = obj.version === undefined ? 1 : obj.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, reason: '备份版本号无效' }
  if (version > BACKUP_VERSION) {
    return {
      ok: false,
      reason: `备份文件版本（v${version}）比当前程序更新，请先升级后再导入`,
    }
  }

  for (const field of ['settings', 'rubrics', 'drafts', 'mastery']) {
    if (obj[field] !== undefined && (!obj[field] || typeof obj[field] !== 'object' || Array.isArray(obj[field])))
      return { ok: false, reason: `备份中的 ${field} 格式错误，未导入任何数据` }
  }
  for (const field of ['models', 'reports', 'templates']) {
    if (obj[field] !== undefined && !Array.isArray(obj[field]))
      return { ok: false, reason: `备份中的 ${field} 必须是数组` }
  }
  if (version === 2 && ['settings', 'models', 'rubrics', 'drafts', 'mastery', 'reports', 'templates'].some(key => !(key in obj)))
    return { ok: false, reason: '完整备份缺少数据字段，请重新导出' }
  const settingTypes: Record<string, string> = {
    transport: 'string', proxyBaseUrl: 'string', proxyToken: 'string', timeoutSec: 'number',
    autoRetry: 'boolean', preferReliableJson: 'boolean', sentenceLevel: 'boolean',
    strictness: 'string', locale: 'string',
  }
  for (const [key, value] of Object.entries(asRecord(obj.settings))) {
    if ((settingTypes[key] && typeof value !== settingTypes[key]) ||
        (key === 'defaultModelId' && value !== null && typeof value !== 'string'))
      return { ok: false, reason: `设置 ${key} 格式错误` }
  }
  const tasks = ['eng1_big', 'eng1_small', 'eng1_translation']
  // Reject malformed records before any write; do not silently discard history.
  for (const entry of asArray<Record<string, unknown>>(obj.reports)) {
    const row = asRecord(entry)
    if (!row.id || typeof row.id !== 'string' || !Number.isFinite(row.createdAt) ||
        !tasks.includes(String(row.taskType)) || !row.input || !row.report)
      return { ok: false, reason: '批改记录格式不完整，未导入任何数据' }
  }
  for (const entry of asArray<Record<string, unknown>>(obj.templates)) {
    const row = asRecord(entry)
    if (!row.id || typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.body !== 'string' ||
        !Array.isArray(row.sourceReportIds) || !Array.isArray(row.taskTypes) || !Array.isArray(row.problemTags))
      return { ok: false, reason: '模板格式不完整，未导入任何数据' }
  }
  for (const entry of asArray<Record<string, unknown>>(obj.models)) {
    const row = asRecord(entry)
    if (!row.id || typeof row.id !== 'string' || typeof row.baseUrl !== 'string' || typeof row.model !== 'string')
      return { ok: false, reason: '模型配置格式不完整' }
  }
  for (const [task, value] of Object.entries(asRecord(obj.rubrics))) {
    const row = asRecord(value)
    if (!tasks.includes(task) || typeof row.content !== 'string' || !Array.isArray(row.versions))
      return { ok: false, reason: '评分细则格式不完整' }
  }
  const mastery = asRecord(obj.mastery)
  const reports = asArray<StoredReport>(obj.reports).filter((r) => r && typeof r.id === 'string')
  const templates = asArray<WritingTemplate>(obj.templates).filter(
    (t) => t && typeof t.id === 'string',
  )

  const warnings: string[] = []
  if (version < 2) {
    // 老版本备份里根本没有这两项，必须明说，否则用户会以为「批改记录导进来了」
    warnings.push('这是一份旧版备份，只含配置；其中的批改记录无法补出，请改用新版重新导出')
  }
  const droppedReports = asArray<unknown>(obj.reports).length - reports.length
  if (droppedReports > 0) {
    warnings.push(`有 ${droppedReports} 条批改记录缺少 id，已跳过`)
  }

  return {
    ok: true,
    warnings,
    payload: {
      kind: BACKUP_KIND,
      version,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
      includesSecrets: obj.includesSecrets === true,
      settings: asRecord(obj.settings) as Partial<AppSettings>,
      models: asArray<ModelConfig>(obj.models).filter((m) => m && typeof m.id === 'string'),
      rubrics: asRecord(obj.rubrics) as Partial<Record<TaskType, Rubric>>,
      drafts: asRecord(obj.drafts),
      mastery: {
        templates: asBoolMap(mastery.templates),
        words: asBoolMap(mastery.words),
      },
      reports,
      templates,
    },
  }
}

/* -------------------------------------------------------------------------- */
/*  统计（导入前先让使用者看清「这一份里到底有什么」）                          */
/* -------------------------------------------------------------------------- */

export interface BackupSummary {
  reports: number
  templates: number
  models: number
  rubricsFilled: number
  drafts: number
  wordsMastered: number
  templatesMastered: number
  /** 批改记录里带题目的条数 —— 即「用户提问信息」的条数 */
  withPrompt: number
  includesSecrets: boolean
}

export function summarizeBackup(payload: BackupPayload): BackupSummary {
  const rubrics = Object.values(payload.rubrics ?? {})
  return {
    reports: payload.reports.length,
    templates: payload.templates.length,
    models: payload.models.length,
    rubricsFilled: rubrics.filter((r) => r && r.filled !== false).length,
    drafts: Object.values(payload.drafts ?? {}).filter((d) => draftHasContent(d)).length,
    wordsMastered: Object.values(payload.mastery?.words ?? {}).filter(Boolean).length,
    templatesMastered: Object.values(payload.mastery?.templates ?? {}).filter(Boolean).length,
    withPrompt: payload.reports.filter((r) => Boolean(r?.input?.prompt?.trim())).length,
    includesSecrets: payload.includesSecrets,
  }
}

/* -------------------------------------------------------------------------- */
/*  合并规则                                                                  */
/* -------------------------------------------------------------------------- */

function union<T>(a: T[] | undefined, b: T[] | undefined): T[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])]
}

/** 合并视图状态：true 优先。已掌握的标记是使用者的劳动成果，不能被覆盖成未掌握 */
export function mergeMastery(old: Record<string, boolean>, incoming: Record<string, boolean>) {
  const out: Record<string, boolean> = { ...old }
  for (const [key, flag] of Object.entries(incoming ?? {})) {
    if (flag || !(key in out)) out[key] = Boolean(flag)
  }
  return out
}

/**
 * 合并批改记录：按 id 去重。
 * 同一条（同 id）以导入的一方为准 —— 导出方是使用者主动选定的那一份。
 */
export function mergeReports(
  old: StoredReport[],
  incoming: StoredReport[],
): StoredReport[] {
  const byId = new Map<string, StoredReport>()
  for (const row of old) byId.set(row.id, row)
  for (const row of incoming) byId.set(row.id, row)
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * 合并模板：按 id 去重，但**字段级**取并集。
 *
 * 为什么不像批改记录那样整条覆盖：
 * 模板身上挂着使用者的操作痕迹 —— 出现次数、来源记录、掌握标记。
 * 整条覆盖会让「同一问题反复出现」的次数归零，而次数正是记忆优先级的依据。
 * 内容字段则以手动编辑过的一方优先，避免使用者的改动被自动提炼覆盖。
 */
export function mergeTemplates(
  old: WritingTemplate[],
  incoming: WritingTemplate[],
): WritingTemplate[] {
  const byId = new Map<string, WritingTemplate>()
  for (const row of old) byId.set(row.id, row)

  for (const row of incoming) {
    const prev = byId.get(row.id)
    if (!prev) {
      byId.set(row.id, row)
      continue
    }

    const content =
      prev.edited && !row.edited
        ? prev
        : row.edited && !prev.edited
          ? row
          : (row.updatedAt ?? 0) >= (prev.updatedAt ?? 0)
            ? row
            : prev

    byId.set(row.id, {
      ...content,
      recurrence: Math.max(prev.recurrence ?? 1, row.recurrence ?? 1),
      sourceReportIds: union(prev.sourceReportIds, row.sourceReportIds),
      problemTags: union(prev.problemTags, row.problemTags),
      taskTypes: union(prev.taskTypes, row.taskTypes),
      edited: Boolean(prev.edited || row.edited),
      updatedAt: Math.max(prev.updatedAt ?? 0, row.updatedAt ?? 0),
      createdAt: Math.min(prev.createdAt ?? Infinity, row.createdAt ?? Infinity),
    })
  }

  return [...byId.values()].sort(
    (a, b) => (b.recurrence ?? 0) - (a.recurrence ?? 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  )
}

function pickLongerText(a: unknown, b: unknown): string {
  const sa = typeof a === 'string' ? a : ''
  const sb = typeof b === 'string' ? b : ''
  return sb.trim().length >= sa.trim().length ? sb : sa
}

function pickLongerList<T>(a: unknown, b: unknown): T[] {
  const la = Array.isArray(a) ? (a as T[]) : []
  const lb = Array.isArray(b) ? (b as T[]) : []
  return lb.length >= la.length ? lb : la
}

export function draftHasContent(draft: unknown): boolean {
  const d = asRecord(draft)
  const texts = ['year', 'prompt', 'essay', 'extras', 'reference', 'transcriptionNote']
  if (texts.some((k) => typeof d[k] === 'string' && (d[k] as string).trim().length > 0)) return true
  return ['promptImages', 'essayImages'].some((k) => Array.isArray(d[k]) && (d[k] as unknown[]).length > 0)
}

/**
 * 合并输入草稿：逐字段取「内容更多」的一方。
 *
 * 这里刻意不做整块覆盖。草稿里放的是使用者粘贴的题目、作文与拍下来的照片，
 * 是重建一次批改所必需的原始输入；用一份空草稿覆盖掉它，
 * 就等于把「用户提问信息」删了 —— 而这正是本模块要解决的问题。
 */
export function mergeDrafts(old: DraftMap, incoming: DraftMap): DraftMap {
  const out: DraftMap = { ...old }
  for (const [task, draft] of Object.entries(incoming ?? {})) {
    const prev = asRecord(out[task])
    const next = asRecord(draft)
    // 新草稿若整条为空，直接保留旧的（不必逐字段比）
    if (!draftHasContent(next) && draftHasContent(prev)) continue

    out[task] = {
      ...prev,
      ...next,
      year: pickLongerText(prev.year, next.year),
      prompt: pickLongerText(prev.prompt, next.prompt),
      essay: pickLongerText(prev.essay, next.essay),
      extras: pickLongerText(prev.extras, next.extras),
      reference: pickLongerText(prev.reference, next.reference),
      transcriptionNote: pickLongerText(prev.transcriptionNote, next.transcriptionNote),
      promptImages: pickLongerList(prev.promptImages, next.promptImages),
      essayImages: pickLongerList(prev.essayImages, next.essayImages),
    }
  }
  return out
}

/* -------------------------------------------------------------------------- */
/*  导出前的脱敏                                                              */
/* -------------------------------------------------------------------------- */

/** 去掉 API Key；批改记录与草稿原样保留（它们不含密钥） */
export function stripSecrets(models: ModelConfig[]): ModelConfig[] {
  return models.map((m) => ({ ...m, apiKey: '' }))
}

export function backupFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `砚台备份-${stamp}.json`
}
