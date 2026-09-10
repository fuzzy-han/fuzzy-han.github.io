/* ==========================================================================
   CDP 测试脚手架：启动无头 Chromium + 常用断言助手
   供 scripts/verify-*.mjs 复用，避免每个脚本重复抄一遍连接逻辑
   ========================================================================== */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 找一个可用的 Chromium：优先环境变量，其次 Playwright 缓存目录 */
export function findChrome() {
  if (process.env.DSH_CHROME) return process.env.DSH_CHROME
  const cache = join(homedir(), '.cache/ms-playwright')
  if (existsSync(cache)) {
    for (const entry of readdirSync(cache)) {
      if (!entry.startsWith('chromium-')) continue
      for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const candidate = join(cache, entry, rel)
        if (existsSync(candidate)) return candidate
      }
    }
  }
  return 'chromium'
}

export const APP_URL = process.env.DSH_APP_URL ?? 'http://127.0.0.1:5273'

/**
 * 启动浏览器并返回一组操作原语。
 * 用法：
 *   const cdp = await openCdp({ port: 9400 })
 *   await cdp.goto('#/workbench')
 *   cdp.check('渲染正常', await cdp.ev(`!!document.querySelector('.shell')`))
 *   process.exit(await cdp.close() ? 0 : 1)
 */
export async function openCdp({
  port = Number(process.env.DSH_CDP_PORT ?? 9400),
  width,
  height,
  mobile = false,
} = {}) {
  const chrome = spawn(
    findChrome(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=/tmp/dsh-cdp-${port}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let wsUrl = null
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl
        break
      }
    } catch {
      /* 还没起来 */
    }
    await sleep(250)
  }
  if (!wsUrl) throw new Error(`无法连接 CDP（端口 ${port}）`)

  const ws = new WebSocket(wsUrl)
  await new Promise((resolve) => {
    ws.onopen = resolve
  })

  let id = 0
  const pending = new Map()
  const consoleErrors = []

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? 'unknown')
    }
  }

  const send = (method, params = {}) => {
    const myId = ++id
    ws.send(JSON.stringify({ id: myId, method, params }))
    return new Promise((resolve) => pending.set(myId, resolve))
  }

  /** 求值：undefined 结果会返回空对象，这里显式还原成 undefined */
  const ev = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (res.result?.exceptionDetails) {
      return { ERR: res.result.exceptionDetails.exception?.description }
    }
    const result = res.result?.result
    if (!result) return undefined
    return result.type === 'undefined' ? undefined : result.value
  }

  const waitFor = async (expression, timeout = 25000, label = '') => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      try {
        if (await ev(expression)) return true
      } catch {
        /* 元素还没挂载，继续等 */
      }
      await sleep(120)
    }
    if (label) console.log(`    (等待超时: ${label})`)
    return false
  }

  const goto = async (hash, settle = 1500) => {
    await send('Page.navigate', { url: `${APP_URL}/#/${String(hash).replace(/^#?\/?/, '')}` })
    await sleep(settle)
  }

  /** 写入输入框/文本域的值并触发 React 的 onChange */
  const setValue = (selector, value) =>
    ev(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return false
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
        : el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`)

  const results = []
  const check = (name, pass, detail = '') => {
    results.push({ name, pass })
    console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}${detail ? '  → ' + detail : ''}`)
  }

  /** 打印小结，返回失败数量 */
  const summary = () => {
    const failed = results.filter((x) => !x.pass)
    console.log(`\n══════ ${results.length - failed.length}/${results.length} 通过 ══════`)
    if (failed.length) {
      console.log('失败项：')
      failed.forEach((f) => console.log('  · ' + f.name))
    }
    return failed.length
  }

  await send('Runtime.enable')
  await send('Page.enable')
  if (width && height) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    })
  }

  const close = async () => {
    try {
      ws.close()
    } catch {
      /* 忽略 */
    }
    chrome.kill()
  }

  return { send, ev, waitFor, goto, setValue, check, summary, close, consoleErrors, results }
}

/* -------------------------------------------------------------------------- */
/*  注入一个指向假模型的配置，免去每个脚本重复写配置代码                          */
/* -------------------------------------------------------------------------- */

export const MOCK_BASE_URL = process.env.DSH_MOCK_URL ?? 'http://127.0.0.1:8891/v1'

export function injectMockModelScript({
  baseUrl = MOCK_BASE_URL,
  transport = 'direct',
  proxyBaseUrl = 'http://127.0.0.1:8787',
} = {}) {
  return `(() => {
    const KEY = 'kaoyan-writing-coach:settings'
    const raw = localStorage.getItem(KEY)
    const s = raw ? JSON.parse(raw) : { state: {}, version: 1 }
    s.state = s.state ?? {}
    s.state.models = [{
      id: 'mock1', label: '假模型（测试）', provider: 'custom',
      baseUrl: ${JSON.stringify(baseUrl)}, apiKey: 'sk-test', model: 'mock-grader',
      temperature: 0.3, maxTokens: 4096, vision: true, createdAt: Date.now(),
    }]
    s.state.settings = Object.assign({}, s.state.settings, {
      defaultModelId: 'mock1',
      transport: ${JSON.stringify(transport)},
      proxyBaseUrl: ${JSON.stringify(proxyBaseUrl)},
      proxyToken: '',
    })
    localStorage.setItem(KEY, JSON.stringify(s))
    return true
  })()`
}
