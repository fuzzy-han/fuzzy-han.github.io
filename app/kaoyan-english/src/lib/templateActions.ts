/* ==========================================================================
   模板相关的 UI 动作封装
   放在单独文件里，避免页面组件直接依赖引擎内部的类型细节。
   ========================================================================== */

import { generateTemplates as runExtraction, type TemplateGenerationResult } from './templateEngine'
import type { AppSettings, ModelConfig } from '@/types/domain'
import type { StoredReport } from './reports'
import type { WritingTemplate } from '@/types/template'

export type { TemplateGenerationResult }

export async function generateTemplates(
  report: StoredReport,
  model: ModelConfig,
  settings: AppSettings,
  existing: WritingTemplate[],
  signal?: AbortSignal,
): Promise<TemplateGenerationResult> {
  return runExtraction(report, model, settings, existing, signal)
}
