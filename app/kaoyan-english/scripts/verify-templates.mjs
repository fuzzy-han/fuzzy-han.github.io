#!/usr/bin/env node
/* ==========================================================================
   模板库自检
   前置：pnpm dev、node scripts/mock-model.mjs

   覆盖：
   · 从报告页一键提炼模板
   · 模板按分类归入模板库
   · 同一问题再次出现时合并并累加出现次数（不产生重复条目）
   · 反复出现的条目有醒目标记
   · 已掌握标记、编辑、删除
   · 手机端不溢出
   ========================================================================== */

import { openCdp, injectMockModelScript, sleep } from './lib/cdp.mjs'

const cdp = await openCdp({ port: 9530 })
const { ev, waitFor, goto, check, summary, close, resetAppState } = cdp

await goto('workbench', 1800)
await resetAppState()
await waitFor(`!!document.querySelector('.task-card')`, 8000, '首屏')
await ev(injectMockModelScript())
await cdp.send('Page.reload')
await sleep(2200)

/** 走一次批改，停在报告页 */
async function grade(task = 'eng1_big') {
  await goto(`grade?task=${task}`, 2000)
  await ev(`(() => {
    const t = document.querySelectorAll('.grade-textarea')
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
    set.call(t[0], 'Directions: Write an essay of 160-200 words. 图画：两位登山者相互搀扶攀登陡崖，标注 Cooperate.')
    t[0].dispatchEvent(new Event('input', { bubbles: true }))
    set.call(t[1], 'The picture show two climbers who help each other to climb the mountain. We should learn the spirit of cooperation.')
    t[1].dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await sleep(600)
  await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改') && !b.disabled); if (b) b.click() })()`)
  return waitFor(`location.hash.startsWith('#/report')`, 45000, '报告页')
}

console.log('── 1. 空状态 ──')
await goto('templates', 2000)
check('模板库页面渲染', await ev(`!!document.querySelector('.tpl-stats')`))
check('空状态给出引导', ((await ev(`document.body.innerText`)) ?? '').includes('模板库还是空的'))

console.log('\n── 2. 从报告页提炼 ──')
check('完成一次批改', await grade())
check('报告页有「提炼模板」按钮', ((await ev(`document.body.innerText`)) ?? '').includes('提炼模板'))
await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('提炼模板')); if (b) b.click() })()`)
const jumped = await waitFor(`location.hash.startsWith('#/templates')`, 30000, '模板库')
check('提炼后自动跳到模板库', jumped, await ev(`location.hash`))
await sleep(1500)
check('模板已入库', (await ev(`document.querySelectorAll('.tpl').length`)) === 2,
  `${await ev(`document.querySelectorAll('.tpl').length`)} 条`)
check('总数统计更新', ((await ev(`document.querySelector('.tpl-stat__num')?.textContent`)) ?? '') === '2')
const pageText = (await ev(`document.body.innerText`)) ?? ''
check('按分类显示', pageText.includes('常错点') && pageText.includes('固定搭配'))
// 不假定哪张卡在前：模板按更新时间排序，两次提炼的先后顺序不固定
const allWrong = await ev(`[...document.querySelectorAll('.tpl__wrong')].map(e=>e.textContent).join(' | ')`)
const allRight = await ev(`[...document.querySelectorAll('.tpl__right, .tpl__example')].map(e=>e.textContent).join(' | ')`)
check('显示错→对对照',
  allWrong.includes('The picture show') && allRight.includes('The picture shows'),
  `错=${allWrong.slice(0,40)}` )
const allTags = await ev(`[...document.querySelectorAll('.tpl__foot')].map(e=>e.textContent).join(' | ')`)
check('显示问题类型标签', allTags.includes('主谓一致') && allTags.includes('搭配'), allTags.slice(0, 60))

console.log('\n── 3. 相同问题再次出现应合并而非重复 ──')
const before = await ev(`document.querySelectorAll('.tpl').length`)
await grade()
await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('提炼模板')); if (b) b.click() })()`)
await waitFor(`location.hash.startsWith('#/templates')`, 30000, '模板库')
await waitFor(`document.querySelectorAll('.tpl').length >= 2`, 20000, '模板卡渲染')
await sleep(600)
const after = await ev(`document.querySelectorAll('.tpl').length`)
check('条目数没有增加（合并了）', after === before, `提炼前 ${before} → 提炼后 ${after}`)
check('出现次数累加到 2', ((await ev(`document.body.innerText`)) ?? '').includes('出现 2 次'))
const recurringMark = await ev(`document.querySelectorAll('.tpl--recurring').length`)
check('反复出现的条目有标记', recurringMark > 0, `${recurringMark} 条`)

console.log('\n── 4. 筛选「反复出现」 ──')
await ev(`[...document.querySelectorAll('.tpl-cat')].find(b=>b.textContent.includes('反复出现')).click()`)
await sleep(600)
check('反复出现筛选生效', (await ev(`document.querySelectorAll('.tpl').length`)) === recurringMark)
check('统计显示反复出现数', ((await ev(`document.querySelector('.tpl-stat--warn')?.textContent`)) ?? '').includes('2'))

console.log('\n── 5. 分类筛选与记忆提示 ──')
await ev(`[...document.querySelectorAll('.tpl-cat')].find(b=>b.textContent.includes('常错点')).click()`)
await sleep(600)
check('分类筛选生效', (await ev(`document.querySelectorAll('.tpl').length`)) === 1)
check('给出该分类的记忆建议', ((await ev(`document.querySelector('.tpl-tip')?.textContent`)) ?? '').includes('怎么记'))

console.log('\n── 6. 已掌握标记 ──')
await ev(`[...document.querySelectorAll('.tpl-cat')].find(b=>b.textContent.includes('全部模板')).click()`)
await sleep(500)
// 用 title 定位按钮，不依赖顺序（顺序会随 UI 调整而变）
const clickAction = (title) => ev(`(() => {
  const card = document.querySelector('.tpl')
  const b = [...card.querySelectorAll('.tpl__actions .btn')].find(b => b.getAttribute('title') === ${JSON.stringify(title)})
  if (b) b.click()
  return !!b
})()`)

await clickAction('标记为已掌握')
await sleep(600)
check('可标记已掌握', (await ev(`document.querySelectorAll('.tpl--mastered').length`)) === 1)
check('已掌握计数更新', ((await ev(`document.querySelector('.tpl-stat--ok')?.textContent`)) ?? '').includes('1'))

console.log('\n── 7. 编辑 ──')
await clickAction('编辑')
await sleep(500)
check('进入编辑态', (await ev(`document.querySelectorAll('.tpl__body .input').length`)) >= 3)
await ev(`(() => {
  const inputs = document.querySelectorAll('.tpl__body .input')
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
  set.call(inputs[0], '我改过的用法说明')
  inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
})()`)
await sleep(300)
await clickAction('保存')
await sleep(900)
check('编辑已保存', ((await ev(`document.body.innerText`)) ?? '').includes('我改过的用法说明'))
check('编辑过的标记为 edited（不再自动合并）', await ev(`(async () => {
  const s = await import('/src/lib/templates.ts')
  const rows = await s.listTemplates()
  return rows.some(t => t.edited)
})()`))

console.log('\n── 8. 删除 ──')
await ev(`window.confirm = () => true`)
const countBefore = await ev(`document.querySelectorAll('.tpl').length`)
await clickAction('删除')
await sleep(900)
check('可删除模板', (await ev(`document.querySelectorAll('.tpl').length`)) === countBefore - 1)

console.log('\n── 9. 手机端 ──')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await cdp.send('Page.reload')
await sleep(2200)
const mob = await ev(`(() => {
  const de = document.documentElement
  const bad = []
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1)) {
      const inScroller = (() => { let n = el.parentElement
        while (n && n !== document.body) { const s = getComputedStyle(n)
          if (s.overflowX === 'auto' || s.overflowX === 'scroll') return true; n = n.parentElement }
        return false })()
      if (el.closest('.sidebar') || el.closest('.nav-scrim') || inScroller) return
      bad.push(typeof el.className === 'string' ? el.className : el.tagName)
    }
  })
  return { scrollW: de.scrollWidth, clientW: de.clientWidth, bad: [...new Set(bad)].slice(0, 5) }
})()`)
console.log('    ', JSON.stringify(mob))
check('手机端无横向溢出', mob.scrollW <= mob.clientW + 1, `scrollW=${mob.scrollW}`)
check('手机端无元素越界', mob.bad.length === 0, JSON.stringify(mob.bad))
check('手机端分类栏可横滑', (await ev(`getComputedStyle(document.querySelector('.tpl-side')).overflowX`)) === 'auto')

check('无未捕获异常', cdp.consoleErrors.length === 0, cdp.consoleErrors.join(' | ').slice(0, 150))

const failed = summary()
await close()
process.exit(failed ? 1 : 0)
