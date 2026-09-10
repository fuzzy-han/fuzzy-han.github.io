/* ==========================================================================
   CDP 测试脚手架：启动无头 Chromium + 常用断言助手
   供 scripts/verify-*.mjs 复用，避免每个脚本重复抄一遍连接逻辑
   ========================================================================== */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
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
  /*
   * 每次运行都用全新的 profile 目录。
   *
   * 教训：固定路径的 profile 会在测试之间残留 IndexedDB，
   * 上一次跑出来的「有库无表」损坏状态会带到下一次，
   * 表现为「单独跑通过、连跑必挂」——排查成本极高。
   * mkdtemp 保证绝对干净，进程退出时再删掉。
   */
  const profileDir = mkdtempSync(join(tmpdir(), `dsh-cdp-${port}-`))

  const chrome = spawn(
    findChrome(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
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

  /**
   * 彻底重置应用状态：localStorage **和** IndexedDB。
   *
   * 只清 localStorage 是不够的——批改报告存在 IndexedDB 里，
   * 上一个测试留下的记录会累积到下一个，导致「历史记录有 N 条」这类断言
   * 只在连跑时随机失败，单独跑永远正常，最难排查。
   *
   * 为什么用「清空对象仓库」而不是 deleteDatabase：
   * IDB 的 deleteDatabase 在存在活跃连接时不会执行、只会一直等，
   * 而应用启动时就会打开连接。删库要么挂起、要么在重载后才发现没删掉。
   * 清空仓库是事务性的，立刻生效。删除数据库本身交给「清空全部数据」按钮，
   * 那边已经会在删除前先 closeDB()。
   */
  const resetAppState = async (dbName = 'kaoyan-writing-coach-db') => {
    await ev(`localStorage.clear()`)

    /*
     * 清空报告仓库。用版本推进触发 upgradeneeded 里 clear()，
     * 而不是自己 open() 再 clear() —— 后者若不建对象仓库，会把库
     * 创建成「有库无表」的损坏状态，应用的写入会永久挂起。
     *
     * 全程自己兜超时：IDB 的 onblocked 可能永远不来，
     * 页面里挂一个永不 resolve 的 Promise 会把测试进程一起吊死。
     */
    await ev(`new Promise((resolve) => {
      let done = false
      const finish = (why) => { if (!done) { done = true; resolve(why) } }
      const guard = setTimeout(() => finish('timeout'), 4000)
      try {
        const probe = indexedDB.open(${JSON.stringify(dbName)})
        probe.onsuccess = () => {
          const version = probe.result.version
          probe.result.close()
          try {
            const bump = indexedDB.open(${JSON.stringify(dbName)}, version + 1)
            bump.onupgradeneeded = () => {
              const db = bump.result
              if (db.objectStoreNames.contains('reports')) {
                db.transaction('reports', 'readwrite').objectStore('reports').clear()
              } else {
                db.createObjectStore('reports', { keyPath: 'id' })
              }
            }
            bump.onsuccess = () => { clearTimeout(guard); bump.result.close(); finish('reset') }
            bump.onerror = () => { clearTimeout(guard); finish('reset-error') }
            bump.onblocked = () => { clearTimeout(guard); finish('reset-blocked') }
          } catch (err) { clearTimeout(guard); finish('bump-threw') }
        }
        probe.onerror = () => { clearTimeout(guard); finish('probe-error') }
        probe.onblocked = () => { clearTimeout(guard); finish('probe-blocked') }
      } catch (err) { clearTimeout(guard); finish('threw') }
    })`)

    await send('Page.reload')
    await sleep(1800)
  }

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
    // 清了 profile，避免残留影响下一次运行
    try {
      rmSync(profileDir, { recursive: true, force: true })
    } catch {
      /* 删不掉也不影响：下次用的是新目录 */
    }
  }

  return { send, ev, waitFor, goto, setValue, check, summary, close, consoleErrors, results, resetAppState }
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
