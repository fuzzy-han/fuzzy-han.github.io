/* ==========================================================================
   持久化层
   · 设置 / 模型配置 / 细则 → localStorage（体积小、同步读取、首屏不闪）
   · 批改报告 → IndexedDB（单份报告 JSON 可达数百 KB，localStorage 5MB 会爆）
   ========================================================================== */

const NAMESPACE = 'kaoyan-writing-coach'

export const LS_KEYS = {
  settings: `${NAMESPACE}:settings`,
  models: `${NAMESPACE}:models`,
  rubrics: `${NAMESPACE}:rubrics`,
  /** 批改台的输入草稿（按题型分别存） */
  drafts: `${NAMESPACE}:drafts`,
  /** 词汇广场的「已掌握」标记 */
  vocabMastered: `${NAMESPACE}:vocab-mastered`,
  /** 模板库的「已掌握」标记 */
  templateMastered: `${NAMESPACE}:template-mastered`,
} as const

/**
 * 导出/导入需要原样搬走的 localStorage 键。
 *
 * 这里必须列全：漏掉一个键，使用者换浏览器后就会少一类数据，
 * 而且不会报错 —— 只表现为「怎么少了一块」。新增键时同步加到这里。
 */
export const BACKED_UP_LS_KEYS = [
  LS_KEYS.drafts,
  LS_KEYS.vocabMastered,
  LS_KEYS.templateMastered,
] as const

/* -------------------------------------------------------------------------- */
/*  localStorage 读写（带容错：解析失败不炸应用）                                */
/* -------------------------------------------------------------------------- */

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn(`[storage] 读取 ${key} 失败，使用默认值`, err)
    return fallback
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn(`[storage] 写入 ${key} 失败`, err)
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch (err) {
    console.warn(`[storage] 删除 ${key} 失败`, err)
  }
}

/* -------------------------------------------------------------------------- */
/*  IndexedDB 极简封装                                                         */
/* -------------------------------------------------------------------------- */

const DB_NAME = `${NAMESPACE}-db`
const DB_VERSION = 4

export const STORES = {
  reports: 'reports',
  /** 从批改记录里提炼出的可复用模板 */
  templates: 'templates',
  /** 词汇库缓存（约 1.1 MB gzip，缓存后离线可用） */
  vocab: 'vocab',
} as const

let dbPromise: Promise<IDBDatabase | null> | null = null
let openConnection: IDBDatabase | null = null

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }

    const connect = (version?: number) => {
      let request: IDBOpenDBRequest
      try { request = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version) }
      catch { resolve(null); return }
      const timer = setTimeout(() => { dbPromise = null; resolve(null) }, 8000)
      request.onupgradeneeded = () => {
        const db = request.result
        for (const name of Object.values(STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' })
            if (name === STORES.reports) { store.createIndex('createdAt', 'createdAt'); store.createIndex('taskType', 'taskType') }
            if (name === STORES.templates) { store.createIndex('category', 'category'); store.createIndex('recurrence', 'recurrence') }
          }
        }
      }
      request.onsuccess = () => {
        clearTimeout(timer)
        const db = request.result
        if (Object.values(STORES).some(name => !db.objectStoreNames.contains(name))) {
          const nextVersion = db.version + 1
          db.close()
          connect(nextVersion)
          return
        }
        db.onversionchange = () => { db.close(); openConnection = null; dbPromise = null }
        openConnection = db
        resolve(db)
      }
      request.onerror = () => {
        clearTimeout(timer)
        if (request.error?.name === 'VersionError') connect()
        else { dbPromise = null; resolve(null) }
      }
    }
    connect(DB_VERSION)
  })

  return dbPromise
}

/**
 * 主动关闭 IndexedDB 连接。
 *
 * 为什么必须有这个：IDB 的 deleteDatabase 在存在活跃连接时**不会执行**，
 * 只会一直等连接关闭。浏览器里表现为「清空数据」永远卡在删除那一步，
 * 之后的写入也全部挂起——用户看到的就是批改完成后一直停在「正在校验评分」。
 * 所以清空数据前必须先把连接关掉。
 */
export function closeDB(): void {
  if (openConnection) {
    try {
      openConnection.close()
    } catch {
      /* 已经关了，忽略 */
    }
  }
  openConnection = null
  // 置空后下次访问会重新打开，避免拿到已关闭的连接
  dbPromise = null
}

/** 单次 IndexedDB 操作的超时。被 blocked 的事务不会报错，只会永远等下去。 */
const TX_TIMEOUT_MS = 8000

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDB().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null)
          return
        }

        let settled = false
        /*
         * 超时兜底：IDB 事务被其他连接 block 住时既不 success 也不 error，
         * 调用方会永久挂起（用户看到的是「批改完一直停在正在校验评分」）。
         * 与其静默卡死，不如超时后放行——报告写不进磁盘是可惜，但不能把整个流程拖死。
         */
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          console.warn(`[storage] IndexedDB 操作超时（${TX_TIMEOUT_MS}ms），可能有其他标签页占用连接`)
          resolve(null)
        }, TX_TIMEOUT_MS)

        const finish = (value: T | null) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(value)
        }

        try {
          const transaction = db.transaction(store, mode)
          const request = run(transaction.objectStore(store))
          request.onsuccess = () => finish(request.result)
          request.onerror = () => {
            console.warn('[storage] IndexedDB 操作失败', request.error)
            finish(null)
          }
          transaction.onabort = () => {
            console.warn('[storage] IndexedDB 事务被中止')
            finish(null)
          }
        } catch (err) {
          console.warn('[storage] IndexedDB 事务异常', err)
          finish(null)
        }
      }),
  )
}

/** Backup operations must fail explicitly and wait for transaction commit. */
export async function readUserData(): Promise<{ reports: unknown[]; templates: unknown[] }> {
  const db = await openDB()
  if (!db) throw new Error('无法读取本机数据库，请关闭占用的标签页后重试；未生成不完整备份')
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.reports, STORES.templates], 'readonly')
    const reports = transaction.objectStore(STORES.reports).getAll()
    const templates = transaction.objectStore(STORES.templates).getAll()
    const timer = setTimeout(() => transaction.abort(), TX_TIMEOUT_MS)
    transaction.oncomplete = () => { clearTimeout(timer); resolve({ reports: reports.result, templates: templates.result }) }
    transaction.onabort = transaction.onerror = () => { clearTimeout(timer); reject(new Error('读取历史数据失败，请检查浏览器存储权限')) }
  })
}

/** Commit reports/templates together; restore localStorage if the transaction fails. */
export async function replaceUserData(
  reports: unknown[], templates: unknown[], values: Record<string, unknown>,
): Promise<void> {
  const db = await openDB()
  if (!db) throw new Error('数据库不可用，未导入数据')
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, localStorage.getItem(key)]))
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    }
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([STORES.reports, STORES.templates], 'readwrite')
    const timer = setTimeout(() => transaction.abort(), TX_TIMEOUT_MS)
    transaction.oncomplete = () => { clearTimeout(timer); resolve() }
    transaction.onabort = transaction.onerror = () => {
      clearTimeout(timer)
      try { restore() } catch { /* Original error remains actionable. */ }
      reject(new Error('导入写入失败，已撤回本次修改；请检查存储空间和权限'))
    }
    try {
      for (const [store, rows] of [[STORES.reports, reports], [STORES.templates, templates]] as const) {
        const target = transaction.objectStore(store)
        target.clear()
        for (const row of rows) target.put(row)
      }
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value))
    } catch {
      transaction.abort()
    }
  })
}

export const idb = {
  get<T>(store: string, key: string): Promise<T | null> {
    return tx<T>(store, 'readonly', (os) => os.get(key) as IDBRequest<T>)
  },

  getAll<T>(store: string): Promise<T[]> {
    return tx<T[]>(store, 'readonly', (os) => os.getAll() as IDBRequest<T[]>).then(
      (rows) => rows ?? [],
    )
  },

  put(store: string, value: unknown): Promise<unknown> {
    return tx(store, 'readwrite', (os) => os.put(value))
  },

  delete(store: string, key: string): Promise<unknown> {
    return tx(store, 'readwrite', (os) => os.delete(key))
  },

  clear(store: string): Promise<unknown> {
    return tx(store, 'readwrite', (os) => os.clear())
  },
}

/* -------------------------------------------------------------------------- */
/*  工具                                                                       */
/* -------------------------------------------------------------------------- */

export function makeId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}_${rand}`
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
