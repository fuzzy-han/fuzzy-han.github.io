#!/usr/bin/env node
/* ==========================================================================
   思考型模型端到端测试（可选，消耗真实额度）

   为什么单列：思考型 / 长输出模型（deepseek-v4-flash-vision-exp、deepseek-reasoner 等）
   会优先照做批改指令里的「一、整体评价与评分…」，写出一篇几千字的文字报告，
   直到撞上 max_tokens 被截断 —— 结果是用户永远拿不到 JSON，只看到一句错误。

   平台现在用 assistant 预填充（把回复开头钉成 JSON 的第一个字段）来强制结构化输出。
   这个测试专门验证该机制对该类模型有效。假模型永远发现不了这个问题。

   前置：
     DEEPSEEK_API_KEY=sk-xxx PROBE_MODEL=deepseek-v4-flash-vision-exp \
       node scripts/verify-reasoning-model.mjs
     pnpm proxy   # 需要代理绕过浏览器 CORS
   ========================================================================== */
import { openCdp, sleep } from '/home/han/VibeDesign/scripts/lib/cdp.mjs'
import { readFileSync } from 'node:fs'
const KEY = process.env.DEEPSEEK_API_KEY
if (!KEY) {
  console.error('缺少 DEEPSEEK_API_KEY 环境变量，跳过思考型模型测试')
  process.exit(0)
}
const MODEL = process.env.PROBE_MODEL ?? 'deepseek-v4-flash-vision-exp'

const cdp = await openCdp({ port: 9500 })
const { ev, waitFor, goto, check, summary, close, resetAppState } = cdp
await goto('workbench', 1800)
await resetAppState()
await waitFor(`!!document.querySelector('.task-card')`, 8000, '首屏')

await ev(`(() => {
  const K='kaoyan-writing-coach:settings'; const s=JSON.parse(localStorage.getItem(K))
  s.state.models=[{id:'v1',label:'思考型模型',provider:'custom',baseUrl:'https://api.deepseek.com/v1',apiKey:${JSON.stringify(KEY)},model:${JSON.stringify(MODEL)},temperature:0.3,maxTokens:32768,vision:true,createdAt:Date.now()}]
  s.state.settings=Object.assign({},s.state.settings,{defaultModelId:'v1',transport:'proxy',proxyBaseUrl:'http://127.0.0.1:8787',preferReliableJson:false,timeoutSec:300})
  localStorage.setItem(K,JSON.stringify(s))
})()`)
await cdp.send('Page.reload'); await sleep(2200)
await goto('grade?task=eng1_big', 2200)
await ev(`(() => { const t=document.querySelectorAll('.grade-textarea'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
  set.call(t[0],'Directions: Write an essay of 160-200 words based on the following drawing. 图画：两位登山者相互搀扶攀登陡崖，图下方英文标注 Cooperate。请 1) describe the drawing briefly 2) interpret its intended meaning 3) give your comments.')
  t[0].dispatchEvent(new Event('input',{bubbles:true}))
  set.call(t[1],'The picture show two climbers who help each other to climb the mountain. We should learn the spirit of cooperation. Only by working together can we overcome difficulties in our life.')
  t[1].dispatchEvent(new Event('input',{bubbles:true})) })()`)
await sleep(700)
const t0 = Date.now()
await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改') && !b.disabled); if(b) b.click() })()`)
const done = await waitFor(`location.hash.startsWith('#/report')`, 280000, '报告页')
const secs = ((Date.now()-t0)/1000).toFixed(1)
check(`思考型模型批改完成（${secs}s，模型=${MODEL}）`, done, await ev(`location.hash`))
if (done) {
  check('出分', (((await ev(`document.querySelector('.score-ring__number')?.textContent`))??'').length)>0,
    `${await ev(`document.querySelector('.score-ring__number')?.textContent`)}/20 ${await ev(`document.querySelector('.score-ring__band')?.textContent`)}`)
  check('维度 4 条', (await ev(`document.querySelectorAll('.dimbars__row').length`))===4)
  check('逐句卡生成', (await ev(`document.querySelectorAll('.sent').length`))>0, `${await ev(`document.querySelectorAll('.sent').length`)} 句`)
  check('修改后全文生成', (((await ev(`document.querySelector('.report-essay')?.textContent`))??'').length)>50)
  check('无诊断警告', !((await ev(`document.body.innerText`))??'').includes('关于这次结果的几点说明'))
} else {
  const err = await ev("document.querySelector('.note--danger')?.innerText?.replace(/\\\\n/g,' ').slice(0,300) ?? '无错误'")
  console.log('   失败原因:', err)
}
const failed = summary(); await close(); process.exit(failed?1:0)
