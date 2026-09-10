#!/usr/bin/env node
/* ==========================================================================
   假模型服务（仅供自检使用，不参与生产）

   为什么需要它：批改链路涉及流式 SSE、JSON 契约解析、分数规范化等一堆
   容易出错的地方，用真实模型测试既慢又花钱、结果还不稳定。
   这里返回一份固定的、结构完整的批改结果，让自检可以断言到具体字段。
   端口默认 8891。
   ========================================================================== */
// 假模型服务：验证批改链路（SSE 流式 + JSON 契约）是否真的跑得通
import { createServer } from 'node:http'

const SAMPLE = {
  band: '13–16分',
  total: 15,
  dimensions: [
    { key: 'content', score: 5, comment: '切题，但图画寓意挖掘不足。', evidence: ['The picture show two climbers'] },
    { key: 'language', score: 6, comment: '语法基本正确，存在主谓一致错误。', evidence: ['The picture show'] },
    { key: 'structure', score: 2.5, comment: '段落清晰，衔接词偏少。', evidence: [] },
    { key: 'format', score: 1.5, comment: '字数偏少。', evidence: [] },
  ],
  isOnTopic: true,
  topicNote: '文章围绕合作展开，符合图画寓意。',
  sentences: [
    {
      index: 1,
      original: 'The picture show two climbers who help each other to climb the mountain.',
      problems: ['主谓不一致：主语 The picture 为第三人称单数，谓语应为 shows。'],
      revised: 'The picture shows two climbers helping each other up the mountain.',
      explanation: '主语为单数，谓语需用第三人称单数形式。',
      level: 'must',
      labels: ['主谓一致'],
    },
    {
      index: 2,
      original: 'We should learn the spirit of cooperation.',
      problems: [],
      revised: 'We should learn the spirit of cooperation.',
      explanation: '句子正确，可以保留。',
      level: 'ok',
      labels: [],
    },
  ],
  revisedEssay: 'The picture shows two climbers helping each other up the mountain.\n\nWe should learn the spirit of cooperation.',
  revisedWordCount: 21,
  phrases: [
    { phrase: 'help each other', meaning: '互相帮助', usage: '作谓语，主语为复数。', scene: '描述合作场景' },
  ],
  structure: {
    outline: ['第一段描述图画', '第二段阐释寓意', '第三段给出评论'],
    frameworks: [{ name: 'As is vividly depicted in the drawing, ...', example: 'As is vividly depicted in the drawing, two climbers are helping each other.' }],
  },
  topFixes: ['主谓一致', '衔接词偏少', '补充细节'],
  practice: ['每天改写 5 句主谓一致练习', '积累 10 个衔接词', '练习扩写段落'],
  notes: [],
}

const TRANSLATION = {
  band: '7–8分',
  total: 7,
  dimensions: [
    { key: 'accuracy', score: 3, comment: '主要采分点基本命中。', evidence: [] },
    { key: 'fluency', score: 2, comment: '中文较通顺。', evidence: [] },
    { key: 'language', score: 2, comment: '个别关键词译法欠妥。', evidence: [] },
  ],
  isOnTopic: true,
  topicNote: '整段翻译基本传达原意。',
  sentences: [
    {
      index: 1,
      original: 'It is generally agreed that a person of high intelligence is one who can grasp ideas readily.',
      score: 1.5,
      points: [
        { point: 'It is generally agreed that', meaning: '人们普遍认为', score: 0.5, earned: 0.5, yourRendering: '人们普遍认为', status: 'hit', note: '形式主语句处理正确。' },
        { point: 'a person of high intelligence', meaning: '智力高的人', score: 0.5, earned: 0.5, yourRendering: '高智力的人', status: 'hit', note: '' },
        { point: 'grasp ideas readily', meaning: '迅速领会思想', score: 1, earned: 0.5, yourRendering: '很快抓住想法', status: 'partial', note: 'readily 的程度感略弱。' },
      ],
      problems: ['readily 译为「很快」可接受，但「迅速」更贴切。'],
      explanation: '主句为形式主语结构，真正主语是 that 从句。',
      yourTranslation: '人们普遍认为，高智力的人就是能很快抓住想法的人。',
      revised: '人们普遍认为，智力高的人能够迅速领会各种思想。',
      level: 'optional',
    },
  ],
  revisedEssay: '(1) 人们普遍认为，智力高的人能够迅速领会各种思想。',
  revisedWordCount: 24,
  typoDeduction: { count: 2, deducted: 0, note: '未满 3 个，不扣分。' },
  phrases: [{ phrase: 'be agreed that', meaning: '一致认为', usage: '常用于引出共识。', scene: '议论段落开头' }],
  structure: { outline: ['第一句点出定义'], frameworks: [{ name: 'It is generally agreed that ...', example: 'It is generally agreed that ...' }] },
  topFixes: ['关键词精度', '长句断句', '中文衔接'],
  practice: ['精读长难句', '对照参考译文', '整理一词多义'],
  notes: ['第 2 句未提供译文，无法评分。'],
}


/** 模板提炼请求的假响应 */
const TEMPLATES = JSON.stringify({
  templates: [
    {
      category: 'grammar',
      title: '主谓一致的第三人称单数',
      body: 'The picture shows two climbers...',
      meaning: '主语是单数时谓语动词要加 s；这是最容易在考场上一紧张就写错的地方。',
      usage: '写作时先找出主语，判断单复数，再落笔谓语。描述图画时主语常是 The picture / The chart。',
      scene: '图画描述段首句',
      example: 'The picture shows two climbers helping each other.',
      wrongExample: 'The picture show two climbers who help each other.',
      problemTags: ['主谓一致'],
    },
    {
      category: 'collocation',
      title: '表达「培养合作精神」',
      body: 'cultivate a cooperative spirit',
      meaning: '培育合作精神；比 learn the spirit of cooperation 更地道。',
      usage: 'cultivate 后接抽象名词，如 cultivate a habit / a sense of responsibility。',
      scene: '论证段落点题',
      example: 'We should cultivate a cooperative spirit in our daily life.',
      wrongExample: 'We should learn the spirit of cooperation.',
      problemTags: ['搭配', '中式表达'],
    },
  ],
})

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', '*')
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }

  let body = ''
  for await (const chunk of req) body += chunk

  const parsed = body ? JSON.parse(body) : {}
  const rawMessages = JSON.stringify(parsed.messages ?? [])
  // 模板提炼请求：提示词里会出现「提炼」「模板」这类字样
  const isTemplateRequest = rawMessages.includes('提炼') && rawMessages.includes('模板')
  const isTranslation = rawMessages.includes('翻译')
  const payload = isTemplateRequest ? null : isTranslation ? TRANSLATION : SAMPLE
  /*
   * 忠实模拟真实行为：只有带了 response_format: json_object 才回 JSON，
   * 否则像真实模型一样回一段人类可读的文字报告。
   * 这一点很关键 —— 假模型如果无条件回 JSON，就会掩盖
   * 「模型不听契约、首轮拿不到 JSON」这类真实故障。
   */
  const wantsJson = Boolean(parsed.response_format?.type === 'json_object')
  const content = wantsJson
    ? (isTemplateRequest ? TEMPLATES : JSON.stringify(payload))
    : (isTemplateRequest
        ? '一、可复用模板\n\n1. 主谓一致：The picture shows...\n2. 搭配：cultivate a cooperative spirit'
        : '一、整体评价与评分\n\n切题情况：本文围绕合作展开。\n\n二、逐句批改\n\n1. The picture show... → The picture shows...')

  if (parsed.stream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    // 切块下发，模拟真实流式
    const size = 220
    for (let i = 0; i < content.length; i += size) {
      const piece = content.slice(i, i + size)
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)
      await new Promise((r) => setTimeout(r, 12))
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 3200, completion_tokens: 1800, total_tokens: 5000 } })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 3200, completion_tokens: 1800, total_tokens: 5000 },
  }))
})

server.listen(8891, '127.0.0.1', () => console.log('mock api on http://127.0.0.1:8891/v1'))
