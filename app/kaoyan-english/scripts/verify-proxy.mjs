#!/usr/bin/env node
/* ==========================================================================
   本地代理通道自检
   前置：pnpm dev、node scripts/mock-model.mjs、node proxy/server.mjs
   覆盖：平台切到代理通道后，请求经代理转发仍能完成流式批改
   ========================================================================== */

import { openCdp, injectMockModelScript, sleep, MOCK_BASE_URL } from './lib/cdp.mjs'

const PROXY_BASE = process.env.DSH_PROXY_URL ?? 'http://127.0.0.1:8787'
const cdp = await openCdp({ port: 9403 })
const { ev, waitFor, goto, check, summary, close } = cdp

await goto('workbench', 1800)
await ev(`localStorage.clear()`)
await ev(`window.location.hash = '#/workbench'`)
await cdp.send('Page.reload')
await waitFor(`!!document.querySelector('.task-card')`, 8000, '首屏')
await ev(injectMockModelScript({ transport: 'proxy', proxyBaseUrl: PROXY_BASE }))
await cdp.send('Page.reload')
await sleep(2200)

console.log('── 设置页显示代理通道 ──')
await goto('settings', 1800)
check('通道选中「本地代理」', (await ev(`document.querySelectorAll('.channel-card')[1].getAttribute('aria-pressed')`)) === 'true')
check('显示代理地址输入框', await ev(`!!document.querySelector('.settings-proxy')`))
check('代理地址已填入', ((await ev(`document.querySelector('.settings-proxy .input')?.value`)) ?? '').includes('8787'))

console.log('\n── 经代理批改 ──')
await goto('grade?task=eng1_big', 2000)
await ev(`(() => {
  const t = document.querySelectorAll('.grade-textarea')
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
  set.call(t[0], 'Directions: 图画为两位登山者互相搀扶。')
  t[0].dispatchEvent(new Event('input', { bubbles: true }))
  set.call(t[1], 'The picture show two climbers who help each other to climb the mountain.')
  t[1].dispatchEvent(new Event('input', { bubbles: true }))
})()`)
await sleep(600)
await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改') && !b.disabled); if (b) b.click() })()`)

const reached = await waitFor(`location.hash.startsWith('#/report')`, 50000, '报告页')
check('经代理通道完成批改', reached, await ev(`location.hash`))
check('报告有总分', (((await ev(`document.querySelector('.score-ring__number')?.textContent`)) ?? '').length) > 0)
// 模型名在折叠的元信息区里，直接读字段值更稳（不要依赖全文匹配的括号形态）
check('模型名记录正确',
  ((await ev(`document.querySelector('.metafield__value')?.textContent`)) ?? '').includes('假模型'),
  await ev(`document.querySelector('.metafield__value')?.textContent`))
check('上游地址未泄露到界面', !((await ev(`document.body.innerText`)) ?? '').includes('sk-test'))
check('无未捕获异常', cdp.consoleErrors.length === 0, cdp.consoleErrors.join(' | ').slice(0, 150))

void MOCK_BASE_URL
const failed = summary()
await close()
process.exit(failed ? 1 : 0)
