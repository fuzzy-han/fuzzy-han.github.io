/* ==========================================================================
   图片转录（OCR）

   用户的指令里明确要求：「手写图片先准确转录，保留原有拼写、语法和分段，
   不偷编纠错。无法辨认或有歧义处请我确认，不把识别错误当成我的错误。」

   因此这里不做「顺手纠错」：转录结果原样保留，不确定处单独列出来。
   ========================================================================== */

import { chatComplete } from './api'
import { extractJson } from './json'
import type { AppSettings, ModelConfig } from '@/types/domain'
import type { InputImage } from '@/types/report'

export interface TranscriptResult {
  /** 逐字转录的文本；题目图可能为空 */
  text: string
  /** 无法辨认或存疑的地方，需要用户确认 */
  uncertain: string[]
  /** 对图片内容的一句话说明，便于用户核对录对了没有 */
  summary: string
}

function buildOcrPrompt(role: InputImage['role'], taskName: string): string {
  const what =
    role === 'essay'
      ? `学生的${taskName}作答（可能是手写）`
      : '考试题目与写作要求（可能包含图片说明文字）'

  return [
    `请准确转录这张图片里的文字。图片内容是：${what}。`,
    '',
    '要求：',
    '1. 逐字转录，**保留原有的拼写、语法、大小写和分段**。不要纠正任何错误，不要改写，不要润色。',
    '2. 手写体请尽量辨认；实在无法辨认的字用 ⍰ 占位，不要猜测填充。',
    '3. 如果图中有印刷体的英文标注、对话气泡、图注，也要照抄，并注明它出现在图中的位置。',
    '4. 如果图片里包含图画而非纯文字，请用中文描述画面内容（谁、在做什么、彼此关系、整体寓意），因为后续批改看不到图片。',
    '5. 把无法辨认或有歧义的地方单独列出来。',
    '',
    '只输出以下 JSON，不要任何解释文字，不要 ``` 代码块：',
    '{',
    '  "text": "逐字转录的正文；若为纯图画则填写画面描述",',
    '  "uncertain": ["无法辨认或存疑之处的说明"],',
    '  "summary": "一句话说明这张图是什么内容"',
    '}',
  ].join('\n')
}

/** 转录一张图片 */
export async function transcribeImage(
  image: InputImage,
  model: ModelConfig,
  settings: Pick<AppSettings, 'transport' | 'proxyBaseUrl' | 'proxyToken' | 'timeoutSec'>,
  taskName: string,
): Promise<TranscriptResult> {
  if (!model.vision) {
    throw new Error(
      `当前模型「${model.label}」未开启视觉能力，无法识别图片。请在「模型配置」里换一个支持图片的模型，或改为直接粘贴文本。`,
    )
  }

  const result = await chatComplete({
    model,
    settings,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildOcrPrompt(image.role, taskName) },
          { type: 'image_url', image_url: { url: image.dataUrl } },
        ],
      },
    ],
    temperature: 0,
    maxTokens: 4096,
    jsonMode: true,
  })

  const parsed = extractJson(result.content)
  if (!parsed.ok) {
    // 转录失败不该让整条流程断掉：把模型原文当作转录结果，并提醒用户核对
    return {
      text: result.content.trim(),
      uncertain: ['模型没有按要求返回结构化结果，上面是它的原始输出，请人工核对。'],
      summary: '（未能结构化）',
    }
  }

  const value = parsed.value as Record<string, unknown>
  return {
    text: typeof value.text === 'string' ? value.text : '',
    uncertain: Array.isArray(value.uncertain)
      ? value.uncertain.map((x) => String(x)).filter(Boolean)
      : [],
    summary: typeof value.summary === 'string' ? value.summary : '',
  }
}
