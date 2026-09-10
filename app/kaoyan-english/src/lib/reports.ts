/* ==========================================================================
   批改报告的持久化（IndexedDB）

   单份报告含逐句 JSON，几百 KB 很常见，放 localStorage 会撑爆 5MB 配额，
   因此报告走 IndexedDB，设置与细则仍留在 localStorage。
   ========================================================================== */

import { idb, STORES, makeId } from './storage'
import type { TaskType } from '@/types/domain'
import type { GradingReport } from '@/types/report'
import type { ReportDiagnostic } from './report'

export interface StoredReport {
  id: string
  createdAt: number
  taskType: TaskType
  /** 学生输入的快照，便于复看与二次批改 */
  input: {
    year: string
    prompt: string
    essay: string
    extras: string
    reference?: string
    transcriptionNote?: string
  }
  report: GradingReport
  diagnostics: ReportDiagnostic[]
  meta: {
    modelLabel: string
    provider: string
    modelName: string
    elapsedMs: number
    totalTokens: number | null
    retried: boolean
    repaired: boolean
  }
}

export async function saveReport(
  draft: Omit<StoredReport, 'id' | 'createdAt'>,
): Promise<StoredReport> {
  const record: StoredReport = { ...draft, id: makeId('report'), createdAt: Date.now() }
  await idb.put(STORES.reports, record)
  return record
}

export async function listReports(): Promise<StoredReport[]> {
  const rows = await idb.getAll<StoredReport>(STORES.reports)
  return rows.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getReport(id: string): Promise<StoredReport | null> {
  return idb.get<StoredReport>(STORES.reports, id)
}

export async function deleteReport(id: string): Promise<void> {
  await idb.delete(STORES.reports, id)
}

export async function clearReports(): Promise<void> {
  await idb.clear(STORES.reports)
}
