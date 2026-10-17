/* ==========================================================================
   备份的读写：把散在三处的使用者数据收拢成一份文件，再还原回去

   数据分散情况（这也是问题本身）：
     · localStorage  → 设置、模型配置、评分细则、输入草稿、掌握标记
     · IndexedDB     → 批改记录、模板
     · 网络          → 词表缓存（可重新下载，不进备份）

   只导出第一处里的一部分，使用者换浏览器时就会丢掉批改记录与总结，
   而界面上「导出成功」的提示完全正常，属于最难被发现的缺陷。
   ========================================================================== */

import { BACKED_UP_LS_KEYS, LS_KEYS, STORES, idb, readJSON, readUserData, replaceUserData } from './storage'
import { useConfigStore, DEFAULT_SETTINGS, buildDefaultRubrics } from '@/app/store'
import type { AppSettings, Rubric, TaskType } from '@/types/domain'
import type { StoredReport } from './reports'
import type { WritingTemplate } from '@/types/template'
import {
  BACKUP_KIND,
  BACKUP_VERSION,
  backupFilename,
  emptyBackup,
  mergeDrafts,
  mergeMastery,
  mergeReports,
  mergeTemplates,
  stripSecrets,
  type BackupPayload,
  type DraftMap,
} from './backup'

/* -------------------------------------------------------------------------- */
/*  采集                                                                      */
/* -------------------------------------------------------------------------- */

export interface CollectOptions {
  /** 是否把 API Key 一并写进文件（默认否） */
  includeSecrets?: boolean
}

/**
 * 收集当前浏览器里的全部使用者数据。
 * 任何用户数据读取失败均中止导出，避免把失败误报为空历史。
 */
function readBackupJSON<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  try { return JSON.parse(raw) as T }
  catch { throw new Error(`本机数据 ${key} 无法解析，请先修复后再备份`) }
}

export async function collectBackup(options: CollectOptions = {}): Promise<BackupPayload> {
  const { includeSecrets = false } = options
  const state = useConfigStore.getState()

  const data = await readUserData()
  const reports = data.reports as StoredReport[]
  const templates = data.templates as WritingTemplate[]

  return {
    ...emptyBackup(),
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    includesSecrets: includeSecrets,
    settings: { ...state.settings, proxyToken: includeSecrets ? state.settings.proxyToken : '' },
    models: includeSecrets ? state.models : stripSecrets(state.models),
    rubrics: state.rubrics,
    drafts: readBackupJSON<DraftMap>(LS_KEYS.drafts, {}),
    mastery: {
      templates: readBackupJSON<Record<string, boolean>>(LS_KEYS.templateMastered, {}),
      words: readBackupJSON<Record<string, boolean>>(LS_KEYS.vocabMastered, {}),
    },
    reports: [...reports].sort((a, b) => b.createdAt - a.createdAt),
    templates,
  }
}

/* -------------------------------------------------------------------------- */
/*  还原                                                                      */
/* -------------------------------------------------------------------------- */

export type ImportMode = 'merge' | 'replace'

export interface ApplyResult {
  reports: number
  templates: number
  drafts: number
  wordsMastered: number
  templatesMastered: number
  warnings: string[]
}

/**
 * 把备份写回本机。
 *
 * 两种模式的区别是使用者真正需要选择的那个问题：
 *   · merge   —— 与现有数据合并，谁都不丢（默认，用于「换浏览器后把旧记录搬过来」）
 *   · replace —— 完全以备份为准（用于「把一台机器恢复成备份时的样子」）
 * 合并模式之所以是默认值，是因为它的失败方式是「多了一点数据」，
 * 而覆盖模式的失败方式是「少了一整批记录」。
 */
export async function applyBackup(
  payload: BackupPayload,
  mode: ImportMode = 'merge',
): Promise<ApplyResult> {
  const warnings: string[] = []
  const state = useConfigStore.getState()
  const data = await readUserData()
  const existingModels = new Map(state.models.map(model => [model.id, model]))
  const importedModels = payload.models.map(model => ({
    ...model,
    apiKey: !payload.includesSecrets && mode === 'merge'
      ? existingModels.get(model.id)?.apiKey || model.apiKey || '' : model.apiKey || '',
  }))
  const models = mode === 'merge'
    ? [...new Map([...state.models, ...importedModels].map(model => [model.id, model])).values()]
    : importedModels
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS, ...(mode === 'merge' ? state.settings : {}), ...payload.settings,
  }
  if (!payload.includesSecrets && mode === 'merge') settings.proxyToken = state.settings.proxyToken
  if (!models.some(model => model.id === settings.defaultModelId)) settings.defaultModelId = models[0]?.id ?? null
  const rubrics = { ...(mode === 'merge' ? state.rubrics : buildDefaultRubrics()), ...payload.rubrics } as Record<TaskType, Rubric>
  // Old configuration-only backups must never erase history, even in replace mode.
  const configurationOnly = payload.version === 1
  if (configurationOnly) warnings.push('旧版备份只恢复配置，现有历史、模板、草稿和掌握标记已保留')
  const keep = mode === 'merge' || configurationOnly
  const drafts = keep ? mergeDrafts(readJSON<DraftMap>(LS_KEYS.drafts, {}), payload.drafts) : payload.drafts
  const wordsMastered = keep ? mergeMastery(readJSON(LS_KEYS.vocabMastered, {}), payload.mastery.words) : payload.mastery.words
  const templatesMastered = keep ? mergeMastery(readJSON(LS_KEYS.templateMastered, {}), payload.mastery.templates) : payload.mastery.templates
  const reports = mergeReports(keep ? data.reports as StoredReport[] : [], payload.reports)
  const templates = mergeTemplates(keep ? data.templates as WritingTemplate[] : [], payload.templates)
  // Zustand uses LS_KEYS.settings for its persisted envelope.
  const config = { state: { settings, models, rubrics }, version: 1 }
  await replaceUserData(reports, templates, {
    [LS_KEYS.settings]: config,
    [LS_KEYS.drafts]: drafts,
    [LS_KEYS.vocabMastered]: wordsMastered,
    [LS_KEYS.templateMastered]: templatesMastered,
  })
  // Data is durable before notifying React; persistence has already been checked.
  useConfigStore.setState({ settings, models, rubrics })

  return {
    reports: reports.length,
    templates: templates.length,
    drafts: Object.keys(drafts).length,
    wordsMastered: Object.values(wordsMastered).filter(Boolean).length,
    templatesMastered: Object.values(templatesMastered).filter(Boolean).length,
    warnings,
  }
}

/* -------------------------------------------------------------------------- */
/*  下载                                                                      */
/* -------------------------------------------------------------------------- */

export function downloadBackup(payload: BackupPayload): string {
  const name = backupFilename()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 立刻回收会让部分浏览器拿到空文件，延迟释放
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return name
}

/** 当前本机数据的条数，用于在设置页显示「你有什么可备份」 */
export async function localCounts(): Promise<{ reports: number; templates: number }> {
  const [reports, templates] = await Promise.all([
    idb.getAll<StoredReport>(STORES.reports),
    idb.getAll<WritingTemplate>(STORES.templates),
  ])
  return { reports: reports.length, templates: templates.length }
}

export { BACKED_UP_LS_KEYS }
