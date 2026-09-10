import type { Rubric, TaskType } from '@/types/domain'
import { TASK_SPECS } from './tasks'

/* ==========================================================================
   Instruction（评分细则 / 批改指令）

   批改时整段内容会作为 system prompt 主体上传给模型，是模型的唯一评分依据。
   三种题型各自独立：已填写的用用户内容，未填写的给一份空白骨架。
   ========================================================================== */

export const RUBRIC_PLACEHOLDER = '（此处填写该题型的评分细则，将作为 prompt 主体上传给模型）'

/**
 * 内置指令的版本号。改动内置内容时把它 +1，
 * 便于日后按版本把更新推给老用户（目前仅记录，不做自动覆盖）。
 */
export const RUBRIC_SEED_REVISION = 2

export interface RubricSeed {
  content: string
  /** 首次写入时记进版本历史的备注 */
  note: string
}

/**
 * 由 TaskSpec.guide 生成指令末尾的「学生需要提供什么」。
 *
 * 这里刻意只维护一份定义：批改指令末尾的说明、P2 批改台的输入表单、
 * 缺字段时的校验文案，全部从这里派生。改一处三处同步，
 * 不会出现「指令里说要交 A、表单却只收 B」这种对不上的情况。
 */
export function buildInputSections(taskType: TaskType): string {
  const { guide } = TASK_SPECS[taskType]

  /** 每段 = 标题 + 怎么填（placeholder）+ 要点要求（hint） */
  const block = (field: { label: string; placeholder: string; hint: string }) =>
    `【${field.label}】\n\n${field.placeholder}\n\n要点：${field.hint}`

  const blocks: string[] = []
  if (guide.year) blocks.push(block(guide.year))

  blocks.push(block(guide.prompt), block(guide.essay), block(guide.extras))

  return blocks.join('\n\n')
}

/** 把内置指令里的输入段占位替换成由 guide 生成的内容 */
function withInputSections(instruction: string, taskType: TaskType): string {
  return instruction.replace('__INPUT_SECTIONS__', buildInputSections(taskType))
}

/**
 * 平台侧的输出契约。
 *
 * 为什么必须由平台追加：报告页要按句子渲染折叠卡、按维度渲染分数条，
 * 就必须拿到结构化数据。用户手写的自然语言指令（哪怕已经规定了输出顺序）
 * 无法保证机器可解析，因此在用户指令之后追加一段固定的字段说明。
 */
export function buildOutputContract(taskType: TaskType): string {
  const spec = TASK_SPECS[taskType]
  const isTranslation = taskType === 'eng1_translation'

  /*
   * 逐句 schema 分两套：
   * · 作文 —— 原句 → 问题 → 修改句 → 中文解释
   * · 翻译 —— 原句 → 采分点（分值/得分）→ 错误分析 → 修改译文
   * 两套都严格对齐用户在 instruction 里写的那几条要求，字段一一对应。
   */
  const sentenceSchema = isTranslation
    ? `      {
        "index": 题号（整数，1–5）,
        "original": "该句英文原句，逐字照抄，不改写",
        "score": 该句得分（数字，满分 2）,
        "points": [
          {
            "point": "采分点对应的英文片段",
            "meaning": "该采分点应表达的意思",
            "score": 该采分点分值（数字）,
            "earned": 该采分点得分（数字）,
            "yourRendering": "我的译文中对应的译文片段，没有则填空字符串",
            "status": "hit|partial|mistranslated|missed|over（命中/部分命中/误译/漏译/多译）",
            "note": "中文说明"
          }
        ],
        "problems": ["误译、漏译及表达问题的说明；区分真正错误与可选优化"],
        "explanation": "关键词含义、句子主干、修饰或指代关系的讲解",
        "yourTranslation": "我这一句的译文，逐字照抄",
        "revised": "修改译文：尽量保留我的正确表达，准确、完整、自然",
        "level": "must|optional|ok"
      }`
    : `      {
        "index": 句序（整数，从 1 开始）,
        "original": "原句，逐字照抄，不改写不纠错",
        "problems": ["问题描述，无问题则空数组"],
        "revised": "修改后的句子；正确的句子原样返回",
        "explanation": "针对这句的中文解释",
        "level": "must|optional|ok",
        "labels": ["问题类型标签，如 主谓一致/时态/搭配/指代/中式表达"]
      }`

  const dimensionsBlock = spec.dimensions
    .map(
      (d) =>
        `    { "key": "${d.key}", "score": 得分（数字，≤${d.max}）, "comment": "针对${d.name}的中文评价", "evidence": ["引用的原文片段"] }`,
    )
    .join(',\n')

  const translationExtra = isTranslation
    ? `
  "typoDeduction": {
    "count": 不影响原意的错别字个数（数字）,
    "deducted": 实际扣分（每满 3 个扣 0.5，不足 3 个不扣，且已按误译扣分的不重复计算）,
    "note": "中文说明"
  },`
    : ''

  /*
   * 小作文专有：格式逐项核对 + 词数统计。
   * 用户在批改原则里明确要求「称呼、结束语和署名单独说明」，
   * 并要求「按题目要求评价长度，不自行套用每少 10 词扣 1 分」，
   * 所以这两件事各给一个字段，不能让模型混在 comment 里糊过去。
   */
  const isSmallEssay = taskType === 'eng1_small'
  const smallEssayExtra = isSmallEssay
    ? `
  "essayFormat": {
    "type": "文本类型，如 书信 / 通知 / 备忘录",
    "salutation": "称呼原文；没有或不适用则填空字符串",
    "closing": "结束语原文；没有或不适用则填空字符串",
    "signature": "署名原文；没有或不适用则填空字符串",
    "bodyWordCount": 正文词数（数字，不含称呼/结束语/署名）,
    "wordCountNote": "按题目要求评价长度的中文说明；明显不足时结合内容完成度判断，不套用固定扣分公式",
    "formatIssues": ["格式方面的问题；没有问题则空数组"]
  },`
    : ''

  const scaleRule = isTranslation
    ? `2. 共 5 句，每句满分 2 分，各句 score 之和减去 typoDeduction.deducted 必须等于 total（最低为 0）。
3. 每句的采分点合计必须为 2 分，且必须在 points[].note 或 explanation 里注明这是「模拟划分」。
4. 整句明显扭曲原意最多 0.5 分；未作答或完全无关得 0 分；局部误译漏译按采分点处理，不重复扣分。
5. sentences 必须覆盖全部 5 句，original 与 yourTranslation 逐字照抄，不替用户改写或纠错。`
    : isSmallEssay
      ? `2. dimensions 数组必须**包含全部 ${spec.dimensions.length} 个维度，一个都不能省**；各维度分之和必须等于 total，且 total 必须落在 band 所选档位的区间内。
3. sentences 必须覆盖全文每一句，original 逐字照抄，顺序与原文一致。
4. 先检查写作对象、目的与任务要点，再综合定档给分，**不机械按错误数量扣分**。
5. 不以连接词、复杂句或同义替换的数量决定分数；常用句式使用得当不扣分，生僻词与长句不自动加分。`
      : `2. dimensions 数组必须**包含全部 ${spec.dimensions.length} 个维度，一个都不能省**；各维度分之和必须等于 total，且 total 必须落在 band 所选档位的区间内。
3. sentences 必须覆盖全文每一句，original 逐字照抄，顺序与原文一致。`

  return `## 附：结构化输出契约（平台自动追加，请严格遵守）

上面的批改要求面向读者，下面这一节面向程序。请在给出自然语言结果的同时，
额外输出一份 JSON，供平台的报告页渲染逐句卡片与分数条。

**硬性要求**
1. 评分维度固定为下面 ${spec.dimensions.length} 项，key 必须逐字使用，合计 ${spec.total} 分：
${spec.dimensions.map((d) => `   - \`${d.key}\` → ${d.name}，满分 ${d.max}`).join('\n')}
${scaleRule}
6. level 取值：must=必须修改 / optional=可选优化 / ok=正确无误。
7. 只输出 JSON 本体，不要包裹 \`\`\`json 代码块，不要输出任何解释文字。

**JSON 结构**
{
  "band": "所属档位，如 ${isTranslation ? '7–8分' : '13–16分'}",
  "total": 总分（数字）,
  "dimensions": [
${dimensionsBlock}
  ],
  "isOnTopic": 是否切题 / 是否完成了任务（true/false）,
  "topicNote": "切题或完成情况的中文说明",
  "sentences": [
${sentenceSchema}
  ],
  "revisedEssay": "${isTranslation ? '整合后的全文参考译文（中文，保留题号，用 \\\\n\\\\n 分段）' : '按修改后全文要求产出的英文全文（保留分段，用 \\\\n\\\\n 分段）'}",
  "revisedWordCount": ${isTranslation ? '参考译文字数（数字）' : '修改后词数（数字）'},${translationExtra}${smallEssayExtra}
  "phrases": [
    { "phrase": "值得积累的词组或句法", "meaning": "中文意思", "usage": "用法说明", "scene": "适用场景" }
  ],
  "structure": {
    "outline": [${isTranslation ? '"各句的翻译思路，逐句一条"' : '"各段思路，逐段一条"'}],
    "frameworks": [{ "name": "可替换句式框架", "example": "例句" }]
  },
  "topFixes": ["归纳出的主要问题，3 条"],
  "practice": ["具体练习建议，与上面 3 条一一对应"],
  "notes": ["需要我确认的地方（如手写图片无法辨认处、缺少上下文等）；没有则空数组"]
}`
}

/** 没有自定义细则时的空白骨架 */
export function buildRubricTemplate(taskType: TaskType): string {
  const spec = TASK_SPECS[taskType]
  const dims = spec.dimensions
    .map((d) => `### ${d.name}（满分 ${d.max} 分）\n- 判分关注点：${d.focus}\n- ${RUBRIC_PLACEHOLDER}`)
    .join('\n\n')

  const bands = spec.bands.map((b) => `- ${b.label}：${b.min}–${b.max} 分 —— ${RUBRIC_PLACEHOLDER}`).join('\n')

  const translationExtra =
    taskType === 'eng1_translation'
      ? `\n\n## 采分点切分要求\n- 该段落共 5 句，每句 2 分。\n- 请逐句列出采分点（关键词、句式结构、逻辑关系），并逐条对照学生译文标注：命中 / 漏译 / 误译 / 多译。\n- ${RUBRIC_PLACEHOLDER}`
      : `\n\n## 逐句诊断要求\n- 请对每一个句子给出：语法问题、优化后的句子、可替换的高级表达、句子结构划分。\n- ${RUBRIC_PLACEHOLDER}`

  return `# ${spec.name} 批改指令

## 一、任务说明
- 满分：${spec.total} 分
- 建议篇幅：${spec.inputs.wordLimit}
- ${RUBRIC_PLACEHOLDER}

## 二、评分档次
${bands}

## 三、评分维度与权重
${dims}

## 四、批改原则
- ${RUBRIC_PLACEHOLDER}

## 五、输出顺序与格式
- ${RUBRIC_PLACEHOLDER}${translationExtra}

${buildOutputContract(taskType)}
`
}

/* -------------------------------------------------------------------------- */
/*  已填写的指令                                                               */
/* -------------------------------------------------------------------------- */

/** 用户提供的「英语一大作文」批改指令（原文照录） */
const ENG1_BIG_INSTRUCTION = `你是一名考研英语一阅卷老师，按照以下要求批改我的大作文（B节，满分20分）。用中文讲解，英文呈现原句、修改句及修改后的作文。严格客观，不刻意给分或压分，评分仅供练习参考。

【评分参考】

17–20分： 很好地完成任务，内容切题，要点完整；语法结构和词汇丰富准确，基本无语言错误；衔接自然，层次清晰，论证充分，搭配和语法恰当。

13–16分： 较好完成任务，主要要点完整，允许遗漏少量次要信息；语言较丰富，偶有错误；行文连贯，层次较清晰，论证较充分。

9–12分： 基本完成任务，内容基本切题，涵盖多数要点；存在一些语言错误，但不影响整体理解；结构和衔接基本合理。

5–8分： 存在审题偏差、重要要点遗漏或无关内容；语言较单调，错误较多，影响理解；连贯性和论证不足。

1–4分： 未完成任务，明显遗漏主要内容；语言错误严重，缺乏组织与衔接，难以有效传达信息。

0分： 未作答、内容完全无关，或语言过少、原文无法辨认从而无法评价。照片模糊时需要求重传，不据此判0分。

【批改原则】

先核对题目、图片和写作要求，明确主题、必答要点及字数要求，不仅凭年份猜题。结合内容、语言和组织结构综合定档，再给分，不编造固定扣分规则。

区分"必须修改的错误"和"可选优化"。正确但简单的表达可以保留，不把生僻、复杂长句当成高分的必要条件。

尽量保留我的原意、论证思路和正确句式；偏题、逻辑不成立或表达不清时才做较大调整，并说明原因。

手写图片先准确转录，保留原有拼写、语法和分段，不偷编纠错。无法辨认或有歧义处请我确认，不把识别错误当成我的错误。

缺少题目或关键图片时，可先批改语言，暂不给出确定总分；词数无法准确统计时如实说明。

【请按以下顺序输出】

一、整体评价与评分

先说原文是否切题，说明是否符合题目要求；给出模拟得分 X/20 及所属档位。从内容与审题、语言准确性与丰富性、结构与衔接三个方面评价，引用具体原文说明得分依据和主要不足。

二、逐句批改

按照"原句→问题→修改句→中文解释"检查拼写、语法、搭配、句子结构、指代及逻辑衔接。标注【必须修改】或【可选优化】，有明显问题的句子说明可以保留。同类错误可合并解释，但需标明位置。

三、修改后全文

在保留原意和正确句式的基础上，修正错误、补足必要衔接。加粗主要修改，注明修改后词数，符合题目要求。

四、表达积累

挑选 3–5 个准确、自然、考场上容易复现的词组或句式，解释中文意思、用法及适用场景，不堆砌生僻词。

五、写作思路与复盘

简要总结本题的段落思路和可替换句式框架，说明哪些内容需要题目调整。最后列出最需要优先改进的 3 个问题，并给出具体练习建议，不只说"多背、多练"。

__INPUT_SECTIONS__`

/** 用户提供的「英语一翻译」批改指令（原文照录） */
const ENG1_TRANSLATION_INSTRUCTION = `你是一名考研英语一阅卷老师，按照以下评分规则批改我的翻译。共 5 个划线句，每句 2 分，满分 10 分。严格客观，不刻意抬分或压分，结果仅供练习参考。

【评分规则】

按点给分：根据英文原文、上下文及参考译文（如有），将每句划分为 3-4 个采分点，分值合计为 2 分，并注明属于模拟划分。意思准确即可得分，不要求与参考译文用词、语序完全一致。

综合考虑准确性、完整性和中文通顺程度。整句明显扭曲原意，最多得 0.5 分；未作答或译文完全无关，得 0 分。局部误译、漏译按对应采分点处理，不重复扣分。

同一处提供多个备选译法时，若其中有错，按错误译法评价。

不影响原意的错别字按全篇累计，每满 3 个扣 0.5 分，不足 3 个不扣；已按误译扣分的错误不再重复计算，总分最低为 0 分。

【批改要求】

逐句输出：

① 单句得分： X/2。

② 采分点： 列出对应英文、应表达的意思、分值及我的得分。

③ 错误分析： 指出误译、漏译及表达问题，解释关键词含义、句子主干、修饰或指代关系。区分真正错误与可选优化，不把正确但不够漂亮的表达判错。

④ 修改译文： 尽量保留我的正确表达，给出准确、完整、自然的译文。

最后汇总各句得分、错别字扣分和总分，归纳 3 个主要问题，并整理值得积累的词组或句法。

如果上传手写图片，先转录原文，无法辨认处请我确认，不要猜测或当作错误。缺少必要上下文时，说明不确定之处，不要编造。

__INPUT_SECTIONS__`

/** 用户提供的「英语一小作文」批改指令（原文照录） */
const ENG1_SMALL_INSTRUCTION = `你是一名考研英语一阅卷老师，批改我的小作文，满分10分。按照以下民间整理的评分参考，严格客观地评价，不刻意分数或压分，结果仅供参考。

【评分参考】
9—10分：完整覆盖任务要点，目的明确，格式和语气恰当；语言准确、表达自然，衔接流畅。
7—8分：较好完成任务，主要要点完整，格式基本正确；语言有一定变化，偶有错误，行文连贯。
5—6分：基本完成任务，涵盖多数要点；格式或语言存在一些问题，但不影响整体理解。
3—4分：遗漏重要要点或存在明显缺点；格式不当、语言错误较多，影响理解。
1—2分：严重偏离任务，内容明显不足，只有少数句子可以理解。
0分：未作答、内容完全无关，或没有可评价的英文内容。

【批改原则】
1. 先检查写作对象、目的和任务要点，再结合语言、格式及连贯性综合定档、给分，不机械按错误数量扣分。
2. 根据具体文本检查格式，例如书信的称呼、结束语和署名、通知的标题和落款；同时检查是否符合题目指定的身份、姓名及语气要求。
3. 统计正文词数，称呼、结束语和署名单独说明，按照题目要求评价长度。明显不足时结合内容完成度判断，不自行套用"每少10词扣1分"等规则，不重复扣分。
4. 不以连接词、复杂句或同义替换的数量决定分数；常用句式使用得当不扣分，生僻词和长句不自动加分。

【输出要求】
① 整体评分：给出词数、X/10分、所属档位，以及内容、格式、语言和衔接方面的具体依据。
② 逐句批改：按"原句→修改句→中文解释"呈现，区分必须修改的错误与可选优化，正确表达可以保留。
③ 修改后全文：尽量保留我的原意和正确句式，分粗主要修改，符合题目字数及文本要求。
④ 复盘积累：总结3个最需要改进的问题，提炼3—5个可复用表达，简要给出结合错误的写作框架。

如果上传手写图片，请先准确转录，无法辨认处请我确认，不要猜测或当作错误。缺少题目时，先批改语言，暂不给出确定总分。用中文讲解，英文呈现原句与修改内容。

__INPUT_SECTIONS__`

/**
 * 已由用户填入的批改指令。key 存在即表示该题型有现成指令，
 * 首次加载时写入 store，之后完全由用户接管（改动不会被覆盖）。
 */
const SEEDS: Partial<Record<TaskType, RubricSeed>> = {
  eng1_big: {
    content: `${withInputSections(ENG1_BIG_INSTRUCTION, 'eng1_big')}\n\n${buildOutputContract('eng1_big')}`,
    note: '内置：考研英语一大作文批改指令',
  },
  eng1_small: {
    content: `${withInputSections(ENG1_SMALL_INSTRUCTION, 'eng1_small')}\n\n${buildOutputContract('eng1_small')}`,
    note: '内置：考研英语一小作文批改指令',
  },
  eng1_translation: {
    content: `${withInputSections(ENG1_TRANSLATION_INSTRUCTION, 'eng1_translation')}\n\n${buildOutputContract('eng1_translation')}`,
    note: '内置：考研英语一翻译批改指令',
  },
}

export function getRubricSeed(taskType: TaskType): RubricSeed | undefined {
  return SEEDS[taskType]
}

/* -------------------------------------------------------------------------- */
/*  判空与体检                                                                 */
/* -------------------------------------------------------------------------- */

/** 空白骨架的占位符 */
const PLACEHOLDER_TOKEN = '此处填写该题型的评分细则'

/**
 * 骨架里一共埋了这么多处占位符（见 buildRubricTemplate 的生成逻辑）。
 * 用它做统计判据，而不是「出现任意一处就算未填写」。
 */
export const SKELETON_PLACEHOLDER_COUNT = 8

/**
 * 正文里是否有实打实的内容（相对「只有骨架 + 占位符」而言）。
 *
 * 判据是**统计式**的：骨架的特征是占位符成片出现；
 * 而用户写的内容里即便提到一次这句话，也只是零星一处。
 *
 * 为什么不用「出现占位符就判未填写」：那样用户正文里引用一次这句话，
 * 整份细则就会被判成「待填写」，界面其他部分却完全正常，极难排查——
 * 这正是之前那个 bug。
 * 为什么也不单看长度：用户可能只写了几十字的简短口径，那是合法的、已填写的。
 */
function hasRealContent(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return false
  const placeholders = rubricProgress(trimmed)
  // 占位符成片出现 → 还是骨架
  if (placeholders >= 3) return false
  // 有真实内容可读 → 已填写
  if (userContent(trimmed).length >= 24) return true
  return placeholders === 0
}

/**
 * 判断细则是否已填写。
 *
 * 以显式的 filled 标记为准；标记缺失（老数据）时退回内容判断。
 *
 * 为什么不再用「数占位符」判断：
 * 那个做法把「内容里出现过某串字」当成「还没填」，极其脆弱——
 * 用户正文里只要引用了同样一句话（或在批注里提到它），
 * 整份细则就会被判成「待填写」，而界面其他部分看起来完全正常，极难排查。
 */
export function isRubricFilled(rubric: Pick<Rubric, 'content' | 'filled'>): boolean {
  if (!rubric.content.trim()) return false
  if (rubric.filled !== undefined) return rubric.filled
  return hasRealContent(rubric.content)
}

/** 还剩多少处占位符没填（只用于给用户看的提示，不用于判状态） */
export function rubricProgress(content: string): number {
  return content.split(PLACEHOLDER_TOKEN).length - 1
}

/** 正文里是否还留着空白骨架的占位符 */
export function hasPlaceholder(content: string): boolean {
  return content.includes(PLACEHOLDER_TOKEN)
}

/** 模板里的框架行：本身是提示，不是评分依据 */
const SCAFFOLD_LINES: RegExp[] = [
  /^#.*批改指令$/,
  /^#.*评分细则$/,
  /^##\s*[一二三四五]、/,
  /^\s*-\s*满分：/,
  /^\s*-\s*建议篇幅：/,
  /^\s*-\s*判分关注点：/,
  /^\s*-\s*(第五|第四|第三|第二|第一)档：/,
  /^\s*-\s*(优秀|良好|及格|较差|极差)：/,
]

/**
 * 剥掉占位符与模板脚手架，只留下用户真正写进去的内容。
 * 默认骨架带有「档次 / 维度 / 关注点」等大量框架文字，
 * 若按总字符数判断，会把一份一个字都没写的空骨架误判成「已填写」。
 */
function userContent(content: string): string {
  let rest = content.split(PLACEHOLDER_TOKEN).join('')
  rest = rest.replace(/\s/g, '')
  for (const line of content.split('\n')) {
    if (SCAFFOLD_LINES.some((re) => re.test(line))) {
      rest = rest.split(line.replace(/\s/g, '')).join('')
    }
  }
  return rest
}

/** 是否只剩模板骨架、没有任何用户内容（仅老数据回退路径使用） */
export function isRubricEmpty(content: string): boolean {
  if (content.includes(PLACEHOLDER_TOKEN)) return true
  return userContent(content).length < 24
}

export interface RubricCheck {
  id: string
  level: 'ok' | 'warn'
  label: string
  hint: string
}

export interface RubricReport {
  /** 是否已填写（不再是空骨架） */
  filled: boolean
  /** 剩余未填的占位符数量 */
  remaining: number
  checks: RubricCheck[]
  warnCount: number
}

/**
 * 检查项。
 *
 * 注意措辞：细则可以走「按档给分」也可以走「按点扣分」，两条路都成立。
 * 因此这里只检查「有没有给出可判定的依据」，不预设必须是扣分制。
 */
const COMMON_RULES: {
  id: string
  test: RegExp
  okLabel: string
  okHint: string
  warnLabel: string
  warnHint: string
}[] = [
  {
    id: 'bands',
    test: /\d+\s*[–\-—~]\s*\d+\s*分|档次|第[一二三四五]档|段位/i,
    okLabel: '包含评分档次区间',
    okHint: '模型能把总分落到正确档位，不会给出无依据的中间分。',
    warnLabel: '未检测到档次区间',
    warnHint: '建议写明各档分数范围与特征，模型才有定档依据。',
  },
  {
    id: 'basis',
    test: /扣分|减分|得分点|给分点|采分点|评分(参考|标准|依据)|定档/,
    okLabel: '包含可判定的给分依据',
    okHint: '按档给分或按点扣分都可以，只要规则可判定。',
    warnLabel: '未检测到给分 / 扣分依据',
    warnHint: '写明「什么情况落在什么档」，是评分稳定性的关键。',
  },
  {
    id: 'length',
    test: /字数|词数|words|篇幅|词左右/,
    okLabel: '包含篇幅 / 字数要求',
    okHint: '格式语域维度有据可依。',
    warnLabel: '未检测到字数要求',
    warnHint: '建议写明字数区间及不足 / 超出的处理方式。',
  },
  {
    id: 'sentence',
    test: /逐句|句子|语法|拼写|搭配|指代|结构|转录/,
    okLabel: '包含逐句 / 语言层面的诊断要求',
    okHint: '报告页的逐句折叠卡依赖这部分指令。',
    warnLabel: '未检测到逐句诊断要求',
    warnHint: '若希望报告页输出逐句优化卡，需在此明确要求。',
  },
  {
    id: 'output',
    test: /输出|请按以下顺序|整体评价|修改后全文|表达积累|复盘/,
    okLabel: '规定了输出顺序与内容',
    okHint: '模型会按你要求的顺序组织结果，报告页与文字稿一致。',
    warnLabel: '未规定输出结构',
    warnHint: '建议写明要输出哪几部分，避免模型自由发挥。',
  },
  {
    id: 'principle',
    test: /原则|保留|原意|不编造|客观|不.*(压分|刻意给分)/,
    okLabel: '包含批改原则（保原意 / 不编造）',
    okHint: '能有效抑制模型过度改写与凭空扣分。',
    warnLabel: '未检测到批改原则',
    warnHint: '建议明确「保留原意」「不编造扣分规则」这类约束。',
  },
]

/**
 * 细则体检。
 * 关键词检查只在「已填写」时才有意义——空骨架里本来就带着
 * 「档次」「扣分」这些框架词，对骨架做匹配会产生一堆假通过。
 */
export function reviewRubric(content: string, taskType: TaskType): RubricReport {
  const remaining = rubricProgress(content)
  // 体检只看「正文有没有内容」，不看 filled 标记：
  // 用户可能刚粘完还没保存，此时也应该能得到体检反馈。
  const filled = hasRealContent(content)

  if (!filled) {
    return {
      filled: false,
      remaining,
      warnCount: 1,
      checks: [
        {
          id: 'empty',
          level: 'warn',
          label: remaining > 0 ? `细则尚未填写（${remaining} 处占位）` : '细则内容为空白',
          hint: '空白骨架仍可保存。但批改时模型拿不到评分依据，分数与批语都会失去准头——这是当前最该先补上的一步。',
        },
      ],
    }
  }

  const checks: RubricCheck[] = []

  if (remaining > 0) {
    checks.push({
      id: 'placeholder',
      level: 'warn',
      label: `正文里还留着 ${remaining} 处空白骨架的占位符`,
      hint: '骨架文本会一起上传给模型，建议删掉或用真实内容替换，避免模型被提示词干扰。',
    })
  }

  checks.push(...COMMON_RULES.map((rule): RubricCheck => {
    const hit = rule.test.test(content)
    return {
      id: rule.id,
      level: hit ? 'ok' : 'warn',
      label: hit ? rule.okLabel : rule.warnLabel,
      hint: hit ? rule.okHint : rule.warnHint,
    }
  }))

  // 结构化契约由平台自动追加，这里确认它确实在
  const hasContract = content.includes('结构化输出契约')
  checks.push({
    id: 'contract',
    level: hasContract ? 'ok' : 'warn',
    label: hasContract ? '含结构化输出契约' : '缺少结构化输出契约',
    hint: hasContract
      ? '报告页能据此渲染逐句卡片与维度分数条。'
      : '缺少契约时报告页只能拿到纯文本，无法渲染逐句折叠卡与分数可视化。',
  })

  if (taskType === 'eng1_small') {
    const hit = /称谓|落款|格式|语域|署名/.test(content)
    checks.push({
      id: 'format',
      level: hit ? 'ok' : 'warn',
      label: hit ? '包含小作文格式要求' : '未检测到格式 / 语域要求',
      hint: hit ? '称呼、落款、语域是小作文的硬性得分点。' : '小作文格式分占比高，建议明确称呼、落款与语域要求。',
    })
  }

  if (taskType === 'eng1_translation') {
    const hit = /采分点|关键词|漏译|误译|通顺/.test(content)
    checks.push({
      id: 'keypoints',
      level: hit ? 'ok' : 'warn',
      label: hit ? '包含采分点对照要求' : '未检测到采分点 / 漏译误译要求',
      hint: hit ? '翻译按采分点给分，这部分是核心。' : '翻译判分依赖采分点，建议写明如何切分与对照。',
    })
  }

  return {
    filled: true,
    remaining: 0,
    checks,
    warnCount: checks.filter((c) => c.level === 'warn').length,
  }
}
