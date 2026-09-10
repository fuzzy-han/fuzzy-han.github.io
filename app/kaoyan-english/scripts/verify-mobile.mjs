#!/usr/bin/env node
/* ==========================================================================
   手机端适配自检（默认 390×844，可用 W / H 环境变量覆盖）
   检查：各页面无横向溢出、抽屉交互（汉堡 / 遮罩 / Esc / 跳转自动收起）、
        触控目标尺寸、输入框字号（防 iOS 聚焦缩放）
   运行前先启动 dev server：pnpm dev
   ========================================================================== */
const PORT=Number(process.env.DSH_CDP_PORT ?? 9371)
const CHROME=process.env.DSH_CHROME ?? process.env.HOME+'/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome'
const APP=process.env.DSH_APP_URL ?? 'http://127.0.0.1:5273'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,`--user-data-dir=${mkdtempSync(join(tmpdir(),'dsh-mob-'))}`,'about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function wsUrl(){for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl}catch{}await sleep(250)}throw new Error('no cdp')}
const ws=new WebSocket(await wsUrl());await new Promise(r=>ws.onopen=r)
let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}}
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r))}
const evaluate=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)return {ERR:r.result.exceptionDetails.exception?.description};const res=r.result?.result;return res?.type==='undefined'?undefined:res?.value}
const waitFor=async(e,t=8000)=>{const d=Date.now()+t;while(Date.now()<d){try{if(await evaluate(e))return true}catch{}await sleep(100)}return false}

const W=Number(process.env.W ?? 390), H=Number(process.env.H ?? 844)
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:2,mobile:true})

const r=[];const check=(n,p,d='')=>{r.push({n,p,d});console.log(`${p?'  PASS':'  FAIL'}  ${n}${d?'  → '+d:''}`)}

// 各页面横向溢出检查：这是手机端最常见的崩坏
for (const page of ['workbench','grade?task=eng1_big','rubrics','models','settings','history','report']) {
  await send('Page.navigate',{url:`${APP}/#/${page}`})
  await sleep(2000)
  const m = await evaluate(`(()=>{
    const de = document.documentElement;

    /*
     * 判断元素是否处在「故意横向滚动」的容器里。
     * 这类容器（题型页签、筛选条）本来就会比视口宽，内部元素越过视口
     * 右缘是正常设计，不该报成越界——否则每次加一个横滑条都会误报。
     */
    const inScroller = (el) => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') return true;
        node = node.parentElement;
      }
      return false;
    };

    const overflowing = [];
    document.querySelectorAll('body *').forEach(el=>{
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && (rect.right > de.clientWidth + 1 || rect.left < -1)) {
        const cls = typeof el.className==='string' && el.className ? '.'+el.className.trim().split(/\\s+/).join('.') : el.tagName.toLowerCase();
        // 侧栏抽屉默认在视口外，属正常
        if (el.closest('.sidebar') || el.closest('.nav-scrim')) return;
        if (inScroller(el)) return;
        overflowing.push({cls, left:Math.round(rect.left), right:Math.round(rect.right)});
      }
    });
    return {
      scrollW: de.scrollWidth, clientW: de.clientWidth,
      overflowing: overflowing.slice(0,6),
    };
  })()`)
  check(`#/${page} 无横向滚动`, m.scrollW <= m.clientW + 1, `scrollW=${m.scrollW} clientW=${m.clientW}`)
  if (m.overflowing?.length) check(`#/${page} 无元素越界`, false, JSON.stringify(m.overflowing))
}

// ── 批改台手机端：上传入口必须都可用、不溢出 ──
console.log('\n── 批改台上传入口（手机端）──')
await send('Page.navigate',{url:`${APP}/#/grade?task=eng1_big`});await sleep(2000)
const uploadBar = await evaluate(`(() => {
  const de=document.documentElement
  const btns=[...document.querySelectorAll('.grade-drop__action')]
  const bad=btns.filter(b=>{const r=b.getBoundingClientRect();return r.right > de.clientWidth+1 || r.left < -1})
  const cam=[...document.querySelectorAll('.grade-drop input[type=file]')].find(i=>i.getAttribute('capture'))
  return {
    buttons: btns.map(b=>b.textContent.trim()),
    heights: btns.map(b=>Math.round(b.getBoundingClientRect().height)),
    overflowing: bad.map(b=>b.textContent.trim()),
    hasCapture: cam?.getAttribute('capture') ?? null,
  }
})()`)
console.log('   ', JSON.stringify(uploadBar))
check('手机端有拍照与选文件入口', uploadBar.buttons.includes('拍照') && uploadBar.buttons.includes('选文件'))
check('上传按钮不溢出视口', uploadBar.overflowing.length === 0, JSON.stringify(uploadBar.overflowing))
check('拍照入口触控高度足够', uploadBar.heights.every(h=>h>=28), JSON.stringify(uploadBar.heights))
check('拍照入口带 capture', uploadBar.hasCapture === 'environment')

// ── 报告页手机端检查：先注入假模型并真批一次 ──
console.log('\n── 报告页（真批一次后检查）──')
await send('Page.navigate',{url:`${APP}/#/workbench`});await sleep(1200)
await evaluate(`localStorage.clear()`)
await send('Page.reload');await waitFor(`!!document.querySelector('.task-card')`,8000)
await evaluate(`(() => {
  const KEY='kaoyan-writing-coach:settings'
  const s=JSON.parse(localStorage.getItem(KEY))
  s.state.models=[{id:'mock1',label:'假模型',provider:'custom',baseUrl:'http://127.0.0.1:8891/v1',apiKey:'sk-t',model:'mock-grader',temperature:0.3,maxTokens:4096,vision:true,createdAt:Date.now()}]
  s.state.settings=Object.assign({},s.state.settings,{defaultModelId:'mock1',transport:'direct'})
  localStorage.setItem(KEY,JSON.stringify(s))
})()`)
await send('Page.reload');await sleep(2000)
await evaluate(`location.hash='#/grade?task=eng1_big'`);await sleep(2000)
await evaluate(`(() => {
  const t=document.querySelectorAll('.grade-textarea')
  const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
  set.call(t[0],'Directions: 图画为两位登山者互相搀扶。');t[0].dispatchEvent(new Event('input',{bubbles:true}))
  set.call(t[1],'The picture show two climbers who help each other to climb the mountain.');t[1].dispatchEvent(new Event('input',{bubbles:true}))
})()`)
await sleep(500)
await evaluate(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改') && !b.disabled); if(b) b.click() })()`)
const graded = await waitFor(`location.hash.startsWith('#/report')`, 45000, '报告页')
check('手机端也能完成批改', graded === true)

const reportOverflow = await evaluate(`(() => {
  const de=document.documentElement
  const bad=[]
  document.querySelectorAll('body *').forEach(el=>{
    const r=el.getBoundingClientRect()
    if(r.width>0 && (r.right > de.clientWidth+1 || r.left < -1)){
      const cls = typeof el.className==='string' && el.className ? '.'+el.className.trim().split(/\s+/).join('.') : el.tagName.toLowerCase()
      if(!el.closest('.sidebar') && !el.closest('.nav-scrim')) bad.push({cls,left:Math.round(r.left),right:Math.round(r.right)})
    }
  })
  return {scrollW:de.scrollWidth, clientW:de.clientWidth, bad:bad.slice(0,6)}
})()`)
console.log('   ', JSON.stringify(reportOverflow))
check('报告页无横向滚动', reportOverflow.scrollW <= reportOverflow.clientW + 1)
check('报告页无元素越界', reportOverflow.bad.length === 0, JSON.stringify(reportOverflow.bad))
check('分数环在手机端渲染', await evaluate(`!!document.querySelector('.score-ring')`))
check('逐句卡在手机端渲染', (await evaluate(`document.querySelectorAll('.sent').length`)) > 0)

// 展开一张逐句卡，检查展开态不越界
await evaluate(`document.querySelectorAll('.sent__head')[0].click()`)
await sleep(500)
const expandedOverflow = await evaluate(`(() => {
  const de=document.documentElement
  const bad=[]
  document.querySelectorAll('.sent__body *').forEach(el=>{
    const r=el.getBoundingClientRect()
    if(r.width>0 && (r.right > de.clientWidth+1 || r.left < -1)) bad.push(el.className || el.tagName)
  })
  return {scrollW:de.scrollWidth, clientW:de.clientWidth, bad:bad.slice(0,5)}
})()`)
check('展开态无横向滚动', expandedOverflow.scrollW <= expandedOverflow.clientW + 1,
  `scrollW=${expandedOverflow.scrollW}`)
check('展开态无元素越界', expandedOverflow.bad.length === 0, JSON.stringify(expandedOverflow.bad))

// 翻译报告：采分点表在窄屏最容易溢出
await evaluate(`location.hash='#/grade?task=eng1_translation'`);await sleep(2000)
await evaluate(`(() => {
  const t=document.querySelectorAll('.grade-textarea')
  const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
  set.call(t[0],'It is generally agreed that a person of high intelligence is one who can grasp ideas readily.');t[0].dispatchEvent(new Event('input',{bubbles:true}))
  set.call(t[1],'(1) 人们普遍认为，高智力的人就是能很快抓住想法的人。');t[1].dispatchEvent(new Event('input',{bubbles:true}))
})()`)
await sleep(500)
await evaluate(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改') && !b.disabled); if(b) b.click() })()`)
await waitFor(`location.hash.startsWith('#/report')`, 45000, '翻译报告')
await sleep(1000)
await evaluate(`document.querySelectorAll('.sent__head')[0]?.click()`)
await sleep(500)
const ptOverflow = await evaluate(`(() => {
  const de=document.documentElement
  const bad=[]
  document.querySelectorAll('.pt, .pt *').forEach(el=>{
    const r=el.getBoundingClientRect()
    if(r.width>0 && (r.right > de.clientWidth+1 || r.left < -1)) bad.push(typeof el.className==='string'?el.className:el.tagName)
  })
  return {scrollW:de.scrollWidth, clientW:de.clientWidth, ptCount:document.querySelectorAll('.pt').length, bad:[...new Set(bad)].slice(0,5)}
})()`)
console.log('   ', JSON.stringify(ptOverflow))
check('采分点表在手机端渲染', ptOverflow.ptCount >= 1)
check('采分点表无溢出', ptOverflow.bad.length === 0 && ptOverflow.scrollW <= ptOverflow.clientW + 1,
  JSON.stringify(ptOverflow.bad))

// 抽屉交互
await send('Page.navigate',{url:`${APP}/#/workbench`});await sleep(1800)
const closed = await evaluate(`(()=>{const s=document.querySelector('.sidebar');const r=s.getBoundingClientRect();return {right:Math.round(r.right), visible: r.right>0}})()`)
check('抽屉默认收起（不在视口内）', closed.visible === false, JSON.stringify(closed))

await evaluate(`document.querySelector('.nav-toggle').click()`)
await sleep(500)
const opened = await evaluate(`(()=>{const s=document.querySelector('.sidebar');const r=s.getBoundingClientRect();const scrim=getComputedStyle(document.querySelector('.nav-scrim'));return {right:Math.round(r.right), width:Math.round(r.width), scrimOpacity:scrim.opacity, bodyOverflow:document.body.style.overflow}})()`)
check('点汉堡后抽屉划入', opened.right > 100, JSON.stringify(opened))
check('遮罩出现', Number(opened.scrimOpacity) > 0.9, `opacity=${opened.scrimOpacity}`)
check('背景滚动被锁住', opened.bodyOverflow === 'hidden', opened.bodyOverflow)
check('抽屉里导航文字可见', (await evaluate(`getComputedStyle(document.querySelector('.nav__label')).display`)) !== 'none')

// 点遮罩关闭
await evaluate(`document.querySelector('.nav-scrim').click()`)
await sleep(500)
check('点遮罩可关闭抽屉', (await evaluate(`document.querySelector('.sidebar').getBoundingClientRect().right`)) <= 0)
check('关闭后恢复滚动', (await evaluate(`document.body.style.overflow`)) === '')

// Esc 关闭
await evaluate(`document.querySelector('.nav-toggle').click()`)
await sleep(400)
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
await sleep(400)
check('Esc 可关闭抽屉', (await evaluate(`document.querySelector('.sidebar').getBoundingClientRect().right`)) <= 0)

// 点导航项跳转并自动关闭
await evaluate(`document.querySelector('.nav-toggle').click()`)
await sleep(400)
await evaluate(`[...document.querySelectorAll('.nav__item')].find(b=>b.textContent.includes('评分细则')).click()`)
await waitFor(`location.hash === '#/rubrics'`)
await sleep(400)
check('点导航项会跳转', (await evaluate(`location.hash`)) === '#/rubrics')
check('跳转后抽屉自动收起', (await evaluate(`document.querySelector('.sidebar').getBoundingClientRect().right`)) <= 0)

// 触控目标尺寸
await send('Page.navigate',{url:`${APP}/#/workbench`});await sleep(1800)
const small = await evaluate(`(()=>{
  const bad=[];
  document.querySelectorAll('button, a, .nav__item, .switch, summary').forEach(el=>{
    const r=el.getBoundingClientRect();
    if(r.width===0||r.height===0) return;
    if(r.height < 32) { const cls=typeof el.className==='string'?el.className.trim().split(/\\s+/)[0]:el.tagName; bad.push(cls+':'+Math.round(r.height)) }
  });
  return bad.slice(0,8);
})()`)
check('可点元素高度均 ≥32px', Array.isArray(small) && small.length===0, JSON.stringify(small))

// 输入框字号 ≥16px（防 iOS 聚焦缩放）
await send('Page.navigate',{url:`${APP}/#/rubrics`});await sleep(1800)
const fs = await evaluate(`getComputedStyle(document.querySelector('.rubric-textarea')).fontSize`)
check('输入框字号 ≥16px（防 iOS 自动缩放）', parseFloat(fs) >= 16, fs)

const failed=r.filter(x=>!x.p)
console.log(`\n══════ ${r.length-failed.length}/${r.length} 通过（${W}×${H}）══════`)
ws.close();chrome.kill();process.exit(failed.length?1:0)
