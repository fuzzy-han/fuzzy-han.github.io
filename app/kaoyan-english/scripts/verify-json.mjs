#!/usr/bin/env node
/* ==========================================================================
   JSON 容错提取单元测试（纯函数，不需要浏览器）

   为什么单列一套：真实模型返回的 JSON 经常带围栏、带前后话术、被截断。
   这些情况无法靠端到端测试稳定复现，必须用固定样本直接打。
   ========================================================================== */

import { extractJson } from '../src/lib/json.ts'

let failed = 0
const check = (name, pass, detail = '') => {
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

console.log(`\n══════ ${cases.length - failed}/${cases.length} 通过 ══════`)
process.exit(failed ? 1 : 0)
