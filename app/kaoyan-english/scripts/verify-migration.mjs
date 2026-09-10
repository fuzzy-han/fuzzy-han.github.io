#!/usr/bin/env node
/* ==========================================================================
   验证内置指令的补种与迁移：不覆盖用户内容、缺项要补、且必须落盘
   运行前先启动 dev server：pnpm dev
   可用环境变量覆盖：DSH_APP_URL / DSH_CHROME / DSH_CDP_PORT
   ========================================================================== */
const PORT=Number(process.env.DSH_CDP_PORT ?? 9339)
const CHROME=process.env.DSH_CHROME ?? process.env.HOME+'/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome'
const APP=process.env.DSH_APP_URL ?? 'http://127.0.0.1:5273'
import { spawn } from 'node:child_process'
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/cdp7','about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function wsUrl(){for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl}catch{}await sleep(250)}throw new Error('no cdp')}
const ws=new WebSocket(await wsUrl());await new Promise(r=>ws.onopen=r)
let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r))}
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)return {ERR:r.result.exceptionDetails.exception?.description};return r.result?.result?.value}
const waitFor=async(e,t=8000)=>{const d=Date.now()+t;while(Date.now()<d){try{if(await ev(e))return true}catch{}await sleep(100)}return false}
const r=[];const check=(n,p,d='')=>{r.push({n,p});console.log(`${p?'  PASS':'  FAIL'}  ${n}${d?'  → '+d:''}`)}
await send('Page.enable')

// ── 场景 A：全新安装，做一次正常操作，确认内容落盘并可跨会话保留 ──
console.log('══ 场景 A：全新安装 ══')
await send('Page.navigate',{url:`${APP}/#/workbench`});await sleep(1500)
await ev(`localStorage.clear()`)
await send('Page.reload')
await waitFor(`!!document.querySelector('.task-card')`)
await ev(`window.location.hash='#/rubrics'`)
await waitFor(`!!document.querySelector('.rubric-textarea')`)

// 模拟用户做一次编辑并保存（这是真实使用路径）
await ev(`(()=>{
  const t=document.querySelector('.rubric-textarea');
  const d=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');
  d.set.call(t, t.value + '\\n\\n## 我的补充\\n- 我的个性化要求：重点关注逻辑衔接。');
  t.dispatchEvent(new Event('input',{bubbles:true}));
})()`)
await waitFor(`document.body.textContent.includes('有未保存的修改')`)
await ev(`[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('保存并归档')).click()`)
await sleep(900)

const A = await ev(`(()=>{const raw=localStorage.getItem('kaoyan-writing-coach:settings');if(!raw)return {hasKey:false};const s=JSON.parse(raw);const r=s.state.rubrics.eng1_big;return {hasKey:true, hasBuiltin:r.content.includes('你是一名考研英语一阅卷老师'), hasCustom:r.content.includes('我的个性化要求'), versions:r.versions.length, note:r.versions[0]?.note}})()`)
console.log('   ', JSON.stringify(A))
check('保存后内置指令落盘', A.hasKey && A.hasBuiltin)
check('用户补充内容落盘', A.hasCustom)

await send('Page.reload');await sleep(1500)
await ev(`window.location.hash='#/rubrics'`)
await waitFor(`!!document.querySelector('.rubric-textarea')`)
const reloaded = await ev(`document.querySelector('.rubric-textarea').value`)
check('刷新后内容完整保留', reloaded.includes('我的个性化要求') && reloaded.includes('你是一名考研英语一阅卷老师'))

// ── 场景 B：老用户升级 —— 存储里没有大作文这一项 ──
console.log('\n══ 场景 B：老用户升级（存储里没有 eng1_big）══')
await ev(`(()=>{
  const raw=JSON.parse(localStorage.getItem('kaoyan-writing-coach:settings'));
  // 模拟旧版本：rubrics 里只有小作文和翻译，且小作文是用户自己写的
  raw.state.rubrics = {
    eng1_small: { taskType:'eng1_small', content:'用户自己写的小作文细则，绝对不能被覆盖', updatedAt: 1700000000000, versions: [] },
    eng1_translation: { taskType:'eng1_translation', content:'用户自己写的翻译细则', updatedAt: 1700000000000, versions: [] },
  };
  localStorage.setItem('kaoyan-writing-coach:settings', JSON.stringify(raw));
})()`)
await send('Page.reload');await sleep(2500)
await ev(`window.location.hash='#/rubrics'`)
await waitFor(`!!document.querySelector('.rubric-textarea')`)

const smallTab = await ev(`(()=>{document.querySelectorAll('.rubric-tab')[1].click();return true})()`)
void smallTab
await sleep(700)
const smallContent = await ev(`document.querySelector('.rubric-textarea').value`)
check('用户自己写的小作文细则未被覆盖', smallContent.includes('绝对不能被覆盖'), smallContent.slice(0,40))

const bigTab = await ev(`(()=>{document.querySelectorAll('.rubric-tab')[0].click();return true})()`)
void bigTab
await sleep(700)
const bigContent = await ev(`document.querySelector('.rubric-textarea').value`)
check('缺失的大作文内置指令被补种', bigContent.includes('你是一名考研英语一阅卷老师'))

const B = await ev(`(()=>{const raw=localStorage.getItem('kaoyan-writing-coach:settings');const s=JSON.parse(raw);const r=s.state.rubrics;return {hasKey:!!raw, keys:Object.keys(r), bigLen:r.eng1_big?.content?.length ?? 'MISSING', smallKept:r.eng1_small?.content?.includes('绝对不能被覆盖'), note:r.eng1_big?.versions?.[0]?.note ?? null}})()`)
console.log('     磁盘内容:', JSON.stringify(B))
console.log('     界面是否已渲染内置指令:', bigContent.includes('你是一名考研英语一阅卷老师'))
console.log('   ', JSON.stringify(B))
check('补种结果已写入磁盘（不是只在内存里）', B.bigLen > 2000)
check('补种带来源备注', B.note?.includes('内置'))

// ── 场景 D：老用户缺小作文，但自己写过大作文与翻译 ──
console.log('\n══ 场景 D：缺小作文，其余为用户内容 ══')
await ev(`(()=>{
  const raw=JSON.parse(localStorage.getItem('kaoyan-writing-coach:settings'));
  raw.state.rubrics = {
    eng1_big: { taskType:'eng1_big', content:'我自己的大作文细则，不要动', updatedAt: 1700000000000, versions: [] },
    eng1_translation: { taskType:'eng1_translation', content:'我自己的翻译细则，不要动', updatedAt: 1700000000000, versions: [] },
  };
  localStorage.setItem('kaoyan-writing-coach:settings', JSON.stringify(raw));
})()`)
await send('Page.reload');await sleep(2500)
await ev(`window.location.hash='#/rubrics'`)
await waitFor(`!!document.querySelector('.rubric-textarea')`)

await ev(`document.querySelectorAll('.rubric-tab')[1].click()`)
await sleep(700)
const seContent = await ev(`document.querySelector('.rubric-textarea').value`)
check('缺失的小作文内置指令被补种', seContent.includes('批改我的小作文，满分10分'), seContent.slice(0,30))

await ev(`document.querySelectorAll('.rubric-tab')[0].click()`)
await sleep(700)
check('用户自己的大作文细则未被覆盖',
  (await ev(`document.querySelector('.rubric-textarea').value`)).includes('我自己的大作文细则，不要动'))

const D = await ev(`(()=>{const r=JSON.parse(localStorage.getItem('kaoyan-writing-coach:settings')).state.rubrics;return {smallLen:r.eng1_small?.content?.length ?? 'MISSING', bigKept:r.eng1_big?.content?.includes('不要动'), trKept:r.eng1_translation?.content?.includes('不要动')}})()`)
console.log('   ', JSON.stringify(D))
check('小作文补种已落盘', typeof D.smallLen === 'number' && D.smallLen > 1500)
check('大作文与翻译的用户内容均保留', D.bigKept === true && D.trKept === true)

// 恢复成「只有小作文被清空」的状态，交给场景 C 验证
await ev(`(()=>{
  const raw=JSON.parse(localStorage.getItem('kaoyan-writing-coach:settings'));
  raw.state.rubrics.eng1_big = { taskType:'eng1_big', content:'', updatedAt: 1700000000000, versions: [] };
  localStorage.setItem('kaoyan-writing-coach:settings', JSON.stringify(raw));
})()`)
await send('Page.reload');await sleep(2200)

// ── 场景 E：老数据的「已填写」误判（曾经的真实 bug）──
// 老存储里没有 filled 标记，且用户正文里恰好含有与骨架占位符相同的字样
// （例如引用了一句话，或自己写了批注）。旧逻辑靠数占位符判断，
// 会把这种情况误判成「待填写」，而界面看起来一切正常，极难排查。
console.log('\n══ 场景 E：老数据 + 正文含占位符字样 ══')
await ev(`(()=>{
  const raw=JSON.parse(localStorage.getItem('kaoyan-writing-coach:settings'));
  raw.state.rubrics = {
    eng1_big: { taskType:'eng1_big', content:'# 我的大作文细则\\n\\n我参考了模板里的「此处填写该题型的评分细则」提示，自己写了完整规则：内容要点缺一个扣 2 分，语言错误每处扣 0.5 分，字数不足 160 词扣 1 分。', updatedAt: 1700000000000, versions: [] },
    eng1_small: { taskType:'eng1_small', content:'# 我的小作文细则\\n称呼与署名必须规范，语域错误扣 1 分，要点每缺一条扣 1.5 分。', updatedAt: 1700000000000, versions: [] },
    eng1_translation: { taskType:'eng1_translation', content:'# 我的翻译细则\\n按采分点给分，漏译每处扣 0.5 分，中文不通顺每处扣 0.5 分。', updatedAt: 1700000000000, versions: [] },
  };
  delete raw.state.rubrics.eng1_big.filled;
  localStorage.setItem('kaoyan-writing-coach:settings', JSON.stringify(raw));
})()`)
await send('Page.reload');await sleep(2500)
await send('Page.navigate',{url:`${APP}/#/workbench`})
await waitFor(`!!document.querySelector('.task-card')`)
await sleep(400)

const sidebar = await ev(`document.querySelector('.sidebar__foot').innerText.replace(/\\n+/g,' | ')`)
const chips = await ev(`[...document.querySelectorAll('.task-card')].map(c=>c.querySelector('.chip').textContent)`)
console.log('   侧栏:', sidebar)
console.log('   题型卡:', JSON.stringify(chips))
check('正文含占位符字样的老数据仍判为已填写（不再误判）',
  sidebar.includes('3/3'), sidebar)
check('三个题型卡均显示已填写', chips.every(c=>c.includes('已填写')), JSON.stringify(chips))

// 正文里确实留着占位符字样时，体检要给出提示（这是真信号）
await ev(`window.location.hash='#/rubrics'`)
await waitFor(`!!document.querySelector('.rubric-textarea')`)
await sleep(500)
const reviewLabels = await ev(`[...document.querySelectorAll('.checklist__label')].map(e=>e.textContent)`)
console.log('   体检项:', JSON.stringify(reviewLabels))
check('体检对残留占位符字样给出提示',
  reviewLabels.some(l=>l.includes('占位符')), JSON.stringify(reviewLabels))

// ── 场景 C：用户删空内置指令后，不应被再次强塞 ──
console.log('\n══ 场景 C：用户清空后不应被强塞 ══')
await ev(`(()=>{
  const t=document.querySelector('.rubric-textarea');
  const d=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value');
  d.set.call(t,''); t.dispatchEvent(new Event('input',{bubbles:true}));
})()`)
await waitFor(`document.body.textContent.includes('有未保存的修改')`)
await ev(`[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('保存并归档')).click()`)
await sleep(900)
await send('Page.reload');await sleep(2000)
await ev(`window.location.hash='#/rubrics'`)
await waitFor(`!!document.querySelector('.rubric-textarea')`)
await sleep(400)
const afterClear = await ev(`document.querySelector('.rubric-textarea').value`)
check('用户清空后未被重新塞回内置指令', !afterClear.includes('你是一名考研英语一阅卷老师'), `长度 ${afterClear.length}`)

const failed=r.filter(x=>!x.p)
console.log(`\n══════ ${r.length-failed.length}/${r.length} 通过 ══════`)
ws.close();chrome.kill();process.exit(failed.length?1:0)
