import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { openCdp, injectMockModelScript } from './lib/cdp.mjs'
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') { res.end();return }
  for await (const chunk of req) { void chunk }
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ choices: [{ message: { content: 'Production coach feedback: use shows with a singular subject.' } }] }))
})
await new Promise(resolve => server.listen(9892, '127.0.0.1', resolve))
const c = await openCdp({ port: 9585, width: 390, height: 844, mobile: true })
try {
  await c.goto('workbench', 500)
  await c.ev(injectMockModelScript({ baseUrl: 'http://127.0.0.1:9892/v1' }))
  await c.send('Page.reload'); await c.waitFor(`!!document.querySelector('.task-card')`)
  const source = readFileSync(new URL('./verify-learning.mjs', import.meta.url), 'utf8')
  const expression = source.match(/const seeded = await c.ev\(`([\s\S]*?)`\)/)[1].replace("const { putUserRecord } = await import('/src/lib/storage.ts')", `const putUserRecord = async (store, value) => {
    const db = await new Promise((resolve, reject) => { const r=indexedDB.open('kaoyan-writing-coach-db',4); r.onupgradeneeded=()=>{for(const n of ['reports','templates','vocab']) if(!r.result.objectStoreNames.contains(n))r.result.createObjectStore(n,{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error) })
    await new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).put(value);t.oncomplete=resolve;t.onabort=()=>reject(t.error)});db.close()
  }`)
  c.check('Production fixture stored', await c.ev(expression) === true)
  await c.goto('report?id=learning_seed', 500)
  c.check('Production report has learning entry', await c.waitFor(`!!document.querySelector('[aria-label="持续学习"]')`))
  await c.setValue('[aria-label="追问内容"]', 'Please explain this sentence.')
  await c.ev(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='发送追问').click()`)
  c.check('Production bundle sends contextual question', await c.waitFor(`document.body.innerText.includes('Production coach feedback')`))
  await c.send('Page.reload')
  c.check('Production conversation survives reload', await c.waitFor(`document.body.innerText.includes('Production coach feedback')`))
  c.check('Production mobile layout fits screen', await c.ev(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`))
  c.check('Production has no uncaught errors', c.consoleErrors.length === 0, c.consoleErrors.join(' | '))
  process.exitCode=c.summary()?1:0
} finally {await c.close(); await new Promise(resolve=>server.close(resolve))}
