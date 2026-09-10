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
