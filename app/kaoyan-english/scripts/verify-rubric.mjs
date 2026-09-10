#!/usr/bin/env node
/* ==========================================================================
   验证内置批改指令是否正确落地、体检是否通过、就绪状态是否正确
   运行前先启动 dev server：pnpm dev
   可用环境变量覆盖：DSH_APP_URL / DSH_CHROME / DSH_CDP_PORT
   ========================================================================== */
const PORT=Number(process.env.DSH_CDP_PORT ?? 9337)
const CHROME=process.env.DSH_CHROME ?? process.env.HOME+'/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome'
const APP=process.env.DSH_APP_URL ?? 'http://127.0.0.1:5273'
import { spawn } from 'node:child_process'
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/cdp5','about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function wsUrl(){for(let i=0;i<40;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const l=await r.json();const p=l.find(t=>t.type==='page');if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl}catch{}await sleep(250)}throw new Error('no cdp')}
const ws=new WebSocket(await wsUrl());await new Promise(r=>ws.onopen=r)
let id=0;const pend=new Map();const errs=[]
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}if(m.method==='Runtime.exceptionThrown')errs.push(m.params.exceptionDetails?.exception?.description||'')}
const send=(m,p={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise(r=>pend.set(i,r))}
const ev=async e=>{
  const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true})
  if(r.result?.exceptionDetails)return {ERR:r.result.exceptionDetails.exception?.description}
  const res=r.result?.result
  if(!res)return undefined
  // 基础类型走 value；对象/数组走 value（returnByValue 已序列化）。
  // 注意 undefined 结果会返回空对象 {}，这里显式还原成 undefined，避免误判。
  return res.type==='undefined' ? undefined : res.value
}
const waitFor=async(e,t=8000)=>{const d=Date.now()+t;while(Date.now()<d){try{if(await ev(e))return true}catch{}await sleep(100)}return false}
await send('Runtime.enable');await send('Page.enable')
await send('Page.navigate',{url:`${APP}/#/workbench`});await sleep(1500)
await ev(`localStorage.clear()`)
await ev(`window.location.hash='#/rubrics'`)
await send('Page.reload')
await waitFor(`!!document.querySelector('.rubric-textarea')`)
await sleep(500)

const r=[]
const check=(n,p,d='')=>{r.push({n,p,d});console.log(`${p?'  PASS':'  FAIL'}  ${n}${d?'  → '+d:''}`)}

console.log('── 内置指令是否落地 ──')
const ta = await ev(`document.querySelector('.rubric-textarea').value`)
check('大作文细则已填入内置指令', ta.includes('你是一名考研英语一阅卷老师'))
check('保留了用户原文的评分参考', ta.includes('17–20分') && ta.includes('0分： 未作答'))
check('保留了批改原则', ta.includes('不编造固定扣分规则') && ta.includes('不偷编纠错'))
check('保留了五个输出部分', ta.includes('一、整体评价与评分') && ta.includes('五、写作思路与复盘'))
check('追加了结构化输出契约', ta.includes('结构化输出契约') && ta.includes('"sentences"'))
check('契约含全部 4 个评分维度',
  ['"content"','"language"','"structure"','"format"'].every(k=>ta.includes(k)),
  ['"content"','"language"','"structure"','"format"'].filter(k=>!ta.includes(k)).join(',') || '齐全')
check('契约要求 level 三态', ta.includes('must|optional|ok'))

console.log('\n── 翻译指令是否落地 ──')
// 切到翻译 tab（第三个）
await ev(`document.querySelectorAll('.rubric-tab')[2].click()`)
await waitFor(`document.querySelector('.topbar__crumbs')?.textContent.includes('翻译')`)
await sleep(300)
const tr = await ev(`document.querySelector('.rubric-textarea').value`)
check('翻译指令已填入', tr.includes('你是一名考研英语一阅卷老师，按照以下评分规则批改我的翻译'))
check('保留按点给分规则', tr.includes('按点给分') && tr.includes('3-4 个采分点') && tr.includes('模拟划分'))
check('保留整句扭曲原意上限 0.5 分', tr.includes('整句明显扭曲原意，最多得 0.5 分'))
check('保留错别字累计扣分规则', tr.includes('每满 3 个扣 0.5 分') && tr.includes('总分最低为 0 分'))
check('保留四个逐句输出项', tr.includes('① 单句得分') && tr.includes('② 采分点') && tr.includes('③ 错误分析') && tr.includes('④ 修改译文'))
check('保留汇总要求', tr.includes('汇总各句得分、错别字扣分和总分'))
check('保留手写图片转录约束', tr.includes('先转录原文') && tr.includes('不要猜测或当作错误'))
check('含翻译专有 typoDeduction 字段', tr.includes('"typoDeduction"') && tr.includes('"deducted"'))
check('含采分点五态枚举', ['hit','partial','mistranslated','missed','over'].every(k=>tr.includes(k)))
check('契约要求每句采分点合计 2 分', tr.includes('每句的采分点合计必须为 2 分'))
check('契约覆盖全部 5 句', tr.includes('必须覆盖全部 5 句'))
check('翻译维度阈值正确', tr.includes('"accuracy"') && tr.includes('"fluency"'))
const trWarn = await ev(`document.querySelectorAll('.checklist__item--warn').length`)
check('翻译体检无 warn 项', trWarn === 0, `warn=${trWarn}`)
void trWarn

console.log('\n── 小作文指令是否落地 ──')
await ev(`document.querySelectorAll('.rubric-tab')[1].click()`)
await waitFor(`document.querySelector('.topbar__crumbs')?.textContent.includes('小作文')`)
await sleep(300)
const se = await ev(`document.querySelector('.rubric-textarea').value`)
check('小作文指令已填入', se.includes('你是一名考研英语一阅卷老师，批改我的小作文，满分10分'))
check('保留六档评分参考', ['9—10分','7—8分','5—6分','3—4分','1—2分','0分'].every(k=>se.includes(k)))
check('保留不机械按错误数扣分', se.includes('不机械按错误数量扣分'))
check('保留格式逐项核对要求', se.includes('书信的称呼、结束语和署名') && se.includes('通知的标题和落款'))
check('保留身份/姓名/语气核对', se.includes('题目指定的身份、姓名及语气要求'))
check('保留词数统计与称呼署名单列', se.includes('称呼、结束语和署名单独说明'))
check('保留不套用固定词数扣分公式', se.includes('不自行套用') && se.includes('每少10词扣1分'))
check('保留连接词不决定分数', se.includes('不以连接词、复杂句或同义替换的数量决定分数'))
check('保留四个输出项', se.includes('① 整体评分') && se.includes('② 逐句批改') && se.includes('③ 修改后全文') && se.includes('④ 复盘积累'))
check('保留复盘三项与3—5个表达', se.includes('总结3个最需要改进的问题') && se.includes('提炼3—5个可复用表达'))
check('保留缺题目时不给确定总分', se.includes('缺少题目时，先批改语言，暂不给出确定总分'))
check('含小作文专有 essayFormat 字段',
  se.includes('"essayFormat"') && se.includes('"salutation"') && se.includes('"closing"') && se.includes('"signature"'))
check('essayFormat 含正文词数与格式问题', se.includes('"bodyWordCount"') && se.includes('"formatIssues"'))
check('小作文四维度齐全', ['"format"','"points"','"language"','"coherence"'].every(k=>se.includes(k)))
const seWarn = await ev(`document.querySelectorAll('.checklist__item--warn').length`)
check('小作文体检无 warn 项', seWarn === 0, `warn=${seWarn}`)

console.log('\n── 侧栏与体检 ──')
await ev(`document.querySelectorAll('.rubric-tab')[0].click()`)
await waitFor(`document.querySelector('.topbar__crumbs')?.textContent.includes('大作文')`)
await sleep(300)
// 来回切 tab 不应串改内容：两个题型的正文必须各自独立
const backToBig = await ev(`document.querySelector('.rubric-textarea').value`)
check('切回大作文后内容未被翻译指令污染',
  backToBig.includes('你是一名考研英语一阅卷老师，按照以下要求批改我的大作文') && !backToBig.includes('① 单句得分'))
check('侧栏显示细则已填 3/3',
  (await ev(`document.querySelector('.sidebar__foot').textContent.replace(/\\s+/g,'')`)).includes('3/3'))
const checks = await ev(`[...document.querySelectorAll('.checklist__label')].map(e=>e.textContent)`)
console.log('     体检项:', JSON.stringify(checks))
check('体检直接通过，不再报「未填写」', !checks.some(c=>c.includes('尚未填写')))
check('无 warn 项', (await ev(`document.querySelectorAll('.checklist__item--warn').length`)) === 0,
  `warn=${await ev(`document.querySelectorAll('.checklist__item--warn').length`)}`)

console.log('\n── 模型卡与就绪状态 ──')
await ev(`window.location.hash='#/workbench'`); await sleep(900)
const cards = await ev(`[...document.querySelectorAll('.task-card')].map(c=>({n:c.querySelector('.task-card__name').textContent, chip:c.querySelector('.chip').textContent, disabled:c.disabled}))`)
console.log('     ', JSON.stringify(cards, null, 0))
check('大作文卡显示「细则已填写」', cards[0].chip.includes('已填写'))
check('小作文显示「细则已填写」', cards[1].chip.includes('已填写'), cards[1].chip)
check('翻译显示「细则已填写」', cards[2].chip.includes('已填写'), cards[2].chip)
const readiness = await ev(`[...document.querySelectorAll('.readiness__item')].map(e=>e.className.replace('readiness__item ',''))`)
console.log('     就绪条语气:', JSON.stringify(readiness))
check('未配模型用琥珀而非朱红', readiness[0].includes('warn'), readiness[0])
check('细则齐全后就绪条转为完成态', readiness[1].includes('ok'), readiness[1])

console.log('\n── 全站「待填写」兜底扫描 ──')
// 三个题型都已内置，界面上任何位置都不该再出现「待填写」。
// 加了这条兜底，以后任何判定逻辑退化都会立刻被抓住。
for (const page of ['rubrics','workbench','settings','history','models']) {
  await ev(`window.location.hash='#/${page}'`)
  await sleep(900)
  const hits = await ev(`(()=>{const out=[];document.querySelectorAll('*').forEach(el=>{if(el.children.length===0 && el.textContent.includes('待填写')) out.push(el.textContent.trim())});return out})()`)
  check(`#/${page} 无「待填写」字样`, Array.isArray(hits) && hits.length === 0, Array.isArray(hits) ? JSON.stringify(hits) : 'eval 失败')
}

console.log('\n── 持久化 ──')
const stored = await ev(`(()=>{const raw=localStorage.getItem('kaoyan-writing-coach:settings');const s=raw?JSON.parse(raw):null;const r=s?.state?.rubrics?.eng1_big;return {hasKey:!!raw, len:r?.content?.length??0, vers:r?.versions?.length??0, note:r?.versions?.[0]?.note??null}})()`)
console.log('     ', JSON.stringify(stored))
// 全新安装时 merge 就会把三种题型都填上默认值，因此没有「缺失」需要补种，
// persist 也不会额外写盘 —— 此时 hasKey=false 是正确行为，不是 bug。
// 真正要走补种+落盘的是「老用户存储里缺某一项」，见 verify-migration.mjs
check('全新安装无需补种（无键亦属正常）', stored.hasKey === false || stored.len > 2000, JSON.stringify(stored))
// 顺带确认界面上的内容确实来自内置指令（不依赖 localStorage 时机）
// 此时已切到批改台（该页没有 .rubric-textarea），所以这里只校验已落盘的细则内容，
// 界面渲染的校验在上面「内置指令是否落地」那一段已经做过。
const full = await ev(`(()=>{const s=JSON.parse(localStorage.getItem('kaoyan-writing-coach:settings'));return s?.state?.rubrics?.eng1_big?.content ?? ''})()`)
check('落盘内容长度与内置指令一致', typeof full === 'string' && full.length > 2000, `${typeof full === 'string' ? full.length : full} 字符`)
check('落盘内容含全部四个评分维度', ['"content"','"language"','"structure"','"format"'].every(k=>full.includes(k)))
check('落盘内容含五个输出部分', full.includes('一、整体评价与评分') && full.includes('五、写作思路与复盘'))
const trFull = await ev(`(()=>{const s=JSON.parse(localStorage.getItem('kaoyan-writing-coach:settings'));return s?.state?.rubrics?.eng1_translation?.content ?? ''})()`)
check('翻译指令已落盘', typeof trFull === 'string' && trFull.length > 1500, `${typeof trFull === 'string' ? trFull.length : trFull} 字符`)
check('翻译落盘内容含错别字扣分字段', typeof trFull === 'string' && trFull.includes('typoDeduction'))
const seFull = await ev(`(()=>{const s=JSON.parse(localStorage.getItem('kaoyan-writing-coach:settings'));return s?.state?.rubrics?.eng1_small?.content ?? ''})()`)
check('小作文指令已落盘', typeof seFull === 'string' && seFull.length > 1500, `${typeof seFull === 'string' ? seFull.length : seFull} 字符`)
check('小作文落盘内容含 essayFormat 字段', typeof seFull === 'string' && seFull.includes('essayFormat'))
check('无未捕获异常', errs.length===0, errs.join(' | ').slice(0,150))

const failed=r.filter(x=>!x.p)
console.log(`\n══════ ${r.length-failed.length}/${r.length} 通过 ══════`)
ws.close();chrome.kill()
process.exit(failed.length?1:0)
