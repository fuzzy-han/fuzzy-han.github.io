/* ==========================================================================
   调用层 — 统一走 OpenAI 兼容的 /chat/completions
   两种通道：
     direct  浏览器直连服务商（默认，零部署；需该服务商允许 CORS）
     proxy   经由本地代理后端转发（解决 CORS，Key 由服务端保管）
   ========================================================================== */

import { readJSON, LS_KEYS } from './storage'
import { ensureJsonKeyword, describeEmptyResponse } from './json'
import { isReasoningModelName } from './models'
import type { AppSettings, ModelConfig } from '@/types/domain'

/** 读取当前设置，供非 React 场景（如连接测试工具函数）使用 */
export function loadSettings(): AppSettings | null {
  const raw = readJSON<{ settings?: AppSettings } | null>(LS_KEYS.settings, null)
  return raw?.settings ?? null
}

export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  /** 纯文本，或 OpenAI 兼容的多模态分段数组 */
  content: string | MessageContentPart[]
}

export interface ChatRequest {
  model: ModelConfig
  settings: Pick<AppSettings, 'transport' | 'proxyBaseUrl' | 'proxyToken' | 'timeoutSec'>
  messages: ChatMessage[]
  /** 覆盖模型配置里的采样参数 */
  temperature?: number
  maxTokens?: number
  /** 强制 JSON 输出（部分服务商支持，失败时上层做容错解析） */
  jsonMode?: boolean
  signal?: AbortSignal
}

export interface ChatUsage {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}

export interface ChatResult {
  content: string
  usage: ChatUsage
  /** 实际命中的端点，便于排查 */
  endpoint: string
  elapsedMs: number
}

export class ApiError extends Error {
  status?: number
  /** 原始响应片段，用于展示给用户 */
  detail?: string

  constructor(message: string, status?: number, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

/** 组装实际请求地址与鉴权头 */
function resolveEndpoint(req: ChatRequest): { url: string; headers: Record<string, string> } {
  const { model, settings } = req

  if (settings.transport === 'proxy') {
    const base = settings.proxyBaseUrl.trim()
    if (!base) {
      throw new ApiError('已选择「本地代理」通道，但未填写代理地址')
    }
    return {
      url: joinUrl(base, '/v1/chat/completions'),
      headers: {
        'Content-Type': 'application/json',
        // 服务端凭 token 取用自己的 Key；同时把模型参数透传过去
        ...(settings.proxyToken.trim() ? { Authorization: `Bearer ${settings.proxyToken.trim()}` } : {}),
        'X-Upstream-Base-Url': model.baseUrl,
        'X-Upstream-Api-Key': model.apiKey,
      },
    }
  }

  const base = model.baseUrl.trim()
  if (!base) {
    throw new ApiError('未填写 Base URL，请在「模型配置」中补全')
  }
  return {
    url: joinUrl(base, '/chat/completions'),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${model.apiKey.trim()}`,
    },
  }
}

/**
 * 组装真正发出去的消息列表。
 * jsonMode 时保证提示词里含 "json" —— DeepSeek 等厂商对此有硬性要求，否则直接 400。
 */
function buildWireMessages(req: ChatRequest): ChatMessage[] {
  return req.jsonMode ? ensureJsonKeyword(req.messages) : req.messages
}

/** 把各家五花八门的错误响应压成一句人话 */
function humanizeError(status: number, body: string): string {
  const lower = body.toLowerCase()
  if (status === 401 || status === 403 || lower.includes('invalid api key') || lower.includes('unauthorized')) {
    return '鉴权失败：API Key 不正确或已失效'
  }
  if (status === 402 || lower.includes('insufficient') || lower.includes('quota') || lower.includes('balance')) {
    return '账户额度不足或余额耗尽'
  }
  if (status === 404) {
    return '端点不存在：请检查 Base URL 与模型名称是否正确'
  }
  if (status === 429) {
    return '触发限流：请求过于频繁，请稍后重试'
  }
  if (status >= 500) {
    return `服务商侧错误（HTTP ${status}），通常稍后重试即可`
  }
  return `调用失败（HTTP ${status}）`
}

export async function chatComplete(req: ChatRequest): Promise<ChatResult> {
  const { url, headers } = resolveEndpoint(req)
  const startedAt = Date.now()

  const timeoutSec = req.settings.timeoutSec > 0 ? req.settings.timeoutSec : 120
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000)

  // 外部传入的 signal 也要能中断本次请求
  const onExternalAbort = () => controller.abort()
  req.signal?.addEventListener('abort', onExternalAbort)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: req.model.model,
        messages: buildWireMessages(req),
        temperature: req.temperature ?? req.model.temperature,
        max_tokens: req.maxTokens ?? req.model.maxTokens,
        stream: false,
        ...(req.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    })

    const text = await response.text()

    if (!response.ok) {
      throw new ApiError(humanizeError(response.status, text), response.status, text.slice(0, 600))
    }

    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      throw new ApiError('服务端返回的不是合法 JSON', response.status, text.slice(0, 600))
    }

    const data = payload as {
      choices?: {
        message?: { content?: unknown; reasoning_content?: unknown }
        finish_reason?: string
      }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
      error?: { message?: string }
    }

    const choice = data.choices?.[0]
    const rawContent = choice?.message?.content

    /*
     * content 可能是字符串，也可能是分段数组（少数网关会这么回）。
     * 之前只判断 typeof === 'string'，遇到数组会被误判成「内容为空」。
     */
    const content =
      typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent
              .map((part) =>
                typeof part === 'string'
                  ? part
                  : typeof (part as { text?: unknown })?.text === 'string'
                    ? String((part as { text: string }).text)
                    : '',
              )
              .join('')
          : ''

    if (content.trim() === '') {
      throw new ApiError(describeEmptyResponse(choice, data), response.status, text.slice(0, 900))
    }



    return {
      content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? null,
        completionTokens: data.usage?.completion_tokens ?? null,
        totalTokens: data.usage?.total_tokens ?? null,
      },
      endpoint: url,
      elapsedMs: Date.now() - startedAt,
    }
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(`请求超时（${timeoutSec} 秒）或已被取消`)
    }
    // fetch 抛 TypeError 绝大多数情况是 CORS 或网络不通
    const message = err instanceof Error ? err.message : String(err)
    throw new ApiError(
      `网络请求失败：${message}。常见原因：该服务商未开放浏览器直连（CORS），请改用「本地代理」通道`,
    )
  } finally {
    clearTimeout(timer)
    req.signal?.removeEventListener('abort', onExternalAbort)
  }
}


/* -------------------------------------------------------------------------- */
/*  流式调用（SSE）                                                            */
/* -------------------------------------------------------------------------- */

export interface StreamChatRequest extends ChatRequest {
  /** 每收到一段增量文本回调一次，用于界面上的实时进度 */
  onDelta?: (delta: string, full: string) => void
}

/**
 * 走 OpenAI 兼容的流式接口。
 *
 * 批改一次要几十秒，没有流式用户会以为卡死。
 * 这里把 SSE 的 data: 行拼起来，同时把增量回调出去。
 * 流中途打断时抛错，由上层决定是否降级到非流式。
 */
export async function chatStream(req: StreamChatRequest): Promise<ChatResult> {
  const { url, headers } = resolveEndpoint(req)
  const startedAt = Date.now()

  const timeoutSec = req.settings.timeoutSec > 0 ? req.settings.timeoutSec : 120
  const controller = new AbortController()
  // 超时按「整段请求」计，避免长输出被误杀
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000)
  const onExternalAbort = () => controller.abort()
  req.signal?.addEventListener('abort', onExternalAbort)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: req.model.model,
        messages: buildWireMessages(req),
        temperature: req.temperature ?? req.model.temperature,
        max_tokens: req.maxTokens ?? req.model.maxTokens,
        stream: true,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new ApiError(humanizeError(response.status, text), response.status, text.slice(0, 600))
    }

    if (!response.body) {
      throw new ApiError('服务端未返回流式响应体')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    let usage: ChatUsage = { promptTokens: null, completionTokens: null, totalTokens: null }

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE 以行为单位；最后一段可能不完整，留在 buffer 里
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line || line.startsWith(':')) continue
        if (!line.startsWith('data:')) continue

        const payload = line.slice(5).trim()
        if (payload === '[DONE]') continue

        try {
          const chunk = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[]
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
          }

          const delta = chunk.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta) {
            full += delta
            req.onDelta?.(delta, full)
          }

          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens ?? null,
              completionTokens: chunk.usage.completion_tokens ?? null,
              totalTokens: chunk.usage.total_tokens ?? null,
            }
          }
        } catch {
          // 单行解析失败不该中断整个流：有些网关会插入非 JSON 的心跳行
          continue
        }
      }
    }

    if (!full.trim()) {
      throw new ApiError(
        '流式响应里没有任何正文内容。可能原因：该模型不支持流式输出；或这是思考型模型（推理过程不通过流式正文下发）。可在「模型配置」里换一个对话模型，重试时会自动改用非流式请求。',
      )
    }

    return {
      content: full,
      usage,
      endpoint: url,
      elapsedMs: Date.now() - startedAt,
    }
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(`请求超时（${timeoutSec} 秒）或已被取消`)
    }
    const message = err instanceof Error ? err.message : String(err)
    throw new ApiError(
      `流式请求失败：${message}。若该服务商不支持流式，请在设置里关闭流式输出`,
    )
  } finally {
    clearTimeout(timer)
    req.signal?.removeEventListener('abort', onExternalAbort)
  }
}

/* -------------------------------------------------------------------------- */
/*  连接测试                                                                   */
/* -------------------------------------------------------------------------- */

export interface TestResult {
  ok: boolean
  message: string
  detail?: string
  elapsedMs?: number
  endpoint?: string
  reply?: string
  /** 附加警告：连接通了，但配置有隐患 */
  warnings?: string[]
}

/**
 * 用一条极小的请求验证「地址 + Key + 模型名」三者是否自洽。
 * 刻意压低 max_tokens，避免测试本身花掉不必要的额度。
 */
export async function testConnection(
  model: ModelConfig,
  settings: Pick<AppSettings, 'transport' | 'proxyBaseUrl' | 'proxyToken' | 'timeoutSec'>,
): Promise<TestResult> {
  const warnings: string[] = []

  try {
    const result = await chatComplete({
      model,
      settings: { ...settings, timeoutSec: Math.min(settings.timeoutSec || 120, 45) },
      messages: [
        { role: 'system', content: '你是连接测试助手，只回复两个字：就绪' },
        { role: 'user', content: 'ping' },
      ],
      temperature: 0,
      /*
       * 512 而不是 16。
       * 原来给 16，是照着「回两个字」估的，但思考型模型光推理就不止 16 个 token，
       * 正文还没开始就被截断 —— 返回 content 为空 + finish_reason=length，
       * 用户看到「测试连接失败」，其实是测试本身额度给少了。
       * 实测 deepseek-v4-flash-vision-exp 需要 41–46 个 token 才能吐出「就绪」。
       */
      maxTokens: 512,
    })

    /*
     * 只 ping 一句是不够的：它用 max_tokens=16 就能成功，
     * 但真正批改要输出几千字，思考型模型会把额度全用在推理上，
     * 结果出现「测试通过、批改却报服务端返回空」这种最难查的情况。
     * 这里补三项静态检查，把隐患在配置阶段就挑明。
     */
    if (isReasoningModelName(model.model)) {
      warnings.push(
        `模型名「${model.model}」看着像思考型模型。平台已会自动为它放大输出额度并使用强制 JSON 输出，可以正常批改；但这类模型更慢（单次批改约 1 分钟）、更贵。追求速度与成本的话，换成普通对话模型（deepseek-chat / moonshot-v1-8k / qwen-plus）更划算。`,
      )
    }

    if (model.maxTokens < 4096) {
      warnings.push(
        `单次输出上限设为 ${model.maxTokens}。逐句批改的报告 JSON 通常要 3000–6000 tokens，思考型模型还要更多。平台会在遇到截断时自动放大重试，但首轮就可能失败、多等一轮；建议直接调到 8192 以上。`,
      )
    }

    if (settings.transport === 'direct' && model.baseUrl.includes('localhost')) {
      warnings.push('Base URL 指向 localhost：只有本机浏览器能访问，换设备或部署到线上后都会失败。')
    }

    return {
      ok: true,
      message: warnings.length > 0 ? '连接正常（有隐患，见下）' : '连接正常',
      reply: result.content.trim().slice(0, 40),
      elapsedMs: result.elapsedMs,
      endpoint: result.endpoint,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  } catch (err) {
    if (err instanceof ApiError) {
      /*
       * 「推理过程占满额度」这类失败要单独解释：它其实是测试额度的问题，
       * 不代表模型不可用。原文案让用户去改「输出上限」，方向是错的。
       */
      if (/推理过程|正文还没开始写/.test(err.message)) {
        return {
          ok: true,
          message: '连接正常（该模型会先输出推理过程）',
          detail: err.message,
          warnings: [
            '这个模型的回复里只有推理过程、没有正文，但连接本身是通的。批改时平台会自动放大输出额度并重试，通常可以直接使用。',
          ],
        }
      }
      return { ok: false, message: err.message, detail: err.detail }
    }
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
