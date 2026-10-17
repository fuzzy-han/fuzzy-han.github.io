#!/usr/bin/env node
/* ==========================================================================
   备份格式与合并规则单元测试（纯函数，不需要浏览器）

   为什么单列一套：
   合并规则写错时不会报错、也不会崩溃，唯一的表现是「导入之后记录少了」，
   而且往往要等到使用者换了电脑才发现。这种「静默丢数据」只能靠固定样本直接打，
   不能指望端到端测试碰巧覆盖到。
   运行：node --experimental-strip-types scripts/verify-backup-unit.mjs
   ========================================================================== */

import {
  BACKUP_KIND,
  BACKUP_VERSION,
  backupFilename,
  draftHasContent,
  emptyBackup,
  mergeDrafts,
  mergeMastery,
  mergeReports,
  mergeTemplates,
  normalizeBackup,
  stripSecrets,
  summarizeBackup,
} from '../src/lib/backup.ts'

let failed = 0
let total = 0
const check = (name, pass, detail = '') => {
  total += 1
  if (!pass) failed += 1
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}${detail ? '  → ' + detail : ''}`)
}

/* -------------------------------------------------------------------------- */
console.log('── 1. 格式校验 ──')

check('非本平台文件被拒绝', normalizeBackup({ kind: 'something-else' }).ok === false)
check('非对象被拒绝', normalizeBackup('not json').ok === false)
check('null 被拒绝', normalizeBackup(null).ok === false)

const v1 = normalizeBackup({
  kind: BACKUP_KIND,
  version: 1,
  settings: { timeoutSec: 90 },
  models: [{ id: 'm1', apiKey: '', baseUrl: 'https://example.com', model: 'test' }],
  rubrics: { eng1_big: { filled: true, content: 'rule', versions: [] } },
})
check('旧版（v1）备份仍可导入', v1.ok === true)
check('旧版备份给出「没有批改记录」的提示', v1.ok && v1.warnings.some((w) => w.includes('旧版')))
check('保留旧版标识以避免覆盖历史', v1.ok && v1.payload.version === 1)
check('旧版缺失的字段被补成安全默认值', v1.ok && v1.payload.reports.length === 0 && v1.payload.templates.length === 0)

const future = normalizeBackup({ kind: BACKUP_KIND, version: 99 })
check('未来版本被拒绝（避免误解出错误的数据）', future.ok === false && future.reason.includes('更新'))

const messy = normalizeBackup({
  ...emptyBackup(),
  kind: BACKUP_KIND,
  version: 2,
  reports: [{ id: 'r1', createdAt: 10 }, null, { noId: true }],
  templates: [{ id: 't1', recurrence: 2 }, 'junk'],
  mastery: { words: { alpha: true, beta: false }, templates: { t1: true } },
  drafts: { eng1_big: { essay: 'hello' } },
})
check('损坏记录整份拒绝，避免覆盖导入时静默丢历史', messy.ok === false)
check('非法版本号被拒绝', !normalizeBackup({ kind: BACKUP_KIND, version: -1 }).ok)
check('错误数组类型被拒绝', !normalizeBackup({ ...emptyBackup(), reports: {} }).ok)
check('缺字段完整备份被拒绝', !normalizeBackup({ kind: BACKUP_KIND, version: 2 }).ok)
check('完整空备份可用于恢复', normalizeBackup(emptyBackup()).ok)

/* -------------------------------------------------------------------------- */
console.log('\n── 2. 统计（导入前让使用者看清文件里有什么）──')

const payload = {
  ...emptyBackup(),
  reports: [
    { id: 'r1', createdAt: 3, input: { prompt: '图画作文：合作', essay: 'a' } },
    { id: 'r2', createdAt: 2, input: { prompt: '', essay: 'b' } },
  ],
  templates: [{ id: 't1' }, { id: 't2' }],
  models: [{ id: 'm1' }],
  drafts: { eng1_big: { essay: 'x' }, eng1_small: { essay: '' } },
  mastery: { words: { a: true, b: true }, templates: { t1: true } },
}
const summary = summarizeBackup(payload)
check('批改记录条数', summary.reports === 2, String(summary.reports))
check('带题目原文的条数单独统计', summary.withPrompt === 1, String(summary.withPrompt))
check('模板条数', summary.templates === 2)
check('只有填过内容的草稿才计数', summary.drafts === 1, String(summary.drafts))
check('已掌握词数', summary.wordsMastered === 2)

/* -------------------------------------------------------------------------- */
console.log('\n── 3. 批改记录合并：一条都不能少 ──')

const oldReports = [{ id: 'a', createdAt: 100 }, { id: 'b', createdAt: 200 }]
const newReports = [{ id: 'b', createdAt: 200 }, { id: 'c', createdAt: 300 }]
const mergedReports = mergeReports(oldReports, newReports)
check('并集而不是替换', mergedReports.length === 3, String(mergedReports.length))
check('同 id 不重复', new Set(mergedReports.map((r) => r.id)).size === 3)
check('按时间倒序，最近的在最前', mergedReports[0].id === 'c' && mergedReports[2].id === 'a')
check('旧记录在合并后依然存在', mergedReports.some((r) => r.id === 'a'))
check('重复导入同一份文件不会翻倍', mergeReports(mergedReports, newReports).length === 3)

const learningOld = [{ id: 'study', createdAt: 1, learning: { turns: [{ id: 'old', createdAt: 1, content: 'old question' }] } }]
const learningNew = [{ id: 'study', createdAt: 1, learning: { turns: [{ id: 'new', createdAt: 2, content: 'new question' }] } }]
const learningMerged = mergeReports(learningOld, learningNew)
check('同一报告合并保留两侧学习对话', learningMerged[0].learning.turns.length === 2)
check('重复导入学习对话不会翻倍', mergeReports(learningMerged, learningNew)[0].learning.turns.length === 2)

/* -------------------------------------------------------------------------- */
console.log('\n── 4. 模板合并：出现次数与来源不能被抹掉 ──')

const oldTemplates = [
  {
    id: 't1',
    updatedAt: 100,
    recurrence: 3,
    body: '旧内容',
    sourceReportIds: ['r1'],
    problemTags: ['时态'],
    taskTypes: ['eng1_big'],
  },
]
const newTemplates = [
  {
    id: 't1',
    updatedAt: 200,
    recurrence: 1,
    body: '新内容',
    sourceReportIds: ['r2'],
    problemTags: ['搭配'],
    taskTypes: ['eng1_small'],
  },
  { id: 't2', updatedAt: 150, recurrence: 1, body: '另一条', sourceReportIds: [], problemTags: [], taskTypes: [] },
]
const mergedTemplates = mergeTemplates(oldTemplates, newTemplates)
const t1 = mergedTemplates.find((t) => t.id === 't1')
check('同 id 合并不新增条目', mergedTemplates.length === 2, String(mergedTemplates.length))
check('出现次数取较大值而不是相加（重复导入不会灌水）', t1.recurrence === 3, String(t1.recurrence))
check('来源记录取并集', t1.sourceReportIds.join() === 'r1,r2', t1.sourceReportIds.join())
check('问题标签取并集', t1.problemTags.sort().join() === '搭配,时态', t1.problemTags.join())
check('适用题型取并集', t1.taskTypes.sort().join() === 'eng1_big,eng1_small', t1.taskTypes.join())
check('内容以更新时间较新的一方为准', t1.body === '新内容', t1.body)

const editedOld = [{ id: 't9', updatedAt: 100, body: '使用者手改过的', edited: true, recurrence: 1, sourceReportIds: [], problemTags: [], taskTypes: [] }]
const autoNew = [{ id: 't9', updatedAt: 300, body: '模型重新提炼的', recurrence: 1, sourceReportIds: [], problemTags: [], taskTypes: [] }]
const editedMerged = mergeTemplates(editedOld, autoNew)[0]
check('手动编辑过的内容优先，不被自动提炼覆盖', editedMerged.body === '使用者手改过的', editedMerged.body)
check('编辑标记被保留', editedMerged.edited === true)

/* -------------------------------------------------------------------------- */
console.log('\n── 5. 掌握标记与草稿合并 ──')

check(
  '两侧都标过的保持已掌握',
  mergeMastery({ a: true }, { a: true }).a === true,
)
check(
  '本机标过、备份没有的不会被改回未掌握',
  mergeMastery({ a: true }, { b: true }).a === true,
)
check(
  '备份里标过的会被补上',
  mergeMastery({}, { c: true }).c === true,
)
check(
  'false 不会覆盖已有的 true',
  mergeMastery({ d: true }, { d: false }).d === true,
)

check('空草稿不算内容', draftHasContent({ essay: '   ' }) === false)
check('图片算内容', draftHasContent({ promptImages: [{ name: 'p.png' }] }) === true)

const draftMerged = mergeDrafts(
  { eng1_big: { year: '2023', prompt: '题目', essay: '本机上写了一半的作文', reference: '' } },
  { eng1_big: { year: '', prompt: '', essay: '', reference: '', extras: '' } },
)
check(
  '空草稿不覆盖本机已有内容',
  draftMerged.eng1_big.essay === '本机上写了一半的作文',
  draftMerged.eng1_big.essay,
)
const draftMerged2 = mergeDrafts(
  { eng1_big: { essay: '短' } },
  { eng1_big: { essay: '备份里更长的一段作文内容' }, eng1_small: { essay: '小作文' } },
)
check('逐字段取内容更多的一方', draftMerged2.eng1_big.essay === '备份里更长的一段作文内容')
check('本机没有的题型直接补齐', draftMerged2.eng1_small.essay === '小作文')
check('年份字段不被空值清掉', mergeDrafts({ eng1_big: { year: '2023' } }, { eng1_big: { year: '' } }).eng1_big.year === '2023')

/* -------------------------------------------------------------------------- */
console.log('\n── 6. 脱敏与文件名 ──')

const modelsInMemory = [{ id: 'm1', apiKey: 'sk-secret', label: 'A' }]
const stripped = stripSecrets(modelsInMemory)
check('API Key 被清空', stripped[0].apiKey === '')
check('其余字段保留', stripped[0].label === 'A' && stripped[0].id === 'm1')
check(
  '脱敏不会就地改到内存里的配置（导出用的是一份副本）',
  modelsInMemory[0].apiKey === 'sk-secret' && stripped[0] !== modelsInMemory[0],
)
check(
  '文件名带日期与时间，两次导出不会互相覆盖',
  /^砚台备份-\d{8}-\d{4}\.json$/.test(backupFilename(new Date(2025, 0, 2, 3, 4))),
  backupFilename(new Date(2025, 0, 2, 3, 4)),
)

/* -------------------------------------------------------------------------- */
console.log(`\n══════ ${total - failed}/${total} 通过 ══════`)
if (failed) {
  console.log('失败项见上方 FAIL 行')
  process.exit(1)
}
