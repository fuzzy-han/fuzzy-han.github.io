/* ==========================================================================
   模板库持久化
   模板数量会随时间累积（几十到几百条），放 IndexedDB 而不是 localStorage。
   ========================================================================== */

import { closeDB, idb, makeId, STORES } from './storage'
import type { TemplateCategory, WritingTemplate } from '@/types/template'

export async function listTemplates(): Promise<WritingTemplate[]> {
  const rows = await idb.getAll<WritingTemplate>(STORES.templates)
  // 「反复出现」优先，其次最近更新 —— 与记忆优先级一致
  return rows.sort((a, b) => b.recurrence - a.recurrence || b.updatedAt - a.updatedAt)
}

export async function saveTemplate(template: WritingTemplate): Promise<void> {
  await idb.put(STORES.templates, template)
}

/** 批量写入（合并后整体覆盖） */
export async function saveTemplates(templates: WritingTemplate[]): Promise<void> {
  for (const template of templates) {
    await idb.put(STORES.templates, template)
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  await idb.delete(STORES.templates, id)
}

export async function clearTemplates(): Promise<void> {
  closeDB()
  await idb.clear(STORES.templates)
}

/** 取某个分类下的模板 */
export async function listTemplatesByCategory(
  category: TemplateCategory,
): Promise<WritingTemplate[]> {
  const all = await listTemplates()
  return all.filter((t) => t.category === category)
}

/** 手动新建一条模板 */
export function createBlankTemplate(category: TemplateCategory = 'phrase'): WritingTemplate {
  const now = Date.now()
  return {
    id: makeId('tpl'),
    createdAt: now,
    updatedAt: now,
    category,
    title: '',
    body: '',
    meaning: '',
    usage: '',
    scene: '',
    example: '',
    wrongExample: '',
    problemTags: [],
    taskTypes: [],
    recurrence: 1,
    sourceReportIds: [],
    origin: 'manual',
  }
}
