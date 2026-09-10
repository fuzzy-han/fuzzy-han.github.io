#!/usr/bin/env node
/* ==========================================================================
   模板库 · 真实模型自检（可选，消耗真实额度）

   为什么必须单独有这一套：假模型每次返回同样的文案，合并逻辑看起来怎么都对；
   真实模型每次措辞都不同，才能暴露「同一问题没被合并、模板库被重复项淹没」。
   实测该问题正是靠这套测试发现的（中文标题按词切分导致相似度恒为 0）。

   前置：
     DEEPSEEK_API_KEY=sk-xxx node scripts/verify-templates-real.mjs
     pnpm dev && pnpm proxy
   ========================================================================== */
import { openCdp, sleep } from '/home/han/VibeDesign/scripts/lib/cdp.mjs'
const KEY = process.env.DEEPSEEK_API_KEY
if (!KEY) {
  console.error('缺少 DEEPSEEK_API_KEY 环境变量，跳过模板库真实模型自检')
  process.exit(0)
}

const cdp = await openCdp({ port: 9540 })
const { ev, waitFor, goto, check, summary, close, resetAppState } = cdp
await goto('workbench', 1800)
await resetAppState()
await waitFor(`!!document.querySelector('.task-card')`, 8000)
await ev(`(() => {
  const K='kaoyan-writing-coach:settings'; const s=JSON.parse(localStorage.getItem(K))
  s.state.models=[{id:'ds',label:'DeepSeek',provider:'deepseek',baseUrl:'https://api.deepseek.com/v1',apiKey:${JSON.stringify(KEY)},model:'deepseek-chat',temperature:0.3,maxTokens:8192,vision:false,createdAt:Date.now()}]
  s.state.settings=Object.assign({},s.state.settings,{defaultModelId:'ds',transport:'proxy',proxyBaseUrl:'http://127.0.0.1:8787',preferReliableJson:true,timeoutSec:180})
  localStorage.setItem(K,JSON.stringify(s))
})()`)
await cdp.send('Page.reload'); await sleep(2200)

async function grade() {
  await goto('grade?task=eng1_big', 2000)
  await ev(`(() => { const t=document.querySelectorAll('.grade-textarea'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
    set.call(t[0],'Directions: Write an essay of 160-200 words. 图画：两位登山者相互搀扶攀登陡崖，标注 Cooperate。请 1) describe the drawing 2) interpret its meaning 3) give your comments.')
    t[0].dispatchEvent(new Event('input',{bubbles:true}))
    set.call(t[1],'The picture show two climbers who help each other to climb the mountain. We should learn the spirit of cooperation. Only by working together can we overcome difficulties.')
    t[1].dispatchEvent(new Event('input',{bubbles:true})) })()`)
  await sleep(600)
  await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改') && !b.disabled); if(b) b.click() })()`)
  return waitFor(`location.hash.startsWith('#/report')`, 200000, '报告页')
}

console.log('── 1. 真实批改 ──')
const t0=Date.now()
check(`批改完成（${((Date.now()-t0)/1000).toFixed(0)}s）`, await grade())
await sleep(1000)

console.log('\n── 2. 真实提炼模板 ──')
await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('提炼模板')); if(b) b.click() })()`)
const ok = await waitFor(`location.hash.startsWith('#/templates')`, 200000, '模板库')
check('提炼完成并进入模板库', ok, await ev(`location.hash`))
await sleep(1500)
const n = await ev(`document.querySelectorAll('.tpl').length`)
check('真实模型产出了模板', n >= 3, `${n} 条`)
const cats = await ev(`[...document.querySelectorAll('.tpl-group__title')].map(e=>e.textContent.replace(/\\s+/g,'').replace(/\\d+$/,''))`)
console.log('    分类:', JSON.stringify(cats))
check('按分类归入', Array.isArray(cats) && cats.length >= 2)
const first = await ev(`(() => { const c=document.querySelector('.tpl'); if(!c) return null
  return { title:c.querySelector('.tpl__title')?.textContent, body:c.querySelector('.tpl__phrase')?.textContent,
           meaning:c.querySelector('.tpl__meaning')?.textContent, tags:c.querySelector('.tpl__foot')?.textContent?.slice(0,40) } })()`)
console.log('    示例模板:', JSON.stringify(first, null, 0).slice(0, 260))
check('模板有实质内容（英文句式 + 中文释义）', Boolean(first?.body) && Boolean(first?.meaning),
  `${first?.body?.slice(0,30)} / ${first?.meaning?.slice(0,20)}`)

console.log('\n── 3. 再次批改同一问题，应合并而非重复 ──')
const before = await ev(`document.querySelectorAll('.tpl').length`)
check('第二次批改', await grade())
await sleep(1000)
await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('提炼模板')); if(b) b.click() })()`)
await waitFor(`location.hash.startsWith('#/templates')`, 200000, '模板库')
await sleep(1500)
const after = await ev(`document.querySelectorAll('.tpl').length`)
console.log(`    模板数：${before} → ${after}`)
const recurring = await ev(`document.querySelectorAll('.tpl--recurring').length`)
const text = (await ev(`document.body.innerText`)) ?? ''
check('未产生大量重复条目', after <= before + 4, `${before} → ${after}`)
check('出现「反复出现」标记', recurring > 0 || text.includes('出现 2 次'), `recurring=${recurring}, 含出现2次=${text.includes('出现 2 次')}`)

check('无 console 异常', cdp.consoleErrors.length === 0, cdp.consoleErrors.join(' | ').slice(0,150))
const failed = summary(); await close(); process.exit(failed?1:0)
