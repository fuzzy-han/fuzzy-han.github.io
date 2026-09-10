#!/usr/bin/env node
/* ==========================================================================
   上传方式与「题目可选」自检
   前置：pnpm dev、node scripts/mock-model.mjs
   覆盖：题目为可选（不给题目也能批完）、拍照入口带 capture、
        选文件入口支持多选与文档、粘贴图片成为附件、附件可移除、拖拽仍在
   ========================================================================== */

import { openCdp, injectMockModelScript, sleep } from '/home/han/VibeDesign/scripts/lib/cdp.mjs'
const cdp = await openCdp({ port: 9410 })
const { ev, waitFor, goto, check, summary, close } = cdp
await goto('workbench', 1800)
await ev(`localStorage.clear()`)
await ev(`window.location.hash='#/workbench'`)
await cdp.send('Page.reload')
await waitFor(`!!document.querySelector('.task-card')`, 8000)
await ev(injectMockModelScript())
await cdp.send('Page.reload'); await sleep(2200)

await goto('grade?task=eng1_big', 2200)

console.log('── 1. 题目为可选 ──')
check('题目字段标了「可选」', ((await ev(`document.querySelector('.field__optional')?.textContent`))??'')==='可选')
const labels = await ev(`[...document.querySelectorAll('.field__label')].map(e=>e.textContent)`)
console.log('     字段标题:', JSON.stringify(labels))
check('说明文案写明不给确定总分', ((await ev(`document.body.innerText`))??'').includes('不给确定总分'))

console.log('\n── 2. 只填作文、不填题目 ──')
await ev(`(() => {
  const t = document.querySelectorAll('.grade-textarea')
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
  set.call(t[1], 'The picture show two climbers who help each other to climb the mountain. We should learn the spirit of cooperation.')
  t[1].dispatchEvent(new Event('input', { bubbles: true }))
})()`)
await sleep(600)
check('没有阻断性错误提示', (await ev(`document.querySelectorAll('.note--warn').length`))===0,
  String(await ev(`document.querySelectorAll('.note--warn').length`)))
check('出现中性提示（非警告）', (await ev(`document.querySelectorAll('.note:not(.note--warn)').length`))>=1)
check('提示说明只批语言', ((await ev(`document.querySelector('.note')?.textContent`))??'').includes('只批改语言'))
check('提交按钮可用（题目非必填）',
  (await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改')); return b && !b.disabled })()`))===true)
check('右侧状态显示「未提供（只批语言）」',
  ((await ev(`document.querySelector('.grade-side').innerText`))??'').includes('未提供（只批语言）'))

console.log('\n── 3. 三个上传入口 ──')
const buttons = await ev(`[...document.querySelectorAll('.grade-drop__action')].map(b=>b.textContent.trim())`)
console.log('     按钮:', JSON.stringify(buttons))
check('有「拍照」入口', buttons.includes('拍照'))
check('有「选文件」入口', buttons.includes('选文件'))
check('提示可拖入与粘贴', ((await ev(`document.querySelector('.grade-drop__hint')?.textContent`))??'').includes('粘贴'))
const capture = await ev(`(() => { const ins=[...document.querySelectorAll('.grade-drop input[type=file]')]; const c=ins.find(i=>i.getAttribute('capture')); return c ? {capture:c.getAttribute('capture'), accept:c.accept} : null })()`)
check('拍照输入带 capture=environment', capture?.capture==='environment', JSON.stringify(capture))
const fileInput = await ev(`(() => { const c=[...document.querySelectorAll('.grade-drop input[type=file]')].find(i=>!i.getAttribute('capture')); return c ? {accept:c.accept, multiple:c.multiple} : null })()`)
check('选文件入口支持多选与文档类型', fileInput?.multiple===true && fileInput.accept.includes('.docx'), JSON.stringify(fileInput))
check('拍照入口只接受图片', capture?.accept==='image/*', capture?.accept)

console.log('\n── 4. 粘贴图片 ──')
// 造一张 2x2 的 PNG，以 file 形式放进剪贴板
const pasted = await ev(`(async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 40; canvas.height = 20
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,40,20)
  ctx.fillStyle = '#141413'; ctx.fillRect(2,2,10,6)
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
  const file = new File([blob], 'pasted.png', { type: 'image/png' })

  const dt = new DataTransfer()
  dt.items.add(file)

  const drop = document.querySelector('.grade-drop')
  const target = drop.querySelector('textarea')
  target.focus()
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
  target.dispatchEvent(event)
  return { prevented: event.defaultPrevented }
})()`)
await sleep(1200)
check('粘贴事件被接管（不再静默丢弃）', pasted?.prevented===true, JSON.stringify(pasted))
check('粘贴的图片成为附件', (await ev(`document.querySelectorAll('.grade-thumb').length`))>=1,
  `缩略图 ${await ev(`document.querySelectorAll('.grade-thumb').length`)} 张`)
check('附件显示文件名与原图体积', ((await ev(`document.querySelector('.grade-thumb__meta')?.textContent`))??'').includes('pasted.png'))
check('附件显示压缩前后对比', ((await ev(`document.querySelector('.grade-thumb__meta')?.textContent`))??'').includes('→'))
check('出现「识别图片中的文字」按钮', ((await ev(`document.querySelector('.grade-side').innerText`))??'').includes('识别图片中的文字'))

console.log('\n── 5. 删除附件 ──')
await ev(`document.querySelector('.grade-thumb__remove').click()`)
await sleep(500)
check('可移除附件', (await ev(`document.querySelectorAll('.grade-thumb').length`))===0)

console.log('\n── 6. 拖拽监听（仍停留在批改台）──')
check('拖拽监听仍在', await ev(`!!document.querySelector('.grade-drop')`))

console.log('\n── 7. 不给题目也能批完 ──')
await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改') && !b.disabled); if (b) b.click() })()`)
const done = await waitFor(`location.hash.startsWith('#/report')`, 50000, '报告页')
check('无题目也能完成批改', done, await ev(`location.hash`))
check('报告页正常出分', (((await ev(`document.querySelector('.score-ring__number')?.textContent`))??'').length)>0)
await ev(`(() => { const d=document.querySelector('details.disclosure'); if (d) d.open = true })()`)
await sleep(400)
check('记录里题目标记为未提供', ((await ev(`document.body.innerText`))??'').includes('（未提供）'),
  ((await ev(`document.querySelector('.code-block')?.textContent`))??'').slice(0, 20))
check('报告保留原文', ((await ev(`document.body.innerText`))??'').includes('two climbers'))


check('无未捕获异常', cdp.consoleErrors.length===0, cdp.consoleErrors.join(' | ').slice(0,150))
const failed = summary()
await close()
process.exit(failed?1:0)
