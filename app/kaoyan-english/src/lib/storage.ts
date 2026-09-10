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
const DB_VERSION = 1

export const STORES = {
  reports: 'reports',
} as const

let dbPromise: Promise<IDBDatabase | null> | null = null

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

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      console.warn('[storage] 打开 IndexedDB 失败', request.error)
      resolve(null)
    }
  })

  return dbPromise
}

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
        try {
          const transaction = db.transaction(store, mode)
          const request = run(transaction.objectStore(store))
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => {
            console.warn('[storage] IndexedDB 操作失败', request.error)
            resolve(null)
          }
        } catch (err) {
          console.warn('[storage] IndexedDB 事务异常', err)
          resolve(null)
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
