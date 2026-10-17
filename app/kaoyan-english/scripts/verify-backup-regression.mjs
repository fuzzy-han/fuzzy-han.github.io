import { openCdp } from './lib/cdp.mjs'
const c = await openCdp({ port: 9572 })
try {
  await c.goto('settings', 500)
  const result = await c.ev(`(async () => {
    const { collectBackup, applyBackup } = await import('/src/lib/backupIO.ts')
    const { normalizeBackup, emptyBackup } = await import('/src/lib/backup.ts')
    const { useConfigStore } = await import('/src/app/store.ts')
    const { closeDB, readUserData } = await import('/src/lib/storage.ts')
    const checks = []
    const check = (name, ok) => checks.push({ name, ok: Boolean(ok) })
    const model = { id: 'existing', label: 'Original', model: 'test', baseUrl: 'https://example.com', apiKey: 'private-key', provider: 'custom' }
    useConfigStore.setState({ models: [model], settings: { ...useConfigStore.getState().settings, proxyToken: 'private-token', defaultModelId: model.id } })
    const row = { id: 'r1', createdAt: 1, taskType: 'eng1_big', input: { prompt: 'Original question', essay: 'Original essay' }, report: { total: 10, sentences: [] }, diagnostics: [], meta: {} }
    const payload = { ...emptyBackup(), reports: [row], drafts: { eng1_big: { essay: 'Draft', essayImages: [{ url: 'data:image/png;base64,AAAA', name: 'image.png' }] } }, mastery: { words: { apple: true }, templates: {} } }
    await applyBackup(payload)
    const exported = await collectBackup()
    check('All history and images exported', exported.reports.length === 1 && exported.drafts.eng1_big.essayImages[0].url.includes('base64'))
    check('All credentials excluded by default', exported.models[0].apiKey === '' && exported.settings.proxyToken === '')
    const secret = await collectBackup({ includeSecrets: true })
    check('Opt-in credentials included', secret.models[0].apiKey === 'private-key' && secret.settings.proxyToken === 'private-token')
    exported.reports[0].report.total = 19
    await applyBackup(exported)
    check('Same-id reports updated and durable', (await collectBackup()).reports[0].report.total === 19)
    check('Redacted import preserves local credentials', useConfigStore.getState().models[0].apiKey === 'private-key' && useConfigStore.getState().settings.proxyToken === 'private-token')
    const legacy = normalizeBackup({ kind: payload.kind, version: 1, settings: { timeoutSec: 90 }, models: [], rubrics: {} })
    await applyBackup(legacy.payload, 'replace')
    check('Legacy replace preserves history and drafts', (await collectBackup()).reports.length === 1 && (await collectBackup()).drafts.eng1_big.essay === 'Draft')
    const before = JSON.stringify(await readUserData())
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) { if (key.endsWith(':drafts')) throw new DOMException('quota', 'QuotaExceededError'); return original.call(this, key, value) }
    let rejected = false
    try { await applyBackup(emptyBackup(), 'replace') } catch { rejected = true }
    Storage.prototype.setItem = original
    check('Quota failure is reported', rejected)
    check('Quota failure rolls back IndexedDB', JSON.stringify(await readUserData()) === before)
    check('Quota failure retains local draft', JSON.parse(localStorage.getItem('kaoyan-writing-coach:drafts')).eng1_big.essay === 'Draft')
    await applyBackup(emptyBackup(), 'replace')
    check('Full replace removes old user data', (await collectBackup()).reports.length === 0 && Object.keys((await collectBackup()).drafts).length === 0)
    localStorage.setItem('other-app', 'keep')
    await applyBackup(emptyBackup(), 'replace')
    check('Unrelated localStorage survives', localStorage.getItem('other-app') === 'keep')
    localStorage.setItem('kaoyan-writing-coach:drafts', '{broken')
    let badRead = false
    try { await collectBackup() } catch { badRead = true }
    check('Corrupt local data prevents incomplete export', badRead)
    localStorage.removeItem('kaoyan-writing-coach:drafts')
    closeDB()
    const dbFactory = window.indexedDB
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined })
    let unavailable = false
    try { await collectBackup() } catch { unavailable = true }
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: dbFactory })
    closeDB()
    check('Unavailable database cannot masquerade as empty history', unavailable)
    closeDB()
    // Simulate an older database with only reports; app must add stores without deleting history.
    await new Promise((resolve, reject) => { const r = indexedDB.deleteDatabase('kaoyan-writing-coach-db'); r.onsuccess = resolve; r.onerror = reject })
    await new Promise((resolve, reject) => { const r = indexedDB.open('kaoyan-writing-coach-db', 1); r.onupgradeneeded = () => r.result.createObjectStore('reports', { keyPath: 'id' }); r.onsuccess = () => { const d = r.result; const t = d.transaction('reports', 'readwrite'); t.objectStore('reports').put(row); t.oncomplete = () => { d.close(); resolve() } }; r.onerror = reject })
    check('Old database upgraded without losing reports', (await collectBackup()).reports[0].id === 'r1')
    closeDB()
    await new Promise((resolve, reject) => { const r = indexedDB.open('kaoyan-writing-coach-db', 6); r.onupgradeneeded = () => r.result.deleteObjectStore('templates'); r.onsuccess = () => { r.result.close(); resolve() }; r.onerror = reject })
    check('Higher-version database readable without reset', (await collectBackup()).reports[0].id === 'r1')
    return checks
  })()`)
  if (!Array.isArray(result)) throw new Error(JSON.stringify(result))
  for (const row of result) c.check(row.name, row.ok)
  process.exitCode = c.summary() ? 1 : 0
} finally { await c.close() }
