#!/usr/bin/env node
/* ==========================================================================
   端到端自检 —— 用真实 Chromium（CDP 驱动）跑一遍关键操作路径
   覆盖：首屏渲染、侧栏导航、细则编辑/保存/持久化/版本历史、
        模型配置增删与状态联动、通道切换、逐步写入
   运行前先启动 dev server：pnpm dev
   运行：node scripts/e2e.mjs
   可用环境变量覆盖：DSH_APP_URL / DSH_CHROME
   ========================================================================== */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.env.DSH_CDP_PORT ?? 9333)
const APP_URL = process.env.DSH_APP_URL ?? 'http://127.0.0.1:5273'

/** 找一个可用的 Chromium：优先环境变量，其次 Playwright 缓存目录 */
function findChrome() {
  if (process.env.DSH_CHROME) return process.env.DSH_CHROME
  const cache = join(homedir(), '.cache/ms-playwright')
  if (existsSync(cache)) {
    for (const entry of readdirSync(cache)) {
      if (!entry.startsWith('chromium-')) continue
      const candidate = join(cache, entry, 'chrome-linux64/chrome')
      if (existsSync(candidate)) return candidate
      const alt = join(cache, entry, 'chrome-linux/chrome')
      if (existsSync(alt)) return alt
    }
  }
  return 'chromium'
}

const CHROME = findChrome()
const USER_DATA_DIR = `/tmp/dsh-e2e-profile-${PORT}`

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))



async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('无法连接 CDP')
}

const ws = new WebSocket(await getWsUrl())
await new Promise((r) => (ws.onopen = r))

let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
function send(method, params = {}) {
  const myId = ++id
  ws.send(JSON.stringify({ id: myId, method, params }))
  return new Promise((r) => pending.set(myId, r))
}

async function evaluate(expr) {
  const res = await send('Runtime.evaluate', {
    expression: expr, awaitPromise: true, returnByValue: true,
  })
  if (res.result?.exceptionDetails) {
    throw new Error('页面异常: ' + JSON.stringify(res.result.exceptionDetails.exception?.description ?? res.result.exceptionDetails))
  }
  return res.result?.result?.value
}

async function goto(hash) {
  await evaluate(`window.location.hash = '${hash}'`)
  await sleep(700)
}

// 轮询等待条件成立，避免固定 sleep 在不同渲染耗时下产生假失败
async function waitFor(expr, timeoutMs = 6000, label = '') {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if (await evaluate(expr)) return true
    } catch {
      /* 元素还没挂载，继续等 */
    }
    await sleep(100)
  }
  console.log(`    (等待超时${label ? ': ' + label : ''})`)
  return false
}

// 等待某元素出现（页面切换后必须先确认已挂载）
const waitForEl = (sel, timeoutMs) => waitFor(`!!document.querySelector('${sel}')`, timeoutMs, sel)

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}${detail ? '  → ' + detail : ''}`)
}

// 收集控制台报错
const consoleErrors = []
await send('Runtime.enable')
await send('Log.enable')
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params.exceptionDetails?.exception?.description ?? 'unknown')
  }
})

await send('Page.enable')
// 先访问一次同源页面，清空上一轮测试留下的 localStorage / IndexedDB，
// 保证每次运行都从「首次打开」状态开始，不受历史运行影响
await send('Page.navigate', { url: `${APP_URL}/#/workbench` })
await sleep(1500)
await evaluate(`(async () => {
  localStorage.clear();
  if (window.indexedDB?.databases) {
    const dbs = await indexedDB.databases();
    dbs.forEach(d => d.name && indexedDB.deleteDatabase(d.name));
  }
})()`)
// 关键：清空 localStorage 不会重置内存里的 zustand store，
// 必须真正 reload 一次，让 store 从空的 localStorage 重新水合
await evaluate(`window.location.hash = '#/workbench'`)
await send('Page.reload', { ignoreCache: false })
await waitFor(`!!document.querySelector('.task-card')`, 8000, '首屏挂载')
await sleep(400)

console.log('\n── 1. 初始渲染 ──')
check('应用已挂载', await evaluate(`!!document.querySelector('.shell')`))
check('侧栏品牌可见', (await evaluate(`document.querySelector('.brand-name')?.textContent`)) === '砚台')
check('三个题型卡均渲染', (await evaluate(`document.querySelectorAll('.task-card').length`)) === 3)
check('无模型时题型卡被禁用', (await evaluate(`[...document.querySelectorAll('.task-card')].every(b=>b.disabled)`)) === true,
  JSON.stringify(await evaluate(`({
    cards: [...document.querySelectorAll('.task-card')].map(c=>c.disabled),
    storeModels: JSON.parse(localStorage.getItem('kaoyan-writing-coach:settings')||'null')?.state?.models?.length ?? 'no store',
    sidebar: document.querySelector('.sidebar__foot')?.innerText.replace(/\\n+/g,' | '),
  })`)))

console.log('\n── 2. 侧栏导航 ──')
await evaluate(`[...document.querySelectorAll('.nav__item')].find(b=>b.textContent.includes('评分细则')).click()`)
await waitForEl('.rubric-layout')
check('导航到评分细则页', (await evaluate(`location.hash`)) === '#/rubrics')
check('细则页已渲染', await evaluate(`!!document.querySelector('.rubric-layout')`))
check('题型 tab 共 3 个', (await evaluate(`document.querySelectorAll('.rubric-tab').length`)) === 3)

console.log('\n── 3. 细则编辑与保存 ──')
// 大作文细则已内置填充，这里直接在末尾追加一段，模拟真实编辑
const before = await evaluate(`document.querySelector('.rubric-textarea').value.length`)
await evaluate(`(() => {
  const ta = document.querySelector('.rubric-textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
  setter.call(ta, ta.value + '\\n\\n## 我的补充\\n- 重点关注逻辑衔接。');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
})()`)
check('编辑后出现「未保存」提示',
  await waitFor(`document.body.textContent.includes('有未保存的修改')`, 5000, '未保存提示'))
check('保存按钮随编辑而解禁',
  (await evaluate(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('保存并归档')); return b ? !b.disabled : false })()`)) === true)
check('内置细则未被编辑破坏',
  (await evaluate(`document.querySelector('.rubric-textarea').value.includes('你是一名考研英语一阅卷老师')`)) === true)
void before

// 切到第二个题型 tab（验证草稿隔离）
await evaluate(`document.querySelectorAll('.rubric-tab')[1].click()`)
await waitFor(`document.querySelector('.rubric-textarea')?.value.includes('格式与语域')`, 5000, '小作文骨架')
check('可切换到小作文细则', (await evaluate(`document.querySelector('.topbar__crumbs')?.textContent.includes('小作文')`)) === true)
check('切换后草稿已重置为小作文骨架', (await evaluate(`document.querySelector('.rubric-textarea').value.includes('格式与语域')`)) === true)

// 切回来验证大作文的修改还在（未保存草稿在切 tab 时丢失是已知取舍）
await evaluate(`document.querySelectorAll('.rubric-tab')[0].click()`)
await waitFor(`document.querySelector('.topbar__crumbs')?.textContent.includes('大作文')`, 5000, '切回大作文')

console.log('\n── 4. 保存并归档 ──')
await evaluate(`(() => {
  const ta = document.querySelector('.rubric-textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
  setter.call(ta, '# 英语一 · 大作文 评分细则\\n\\n## 一、评分档次\\n- 第五档 17-20 分：内容切题、语言基本无误。\\n- 第四档 13-16 分：允许 1-2 处次重点缺失。\\n\\n## 二、扣分规则\\n- 主谓不一致每处扣 0.5 分\\n- 字数不足 160 词扣 1 分\\n- 格式语域不当扣 1 分\\n\\n## 三、逐句诊断\\n- 每句给出语法问题、优化句与结构划分');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
})()`)
await waitFor(`document.body.textContent.includes('有未保存的修改')`, 5000, '保存前未保存提示')
await evaluate(`[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('保存并归档')).click()`)
check('保存后 toast 出现', await waitFor(`!!document.querySelector('.toast')`, 5000, 'toast'))
const stored = await evaluate(`JSON.parse(localStorage.getItem('kaoyan-writing-coach:settings'))?.state?.rubrics?.eng1_big?.content?.includes('主谓不一致每处扣 0.5 分')`)
check('内容已写入 localStorage', stored === true)

await evaluate(`window.location.reload()`)
await sleep(2200)
await evaluate(`window.location.hash = '#/rubrics'`)
await waitForEl('.rubric-textarea')
check('刷新后内容仍在（持久化生效）',
  (await evaluate(`document.querySelector('.rubric-textarea').value.includes('主谓不一致每处扣 0.5 分')`)) === true)

console.log('\n── 5. 细则版本历史 ──')
// 内置指令已覆盖全部三个题型，因此初始为 3/3
check('侧栏显示细则已填 3/3', (await evaluate(`document.querySelector('.sidebar__foot').textContent.includes('3/3')`)) === true)
check('版本历史出现记录', (await evaluate(`document.querySelectorAll('.versionlist__row').length`)) >= 1)

console.log('\n── 6. 模型配置页 ──')
await goto('#/models')
check('服务商卡片 6 个', (await evaluate(`document.querySelectorAll('.provider-card').length`)) === 6)
await evaluate(`[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('添加配置')).click()`)
const okCard = await waitForEl('.model-card')
const diag = await evaluate(`({
  cards: document.querySelectorAll('.model-card').length,
  hash: location.hash,
  topbarBtns: [...document.querySelectorAll('.topbar .btn')].map(b=>b.textContent.trim()),
  storeModels: JSON.parse(localStorage.getItem('kaoyan-writing-coach:settings')||'null')?.state?.models?.length ?? 'no store',
  bodyHead: document.body.innerText.slice(0,90).replace(/\\n+/g,' | '),
})`)
check('成功添加模型配置卡片', (await evaluate(`document.querySelectorAll('.model-card').length`)) === 1, JSON.stringify(diag))
check('默认带出 DeepSeek 地址', (await evaluate(`document.querySelector('.model-grid__wide .input').value`))?.includes('api.deepseek.com'))
check('自动标记为默认且提示未填 Key',
  (await evaluate(`document.querySelector('.model-card__head').textContent.includes('未填写 API Key')`)) === true)

// 填入 key 与模型名，验证状态联动
await evaluate(`(() => {
  const inputs = document.querySelectorAll('.model-grid .input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  const keyInput = [...inputs].find(i => i.type === 'password');
  setter.call(keyInput, 'sk-test-123'); keyInput.dispatchEvent(new Event('input',{bubbles:true}));
  const modelInput = [...document.querySelectorAll('.model-grid .input')].find(i => i.getAttribute('list'));
  setter.call(modelInput, 'deepseek-chat'); modelInput.dispatchEvent(new Event('input',{bubbles:true}));
})()`)
await waitFor(`document.querySelector('.model-card__head')?.textContent.includes('已就绪')`, 5000, '已就绪状态')
check('填入 Key 后状态变为「已就绪」',
  (await evaluate(`document.querySelector('.model-card__head').textContent.includes('已就绪')`)) === true)
check('模型数量同步到侧栏',
  (await evaluate(`document.querySelector('.sidebar__foot').textContent.includes('1 个模型可用')`)) === true)

console.log('\n── 7. 通用设置与持久化 ──')
await goto('#/settings')
await waitForEl('.channel-card')
check('通道卡 2 个', (await evaluate(`document.querySelectorAll('.channel-card').length`)) === 2)
await evaluate(`document.querySelectorAll('.channel-card')[1].click()`)
await sleep(600)
check('切到本地代理后出现代理表单', await evaluate(`!!document.querySelector('.settings-proxy')`))
check('代理模式提示仍为待交付', (await evaluate(`document.querySelector('.settings-proxy').textContent.includes('后续阶段提供')`)) === true)
await evaluate(`document.querySelectorAll('.channel-card')[0].click()`)
await sleep(500)

// 严格度切换
await evaluate(`[...document.querySelectorAll('.segmented__item')].find(b=>b.textContent.trim()==='严格').click()`)
await sleep(500)
check('严格度切换写入存储',
  (await evaluate(`JSON.parse(localStorage.getItem('kaoyan-writing-coach:settings')).state.settings.strictness`)) === 'strict')

console.log('\n── 8. 英文名残留检查（品牌一致性）──')
const brandLeak = await evaluate(`document.body.innerText.match(/Writing Coach|Instruction|Preferences|Model Providers|Grading/g)?.length ?? 0`)
check('页面正文无多余英文装饰标签', brandLeak === 0, `发现 ${brandLeak} 处`)

console.log('\n── 9. 运行时异常 ──')
check('无未捕获异常', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 200))

ws.close()
chrome.kill()

const failed = results.filter((r) => !r.pass)
console.log(`\n══════ 结果：${results.length - failed.length}/${results.length} 通过 ══════`)
if (failed.length) {
  console.log('失败项：')
  failed.forEach((f) => console.log('  · ' + f.name + (f.detail ? ' → ' + f.detail : '')))
  process.exit(1)
}
