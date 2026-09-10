/* ==========================================================================
   领域模型 — 三大题型的任务定义、评分报告结构、模型与指令配置
   ========================================================================== */

/** 任务类型：英语一大作文 / 英语一小作文 / 英语一翻译 */
export type TaskType = 'eng1_big' | 'eng1_small' | 'eng1_translation'

/** 评分维度定义（分值可配置，不写死在渲染层） */
export interface DimensionSpec {
  key: string
  name: string
  max: number
  /** 该维度的判分关注点，供 UI 展示与 prompt 组装提示用 */
  focus: string
}

/** 一个题型模块的完整定义 */
export interface TaskSpec {
  type: TaskType
  name: string
  shortName: string
  /** 满分 */
  total: number
  /** 官方档次区间，用于校验 AI 返回的分数是否落在合法档次 */
  bands: { label: string; min: number; max: number }[]
  dimensions: DimensionSpec[]
  /** 报告页渲染分支：作文走逐句优化，翻译走译文对照 */
  reportMode: 'essay' | 'translation'
  /** 输入表单里需要学生额外提供什么。题目一律可选：没有题目也能批改，
      只是按批改指令不给出确定总分。 */
  inputs: {
    promptLabel: string
    promptPlaceholder: string
    promptHint: string
    wordLimit: string
  }
  /**
   * 批改指令末尾的「学生需要提供什么」说明。
   *
   * 这份内容有三个用途，必须保持单一来源：
   * 1. 拼进内置批改指令，告诉模型等会儿会收到哪几段输入
   * 2. P2 批改台按同样字段顺序渲染输入表单
   * 3. 缺字段时的校验提示文案
   */
  guide: {
    /** 该题型开头需要出的可选字段，如大作文的「题目年份」 */
    year?: { label: string; placeholder: string; hint: string }
    /** 必填的主输入：题目/英文原文 */
    prompt: { label: string; placeholder: string; hint: string }
    /** 必填的主输入：学生作文/译文 */
    essay: { label: string; placeholder: string; hint: string }
    /** 可选：额外需求 */
    extras: { label: string; placeholder: string; hint: string }
  }
}

/* -------------------------------------------------------------------------- */
/*  模型配置                                                                   */
/* -------------------------------------------------------------------------- */

export type ProviderId =
  | 'deepseek'
  | 'kimi'
  | 'qwen'
  | 'glm'
  | 'openai'
  | 'custom'

/** 传输通道：直连各家 API，或经由本地代理后端 */
export type Transport = 'direct' | 'proxy'

export interface ProviderPreset {
  id: ProviderId
  name: string
  /** OpenAI 兼容 chat/completions 端点 */
  baseUrl: string
  docsUrl: string
  /** 预置常用模型（用户可手改） */
  models: string[]
  /** 该家模型是否支持图片输入（用于作文照片 OCR） */
  supportsVision: boolean
  note: string
}

export interface ModelConfig {
  id: string
  /** 展示名，用户可改 */
  label: string
  provider: ProviderId
  baseUrl: string
  apiKey: string
  model: string
  /** 采样温度 */
  temperature: number
  /** 单次输出上限 */
  maxTokens: number
  /** 是否支持视觉输入（覆盖预设） */
  vision: boolean
  createdAt: number
}

/* -------------------------------------------------------------------------- */
/*  Instruction（评分细则）                                                     */
/* -------------------------------------------------------------------------- */

export interface RubricVersion {
  id: string
  /** 版本备注，如「依据 2024 官方细则」 */
  note: string
  content: string
  savedAt: number
}

export interface Rubric {
  taskType: TaskType
  /** 当前生效内容；默认空白，由用户填写 */
  content: string
  updatedAt: number
  /** 历史版本，用于回滚 */
  versions: RubricVersion[]
  /**
   * 是否已填写。
   *
   * 这是**显式状态**，不是从正文猜出来的。早期版本靠数「占位符」判断，
   * 一旦内置指令或用户自己的写法里出现同样的字样，就会被误判成「待填写」。
   * 现在只有「内置指令写入时」和「用户点保存时」会把它置为 true。
   *
   * 老数据的该字段缺失（undefined）时，退回按正文是否为空判断，见 isRubricFilled。
   */
  filled?: boolean
  /** 内置指令的版本号，用于日后把更新过的内置内容推给老用户 */
  seedRevision?: number
}

/* -------------------------------------------------------------------------- */
/*  全局设置                                                                   */
/* -------------------------------------------------------------------------- */

export interface AppSettings {
  /** 默认使用的模型配置 id */
  defaultModelId: string | null
  /** 传输通道 */
  transport: Transport
  /** 本地代理后端地址，transport === 'proxy' 时生效 */
  proxyBaseUrl: string
  /** 代理后端访问口令，可留空 */
  proxyToken: string
  /** 请求超时（秒） */
  timeoutSec: number
  /** JSON 解析失败时自动重试一次 */
  autoRetry: boolean
  /**
   * 优先保证结构化输出的稳定性。
   *
   * 开启后首次请求就走非流式 + json_object：实测流式请求不发 response_format 时，
   * 模型有相当大概率回一篇人类可读的文字报告而不是 JSON，白白多花一轮重试。
   * 关闭则优先流式（能看到实时进度），但首轮失败率更高。
   */
  preferReliableJson: boolean
  /** 是否在报告里要求逐句诊断（关闭可省钱，只出总评） */
  sentenceLevel: boolean
  /** 批改文体严格度：宽松 / 标准 / 严格 */
  strictness: 'lenient' | 'standard' | 'strict'
  /** 界面语言（预留，当前仅中文） */
  locale: 'zh-CN'
}
