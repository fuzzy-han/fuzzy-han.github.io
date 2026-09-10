/* ==========================================================================
   模板合并去重（纯函数，零依赖）

   单独成文件的原因：
   · 需要被 Node 单测直接引用，不能牵进 api.ts 那条依赖链
   · 合并规则是这套「反复出现」信号的核心，值得独立测

   为什么要合并而不是每次都新增：真实模型每次提炼的措辞都有出入，
   不做合并的话模板库很快被同义重复项淹没，「哪个问题反复出现」这个信号就没了。
   ========================================================================== */

import type { DraftTemplate, WritingTemplate } from '@/types/template'
import type { TaskType } from '@/types/domain'

/**
 * 生成本地 id。
 * 刻意内联而不从 storage.ts 引：那个模块会拉起 localStorage / IndexedDB 的依赖链，
 * 一旦引进来，这个纯逻辑模块就没法在 Node 里直接单测了。
 */
function newId(): string {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 归一化：用于判断两个模板是不是同一个东西。
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!?'"“”‘’()\[\]{}—–\-、。，；：！？（）《》〈〉「」『』…·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 按空白切词的集合（英文有效） */
function wordSet(text: string): Set<string> {
  return new Set(normalize(text).split(' ').filter((t) => t.length > 0))
}

/**
 * 字符 3-gram 集合。中文没有空格，按词切会把整句算成一个 token，
 * 导致「结构模板」和「结构模板（图画作文）」被判为毫不相干 —— 实测就是这么漏合并的。
 * 3-gram 对中文和英文都有效，且对语序变化不敏感。
 */
function trigramSet(text: string): Set<string> {
  const flat = normalize(text).replace(/\s/g, '')
  const grams = new Set<string>()
  for (let i = 0; i + 3 <= flat.length; i += 1) grams.add(flat.slice(i, i + 3))
  return grams
}

/** Jaccard 相似度 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let common = 0
  for (const token of a) if (b.has(token)) common += 1
  return common / (a.size + b.size - common)
}

/**
 * 综合相似度：词集合与 3-gram 取较大值。
 *
 * 只用词集合时中文完全失效；只用 3-gram 时短英文搭配容易误判。
 * 取较大值让两种语言都能正确合并。
 */
function similarity(a: string, b: string): number {
  const byWord = jaccard(wordSet(a), wordSet(b))
  // 太短的文本 3-gram 覆盖率会虚高，加一个长度门槛
  const flatA = normalize(a).replace(/\s/g, '')
  const flatB = normalize(b).replace(/\s/g, '')
  const byGram = flatA.length >= 6 && flatB.length >= 6 ? jaccard(trigramSet(a), trigramSet(b)) : 0
  return Math.max(byWord, byGram)
}

/**
 * 判定为「同一模板」的相似度阈值。
 *
 * 0.62 是实测值：真实模型每次提炼的措辞都有出入，定太高（>0.72）
 * 会让同一问题不断新增条目，模板库很快被重复项淹没；
 * 定太低（<0.5）会把不同问题误并。配合 3-gram 相似度使用。
 */
const MERGE_THRESHOLD = 0.62

function findMatch(draft: DraftTemplate, existing: WritingTemplate[]): WritingTemplate | undefined {
  return existing.find((t) => {
    // 手动改过的不参与自动合并，否则用户的修改会被悄悄覆盖
    if (t.edited) return false
    if (t.category !== draft.category) return false
    if (similarity(t.body, draft.body) >= MERGE_THRESHOLD) return true
    // 标题高度相似也算同一条，避免同一句式换了说法重复堆积
    return similarity(t.title, draft.title) >= MERGE_THRESHOLD
  })
}

/** 把新提炼的模板合并进已有集合，返回合并后的完整列表与统计 */
export function mergeDrafts(
  drafts: DraftTemplate[],
  existing: WritingTemplate[],
  context: { reportId: string; taskType: TaskType },
): { templates: WritingTemplate[]; merged: number; added: number } {
  const result = [...existing]
  const now = Date.now()
  let merged = 0
  let added = 0

  for (const draft of drafts) {
    const hit = findMatch(draft, result)

    if (hit) {
      // 同一问题再次出现：累加出现次数，而不是新增一条重复项
      const index = result.findIndex((t) => t.id === hit.id)
      result[index] = {
        ...hit,
        recurrence: hit.recurrence + 1,
        updatedAt: now,
        sourceReportIds: hit.sourceReportIds.includes(context.reportId)
          ? hit.sourceReportIds
          : [...hit.sourceReportIds, context.reportId],
        // 用最新的例句刷新，保持贴近学生近期写法
        example: draft.example || hit.example,
        meaning: hit.meaning || draft.meaning,
        usage: hit.usage || draft.usage,
        scene: hit.scene || draft.scene,
      }
      merged += 1
    } else {
      result.push({
        id: newId(),
        createdAt: now,
        updatedAt: now,
        category: draft.category,
        title: draft.title,
        body: draft.body,
        meaning: draft.meaning,
        usage: draft.usage,
        scene: draft.scene,
        example: draft.example,
        wrongExample: draft.wrongExample,
        problemTags: draft.problemTags,
        taskTypes: [context.taskType],
        recurrence: 1,
        sourceReportIds: [context.reportId],
        origin: 'llm',
      })
      added += 1
    }
  }

  return { templates: result, merged, added }
}

