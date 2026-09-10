/* ==========================================================================
   模板提炼引擎 —— 从一次批改里提炼出可复用的写作资产

   设计要点：
   1. 只喂「报告 + 学生原文」。报告里已有逐句问题、修改句、表达积累、复盘，
      提炼的本质是把这些整理成「离开这篇文章也能用」的形态。
   2. 强制要求学生自己的例句。让他记住的是自己写过的句子，
      比教科书例句更容易回忆起来。
   3. 入库前做合并：同类问题再次出现时累加 recurrence，而不是堆一堆重复条目 ——
      这就是「反复出现的问题」这个信号从哪来。
   ========================================================================== */

import { chatComplete, ApiError } from './api'
import { extractJson } from './json'
import { mergeDrafts } from './templateMerge'
import { TASK_SPECS } from './tasks'
import {
  TEMPLATE_CATEGORIES,
  isTemplateCategory,
  type DraftTemplate,
  type WritingTemplate,
} from '@/types/template'
import type { AppSettings, ModelConfig } from '@/types/domain'
import type { StoredReport } from './reports'
export { mergeDrafts } from './templateMerge'
import type { EssaySentence, TranslationSentence } from '@/types/report'

export interface TemplateGenerationResult {
  /** 本次提炼出的原始模板（预览用） */
  drafts: DraftTemplate[]
  /** 合并后的完整模板集合（已含旧模板） */
  templates: WritingTemplate[]
  /** 与已有模板合并的条数 */
  merged: number
  /** 新增的条数 */
  added: number
  elapsedMs: number
  totalTokens: number | null
}

/* -------------------------------------------------------------------------- */
/*  Prompt                                                                     */
/* -------------------------------------------------------------------------- */

const CATEGORY_LIST = TEMPLATE_CATEGORIES.map((c) => `- ${c.key}：${c.name}（${c.desc}）`).join('\n')

function buildExtractionPrompt(report: StoredReport): string {
  const spec = TASK_SPECS[report.taskType]
  const isTranslation = spec.reportMode === 'translation'

  return `你是一位考研英语写作教练。请从下面这次批改里，提炼出**学生以后能直接复用**的写作模板。

## 分类（category 只能取以下之一）
${CATEGORY_LIST}

## 提炼原则
1. **只提炼能离开这篇文章独立使用的**东西。不要复述这篇作文的内容。
1.1 **标题要「可归类」**：同一类知识点在不同文章里请用同一个标题。
    例如统一写「图画作文三段式框架」「表达合作精神」「主谓一致」，
    不要这次写「三段结构模板」、下次写「图画作文的组织方式」——
    标题一致才能被合并成一条，次数累计起来才看得出哪个问题反复出现。
2. **优先学生自己的句子**。example 字段尽量引用学生原文或批改后的修改句——
   记自己写过的句子比记范文容易得多。
3. **只挑真正值得记的**，3–6 条足够。宁少勿滥，不要为了凑数把常识性内容也列进来。
4. 如果是学生**反复犯的错误**，wrongExample 填错的那句、body 填正确写法，
   problemTags 填问题类型（如 主谓一致 / 时态 / 搭配 / 中式表达 / 指代 / 衔接）。
5. meaning 用中文，body 保留英文（翻译题除外，翻译题用中文记技巧）。
6. usage 写清「怎么用、注意什么」，不要说空话。
7. scene 写适用场景，例如「描述图表趋势」「论证段开头」「书信结尾」。

## 输出格式
只输出 JSON 本体，不要解释文字，不要 \`\`\` 代码块：
{
  "templates": [
    {
      "category": "${TEMPLATE_CATEGORIES[0].key}",
      "title": "一句话说清这是什么，例如「表达合作精神的三种写法」",
      "body": "可复用的英文句式或搭配本身",
      "meaning": "中文释义",
      "usage": "用法说明与注意事项",
      "scene": "适用场景",
      "example": "完整例句，优先取学生自己的句子",
      "wrongExample": "学生写错的原句；本条不是纠错类则填空字符串",
      "problemTags": ["问题类型标签，没有则空数组"]
    }
  ]
}

## 本次批改（题型：${spec.name}，得分 ${report.report.total}/${spec.total}，档位 ${report.report.band}）

### 学生原文
${report.input.essay.slice(0, 3000)}

### 逐句批改
${formatSentences(report, isTranslation)}

### 修改后全文
${report.report.revisedEssay.slice(0, 2000)}

### 表达积累（批改已挑出的）
${report.report.phrases.map((p) => `- ${p.phrase}：${p.meaning}（${p.usage}）`).join('\n') || '（无）'}

### 最需改进的问题
${report.report.topFixes.map((f, i) => `${i + 1}. ${f}`).join('\n') || '（无）'}

请开始提炼。`
}

/** 把逐句批改压缩成紧凑文本，省 token 又保留关键信息 */
function formatSentences(report: StoredReport, isTranslation: boolean): string {
  if (isTranslation) {
    const items = report.report.sentences as TranslationSentence[]
    return (
      items
        .map((s) => {
          const points = s.points
            .map((p) => `    采分点[${p.status}] ${p.point} → ${p.meaning}（${p.earned}/${p.score}）`)
            .join('\n')
          return `  ${s.index}. 原句：${s.original}\n     我的译文：${s.yourTranslation}\n     修改译文：${s.revised}\n${points}\n     问题：${s.problems.join('；') || '无'}`
        })
        .join('\n') || '（无）'
    )
  }

  const items = report.report.sentences as EssaySentence[]
  return (
    items
      .map(
        (s) =>
          `  ${s.index}. [${s.level}] ${s.original}\n     修改：${s.revised}\n     问题：${s.problems.join('；') || '无'}\n     标签：${s.labels.join('/') || '无'}`,
      )
      .join('\n') || '（无）'
  )
}

/* -------------------------------------------------------------------------- */
/*  解析                                                                       */
/* -------------------------------------------------------------------------- */

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(toText).filter(Boolean).slice(0, 6)
}

function parseDrafts(raw: unknown): DraftTemplate[] {
  const container = (raw ?? {}) as Record<string, unknown>
  const list = Array.isArray(container.templates)
    ? container.templates
    : Array.isArray(raw)
      ? (raw as unknown[])
      : []

  return list
    .map((item) => {
      const t = (item ?? {}) as Record<string, unknown>
      return {
        category: isTemplateCategory(t.category) ? t.category : ('phrase' as const),
        title: toText(t.title),
        body: toText(t.body),
        meaning: toText(t.meaning),
        usage: toText(t.usage),
        scene: toText(t.scene),
        example: toText(t.example),
        wrongExample: toText(t.wrongExample),
        problemTags: toTags(t.problemTags),
      }
    })
    .filter((d) => d.title && d.body)
}

/* -------------------------------------------------------------------------- */
/*  合并去重                                                                   */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  执行提炼                                                                   */
/* -------------------------------------------------------------------------- */

export async function generateTemplates(
  report: StoredReport,
  model: ModelConfig,
  settings: AppSettings,
  existing: WritingTemplate[],
  signal?: AbortSignal,
): Promise<TemplateGenerationResult> {
  const startedAt = Date.now()
  const prompt = buildExtractionPrompt(report)

  /* 与批改一致：靠服务商层的 JSON 模式，而不是 assistant 预填充 */
  const res = await chatComplete({
    model,
    settings: {
      transport: settings.transport,
      proxyBaseUrl: settings.proxyBaseUrl,
      proxyToken: settings.proxyToken,
      timeoutSec: settings.timeoutSec,
    },
    messages: [
      { role: 'system', content: '你是一位严谨的考研英语写作教练，只输出要求的 JSON。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.4,
    maxTokens: 8192,
    jsonMode: true,
    signal,
  })

  const parsed = extractJson(res.content)
  if (!parsed.ok) {
    throw new ApiError(
      `模板提炼结果无法解析为 JSON（${parsed.error}）。可换用更强的模型重试。`,
      undefined,
      parsed.json,
    )
  }

  const drafts = parseDrafts(parsed.value)
  if (drafts.length === 0) {
    throw new ApiError('这次没有提炼出可复用的模板。可能这篇作文的问题太零散，或报告内容不足。')
  }

  const { templates, merged, added } = mergeDrafts(drafts, existing, {
    reportId: report.id,
    taskType: report.taskType,
  })

  return {
    drafts,
    templates,
    merged,
    added,
    elapsedMs: Date.now() - startedAt,
    totalTokens: res.usage.totalTokens,
  }
}
