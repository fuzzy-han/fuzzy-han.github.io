/* ==========================================================================
   模板库 —— 从批改记录里提炼出来的、可复用的写作资产

   为什么要这个东西：一次批改的价值不该只停在「这篇改完了」。
   把反复正确的表达、反复犯的错误沉淀成模板，学生才能攒下自己的语料。
   同一类问题出现多次时，模板的 `recurrence` 会累加 —— 这就是「该重点记哪个」的信号。
   ========================================================================== */

import type { TaskType } from './domain'

/* -------------------------------------------------------------------------- */
/*  分类                                                                       */
/* -------------------------------------------------------------------------- */

export type TemplateCategory =
  | 'structure'
  | 'phrase'
  | 'collocation'
  | 'cohesion'
  | 'upgrade'
  | 'grammar'
  | 'translation'

export interface CategoryMeta {
  key: TemplateCategory
  name: string
  /** 一句话说明这个分类装什么，用于模板库页面的引导 */
  desc: string
  /** 记忆建议：怎么记这一类最有效 */
  memoryTip: string
}

export const TEMPLATE_CATEGORIES: CategoryMeta[] = [
  {
    key: 'phrase',
    name: '句式框架',
    desc: '可套用的句子骨架，换词就能用：开头、过渡、结尾、图表描述等。',
    memoryTip: '按「用途」记，不要按字母顺序背。一个场景记一句，考场上直接换主题词。',
  },
  {
    key: 'collocation',
    name: '固定搭配',
    desc: '动宾、形名、介词的固定组合。搭配错是最容易被扣分、也最容易提分的地方。',
    memoryTip: '连着动词一起记，例如把「合作」记成 cultivate a cooperative spirit，而不是孤立记 spirit。',
  },
  {
    key: 'cohesion',
    name: '衔接表达',
    desc: '承接、转折、因果、举例的衔接手段。用准比用多重要。',
    memoryTip: '每类记 2 个就够，记太多反而会在考场上乱用。重点记「什么关系用什么词」。',
  },
  {
    key: 'upgrade',
    name: '词汇升级',
    desc: '把常用词换成更地道的表达，例如 more and more → an increasing number of。',
    memoryTip: '成对记：左边写你原来会用的词，右边写升级版，形成条件反射。',
  },
  {
    key: 'grammar',
    name: '常错点',
    desc: '你反复犯的语法点，连同正确写法一起记下来。',
    memoryTip: '只记「错→对」这一组对照，不要抄语法书。反复出现的才值得记。',
  },
  {
    key: 'structure',
    name: '结构模板',
    desc: '整篇文章或段落的组织框架，例如图画描述段、论证段、结论段。',
    memoryTip: '记住每段「先干什么、后干什么」的顺序，而不是背整篇范文。',
  },
  {
    key: 'translation',
    name: '翻译技巧',
    desc: '长难句的处理方法：如何拆主干、如何处理修饰与被动、如何避免翻译腔。',
    memoryTip: '记「操作步骤」：先找主干、再挂修饰、最后调中文语序。',
  },
]

export function getCategoryMeta(key: TemplateCategory): CategoryMeta {
  return TEMPLATE_CATEGORIES.find((c) => c.key === key) ?? TEMPLATE_CATEGORIES[0]
}

export function isTemplateCategory(value: unknown): value is TemplateCategory {
  return typeof value === 'string' && TEMPLATE_CATEGORIES.some((c) => c.key === value)
}

/* -------------------------------------------------------------------------- */
/*  模板                                                                       */
/* -------------------------------------------------------------------------- */

export interface WritingTemplate {
  id: string
  createdAt: number
  updatedAt: number

  category: TemplateCategory
  /** 标题：一句话说清这是什么，例如「表达合作精神的三种写法」 */
  title: string

  /** 可复用的核心内容：句式、搭配或对照写法 */
  body: string
  /** 中文释义 */
  meaning: string
  /** 用法说明 */
  usage: string
  /** 适用场景 */
  scene: string

  /** 来源例句（取自学生自己的作文，熟悉感更强，更容易记住） */
  example: string
  /** 学生原句中的问题版本，用于「错→对」对照 */
  wrongExample: string

  /** 问题类型标签：主谓一致 / 时态 / 搭配 / 中式表达…… */
  problemTags: string[]
  /** 适用题型 */
  taskTypes: TaskType[]

  /**
   * 出现次数。同一问题在多次批改中反复出现时累加，
   * 界面据此把它标成「反复出现」，提示优先记忆。
   */
  recurrence: number
  /** 来源批改记录 id，可回溯到原报告 */
  sourceReportIds: string[]
  /** 生成方式 */
  origin: 'llm' | 'manual'
  /** 手动编辑过的模板不再参与自动合并，避免用户改动被覆盖 */
  edited?: boolean
}

/** 判定「反复出现」的阈值 */
export const RECURRENCE_THRESHOLD = 2

export function isRecurring(template: WritingTemplate): boolean {
  return template.recurrence >= RECURRENCE_THRESHOLD
}

/* -------------------------------------------------------------------------- */
/*  生成结果                                                                   */
/* -------------------------------------------------------------------------- */

/** 从模型返回里解析出来的原始模板（未入库） */
export interface DraftTemplate {
  category: TemplateCategory
  title: string
  body: string
  meaning: string
  usage: string
  scene: string
  example: string
  wrongExample: string
  problemTags: string[]
}

/* -------------------------------------------------------------------------- */
/*  分类学习进度（用于「已掌握 / 待记忆」）                                     */
/* -------------------------------------------------------------------------- */

export interface TemplateProgress {
  /** 模板 id → 是否已标记掌握 */
  mastered: Record<string, boolean>
}

/** 按分类统计，用于模板库的概览与记忆进度 */
export interface CategoryStat {
  category: TemplateCategory
  total: number
  recurring: number
  mastered: number
}

export function summarizeByCategory(
  templates: WritingTemplate[],
  mastered: Record<string, boolean>,
): CategoryStat[] {
  return TEMPLATE_CATEGORIES.map((meta) => {
    const items = templates.filter((t) => t.category === meta.key)
    return {
      category: meta.key,
      total: items.length,
      recurring: items.filter(isRecurring).length,
      mastered: items.filter((t) => mastered[t.id]).length,
    }
  })
}
