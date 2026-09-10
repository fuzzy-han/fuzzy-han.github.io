#!/usr/bin/env node
/* ==========================================================================
   验证批改指令末尾的输入段是否补全，且与 TaskSpec.guide 保持一致
   运行前先启动 dev server：pnpm dev
   ========================================================================== */
const PORT=Number(process.env.DSH_CDP_PORT ?? 9360)
const CHROME=process.env.DSH_CHROME ?? process.env.HOME+'/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome'
const APP='http://127.0.0.1:5273'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,`--user-data-dir=${mkdtempSync(join(tmpdir(),'dsh-guide-'))}`,'about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function wsUrl(){for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl}catch{}await sleep(250)}throw new Error('no cdp')}
const ws=new WebSocket(await wsUrl());await new Promise(r=>ws.onopen=r)
let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r))}
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)return {ERR:r.result.exceptionDetails.exception?.description};const res=r.result?.result;return res?.type==='undefined'?undefined:res?.value}
const waitFor=async(e,t=8000)=>{const d=Date.now()+t;while(Date.now()<d){try{if(await ev(e))return true}catch{}await sleep(100)}return false}
const r=[];const check=(n,p,d='')=>{r.push({n,p});console.log(`${p?'  PASS':'  FAIL'}  ${n}${d?'  → '+d:''}`)}

await send('Page.enable')
await send('Page.navigate',{url:`${APP}/#/workbench`});await sleep(1800)
await ev(`localStorage.clear()`)
await ev(`window.location.hash='#/rubrics'`)
await send('Page.reload')
await waitFor(`!!document.querySelector('.rubric-textarea')`)
await sleep(600)

const names=['大作文','小作文','翻译']
for (let i=0;i<3;i++){
  await ev(`document.querySelectorAll('.rubric-tab')[${i}].click()`)
  await sleep(700)
  const v = await ev(`document.querySelector('.rubric-textarea').value`)
  console.log(`\n═══ ${names[i]}（${v.length} 字符）═══`)
  check(`${names[i]}：不再有输入段占位符`, !v.includes('__INPUT_SECTIONS__') && !v.includes('粘贴文字，或上传包含题干和图片的清晰照片'))
  check(`${names[i]}：无空白骨架占位符`, !v.includes('此处填写该题型的评分细则'))
  // 打印输入段，供人工复核
  const idx = v.indexOf('【')
  const tail = idx>=0 ? v.slice(idx, v.indexOf('\n\n## 附：结构化输出契约')) : '(未找到输入段)'
  console.log(tail.split('\n').slice(0,6).join('\n'))
  console.log('   …')
  // 关键要点
  const keys = {
    '大作文': ['看不到图片','题目年份','写作要求的三条指令原文','不要混入题干','基础较弱'],
    '小作文': ['三条提纲要求','Do not sign your own name','连同称呼、结束语、署名一起提交','正文词数与称呼/结束语/署名'],
    '翻译': ['不要只给 5 个孤立句子','按题号填写译文','多个备选译法','重点拆主干'],
  }[names[i]]
  for (const k of keys) check(`${names[i]}：含「${k}」`, v.includes(k))
}

// 表单与指令一致性：guide 是唯一来源，这里核对两处引用了同样的字段名
const guideKeys = await ev(`(async()=>{const m=await import('/src/lib/tasks.ts');return Object.fromEntries(Object.entries(m.TASK_SPECS).map(([k,v])=>[k,{year:!!v.guide.year,prompt:v.guide.prompt.label,essay:v.guide.essay.label,extras:v.guide.extras.label}]))})()`)
console.log('\n═══ TaskSpec.guide（表单与指令的单一来源）═══')
console.log(JSON.stringify(guideKeys,null,2))

const failed=r.filter(x=>!x.p)
console.log(`\n══════ ${r.length-failed.length}/${r.length} 通过 ══════`)
ws.close();chrome.kill();process.exit(failed.length?1:0)
