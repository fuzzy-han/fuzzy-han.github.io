/* ==========================================================================
   全局：设置 + 模型配置 + 细则
   单一 localStorage key 持久化，便于整体导出 / 导入
   ========================================================================== */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  AppSettings,
  ModelConfig,
  ProviderId,
  Rubric,
  TaskType,
  Transport,
} from '@/types/domain'
import { LS_KEYS, makeId } from '@/lib/storage'
import { getProviderPreset, TASK_ORDER } from '@/lib/tasks'
import { buildRubricTemplate, getRubricSeed, RUBRIC_SEED_REVISION } from '@/lib/rubric'

export const DEFAULT_SETTINGS: AppSettings = {
  defaultModelId: null,
  transport: 'direct',
  proxyBaseUrl: 'http://127.0.0.1:8787',
  proxyToken: '',
  timeoutSec: 120,
  autoRetry: true,
  preferReliableJson: true,
  sentenceLevel: true,
  strictness: 'standard',
  locale: 'zh-CN',
}

/** 构造默认细则：有内置指令的题型直接填入，其余给空白骨架 */
function buildDefaultRubrics(): Record<TaskType, Rubric> {
  return buildRubrics({}, []).rubrics
}

/**
 * 合并「存储里的细则」与「默认细则」，并把「存储里根本不存在」的题型记下来。
 *
 * 这个「不存在」的信息必须显式带出来：一旦 merge 用默认值把键填上，
 * 之后就再也分不清「用户从来没有」和「默认值刚补的」，
 * 补种逻辑会因为 state.rubrics[type] 已存在而被当成死代码。
 */
function buildRubrics(
  stored: Partial<Record<TaskType, Rubric>>,
  /** 需要按缺失补种的题型；不传则默认「默认值算缺失」 */
  seedTargets?: TaskType[],
): { rubrics: Record<TaskType, Rubric>; absent: TaskType[] } {
  const now = Date.now()
  const rubrics = {} as Record<TaskType, Rubric>
  const absent: TaskType[] = []

  for (const type of TASK_ORDER) {
    const existing = stored[type]
    if (existing) {
      rubrics[type] = existing
      continue
    }
    const seed = getRubricSeed(type)
    rubrics[type] = {
      taskType: type,
      content: seed?.content ?? buildRubricTemplate(type),
      updatedAt: now,
      versions: seed ? [{ id: `${type}_builtin`, note: seed.note, content: '', savedAt: now }] : [],
      // 内置指令算已填写；空白骨架不算，等用户自己填
      filled: seed !== undefined,
      ...(seed ? { seedRevision: RUBRIC_SEED_REVISION } : {}),
    }
    if (seedTargets ? seedTargets.includes(type) : seed !== undefined) {
      absent.push(type)
    }
  }

  return { rubrics, absent }
}

interface ConfigState {
  settings: AppSettings
  models: ModelConfig[]
  rubrics: Record<TaskType, Rubric>

  /* —— 模型 —— */
  addModel: (provider: ProviderId) => string
  updateModel: (id: string, patch: Partial<ModelConfig>) => void
  removeModel: (id: string) => void
  duplicateModel: (id: string) => string | null
  setDefaultModel: (id: string | null) => void

  /* —— 设置 —— */
  updateSettings: (patch: Partial<AppSettings>) => void
  setTransport: (transport: Transport) => void
  resetSettings: () => void

  /* —— 细则 —— */
  saveRubric: (taskType: TaskType, content: string, note: string) => void
  resetRubricToTemplate: (taskType: TaskType) => void
  restoreRubricVersion: (taskType: TaskType, versionId: string) => void
  deleteRubricVersion: (taskType: TaskType, versionId: string) => void
}

/**
 * 水合时发现的「存储里没有内置指令」的题型。由上面的 merge 填写，
 * 水合完成后由 scheduleSeedBuiltins 消费。
 */
const pendingSeed: TaskType[] = []

/** 新版模型配置：按服务商预设填好默认值 */
function createModel(provider: ProviderId, index: number): ModelConfig {
  const preset = getProviderPreset(provider)
  return {
    id: makeId('model'),
    label: `${preset?.name ?? provider} ${index + 1}`,
    provider,
    baseUrl: preset?.baseUrl ?? '',
    apiKey: '',
    model: preset?.models[0] ?? '',
    temperature: 0.3,
    maxTokens: 4096,
    vision: preset?.supportsVision ?? false,
    createdAt: Date.now(),
  }
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      models: [],
      rubrics: buildDefaultRubrics(),

      addModel: (provider) => {
        const sameCount = get().models.filter((m) => m.provider === provider).length
        const model = createModel(provider, sameCount)
        set((state) => ({
          models: [...state.models, model],
          // 第一个配置自动设为默认，省去用户一次点击
          settings:
            state.settings.defaultModelId === null
              ? { ...state.settings, defaultModelId: model.id }
              : state.settings,
        }))
        return model.id
      },

      updateModel: (id, patch) =>
        set((state) => ({
          models: state.models.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),

      removeModel: (id) =>
        set((state) => {
          const models = state.models.filter((m) => m.id !== id)
          return {
            models,
            settings:
              state.settings.defaultModelId === id
                ? { ...state.settings, defaultModelId: models[0]?.id ?? null }
                : state.settings,
          }
        }),

      duplicateModel: (id) => {
        const source = get().models.find((m) => m.id === id)
        if (!source) return null
        const copy: ModelConfig = {
          ...source,
          id: makeId('model'),
          label: `${source.label} 副本`,
          createdAt: Date.now(),
        }
        set((state) => ({ models: [...state.models, copy] }))
        return copy.id
      },

      setDefaultModel: (id) =>
        set((state) => ({ settings: { ...state.settings, defaultModelId: id } })),

      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } })),

      setTransport: (transport) =>
        set((state) => ({ settings: { ...state.settings, transport } })),

      resetSettings: () =>
        set((state) => ({
          settings: { ...DEFAULT_SETTINGS, defaultModelId: state.models[0]?.id ?? null },
        })),

      saveRubric: (taskType, content, note) =>
        set((state) => {
          const prev = state.rubrics[taskType]
          // 内容没变就不留版本，避免刷出一堆空版本
          const changed = prev.content.trim() !== content.trim()
          const versions = changed
            ? [
                {
                  id: makeId('ver'),
                  note: note.trim() || '未命名保存',
                  content: prev.content,
                  savedAt: prev.updatedAt,
                },
                ...prev.versions,
              ].slice(0, 20)
            : prev.versions

          return {
            rubrics: {
              ...state.rubrics,
              [taskType]: {
                ...prev,
                taskType,
                content,
                updatedAt: Date.now(),
                versions,
                // 保存即以用户内容为准：清空后保存就是清空，状态随之变为未填写
                filled: content.trim().length > 0,
              },
            },
          }
        }),

      resetRubricToTemplate: (taskType) =>
        set((state) => {
          const prev = state.rubrics[taskType]
          return {
            rubrics: {
              ...state.rubrics,
              [taskType]: {
                taskType,
                content: buildRubricTemplate(taskType),
                updatedAt: Date.now(),
                // 重置成空白骨架即为未填写
                filled: false,
                versions: [
                  {
                    id: makeId('ver'),
                    note: '重置前的版本',
                    content: prev.content,
                    savedAt: prev.updatedAt,
                  },
                  ...prev.versions,
                ].slice(0, 20),
              },
            },
          }
        }),

      restoreRubricVersion: (taskType, versionId) =>
        set((state) => {
          const prev = state.rubrics[taskType]
          const version = prev.versions.find((v) => v.id === versionId)
          if (!version) return state
          return {
            rubrics: {
              ...state.rubrics,
              [taskType]: {
                ...prev,
                taskType,
                content: version.content,
                updatedAt: Date.now(),
                filled: version.content.trim().length > 0,
                versions: [
                  {
                    id: makeId('ver'),
                    note: '回滚前自动备份',
                    content: prev.content,
                    savedAt: prev.updatedAt,
                  },
                  ...prev.versions,
                ].slice(0, 20),
              },
            },
          }
        }),

      deleteRubricVersion: (taskType, versionId) =>
        set((state) => ({
          rubrics: {
            ...state.rubrics,
            [taskType]: {
              ...state.rubrics[taskType],
              versions: state.rubrics[taskType].versions.filter((v) => v.id !== versionId),
            },
          },
        })),
    }),
    {
      name: LS_KEYS.settings,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // 只持久化数据，不持久化方法
      partialize: (state) => ({
        settings: state.settings,
        models: state.models,
        rubrics: state.rubrics,
      }),
      // 老版本数据缺字段时补齐，避免升级后白屏。
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ConfigState>
        const stored: Partial<Record<TaskType, Rubric>> = p.rubrics ?? {}

        // 先把「存储里根本不存在」的题型记进 pendingSeed，
        // 再让 buildRubrics 用默认值把键填上——顺序不能反，
        // 否则填上之后就再也分不清「从未有过」和「默认值刚补的」。
        pendingSeed.length = 0
        for (const type of TASK_ORDER) {
          if (!stored[type] && getRubricSeed(type)) pendingSeed.push(type)
        }

        return {
          ...current,
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
          models: Array.isArray(p.models) ? p.models : [],
          rubrics: buildRubrics(stored).rubrics,
        }
      },
    },
  ),
)

/* -------------------------------------------------------------------------- */
/*  内置指令补种                                                               */
/* -------------------------------------------------------------------------- */

/**
 * 把内置批改指令补进 store，并且**立刻落盘**。
 *
 * 为什么不用 persist 的 onRehydrateStorage：
 * 在本项目的配置下该回调不会触发（实测确认：store 模块已加载、界面也已渲染出
 * 内置指令，说明 merge 生效，唯独回调没跑）。依赖它会让补种变成死代码。
 * 改用实例上的 onFinishHydration + 主动检查，行为可预测。
 *
 * 为什么不能只靠 persist 的 merge：
 * merge 只影响水合那一刻的内存状态，persist 不会因为 merge 的返回值就写磁盘。
 * 结果是「老用户存储里缺这一项 → merge 用默认值补上 → 界面看起来完全正常，
 * 但磁盘里始终没有这一项」：表面没坏，实际是迁移从未落盘，
 * 以后更新 seed 内容用户永远拿不到新版本。
 *
 * 只补种 merge 阶段登记的题型（pendingSeed）：用户改过的、以及用户清空后
 * 保存过的（content 为空但键存在），都不在名单里，不会被覆盖。
 */
function seedBuiltins(): void {
  if (pendingSeed.length === 0) return

  const patch: Partial<Record<TaskType, Rubric>> = {}
  const now = Date.now()

  for (const type of pendingSeed) {
    const seed = getRubricSeed(type)
    if (!seed) continue
    patch[type] = {
      taskType: type,
      content: seed.content,
      updatedAt: now,
      versions: [{ id: `${type}_builtin`, note: seed.note, content: '', savedAt: now }],
      filled: true,
      seedRevision: RUBRIC_SEED_REVISION,
    }
  }

  pendingSeed.length = 0

  if (Object.keys(patch).length > 0) {
    // setState 会触发 persist 落盘，这正是「只补内存不落盘」问题的解药
    useConfigStore.setState((s) => ({ rubrics: { ...s.rubrics, ...patch } }))
  }
}

/**
 * 等持久化水合完成后再补种，避免与 merge 抢时序。
 * 加超时兜底：万一 hasHydrated 永远不翻，也不能把补种卡死。
 */
function scheduleSeedBuiltins(): void {
  const persistApi = useConfigStore.persist

  if (!persistApi || persistApi.hasHydrated()) {
    seedBuiltins()
    return
  }

  let done = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribe: (() => void) | undefined

  const run = () => {
    if (done) return
    done = true
    unsubscribe?.()
    if (timer) clearTimeout(timer)
    seedBuiltins()
  }

  unsubscribe = persistApi.onFinishHydration(run)
  timer = setTimeout(run, 1500)
}

scheduleSeedBuiltins()

/* -------------------------------------------------------------------------- */
/*  派生选择器                                                                 */
/* -------------------------------------------------------------------------- */

export function useDefaultModel(): ModelConfig | null {
  return useConfigStore((s) => {
    if (s.models.length === 0) return null
    return s.models.find((m) => m.id === s.settings.defaultModelId) ?? s.models[0]
  })
}

/** 判断某条配置是否「可发起调用」 */
export function modelStatus(model: ModelConfig): {
  ok: boolean
  level: 'ok' | 'warn' | 'danger'
  message: string
} {
  if (!model.baseUrl.trim()) {
    return { ok: false, level: 'danger', message: '缺少 Base URL' }
  }
  if (!model.apiKey.trim()) {
    return { ok: false, level: 'warn', message: '未填写 API Key' }
  }
  if (!model.model.trim()) {
    return { ok: false, level: 'danger', message: '缺少模型名称' }
  }
  return { ok: true, level: 'ok', message: '已就绪' }
}
