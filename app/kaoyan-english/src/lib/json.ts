/* ==========================================================================
   从模型返回里抠出合法 JSON

   为什么需要这一层：即便在 prompt 里明确要求「只输出 JSON 本体」，
   各家模型仍会时不时给出 ```json 代码块、前后加一句「好的，以下是结果」、
   或者中途被 max_tokens 截断。直接 JSON.parse 会失败，
   于是必须有容错提取，并在提取后做一次结构修复。
   ========================================================================== */

/** 去掉 ```json ... ``` 围栏，返回围栏内的内容 */
function stripCodeFence(text: string): string | null {
  const fence = /```(?:json|JSON)?\s*\n([\s\S]*?)```/.exec(text)
  return fence ? fence[1] : null
}

/**
 * 从任意文本中取出第一个完整的 JSON 对象。
 *
 * 不能简单地「找第一个 { 和最后一个 }」：模型在 JSON 之后若再补一段
 * 带大括号的说明文字，就会把说明也吞进来。这里改为按括号配对扫描，
 * 并且正确跳过字符串内部的括号与转义字符。
 */
function extractBalancedObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  // 括号没闭合：多半是被 max_tokens 截断，返回剩余部分交给修复逻辑
  return text.slice(start)
}

/** 尝试把被截断的 JSON 补全（补上未闭合的字符串与括号） */
function repairTruncated(json: string): string {
  let inString = false
  let escaped = false
  const stack: string[] = []

  for (let i = 0; i < json.length; i += 1) {
    const ch = json[i]

    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }

    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}' || ch === ']') stack.pop()
  }

  let repaired = json

  if (inString) repaired += '"'

  // 去掉结尾悬空的逗号或半截键名
  repaired = repaired.replace(/,\s*$/, '').replace(/,\s*"[^"]*"\s*:\s*$/, '')

  // 逆序补全未闭合的括号
  while (stack.length > 0) {
    const open = stack.pop()
    repaired += open === '{' ? '}' : ']'
  }

  return repaired
}

export interface ExtractResult {
  ok: boolean
  value?: unknown
  /** 实际用于解析的 JSON 文本 */
  json?: string
  /** 失败原因，便于展示给用户 */
  error?: string
  /** 是否走了截断修复路径 */
  repaired?: boolean
}

export function extractJson(raw: string): ExtractResult {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: '模型返回为空' }

  // 依次尝试：原文 → 代码围栏内 → 括号配对截取
  const candidates: string[] = [trimmed]
  const fenced = stripCodeFence(trimmed)
  if (fenced) candidates.push(fenced.trim())
  const balanced = extractBalancedObject(trimmed)
  if (balanced) candidates.push(balanced)

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate), json: candidate }
    } catch {
      /* 试下一个 */
    }
  }

  // 全部失败，最后试一次截断修复
  const last = candidates[candidates.length - 1]
  try {
    const repaired = repairTruncated(last)
    return { ok: true, value: JSON.parse(repaired), json: repaired, repaired: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      json: last.slice(0, 400),
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  与 OpenAI 兼容响应相关的两个纯函数                                          */
/*  放在这里而不是 api.ts：api.ts 依赖 storage（要读 localStorage），          */
/*  放进来的话这些纯逻辑就没法在 Node 里直接单测了。                            */
/* -------------------------------------------------------------------------- */

/** 只依赖最小形状，避免与 api.ts 循环引用 */
export interface MinimalMessage {
  role: string
  content: string | { type: string; text?: string }[]
}

/**
 * DeepSeek 等厂商在 response_format=json_object 时**硬性要求提示词里出现 "json"**，
 * 否则直接返回 400：
 *   Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'
 *
 * 平台自己的契约文本里恰好写了 "JSON"，但这是巧合：一旦有人改写细则措辞、
 * 或走的是只带一小段上下文的请求，就会莫名其妙 400。
 * 这里不赌运气，缺了就补一句，保证任何路径下都不会因此失败。
 */
export function ensureJsonKeyword<T extends MinimalMessage>(messages: T[]): T[] {
  const mentionsJson = messages.some((m) =>
    typeof m.content === 'string'
      ? /json/i.test(m.content)
      : m.content.some((part) => part.type === 'text' && /json/i.test(part.text ?? '')),
  )

  if (mentionsJson) return messages

  const reminder = '请以 JSON 格式输出结果。'
  return messages.map((m, i) =>
    i === messages.length - 1
      ? typeof m.content === 'string'
        ? ({ ...m, content: `${m.content}\n\n${reminder}` } as T)
        : ({ ...m, content: [...m.content, { type: 'text', text: reminder }] } as T)
      : m,
  )
}

/**
 * 说明「为什么这次返回是空的」。
 *
 * 空响应有几种完全不同的成因，笼统报一句「服务端返回内容为空」
 * 用户根本不知道该改什么。这里按证据分情况说明。
 */
export function describeEmptyResponse(
  choice:
    | { message?: { content?: unknown; reasoning_content?: unknown }; finish_reason?: string }
    | undefined,
  data: { error?: { message?: string } },
): string {
  if (data.error?.message) {
    return `服务端报错：${data.error.message}`
  }

  if (!choice) {
    return '服务端没有返回 choices 字段，响应结构不符合 OpenAI 兼容格式。请确认 Base URL 指到了 /v1 这样的对话补全端点。'
  }

  const finish = choice.finish_reason ?? ''
  const reasoning = choice.message?.reasoning_content
  const hasReasoning = typeof reasoning === 'string' && reasoning.trim() !== ''

  if (finish === 'length' || finish === 'max_tokens') {
    /*
     * 注意区分：正文为空且推理很长，才是「推理吃掉额度」；
     * 正文非空（这里 content 已被判定为空，但可能有其它字段）时更常见的是
     * 模型写成了长篇文字而没有按 JSON 输出，写到一半撞上限。
     * 之前的文案把两者混为一谈，会把人引向错误的排查方向。
     */
    return hasReasoning
      ? '模型只输出了推理过程，正文还没开始写就被输出上限截断（finish_reason=length）。请在「模型配置」里把输出上限调到 16384 以上；若仍不行，请换用普通对话模型（如 deepseek-chat）。'
      : '输出被 max_tokens 截断了，正文没写完。请把「单次输出上限」调到 16384 以上再试。'
  }

  if (hasReasoning) {
    return '服务端只返回了 reasoning_content（推理过程），没有返回正文 content。这是思考型模型的典型表现，平台需要的是正文。请换用普通对话模型。'
  }

  if (finish === 'content_filter') {
    return '内容被服务端的安全策略拦截了（finish_reason=content_filter）。可尝试改写输入或更换服务商。'
  }

  return `服务端返回了 HTTP 200，但 choices[0].message.content 是空的（finish_reason=${finish || '未提供'}）。常见原因：模型名与服务商不匹配、该模型是思考型模型只输出推理过程，或中转网关吞掉了正文。`
}

/* -------------------------------------------------------------------------- */
/*  骨架预填充                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * assistant 回合的预填充内容。
 *
 * 为什么需要：批改指令是写给读者看的（「一、整体评价与评分…」），
 * 模型会优先照做，输出一篇几千字的文字报告而不是 JSON。实测 deepseek-v4
 * 系列尤其明显：它会一直写散文直到撞上 max_tokens 被截断，于是永远等不到 JSON。
 *
 * 把 assistant 回合的开头「钉死」成 JSON 的第一个字段，模型就只能续写合法 JSON——
 * 这是比在提示词里请求更硬的约束。
 */
export const JSON_PREFILL = '{"band":"'

/** 把预填充拼回模型返回的内容 */
export function applyPrefill(prefill: string, returned: string): string {
  /*
   * 有些服务商会把预填充原样回显（返回内容里已经带了 "{" 或 "band"），
   * 直接拼接会变成 {{ 导致解析失败。这里按已经带了多少做裁剪，
   * 拼出来的结果一定是恰好一个 prefill 开头。
   */
  const trimmed = returned.replace(/^\s+/, '')
  if (trimmed.startsWith(prefill)) return trimmed
  if (trimmed.startsWith(prefill.trim())) return prefill + trimmed.slice(prefill.trim().length)

  // 已回显了开头几个字符，逐级裁掉
  const head = prefill.trim().replace(/\s/g, '')
  let matched = 0
  for (let i = 0; i < head.length && i < trimmed.length; i += 1) {
    if (trimmed[i] === head[i]) matched += 1
    else break
  }
  return prefill + trimmed.slice(matched)
}
