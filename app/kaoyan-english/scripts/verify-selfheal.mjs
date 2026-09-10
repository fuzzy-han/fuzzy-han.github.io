#!/usr/bin/env node
/* ==========================================================================
   IndexedDB 自愈自检

   背景：IDB 存在「库在但对象仓库丢了」的半损坏状态（其他工具建过同名库、
   升级中途失败等）。此时 IDB 既不报错也不回调，调用方**永久挂起**——
   用户看到的就是批改完成却一直停在「正在校验评分」。
   应用现在会检测并升版本重建仓库。这里人为造出该状态验证修复有效。

   前置：pnpm dev、node scripts/mock-model.mjs
   ========================================================================== */
import { openCdp, injectMockModelScript, sleep } from '/home/han/VibeDesign/scripts/lib/cdp.mjs'
const cdp = await openCdp({ port: 9490 })
const { ev, waitFor, goto, check, summary, close } = cdp

await goto('workbench', 1800)
await ev(`localStorage.clear()`)
await cdp.send('Page.reload'); await waitFor(`!!document.querySelector('.task-card')`, 8000)

console.log('── 制造损坏状态：建一个没有 reports 表的同名库 ──')
const broken = await ev(`new Promise((resolve) => {
  const t = setTimeout(() => resolve('timeout'), 5000)
  const req = indexedDB.open('kaoyan-writing-coach-db', 1)
  req.onupgradeneeded = () => { /* 故意不建对象仓库 */ }
  req.onsuccess = () => { const has = req.result.objectStoreNames.contains('reports'); req.result.close(); clearTimeout(t); resolve(has ? 'has-store' : 'created-broken') }
  req.onerror = () => { clearTimeout(t); resolve('error') }
})`)
console.log('   ', broken)
check('已造出「有库无表」的损坏状态', broken === 'created-broken')

console.log('\n── 应用启动后应能自愈 ──')
await ev(injectMockModelScript())
await cdp.send('Page.reload')
await sleep(2500)

// 自愈后：写入应当成功且可读回
const writeResult = await ev(`(async () => {
  const s = await import('/src/lib/storage.ts')
  const t0 = Date.now()
  await s.idb.put('reports', { id: 'heal-probe', createdAt: Date.now(), taskType: 'eng1_big', input: {}, report: {}, diagnostics: [], meta: {} })
  const rows = await s.idb.getAll('reports')
  return { elapsed: Date.now() - t0, count: Array.isArray(rows) ? rows.length : -1 }
})()`)
console.log('    写入+读回:', JSON.stringify(writeResult))
check('自愈后写入不再挂起（8 秒内返回）', typeof writeResult === 'object' && writeResult.elapsed < 8000, `${writeResult?.elapsed}ms`)
check('自愈后数据能读回', writeResult?.count === 1, `count=${writeResult?.count}`)

console.log('\n── 损坏状态下也能完成完整批改 ──')
// 再次制造损坏，然后直接批改
await ev(`new Promise((resolve) => {
  const t = setTimeout(() => resolve('t'), 4000)
  const del = indexedDB.deleteDatabase('kaoyan-writing-coach-db')
  del.onsuccess = del.onerror = del.onblocked = () => { clearTimeout(t); resolve('deleted') }
})`)
await cdp.send('Page.reload'); await sleep(2000)
await ev(`new Promise((resolve) => {
  const t = setTimeout(() => resolve('t'), 4000)
  const req = indexedDB.open('kaoyan-writing-coach-db', 1)
  req.onupgradeneeded = () => {}
  req.onsuccess = () => { req.result.close(); clearTimeout(t); resolve('broken-again') }
  req.onerror = () => { clearTimeout(t); resolve('err') }
})`)
await ev(injectMockModelScript())
await cdp.send('Page.reload'); await sleep(2200)
await goto('grade?task=eng1_big', 2000)
await ev(`(() => { const t=document.querySelectorAll('.grade-textarea'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
  set.call(t[0],'Directions: 图画为两位登山者。');t[0].dispatchEvent(new Event('input',{bubbles:true}))
  set.call(t[1],'The picture show two climbers.');t[1].dispatchEvent(new Event('input',{bubbles:true})) })()`)
await sleep(600)
await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改') && !b.disabled); if(b) b.click() })()`)
const done = await waitFor(`location.hash.startsWith('#/report')`, 45000, '报告页')
check('损坏状态下仍能完成批改并出报告', done, await ev(`location.hash`))
check('报告页正常显示分数', (((await ev(`document.querySelector('.score-ring__number')?.textContent`))??'').length) > 0)

const failed = summary(); await close(); process.exit(failed?1:0)
