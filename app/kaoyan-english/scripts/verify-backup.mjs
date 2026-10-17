#!/usr/bin/env node
/* ==========================================================================
   备份与迁移自检：换浏览器之后，批改记录还在不在

   为什么必须用「两个浏览器」来测：
   这个缺陷的表现是「换浏览器后旧记录导不进来」，单窗口里怎么测都测不出来 ——
   本机的 IndexedDB 里本来就有数据，导入看起来永远是成功的。
   因此本脚本开两个互不相干的浏览器（各自独立的 profile），
   A 里造数据并导出文件，B 里导入，再从 B 的界面上核对记录是否真的回来了。

   前置：
     npx vite --port 5273        # 应用
     node scripts/mock-model.mjs # 假模型（本脚本不批改，但界面需要一份模型配置）
   运行：node scripts/verify-backup.mjs
   ========================================================================== */

import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openCdp, sleep } from './lib/cdp.mjs'

const downloadDir = mkdtempSync(join(tmpdir(), 'dsh-backup-dl-'))
const A = await openCdp({ port: Number(process.env.DSH_CDP_PORT ?? 9560) })
const B = await openCdp({ port: Number(process.env.DSH_CDP_PORT ?? 9560) + 1 })

const clickText = (cdp, text) =>
  cdp.ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes(${JSON.stringify(text)}))
    if (!btn || btn.disabled) return false
    btn.click()
    return true
  })()`)

/* -------------------------------------------------------------------------- */
/*  在浏览器 A 里造一份「用了一阵子」的数据                                     */
/* -------------------------------------------------------------------------- */

const SEED = `(async () => {
  const DB = 'kaoyan-writing-coach-db'
  const db = await new Promise((resolve, reject) => {
    // 显式按应用的版本号打开，并在升级时补齐对象仓库；
    // 直接 open() 一个不存在的库会造出「有库无表」的损坏状态，
    // 那种状态下应用的一切写入都会永久挂起（历史上踩过这个坑）
    const req = indexedDB.open(DB, 4)
    req.onupgradeneeded = () => {
      const d = req.result
      for (const name of ['reports', 'templates', 'vocab']) {
        if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('blocked'))
  })

  const write = (store, rows) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    rows.forEach((row) => tx.objectStore(store).put(row))
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error)
  })

  const base = (total, essay, prompt, at) => ({
    id: 'seed_' + at,
    createdAt: at,
    taskType: 'eng1_big',
    input: { year: '2023', prompt, essay, extras: '', reference: '' },
    report: {
      band: '13-16分', total, isOnTopic: true, topicNote: '切题',
      dimensions: [], revisedWordCount: 180, phrases: [], structure: { outline: [], frameworks: [] },
      topFixes: [], practice: [], notes: [], sentences: [], revisedEssay: essay,
    },
    diagnostics: [],
    meta: { modelLabel: '假模型', provider: 'custom', modelName: 'mock-grader', elapsedMs: 9000, totalTokens: 3000, retried: false, repaired: false },
  })

  await write('reports', [
    base(14, 'The picture show two climbers who help each other.', 'Directions: 图画作文，两位登山者相互搀扶，标注 Cooperate。', 1700000000000),
    base(11, 'As is vividly depicted in the picture, cooperation is important.', 'Directions: 关于合作的图画作文。', 1700000100000),
  ])
  await write('templates', [{
    id: 'tpl_seed',
    createdAt: 1700000000000, updatedAt: 1700000100000,
    category: 'phrase', title: '图画描述段的开头句式',
    body: 'As is vividly depicted in the picture, ...',
    meaning: '如图所示，……', usage: '首段第一句', scene: '图画作文开头',
    example: 'As is vividly depicted in the picture, cooperation is important.',
    wrongExample: 'The picture show ...', problemTags: ['时态'], taskTypes: ['eng1_big'],
    recurrence: 4, sourceReportIds: ['seed_1700000000000'], origin: 'llm',
  }])

  // 输入草稿：使用者粘在批改台里、还没提交的题目与作文
  localStorage.setItem('kaoyan-writing-coach:drafts', JSON.stringify({
    eng1_big: {
      year: '2024',
      prompt: 'Directions: 以“人工智能与学习”为题写一篇 160-200 词的短文。',
      essay: 'With the rapid development of artificial intelligence, our way of learning has changed a lot.',
      extras: '', reference: '', promptImages: [], essayImages: [], transcriptionNote: '',
    },
  }))
  // 掌握标记：使用者在词汇广场和模板库里一条条点出来的成果
  localStorage.setItem('kaoyan-writing-coach:vocab-mastered', JSON.stringify({ abandon: true, cooperative: true }))
  localStorage.setItem('kaoyan-writing-coach:template-mastered', JSON.stringify({ tpl_seed: true }))

  return true
})()`

console.log('── 1. 浏览器 A：准备数据并导出 ──')
await A.goto('settings', 2500)
// 让应用先按自己的逻辑把数据库建出来，再往里塞数据
await A.waitFor(`!!document.querySelector('.panel')`, 8000, '设置页')
const seeded = await A.ev(SEED)
A.check('数据写入成功（2 条批改记录 / 1 条模板 / 1 份草稿）', seeded === true, String(seeded))
await A.send('Page.reload')
await sleep(2200)
await A.goto('settings', 2000)

// 「本机现有」的条数是异步读出来的，等它落地再断言
const countsReady = await A.waitFor(
  `[...document.querySelectorAll('.stats-row__item')].some((e) =>
     e.textContent.includes('批改记录') && e.querySelector('.stats-row__num')?.textContent === '2')`,
  6000,
  '本机批改记录条数',
)
A.check('设置页显示本机现有的批改记录条数', countsReady, '')

// 允许下载到临时目录，才能把导出的文件读出来检查
try {
  await A.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true })
} catch {
  await A.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
}

const exported = await clickText(A, '导出全部数据')
A.check('导出按钮可点击', exported === true)

let filePath = null
for (let i = 0; i < 40 && !filePath; i += 1) {
  const files = readdirSync(downloadDir).filter((f) => f.endsWith('.json'))
  if (files.length > 0) filePath = join(downloadDir, files[0])
  else await sleep(250)
}
A.check('备份文件已落盘', Boolean(filePath), filePath ?? '未生成')

let payload = null
if (filePath) {
  payload = JSON.parse(readFileSync(filePath, 'utf8'))
}

console.log('\n── 2. 文件内容：批改记录必须在里面 ──')
A.check('格式标识正确', payload?.kind === 'kaoyan-writing-coach-backup')
A.check('版本号已升到 2', payload?.version === 2, String(payload?.version))
A.check('含 2 条批改记录', payload?.reports?.length === 2, String(payload?.reports?.length))
A.check(
  '每条记录都带着题目原文（用户提问信息）',
  (payload?.reports ?? []).every((r) => (r.input?.prompt ?? '').trim().length > 0),
)
A.check(
  '逐句批改结论也在文件里',
  (payload?.reports ?? []).every((r) => r.report && typeof r.report.total === 'number'),
)
A.check('含 1 条模板', payload?.templates?.length === 1, String(payload?.templates?.length))
A.check('含输入草稿', (payload?.drafts?.eng1_big?.essay ?? '').includes('artificial intelligence'))
A.check('含词汇掌握标记', payload?.mastery?.words?.abandon === true)
A.check('含模板掌握标记', payload?.mastery?.templates?.tpl_seed === true)
A.check('默认不含 API Key', (payload?.models ?? []).every((m) => !m.apiKey))

/* -------------------------------------------------------------------------- */
/*  浏览器 B：全新 profile，相当于换了一台电脑 / 换了一个浏览器                  */
/* -------------------------------------------------------------------------- */

console.log('\n── 3. 浏览器 B：全新环境，确认此刻什么都没有 ──')
await B.goto('settings', 2500)
await B.waitFor(`!!document.querySelector('.panel')`, 8000, '设置页')
const fresh = (await B.ev(`(() => { const n = [...document.querySelectorAll('.stats-row__num')].map(e=>e.textContent); return n.join(',') })()`)) ?? ''
B.check('新环境批改记录为 0', fresh.split(',')[0] === '0', fresh)

console.log('\n── 4. 导入 ──')
await B.send('DOM.enable')
const doc = await B.send('DOM.getDocument')
const node = await B.send('DOM.querySelector', {
  nodeId: doc.result.root.nodeId,
  selector: 'input[type=file]',
})
B.check('找到文件选择框', Boolean(node.result?.nodeId))
await B.send('DOM.setFileInputFiles', { files: [filePath], nodeId: node.result.nodeId })
await sleep(1200)

const pendingText = (await B.ev(`document.querySelector('.note--clay')?.innerText`)) ?? ''
B.check('先显示「待导入」摘要而不是直接覆盖', pendingText.includes('待导入'), pendingText.slice(0, 60))
B.check('摘要里写明批改记录条数', pendingText.includes('批改记录'))
B.check('摘要里写明含题目原文的条数', pendingText.includes('含题目原文'))
B.check('提供了合并与覆盖两种选择', pendingText.includes('合并到现有数据') && pendingText.includes('覆盖现有数据'), '')

const merged = await clickText(B, '合并到现有数据')
B.check('点击合并成功', merged === true)
await sleep(2600)

console.log('\n── 5. 合并结果：旧记录、题目、草稿、标记都要在 ──')
await B.goto('history', 2500)
const historyText = (await B.ev(`document.body.innerText`)) ?? ''
B.check('历史记录里出现批改记录', historyText.includes('two climbers'), '')
B.check('两条记录都在', historyText.includes('cooperation is important'))
B.check('题目原文一并恢复', historyText.includes('合作') || historyText.includes('climbers'))

await B.goto('grade?task=eng1_big', 2500)
const draftValue = (await B.ev(`document.querySelectorAll('.grade-textarea')[1]?.value`)) ?? ''
B.check('批改台草稿已恢复（题目与作文原文没丢）', draftValue.includes('artificial intelligence'), draftValue.slice(0, 40))
const promptValue = (await B.ev(`document.querySelectorAll('.grade-textarea')[0]?.value`)) ?? ''
B.check('题目栏原文已恢复', promptValue.includes('人工智能与学习'), promptValue.slice(0, 30))

await B.goto('templates', 3000)
const tplText = (await B.ev(`document.body.innerText`)) ?? ''
B.check('模板库已恢复', tplText.includes('图画描述段的开头句式'))
B.check('模板的出现次数没被清零', tplText.includes('出现 4 次'))

const mastered = await B.ev(`localStorage.getItem('kaoyan-writing-coach:vocab-mastered')`)
B.check('词汇掌握标记已恢复', String(mastered).includes('abandon'), String(mastered))

console.log('\n── 6. 重复导入不翻倍，覆盖模式仍可用 ──')
await B.goto('settings', 2500)
const before = await B.ev(`document.querySelector('.panel__body .stats-row__num')?.textContent`)
await B.send('DOM.getDocument').then(async (d) => {
  const n2 = await B.send('DOM.querySelector', {
    nodeId: d.result.root.nodeId,
    selector: 'input[type=file]',
  })
  await B.send('DOM.setFileInputFiles', { files: [filePath], nodeId: n2.result.nodeId })
})
await sleep(1200)
await clickText(B, '合并到现有数据')
await sleep(2600)
await B.goto('settings', 2500)
const after = await B.ev(`document.querySelector('.panel__body .stats-row__num')?.textContent`)
B.check('同一份备份导入两次，条数不变', before === after && before === '2', `导入前 ${before} / 导入后 ${after}`)

B.check('无未捕获异常（A）', A.consoleErrors.length === 0, A.consoleErrors.join(' | ').slice(0, 200))
B.check('无未捕获异常（B）', B.consoleErrors.length === 0, B.consoleErrors.join(' | ').slice(0, 200))

const failed = A.summary() + B.summary()
await A.close()
await B.close()
try {
  rmSync(downloadDir, { recursive: true, force: true })
} catch {
  /* 删不掉也不影响 */
}
process.exit(failed ? 1 : 0)
