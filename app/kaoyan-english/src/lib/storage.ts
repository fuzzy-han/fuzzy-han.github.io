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
} as const

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
const DB_VERSION = 2

export const STORES = {
  reports: 'reports',
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

    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (err) {
      console.warn('[storage] IndexedDB 不可用，报告将不会持久化', err)
      resolve(null)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORES.reports)) {
        const store = db.createObjectStore(STORES.reports, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
        store.createIndex('taskType', 'taskType')
      }
    }

    request.onsuccess = () => {
      const db = request.result

      /*
       * 自愈：库存在但对象仓库缺失时，onupgradeneeded 不会再触发，
       * 于是所有事务都会因「找不到对象仓库」而失败——而且 IDB 在这种情况下
       * 既不报错也不回调，调用方会永久挂起（用户看到批改卡在「正在校验评分」）。
       *
       * 这种半损坏状态可能来自：其他工具/标签页建过同名库、升级中途失败、
       * 浏览器回收数据不完整。这里主动升一个版本号把仓库补回来。
       * 注意必须先把本连接关掉，否则 upgrade 会被自己阻塞。
       */
      if (!db.objectStoreNames.contains(STORES.reports)) {
        console.warn('[storage] 检测到数据库缺少对象仓库，正在修复（升版本重建）')
        const targetVersion = db.version + 1
        db.close()
        openConnection = null
        dbPromise = null
        try {
          indexedDB.open(DB_NAME, targetVersion).onsuccess = () => {
            // 修复连接建好即关，让下一次访问重新走正常流程拿到带仓库的库
            dbPromise = null
            openConnection = null
          }
        } catch (err) {
          console.warn('[storage] 自动修复失败，批改记录将不会持久化', err)
        }
        resolve(null)
        return
      }

      openConnection = db
      resolve(openConnection)
    }
    request.onerror = () => {
      console.warn('[storage] 打开 IndexedDB 失败', request.error)
      resolve(null)
    }
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
