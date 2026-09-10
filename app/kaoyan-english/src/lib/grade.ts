/* ==========================================================================
   批改引擎 —— 组装 prompt、发起流式调用、解析并规范化报告
   ========================================================================== */

import { chatComplete, chatStream, ApiError, type ChatMessage } from './api'
import { extractJson, JSON_PREFILL } from './json'
import { normalizeReport, type ReportDiagnostic } from './report'
import { isRubricFilled } from './rubric'
import { TASK_SPECS } from './tasks'
import { resolveStartTokens, MAX_TOKENS_CEILING } from './models'
import type { AppSettings, ModelConfig, TaskType } from '@/types/domain'
import type { GradingReport } from '@/types/report'

/* -------------------------------------------------------------------------- */
/*  学生提交的输入                                                             */
/* -------------------------------------------------------------------------- */

export interface GradeInput {
  taskType: TaskType
  /** 题目年份，可选 */
  year: string
  /** 完整题目及要求 */
  prompt: string
  /** 学生作文 / 译文 */
  essay: string
  /** 额外需求 */
  extras: string
  /** 大作文可选：参考译文（翻译题型用） */
  reference?: string
  /** 若作文来自图片，附上识别说明 */
  transcriptionNote?: string
}

/* -------------------------------------------------------------------------- */
/*  Prompt 组装                                                                */
/* -------------------------------------------------------------------------- */

/**
 * 组装给模型的消息。
 *
 * 结构：
 *   system = 稳定外壳（角色 + 输出纪律）+ 题型细则全文（用户可编辑）
 *   user   = 题目 + 作文 + 额外需求
 *
 * 把细则放 system、把学生内容放 user 是刻意的：
 * 用户内容里若出现「忽略以上指令」这类话，放在 user 里不会顶掉评分规则。
 */
export function buildMessages(
  input: GradeInput,
  rubricContent: string,
  settings: Pick<AppSettings, 'strictness' | 'sentenceLevel'>,
): ChatMessage[] {
  const spec = TASK_SPECS[input.taskType]

  const shell: string[] = [
    '你是一位严格、客观的考研英语一阅卷老师，正在批改学生的练习作业。',
    '',
    '【输出纪律】',
    '1. 严格按下方「批改指令」的评分口径判分，不刻意抬分、不刻意压分。',
    '2. 一切结论必须能指回学生原文的具体位置，不编造不存在的错误。',
    '3. 学生原文逐字引用，不替学生改写后再当作"原文"。',
    '4. 若输入信息不足以判定（如缺少题目、图片无法辨认、词数无法统计），如实说明并列入 notes，不要猜测。',
  ]

  if (settings.sentenceLevel) {
    shell.push('5. 必须逐句输出，不得合并或跳过任何一句。')
  } else {
    shell.push('5. 本次只要求总评与全文改写，sentences 数组可以留空，但仍需输出其余字段。')
  }

  const strictnessHint: Record<AppSettings['strictness'], string> = {
    lenient: '本次批改以鼓励为主：只标注影响理解的错误，正确但简单的表达不要判为问题。',
    standard: '本次批改对齐官方阅卷口径：该扣的分要扣，但不为难学生。',
    strict: '本次批改按高分标准逐句挑刺：除了错误，也要指出表达上的提升空间，但必须区分「必须修改」与「可选优化」。',
  }
  shell.push(`6. ${strictnessHint[settings.strictness]}`)

  const system = `${shell.join('\n')}\n\n${'═'.repeat(24)}\n批改指令（题型：${spec.name}，满分 ${spec.total} 分）\n${'═'.repeat(24)}\n\n${rubricContent}`

  /* —— 学生输入 —— */
  const userParts: string[] = [`【题型】${spec.name}（满分 ${spec.total} 分）`]

  if (input.year.trim()) {
    userParts.push(`【题目年份】\n${input.year.trim()}`)
  }

  userParts.push(`【完整题目及写作要求】\n${input.prompt.trim() || '（学生未提供）'}`)

  if (input.reference?.trim()) {
    userParts.push(`【参考译文】\n${input.reference.trim()}`)
  }

  if (input.transcriptionNote?.trim()) {
    userParts.push(`【转录说明】\n${input.transcriptionNote.trim()}`)
  }

  userParts.push(
    `【学生${spec.reportMode === 'translation' ? '译文' : '作文'}】\n${input.essay.trim()}`,
  )

  if (input.extras.trim()) {
    userParts.push(`【额外需求】\n${input.extras.trim()}`)
  }

  userParts.push('请按批改指令的要求完成批改，并输出约定的 JSON。')

  return [
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n\n') },
  ]
}

/* -------------------------------------------------------------------------- */
/*  提交校验                                                                   */
/* -------------------------------------------------------------------------- */

export interface ValidateInputResult {
  ok: boolean
  /** 阻断性问题，必须修好才能提交 */
  blockers: string[]
  /** 提醒，不阻断 */
  warnings: string[]
}

export function validateInput(
  input: GradeInput,
  rubric: { content: string; filled?: boolean },
): ValidateInputResult {
  const spec = TASK_SPECS[input.taskType]
  const blockers: string[] = []
  const warnings: string[] = []

  if (!input.essay.trim()) {
    blockers.push(`请填写你的${spec.reportMode === 'translation' ? '译文' : '作文'}。`)
  }

  if (!input.prompt.trim()) {
    // 缺题目不阻断：细则里明确允许「先批改语言，暂不给出确定总分」
    warnings.push(
      `没有提供${spec.guide.prompt.label}，这次只批改语言与结构，不给确定总分。补上题目就能得到完整评分。`,
    )
  }

  if (!isRubricFilled(rubric)) {
    blockers.push('该题型的评分细则还是空白，模型没有评分依据。请先到「评分细则」页填写并保存。')
  }

  const essayLength = input.essay.trim().length
  if (essayLength > 0 && essayLength < 40) {
    warnings.push('作文内容很短，批改结果参考价值有限。')
  }

  if (input.taskType === 'eng1_translation') {
    const englishChars = (input.prompt.match(/[a-zA-Z]/g) ?? []).length
    if (englishChars < 60) {
      warnings.push('英文原文看起来偏短，翻译题通常需要完整的 5 个划线句与上下文。')
    }
  }

  return { ok: blockers.length === 0, blockers, warnings }
}

/* -------------------------------------------------------------------------- */
/*  执行批改                                                                   */
/* -------------------------------------------------------------------------- */

export interface GradeCallbacks {
  /** 流式增量，用于展示实时进度 */
  onDelta?: (delta: string, full: string) => void
  /** 阶段提示 */
  onStage?: (stage: string) => void
  signal?: AbortSignal
}

export interface GradeResult {
  report: GradingReport
  diagnostics: ReportDiagnostic[]
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null }
  elapsedMs: number
  /** 是否走了重试 */
  retried: boolean
  /** 是否走了截断修复 */
  repaired: boolean
}

/**
 * 批改一次。
 *
 * 流程：流式调用 → 抠 JSON → 失败则（可选）重试一次非流式
 * 重试刻意换成非流式：很多模型在流式下更容易把 JSON 吐歪，
 * 而且非流式能拿到完整的 finish_reason，成功率更高。
 */
export async function grade(
  input: GradeInput,
  model: ModelConfig,
  rubricContent: string,
  settings: AppSettings,
  callbacks: GradeCallbacks = {},
): Promise<GradeResult> {
  return gradeWithBudget(input, model, rubricContent, settings, callbacks, {
    maxTokens: resolveStartTokens(model.model, model.maxTokens),
    allowBudgetRetry: true,
    /*
     * 首轮是否直接走非流式，取决于稳定性开关。
     * 实测：流式请求不发 response_format 时，模型常回人类可读的文字报告而非 JSON，
     * 于是必然多花一轮重试。默认直接走非流式 + json_object，一次到位。
     */
    forceNonStream: settings.preferReliableJson,
  })
}

interface BudgetOptions {
  maxTokens: number
  /** 是否还允许再放大一次（只放大一次，避免配置真错时无限烧钱） */
  allowBudgetRetry: boolean
  /**
   * 强制走非流式。
   * 放大额度重试时必须置 true：首次流式既然没吐出正文，
   * 再流式一次大概率还是空；换成非流式才能拿到完整的 finish_reason，
   * 也能绕开「网关不支持流式」这类问题。
   */
  forceNonStream: boolean
}

/**
 * 带输出上限的批改，支持在「输出被截断 / 正文为空」时自动放大额度换非流式重来。
 *
 * 为什么需要：思考型模型会把 max_tokens 全用在推理上，正文一个字都没写就被截断，
 * 对外表现就是「测试连接正常、批改却报服务端返回空」——最难自查的一类问题。
 * 与其让用户反复试参数，不如自动放大一次。
 */
async function gradeWithBudget(
  input: GradeInput,
  model: ModelConfig,
  rubricContent: string,
  settings: AppSettings,
  callbacks: GradeCallbacks,
  budget: BudgetOptions,
): Promise<GradeResult> {
  const { maxTokens, allowBudgetRetry, forceNonStream } = budget
  const messages = buildMessages(input, rubricContent, settings)
  const startedAt = Date.now()

  const transport = {
    transport: settings.transport,
    proxyBaseUrl: settings.proxyBaseUrl,
    proxyToken: settings.proxyToken,
    timeoutSec: settings.timeoutSec,
  }

  callbacks.onStage?.('正在连通模型…')

  let raw = ''
  let usage: GradeResult['usage'] = { promptTokens: null, completionTokens: null, totalTokens: null }
  let retried = false

  try {
    /*
     * 两种路径都带上 prefill：
     * 把回复开头钉成 JSON 的第一个字段，模型就只能续写合法 JSON。
     * 不加的时候，模型会优先照做批改指令里的「一、整体评价与评分…」，
     * 写出一篇几千字的文字报告，直到撞上 max_tokens 被截断——永远等不到 JSON。
     */
    if (forceNonStream) {
      callbacks.onStage?.('正在用非流式请求重新批改…')
      const plain = await chatComplete({
        model,
        settings: transport,
        messages,
        maxTokens,
        jsonMode: true,
        prefill: JSON_PREFILL,
        signal: callbacks.signal,
      })
      raw = plain.content
      usage = plain.usage
    } else {
      const streamed = await chatStream({
        model,
        settings: transport,
        messages,
        maxTokens,
        prefill: JSON_PREFILL,
        signal: callbacks.signal,
        onDelta: (delta, full) => {
          callbacks.onStage?.('模型正在批改…')
          callbacks.onDelta?.(delta, full)
        },
      })
      raw = streamed.content
      usage = streamed.usage
    }
  } catch (err) {
    if (callbacks.signal?.aborted) throw err

    const message = err instanceof ApiError ? err.message : String(err)

    /*
     * 输出额度不够时放大重试。
     * 判据用错误原文而不是随便重试：只有明确是「被截断 / 空正文」才值得加额度，
     * 鉴权失败、模型不存在这类问题加多少额度都没用。
     */
    const budgetProblem = /截断|推理过程|reasoning_content|内容为空|没有任何正文/.test(message)
    if (budgetProblem && allowBudgetRetry) {
      /*
       * 放大到至少 16384。
       * 实测：思考型 / 长输出模型在 4096 下经常还没写完正文就撞上限，
       * 翻倍到 8192 仍可能不够（一次完整报告要 6000–9000 tokens）。
       */
      const bigger = Math.min(Math.max(maxTokens * 2, 16384), MAX_TOKENS_CEILING)
      callbacks.onStage?.(`输出额度可能不足，正在改用非流式请求、${bigger} tokens 重试…`)
      return gradeWithBudget(input, model, rubricContent, settings, callbacks, {
        maxTokens: bigger,
        allowBudgetRetry: false,
        forceNonStream: true,
      })
    }

    // 流式不可用（网关不支持、被中间层缓冲等）时降级到非流式，而不是直接失败
    callbacks.onStage?.(`流式调用不可用，改用普通请求重试（${message}）`)
    retried = true

    const plain = await chatComplete({
      model,
      settings: transport,
      messages,
      maxTokens,
      jsonMode: true,
      signal: callbacks.signal,
    })
    raw = plain.content
    usage = plain.usage
  }

  callbacks.onStage?.('正在解析批改结果…')

  let parsed = extractJson(raw)

  // 解析失败且允许重试：再要一次，并明确强调格式
  if (!parsed.ok && settings.autoRetry && !callbacks.signal?.aborted) {
    retried = true
    callbacks.onStage?.('结果不是合法 JSON，正在重新请求…')

    const retry = await chatComplete({
      model,
      settings: transport,
      messages: [
        ...messages,
        { role: 'assistant', content: raw.slice(0, 2000) },
        {
          role: 'user',
          content:
            '你上面的回复不是可解析的 JSON。请只输出 JSON 本体，不要任何解释文字、不要 ``` 代码块、不要注释。',
        },
      ],
      maxTokens,
      jsonMode: true,
      prefill: JSON_PREFILL,
      signal: callbacks.signal,
    })
    raw = retry.content
    usage = retry.usage
    parsed = extractJson(raw)
  }

  if (!parsed.ok) {
    throw new ApiError(
      `模型返回的内容无法解析为 JSON（${parsed.error}）。可尝试：换用更强的模型、在设置里提高输出上限，或检查细则是否被改坏。`,
      undefined,
      parsed.json,
    )
  }

  callbacks.onStage?.('正在校验评分…')

  const { report, diagnostics } = normalizeReport(parsed.value, input.taskType)

  return {
    report,
    diagnostics,
    usage,
    elapsedMs: Date.now() - startedAt,
    retried,
    repaired: parsed.repaired === true,
  }
}
