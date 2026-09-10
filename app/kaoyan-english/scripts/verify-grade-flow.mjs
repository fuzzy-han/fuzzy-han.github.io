#!/usr/bin/env node
/* ==========================================================================
   批改全链路自检（P2）
   前置：先启动 dev server 与假模型服务
     pnpm dev
     node scripts/mock-model.mjs      # 假模型，端口 8891
   覆盖：批改台渲染 → 输入校验 → 提示词预览 → 流式批改 → 落盘 → 跳报告页
   ========================================================================== */

import { openCdp, injectMockModelScript, sleep } from './lib/cdp.mjs'

const cdp = await openCdp({ port: 9401 })
const { ev, waitFor, goto, check, summary, close } = cdp

await goto('workbench', 1800)

// 清空后注入假模型配置
await ev(`localStorage.clear()`)
await ev(`window.location.hash = '#/workbench'`)
await cdp.send('Page.reload')
await waitFor(`!!document.querySelector('.task-card')`, 8000, '首屏')
await ev(injectMockModelScript())
await cdp.send('Page.reload')
await sleep(2200)

console.log('── 1. 批改台渲染 ──')
await goto('grade?task=eng1_big', 2200)
check('批改台已渲染', await ev(`!!document.querySelector('.grade-layout')`))
check('三个题型页签', (await ev(`document.querySelectorAll('.grade-tab').length`)) === 3)
check('右侧显示所选模型', ((await ev(`document.querySelector('.grade-side').innerText`)) ?? '').includes('假模型'))
check('未填内容时提交按钮禁用', (await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改')); return b?.disabled })()`)) === true)
check('题目年份字段存在（仅大作文）', await ev(`!!document.querySelector('.grade-main .field .input')`))

console.log('\n── 2. 大作文可选项与校验 ──')
await goto('grade?task=eng1_translation', 2000)
check('翻译没有「题目年份」字段', (await ev(`!!document.querySelector('.grade-main .field .input')`)) === false)
check('翻译有「参考译文」折叠区', ((await ev(`document.querySelector('.grade-main').innerText`)) ?? '').includes('参考译文'))

console.log('\n── 3. 填写与预览 ──')
await goto('grade?task=eng1_big', 2200)
const textareas = `document.querySelectorAll('.grade-textarea')`
await ev(`(() => {
  const t = ${textareas}
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
  set.call(t[0], 'Directions: Write an essay of 160-200 words. 图画：两位登山者相互搀扶攀登陡崖，标注 Cooperate.')
  t[0].dispatchEvent(new Event('input', { bubbles: true }))
  set.call(t[1], 'The picture show two climbers who help each other to climb the mountain. We should learn the spirit of cooperation.')
  t[1].dispatchEvent(new Event('input', { bubbles: true }))
})()`)
await waitFor(`document.body.textContent.includes('有未保存的修改') || true`, 2000)
await sleep(600)

check('词数已统计', ((await ev(`document.querySelector('.field__counter')?.textContent`)) ?? '').includes('词'),
  await ev(`document.querySelector('.field__counter')?.textContent`))
check('提交按钮解禁', (await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改')); return b && !b.disabled })()`)) === true)
check('右侧显示预计 token', ((await ev(`document.querySelector('.grade-side').innerText`)) ?? '').includes('tokens'))

await ev(`[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('查看将要发送的提示词')).click()`)
await sleep(600)
check('提示词预览出现', await ev(`!!document.querySelector('.grade-preview')`))
check('预览含细则全文', ((await ev(`document.querySelector('.grade-preview').textContent`)) ?? '').includes('你是一名考研英语一阅卷老师'))
check('预览含学生输入', ((await ev(`document.querySelectorAll('.grade-preview')[1].textContent`)) ?? '').includes('two climbers'))
check('预览含结构化契约', ((await ev(`document.querySelector('.grade-preview').textContent`)) ?? '').includes('结构化输出契约'))

console.log('\n── 4. 流式批改 ──')
await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改') && !b.disabled); b.click() })()`)
const reached = await waitFor(`location.hash.startsWith('#/report')`, 50000, '报告页')
check('批改成功并跳到报告页', reached, await ev(`location.hash`))
check('报告页有总分', (((await ev(`document.querySelector('.score-ring__number')?.textContent`)) ?? '').length) > 0)
check('报告已写入 IndexedDB', await ev(`(async () => { const dbs = await indexedDB.databases(); return dbs.some(d => String(d.name).includes('kaoyan')) })()`))
check('输入草稿已持久化', (await ev(`localStorage.getItem('kaoyan-writing-coach:drafts') !== null`)) === true)

console.log('\n── 5. 草稿与取消 ──')
await goto('grade?task=eng1_small', 2000)
check('切到小作文后草稿独立（textarea 为空）',
  (await ev(`document.querySelectorAll('.grade-textarea')[1].value`)) === '')
await goto('grade?task=eng1_big', 2000)
check('切回大作文草稿仍在',
  ((await ev(`document.querySelectorAll('.grade-textarea')[1].value`)) ?? '').includes('two climbers'))

check('无未捕获异常', cdp.consoleErrors.length === 0, cdp.consoleErrors.join(' | ').slice(0, 200))

const failed = summary()
await close()
process.exit(failed ? 1 : 0)
