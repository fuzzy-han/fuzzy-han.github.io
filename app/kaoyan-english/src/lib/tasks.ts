import type { ProviderPreset, TaskSpec, TaskType } from '@/types/domain'

/* -------------------------------------------------------------------------- */
/*  三大题型模块 — 分值与档次均为「可配置」的默认骨架                           */
/*  依据：考研英语一 写作 30 分（大作文 20 + 小作文 10）、翻译 10 分             */
/*  用户可在设置页改写分值与细则，这里只是开箱默认值                             */
/* -------------------------------------------------------------------------- */

export const TASK_SPECS: Record<TaskType, TaskSpec> = {
  eng1_big: {
    type: 'eng1_big',
    name: '英语一 · 大作文',
    shortName: '大作文',
    total: 20,
    bands: [
      { label: '第五档', min: 17, max: 20 },
      { label: '第四档', min: 13, max: 16 },
      { label: '第三档', min: 9, max: 12 },
      { label: '第二档', min: 5, max: 8 },
      { label: '第一档', min: 0, max: 4 },
    ],
    dimensions: [
      { key: 'content', name: '内容要点', max: 6, focus: '是否切题、是否涵盖图画/图表全部寓意要点' },
      { key: 'language', name: '语言表达', max: 8, focus: '语法准确性、词汇丰富度与地道程度' },
      { key: 'structure', name: '篇章结构', max: 4, focus: '段落层次、衔接手段、逻辑连贯' },
      { key: 'format', name: '格式语域', max: 2, focus: '文体规范、语域恰当、字数与卷面' },
    ],
    reportMode: 'essay',
    inputs: {
        promptLabel: '题目 / 图画描述',
      promptPlaceholder:
        '粘贴真题的写作要求，并用自己的话描述图画内容（AI 看不到图，描述越具体越准）：\n\n例：图中两位登山者相互搀扶攀登陡崖，配文 "Cooperate"…\n要求：1) describe the drawing briefly  2) interpret its intended meaning  3) give your comments',
      promptHint: '必须提供。图画题的寓意判断完全依赖这段描述。',
      wordLimit: '约 160–200 词',
    },
    guide: {
      year: {
        label: '题目年份',
        placeholder: '例如：2023 或 2023 英语一',
        hint: '可选。填了准确我会核对题目；不填我不会拿年份去猜题，只按你提供的题干批改。',
      },
      prompt: {
        label: '完整题目及写作要求',
        placeholder:
          '可选。粘贴题干原文，或上传 / 拍照包含题干与图片的内容。若提供，请尽量包含：\n\n1) 写作要求的三条指令原文\n2) 图画内容的文字描述——**我看不到图片**，请你用中文或英文描述清楚：\n   · 图中人物 / 动物 / 物体分别是什么、在做什么\n   · 图上的英文标注或对话气泡，逐字照抄\n   · 整体画面传递的对立、对比或因果\n\n示例：\n「Directions: Write an essay of 160-200 words based on the following drawing. In your essay, you should 1) describe the drawing briefly, 2) interpret its intended meaning, and 3) give your comments.\n图画描述：两位登山者相互搀扶，共同攀登一处陡崖；图下方英文标注为 "Cooperate"。」',
        hint: '可选。不给题目也能批改——我会先批改语言与结构，但不给确定总分，也不会替你猜主题。',
      },
      essay: {
        label: '我的作文',
        placeholder:
          '粘贴正文，或上传清晰照片。\n\n· 手写照片请确保光线充足、字迹可辨；我会先准确转录，保留你原有的拼写、语法和分段。\n· 有无法辨认或有歧义的地方，我会列出来请你确认，不会把识别错误当成你的错误。\n· 正文里不要混入题干或提纲，避免词数统计出错。',
        hint: '词数达不到要求时我会如实说明，并单独指出哪些句子可以扩展。',
      },
      extras: {
        label: '额外需求',
        placeholder:
          '可选。例如：\n· 我基础较弱，请把语法讲解写细一点\n· 重点检查主谓一致和时态\n· 不要替换我的句子结构，只改错误\n· 我想看看有没有更高级的表达',
        hint: '留空则按默认口径批改。',
      },
    },
  },

  eng1_small: {
    type: 'eng1_small',
    name: '英语一 · 小作文（应用文）',
    shortName: '小作文',
    total: 10,
    bands: [
      { label: '第五档', min: 9, max: 10 },
      { label: '第四档', min: 7, max: 8 },
      { label: '第三档', min: 5, max: 6 },
      { label: '第二档', min: 3, max: 4 },
      { label: '第一档', min: 0, max: 2 },
    ],
    dimensions: [
      { key: 'format', name: '格式与语域', max: 2, focus: '书信/通知/备忘录的固定格式、称呼与落款、语域正确' },
      { key: 'points', name: '要点完整', max: 4, focus: '提纲要求的三点是否全部覆盖且有效阐述' },
      { key: 'language', name: '语言表达', max: 3, focus: '语法、拼写、用词准确性' },
      { key: 'coherence', name: '连贯得体', max: 1, focus: '句间衔接与整体得体程度' },
    ],
    reportMode: 'essay',
    inputs: {
        promptLabel: '题目 / 提纲要求',
      promptPlaceholder:
        '粘贴真题要求，务必包含称谓对象与三条提纲：\n\n例：Suppose you are a student… Write a letter to the librarian to\n1) suggest a book list, 2) explain the reason, 3) express thanks.\nDo not sign your own name. Use "Li Ming" instead.',
      promptHint: '必须提供。小作文的得分点就是提纲那几条。',
      wordLimit: '约 100 词',
    },
    guide: {
      prompt: {
        label: '完整题目及要求',
        placeholder:
          '可选。粘贴题干原文，或上传 / 拍照。若提供，请尽量包含：\n\n1) 文本类型与写作目的（书信 / 通知 / 备忘录 / 告示……）\n2) 三条提纲要求，逐条照抄\n3) 我扮演的身份与对象（如「图书馆管理员」「外教 Smith」）\n4) 对署名、姓名、语气的具体规定（如 Do not sign your own name. Use "Li Ming" instead.）\n5) 若有背景情境（如刚收到对方来信），一并附上\n\n示例：\n「Suppose you are a student who has just returned from a library. Write a letter to the librarian to 1) suggest a book list, 2) explain the reason, 3) express thanks. Do not sign your own name. Use "Li Ming" instead.」',
        hint: '可选。不给题目时，我只核对格式与语言，不判断提纲要点是否覆盖，也不给确定总分。',
      },
      essay: {
        label: '我的作文',
        placeholder:
          '粘贴正文或上传清晰照片，**请连同称呼、结束语、署名一起提交**——它们各自单独计分，缺了我无法判断格式。\n\n· 手写照片请确保光线充足、字迹可辨；我会先准确转录。\n· 无法辨认处我会列出来请你确认，不会当成错误。',
        hint: '我会分别统计正文词数与称呼/结束语/署名，并说明是否达标。',
      },
      extras: {
        label: '额外需求',
        placeholder:
          '可选。例如：\n· 我不确定书信的语气是否得体，重点看语域\n· 请告诉我三条提纲要点各自覆盖得怎么样\n· 我基础较弱，讲解请写细一点',
        hint: '留空则按默认口径批改。',
      },
    },
  },

  eng1_translation: {
    type: 'eng1_translation',
    name: '英语一 · 翻译',
    shortName: '翻译',
    total: 10,
    bands: [
      { label: '优秀', min: 9, max: 10 },
      { label: '良好', min: 7, max: 8 },
      { label: '及格', min: 5, max: 6 },
      { label: '较差', min: 3, max: 4 },
      { label: '极差', min: 0, max: 2 },
    ],
    dimensions: [
      { key: 'accuracy', name: '准确完整', max: 4, focus: '采分点是否命中，有无漏译、误译、多译' },
      { key: 'fluency', name: '通顺连贯', max: 3, focus: '中文是否通顺，是否摆脱英文语序的翻译腔' },
      { key: 'language', name: '词汇语法', max: 3, focus: '关键词译法、长难句结构处理是否得当' },
    ],
    reportMode: 'translation',
    inputs: {
        promptLabel: '英文原文（待翻译段落）',
      promptPlaceholder:
        '粘贴真题中的英文段落（通常为 5 个划线句）。\n\n注意：翻译题的「待批改内容」= 你的中文译文；这里填的是英文原文。',
      promptHint: '必须提供。翻译评分按句给采分点，缺原文无法判分。',
      wordLimit: '通常 5 句 / 约 150 词',
    },
    guide: {
      prompt: {
        label: '英文原文及划线句',
        placeholder:
          '粘贴完整段落或上传清晰照片**请把上下文一起粘贴，不要只给 5 个孤立句子**——上下文会直接影响代词指代、时态衔接和部分采分点的判断。\n\n· 如果方便，请标出哪几句是划线句（通常为 5 句）。\n· 若题目给了其他段落作背景，也一并附上。\n· 上传图片时请确保英文清晰可辨；无法辨认处我会列出来请你确认，不会猜测或当作错误。',
        hint: '可选，但强烈建议提供。没有英文原文我无法划分采分点，只能退回评价中文表达质量。',
      },
      essay: {
        label: '我的译文',
        placeholder:
          '按题号填写译文，或上传手写照片。\n\n· 请**逐句对应**，例如「(46) ……」「(47) ……」，便于我按采分点核对，也避免张冠李戴。\n· 同一处若你写了多个备选译法，请标出来；按题目规则，其中若有错，我会按错误译法评价。\n· 手写照片我会先准确转录，保留你的原文用词。',
        hint: '整句明显扭曲原意按规则最多 0.5 分；未作答或完全无关得 0 分。',
      },
      extras: {
        label: '额外需求',
        placeholder:
          '可选。例如：\n· 第 (49) 句结构看不懂，请重点拆主干和修饰关系\n· 我总翻得太「英文化」，重点看中文通顺度\n· 请告诉我哪些采分点是我反复丢的',
        hint: '留空则按默认口径批改。',
      },
    },
  },
}

export const TASK_ORDER: TaskType[] = ['eng1_big', 'eng1_small', 'eng1_translation']

export function getTaskSpec(type: TaskType): TaskSpec {
  return TASK_SPECS[type]
}

/* -------------------------------------------------------------------------- */
/*  模型服务商预设 — 全部走 OpenAI 兼容的 /chat/completions                     */
/* -------------------------------------------------------------------------- */

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    supportsVision: false,
    note: '性价比高，中文语境理解好；目前不支持图片输入。',
  },
  {
    id: 'kimi',
    name: 'Kimi（月之暗面）',
    baseUrl: 'https://api.moonshot.cn/v1',
    docsUrl: 'https://platform.moonshot.cn/console/api-keys',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'kimi-latest'],
    supportsVision: true,
    note: '长上下文友好，kimi-latest 系列支持图片识别，可用于作文照片。',
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    docsUrl: 'https://bailian.console.aliyun.com/',
    models: ['qwen-plus', 'qwen-max', 'qwen-vl-max'],
    supportsVision: true,
    note: 'qwen-vl-max 具备视觉能力，手写体识别表现较好。',
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    models: ['glm-4-plus', 'glm-4-air', 'glm-4v-plus'],
    supportsVision: true,
    note: 'glm-4v-plus 支持图片，可作 OCR 备用通道。',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1'],
    supportsVision: true,
    note: '需要可直连的网络环境；支持视觉输入。',
  },
  {
    id: 'custom',
    name: '自定义 / 中转',
    baseUrl: '',
    docsUrl: '',
    models: [],
    supportsVision: false,
    note: '填任意 OpenAI 兼容端点，例如自建中转或本地 Ollama（http://localhost:11434/v1）。',
  },
]

export function getProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}

export function getProviderName(id: string): string {
  return getProviderPreset(id)?.name ?? id
}
