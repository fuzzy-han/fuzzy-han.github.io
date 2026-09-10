#!/usr/bin/env node
/* ==========================================================================
   真实模型端到端测试（可选，会消耗真实额度）

   为什么必须单独有这一套：假模型只能验证代码路径，验不了「提示词能不能
   驱动真实模型产出符合契约的 JSON」。实测发现：流式请求不发 response_format
   时，模型常回一篇人类可读的文字报告而非 JSON —— 这个问题假模型永远发现不了。

   前置：
     DEEPSEEK_API_KEY=sk-xxx node scripts/verify-real-model.mjs
     pnpm proxy   # 需要代理绕过浏览器 CORS（浏览器不能直连 api.deepseek.com）
   成本：约 2 次批改调用，几千 tokens。
   ========================================================================== */
import { openCdp, sleep } from '/home/han/VibeDesign/scripts/lib/cdp.mjs'
const KEY = process.env.DEEPSEEK_API_KEY
if (!KEY) {
  console.error('缺少 DEEPSEEK_API_KEY 环境变量，跳过真实模型测试')
  process.exit(0)
}

const cdp = await openCdp({ port: 9460 })
const { ev, waitFor, goto, check, summary, close } = cdp
await goto('workbench', 1800)
await ev(`localStorage.clear()`)
await ev(`window.location.hash='#/workbench'`)
await cdp.send('Page.reload'); await waitFor(`!!document.querySelector('.task-card')`,8000)

// 用「本地代理」通道：平台把请求发给代理，代理带上 key 转发给 DeepSeek
await ev(`(() => {
  const K='kaoyan-writing-coach:settings'; const s=JSON.parse(localStorage.getItem(K))
  s.state.models=[{id:'ds',label:'DeepSeek 真实',provider:'deepseek',baseUrl:'https://api.deepseek.com/v1',apiKey:${JSON.stringify(KEY)},model:'deepseek-chat',temperature:0.3,maxTokens:8192,vision:false,createdAt:Date.now()}]
  s.state.settings=Object.assign({},s.state.settings,{defaultModelId:'ds',transport:'proxy',proxyBaseUrl:'http://127.0.0.1:8787',proxyToken:'',preferReliableJson:true,timeoutSec:180})
  localStorage.setItem(K,JSON.stringify(s))
})()`)
await cdp.send('Page.reload'); await sleep(2200)
await goto('grade?task=eng1_big', 2200)
await ev(`(() => { const t=document.querySelectorAll('.grade-textarea'); const set=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
  set.call(t[0],'Directions: Write an essay of 160-200 words based on the following drawing. 图画：两位登山者相互搀扶攀登陡崖，图下方英文标注 Cooperate。请 1) describe the drawing briefly 2) interpret its intended meaning 3) give your comments.')
  t[0].dispatchEvent(new Event('input',{bubbles:true}))
  set.call(t[1],'The picture show two climbers who help each other to climb the mountain. We should learn the spirit of cooperation. Only by working together can we overcome difficulties.')
  t[1].dispatchEvent(new Event('input',{bubbles:true})) })()`)
await sleep(700)
const t0 = Date.now()
await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改') && !b.disabled); if(b) b.click() })()`)
const done = await waitFor(`location.hash.startsWith('#/report')`, 180000, '报告页')
const secs = ((Date.now()-t0)/1000).toFixed(1)
check(`真实 DeepSeek 批改完成（${secs}s）`, done, await ev(`location.hash`))
if (done) {
  check('分数环出分', (((await ev(`document.querySelector('.score-ring__number')?.textContent`))??'').length)>0,
    `得分 ${await ev(`document.querySelector('.score-ring__number')?.textContent`)}/${await ev(`document.querySelector('.score-ring__max')?.textContent`)}`)
  check('档位徽标显示', (((await ev(`document.querySelector('.score-ring__band')?.textContent`))??'').length)>0,
    await ev(`document.querySelector('.score-ring__band')?.textContent`))
  check('维度条 4 条', (await ev(`document.querySelectorAll('.dimbars__row').length`))===4)
  check('逐句卡已生成', (await ev(`document.querySelectorAll('.sent').length`))>0,
    `${await ev(`document.querySelectorAll('.sent').length`)} 句`)
  check('修改后全文已生成', (((await ev(`document.querySelector('.report-essay')?.textContent`))??'').length)>50)
  check('表达积累已生成', (await ev(`document.querySelectorAll('.phrase').length`))>0)
  check('复盘已生成', (await ev(`document.querySelectorAll('.fixes__item').length`))>0)
  // 展开一句看内容是否真的可用
  await ev(`document.querySelectorAll('.sent__head')[0]?.click()`); await sleep(500)
  const body = (await ev(`document.querySelector('.sent__body')?.textContent`))??''
  check('逐句卡展开有讲解', body.includes('原句') && body.includes('讲解'))
  check('无诊断警告（说明 JSON 一次到位）',
    !((await ev(`document.body.innerText`))??'').includes('关于这次结果的几点说明'),
    await ev(`(() => { const n=document.querySelector('.note--warn'); return n ? n.textContent.slice(0,80) : '无警告' })()`))
}
check('无 console 异常', cdp.consoleErrors.length===0, cdp.consoleErrors.join(' | ').slice(0,150))
const failed = summary(); await close(); process.exit(failed?1:0)
