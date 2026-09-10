#!/usr/bin/env node
/* ==========================================================================
   连接测试自检（可选，消耗真实额度）

   背景：「测试连接」原本用 max_tokens=16 发一句 ping —— 那是照着「回两个字」
   估的，但思考型模型光推理就不止 16 个 token，正文还没开始就被截断，
   返回 content 为空 + finish_reason=length。用户看到「测试连接失败」，
   其实是测试本身额度给少了，而不是模型不可用。

   现在测试额度为 512，且对思考型模型按「连接正常 + 隐患提示」呈现。

   前置：
     DEEPSEEK_API_KEY=sk-xxx node scripts/verify-connection.mjs
     pnpm proxy
   ========================================================================== */
import { openCdp, sleep } from '/home/han/VibeDesign/scripts/lib/cdp.mjs'
import { readFileSync } from 'node:fs'
const KEY = process.env.DEEPSEEK_API_KEY
if (!KEY) {
  console.error('缺少 DEEPSEEK_API_KEY 环境变量，跳过连接测试自检')
  process.exit(0)
}

const cdp = await openCdp({ port: 9520 })
const { ev, waitFor, goto, check, summary, close, resetAppState } = cdp
await goto('workbench', 1800)
await resetAppState()
await waitFor(`!!document.querySelector('.task-card')`, 8000, '首屏')

await ev(`(() => {
  const K='kaoyan-writing-coach:settings'; const s=JSON.parse(localStorage.getItem(K))
  s.state.models=[{id:'v1',label:'思考型模型',provider:'custom',baseUrl:'https://api.deepseek.com/v1',apiKey:${JSON.stringify(KEY)},model:'deepseek-v4-flash-vision-exp',temperature:0.3,maxTokens:4096,vision:true,createdAt:Date.now()}]
  s.state.settings=Object.assign({},s.state.settings,{defaultModelId:'v1',transport:'proxy',proxyBaseUrl:'http://127.0.0.1:8787',timeoutSec:120})
  localStorage.setItem(K,JSON.stringify(s))
})()`)
await cdp.send('Page.reload'); await sleep(2200)
await goto('models', 2200)

console.log('── 点「测试连接」（思考型模型 + maxTokens=4096）──')
await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('测试连接')); if(b) b.click() })()`)
const got = await waitFor(`document.querySelector('.note--ok, .note--danger') !== null`, 60000, '测试结果')
check('测试返回了结果', got)
await sleep(500)
const note = await ev("document.querySelector('.note--ok, .note--danger')?.className ?? '无'")
const text = await ev("document.querySelector('.note--ok, .note--danger')?.innerText?.replace(/\\\\n/g,' ') ?? '无'")
console.log('   结果框 class:', note)
console.log('   内容:', text.slice(0, 220))
check('测试连接判定为成功', note.includes('note--ok'), note)
check('不再报「输出了推理过程」这类失败', !text.includes('模型只输出了推理过程'), text.slice(0,100))
const warns = await ev("document.querySelector('.model-warn')?.innerText?.replace(/\\\\n/g,' ') ?? '无警告'")
console.log('   隐患提示:', warns.slice(0, 180))
check('给出可执行的隐患提示', warns !== '无警告', warns.slice(0,80))

const failed = summary(); await close(); process.exit(failed?1:0)
