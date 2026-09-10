#!/usr/bin/env node
/* ==========================================================================
   JSON 容错提取单元测试（纯函数，不需要浏览器）

   为什么单列一套：真实模型返回的 JSON 经常带围栏、带前后话术、被截断。
   这些情况无法靠端到端测试稳定复现，必须用固定样本直接打。
   ========================================================================== */

import { extractJson } from '../src/lib/json.ts'
import { ensureJsonKeyword, describeEmptyResponse } from '../src/lib/json.ts'

let failed = 0
let total = 0
const check = (name, pass, detail = '') => {
  total += 1
  if (!pass) failed += 1
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}${detail ? '  → ' + detail : ''}`)
}

const cases = [
  {
    name: '标准 JSON',
    input: '{"total":15,"band":"13–16分"}',
    expect: (v) => v.total === 15,
  },
  {
    name: '带 ```json 围栏',
    input: '```json\n{"total":15}\n```',
    expect: (v) => v.total === 15,
  },
  {
    name: '带 ``` 围栏（无语言标记）',
    input: '```\n{"total":15}\n```',
    expect: (v) => v.total === 15,
  },
  {
    name: '前后有客套话',
    input: '好的，以下是批改结果：\n\n{"total":15}\n\n希望对你有帮助！',
    expect: (v) => v.total === 15,
  },
  {
    name: 'JSON 之后还有带大括号的说明',
    input: '{"total":15}\n\n补充说明：{"note":"这不是正文"}',
    expect: (v) => v.total === 15,
  },
  {
    name: '字符串内部含大括号',
    input: '{"revised":"The picture {shows} two climbers","total":15}',
    expect: (v) => v.total === 15 && v.revised.includes('{shows}'),
  },
  {
    name: '字符串内部含转义引号',
    input: '{"quote":"he said \\"hi\\"","total":15}',
    expect: (v) => v.total === 15 && v.quote.includes('"hi"'),
  },
  {
    name: '嵌套对象与数组',
    input: '{"structure":{"outline":["a","b"],"frameworks":[{"name":"X","example":"Y"}]},"total":15}',
    expect: (v) => v.structure.outline.length === 2 && v.structure.frameworks[0].name === 'X',
  },
  {
    name: '被截断（缺右括号）',
    input: '{"total":15,"sentences":[{"index":1,"original":"The picture show"',
    expect: (v) => v.total === 15,
    repaired: true,
  },
  {
    name: '被截断（字符串未闭合）',
    input: '{"total":15,"revisedEssay":"The picture shows two',
    expect: (v) => v.total === 15,
    repaired: true,
  },
  {
    name: '尾部悬空逗号',
    input: '{"total":15,',
    expect: (v) => v.total === 15,
    repaired: true,
  },
  {
    name: '中文标点混入（应失败而不是误判成功）',
    input: 'total：15',
    expect: null,
  },
  {
    name: '完全不是 JSON（应失败）',
    input: '抱歉，我无法完成这个任务。',
    expect: null,
  },
  {
    name: '空字符串（应失败）',
    input: '',
    expect: null,
  },
]

for (const c of cases) {
  const result = extractJson(c.input)
  if (c.expect === null) {
    check(c.name, result.ok === false, result.ok ? '却解析成功了' : '')
    continue
  }
  if (!result.ok) {
    check(c.name, false, `解析失败：${result.error}`)
    continue
  }
  let pass
  try {
    pass = c.expect(result.value)
  } catch (err) {
    check(c.name, false, `断言抛错：${err.message}`)
    continue
  }
  if (c.repaired !== undefined) {
    pass = pass && result.repaired === c.repaired
  }
  check(c.name, pass, pass ? '' : `值不符：${JSON.stringify(result.value).slice(0, 120)}`)
}

/* --------------------------------------------------------------------------
   jsonMode 兜底
   DeepSeek 等厂商在 response_format=json_object 时要求提示词里出现 "json"，
   否则直接 400。这条曾经让「JSON 解析失败后的重试」必然失败。
   -------------------------------------------------------------------------- */
console.log('\n── jsonMode 关键词兜底 ──')

const bare = [{ role: 'user', content: '给这句打分：The picture show two climbers.' }]
const patched = ensureJsonKeyword(bare)
check('提示词无 json 字样时会被补上', /json/i.test(patched[patched.length - 1].content))
check('未改动非末条消息', patched.length === bare.length)
check('不改动传入的原始数组（纯函数）', bare[0].content === '给这句打分：The picture show two climbers.')
check('原句内容仍保留', patched[patched.length - 1].content.includes('two climbers'))

const already = [{ role: 'user', content: '请输出 JSON 格式的结果' }]
check('已有 json 字样时不重复追加',
  ensureJsonKeyword(already)[0].content === already[0].content)

const upper = [{ role: 'user', content: '请输出 JSON' }]
check('大写 JSON 也认（大小写不敏感）',
  ensureJsonKeyword(upper)[0].content === upper[0].content)

const multi = [
  { role: 'system', content: '你是阅卷老师，输出 json' },
  { role: 'user', content: '批改这段作文' },
]
check('任意一条消息含 json 即满足',
  ensureJsonKeyword(multi)[1].content === '批改这段作文')

const multimodal = [
  { role: 'user', content: [{ type: 'text', text: '转录这张图' }, { type: 'image_url', image_url: { url: 'data:x' } }] },
]
const mmPatched = ensureJsonKeyword(multimodal)
const mmParts = mmPatched[0].content
check('多模态消息也能补上文本段',
  Array.isArray(mmParts) && mmParts.some(p => p.type === 'text' && /json/i.test(p.text)))

/* --------------------------------------------------------------------------
   空响应诊断：不同成因必须给出不同的可执行建议
   -------------------------------------------------------------------------- */
console.log('\n── 空响应诊断 ──')

const diagCases = [
  {
    name: '思考型模型耗尽输出上限',
    choice: { message: { content: '', reasoning_content: '让我想想……' }, finish_reason: 'length' },
    expect: (t) => t.includes('推理过程') && t.includes('16384'),
  },
  {
    name: '普通模型被 max_tokens 截断',
    choice: { message: { content: '' }, finish_reason: 'length' },
    expect: (t) => t.includes('截断') && t.includes('16384'),
  },
  {
    name: '只返回 reasoning_content',
    choice: { message: { content: '', reasoning_content: '思考中' }, finish_reason: 'stop' },
    expect: (t) => t.includes('reasoning_content'),
  },
  {
    name: '安全策略拦截',
    choice: { message: { content: '' }, finish_reason: 'content_filter' },
    expect: (t) => t.includes('安全策略'),
  },
  {
    name: '缺 choices（Base URL 指错）',
    choice: undefined,
    expect: (t) => t.includes('choices') && t.includes('Base URL'),
  },
  {
    name: '服务端带回 error 字段',
    choice: undefined,
    data: { error: { message: 'quota exceeded' } },
    expect: (t) => t.includes('quota exceeded'),
  },
  {
    name: '成因不明时也给出 finish_reason',
    choice: { message: { content: '' }, finish_reason: 'stop' },
    expect: (t) => t.includes('HTTP 200') && t.includes('stop'),
  },
]

for (const c of diagCases) {
  const text = describeEmptyResponse(c.choice, c.data ?? {})
  check(c.name, c.expect(text), text.slice(0, 60))
}

// total 由 check 自己累计，不手工估算——估算会随着用例增减而失准
/* --------------------------------------------------------------------------
   模板合并：同一问题反复出现必须合并，而不是堆重复条目
   -------------------------------------------------------------------------- */
console.log('\n── 模板合并去重 ──')

const { mergeDrafts } = await import('../src/lib/templateMerge.ts')

const mkDraft = (over) => ({
  category: 'phrase', title: '', body: '', meaning: '', usage: '', scene: '',
  example: '', wrongExample: '', problemTags: [], ...over,
})

// 中文标题（无空格）—— 曾经因为按词切而完全无法匹配
const cn = mergeDrafts(
  [mkDraft({ title: '图画作文三段式框架（描述—阐释—评论）', body: '第一段描述图画，第二段阐释寓意，第三段评论。' })],
  [{
    id: 'a', createdAt: 0, updatedAt: 0, category: 'phrase',
    title: '图画作文三段式框架', body: '第一段描述图画，第二段阐释寓意，第三段评论。',
    meaning: '', usage: '', scene: '', example: '', wrongExample: '',
    problemTags: [], taskTypes: [], recurrence: 1, sourceReportIds: ['r1'], origin: 'llm',
  }],
  { reportId: 'r2', taskType: 'eng1_big' },
)
check('中文标题相似时合并', cn.merged === 1 && cn.added === 0, `merged=${cn.merged} added=${cn.added}`)
check('合并后出现次数累加', cn.templates[0].recurrence === 2, `recurrence=${cn.templates[0].recurrence}`)
check('合并后记录第二个来源', cn.templates[0].sourceReportIds.length === 2)

// 英文搭配
const en = mergeDrafts(
  [mkDraft({ title: '表达「培养合作精神」', body: 'cultivate a cooperative spirit' })],
  [{
    id: 'b', createdAt: 0, updatedAt: 0, category: 'phrase',
    title: '表达合作精神', body: 'cultivate a cooperative spirit',
    meaning: '', usage: '', scene: '', example: '', wrongExample: '',
    problemTags: [], taskTypes: [], recurrence: 1, sourceReportIds: ['r1'], origin: 'llm',
  }],
  { reportId: 'r2', taskType: 'eng1_big' },
)
check('英文搭配相同时合并', en.merged === 1 && en.added === 0, `merged=${en.merged} added=${en.added}`)

// 明显不同的不应误并
const diff = mergeDrafts(
  [mkDraft({ title: '部分倒装句', body: 'Only by working together can we overcome difficulties.' })],
  [{
    id: 'c', createdAt: 0, updatedAt: 0, category: 'phrase',
    title: '表达合作精神', body: 'cultivate a cooperative spirit',
    meaning: '', usage: '', scene: '', example: '', wrongExample: '',
    problemTags: [], taskTypes: [], recurrence: 1, sourceReportIds: ['r1'], origin: 'llm',
  }],
  { reportId: 'r2', taskType: 'eng1_big' },
)
check('不同模板不会被误并', diff.added === 1 && diff.merged === 0, `added=${diff.added} merged=${diff.merged}`)

// 手动改过的不参与合并
const editedCase = mergeDrafts(
  [mkDraft({ title: '表达合作精神', body: 'cultivate a cooperative spirit' })],
  [{
    id: 'd', createdAt: 0, updatedAt: 0, category: 'phrase',
    title: '表达合作精神', body: 'cultivate a cooperative spirit',
    meaning: '', usage: '', scene: '', example: '', wrongExample: '',
    problemTags: [], taskTypes: [], recurrence: 1, sourceReportIds: ['r1'], origin: 'llm', edited: true,
  }],
  { reportId: 'r2', taskType: 'eng1_big' },
)
check('手动编辑过的模板不被自动合并覆盖', editedCase.added === 1 && editedCase.merged === 0)

// 分类不同不应合并
const diffCat = mergeDrafts(
  [mkDraft({ category: 'grammar', title: '表达合作精神', body: 'cultivate a cooperative spirit' })],
  [{
    id: 'e', createdAt: 0, updatedAt: 0, category: 'phrase',
    title: '表达合作精神', body: 'cultivate a cooperative spirit',
    meaning: '', usage: '', scene: '', example: '', wrongExample: '',
    problemTags: [], taskTypes: [], recurrence: 1, sourceReportIds: ['r1'], origin: 'llm',
  }],
  { reportId: 'r2', taskType: 'eng1_big' },
)
check('跨分类不合并', diffCat.added === 1 && diffCat.merged === 0)

console.log(`\n══════ ${total - failed}/${total} 通过 ══════`)
process.exit(failed ? 1 : 0)
