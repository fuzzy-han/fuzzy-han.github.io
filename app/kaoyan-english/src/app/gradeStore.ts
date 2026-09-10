/* ==========================================================================
   批改台状态：输入草稿 + 进行中的批改任务

   刻意不用 persist 中间件持久化草稿：
   学生中途切页回来看到旧输入是好的，但把「正在批改」这类瞬态状态
   一起存下来会导致刷新后卡在假进度上。因此只把输入草稿存 localStorage，
   任务状态纯粹留在内存。
   ========================================================================== */

import { create } from 'zustand'
import { LS_KEYS, readJSON, writeJSON } from '@/lib/storage'
import { TASK_ORDER } from '@/lib/tasks'
import type { GradeInput } from '@/lib/grade'
import type { TaskType } from '@/types/domain'
import type { ReportDiagnostic } from '@/lib/report'
import type { GradingReport } from '@/types/report'
import type { StoredReport } from '@/lib/reports'
import type { InputImage } from '@/types/report'

/* -------------------------------------------------------------------------- */
/*  输入草稿                                                                   */
/* -------------------------------------------------------------------------- */

export interface TaskDraft {
  year: string
  prompt: string
  essay: string
  extras: string
  reference: string
  /** 已上传的题目图片（压缩后，含转录结果） */
  promptImages: InputImage[]
  /** 已上传的作文图片（压缩后，含转录结果） */
  essayImages: InputImage[]
  /** 图片转录说明，老师/模型对识别结果的不确定处 */
  transcriptionNote: string
}

function emptyDraft(): TaskDraft {
  return {
    year: '',
    prompt: '',
    essay: '',
    extras: '',
    reference: '',
    promptImages: [],
    essayImages: [],
    transcriptionNote: '',
  }
}

type DraftMap = Record<TaskType, TaskDraft>

function loadDrafts(): DraftMap {
  const stored = readJSON<Partial<DraftMap>>(LS_KEYS.drafts, {})
  const out = {} as DraftMap
  for (const type of TASK_ORDER) {
    out[type] = { ...emptyDraft(), ...(stored[type] ?? {}) }
  }
  return out
}

/* -------------------------------------------------------------------------- */
/*  批改任务状态                                                               */
/* -------------------------------------------------------------------------- */

export type JobPhase = 'idle' | 'running' | 'done' | 'error'

export interface JobState {
  phase: JobPhase
  /** 面向用户的阶段说明 */
  stage: string
  /** 流式累积的原始输出，用于进度区展示 */
  streamed: string
  error: { message: string; detail?: string } | null
  result: {
    report: GradingReport
    diagnostics: ReportDiagnostic[]
    meta: StoredReport['meta']
  } | null
  /** 本次任务的输入快照，供报告页展示与二次批改 */
  inputSnapshot: GradeInput | null
}

const idleJob: JobState = {
  phase: 'idle',
  stage: '',
  streamed: '',
  error: null,
  result: null,
  inputSnapshot: null,
}

interface GradeStoreState {
  activeTask: TaskType
  drafts: DraftMap
  job: JobState

  setActiveTask: (type: TaskType) => void
  updateDraft: (type: TaskType, patch: Partial<TaskDraft>) => void
  resetDraft: (type: TaskType) => void

  startJob: (input: GradeInput) => void
  appendStream: (text: string) => void
  setStage: (stage: string) => void
  finishJob: (result: JobState['result']) => void
  failJob: (message: string, detail?: string) => void
  clearJob: () => void
}

export const useGradeStore = create<GradeStoreState>()((set, get) => ({
  activeTask: 'eng1_big',
  drafts: loadDrafts(),
  job: idleJob,

  setActiveTask: (type) => set({ activeTask: type }),

  updateDraft: (type, patch) => {
    const drafts = { ...get().drafts, [type]: { ...get().drafts[type], ...patch } }
    set({ drafts })
    writeJSON(LS_KEYS.drafts, drafts)
  },

  resetDraft: (type) => {
    const drafts = { ...get().drafts, [type]: emptyDraft() }
    set({ drafts })
    writeJSON(LS_KEYS.drafts, drafts)
  },

  startJob: (input) =>
    set({
      job: {
        phase: 'running',
        stage: '正在准备…',
        streamed: '',
        error: null,
        result: null,
        inputSnapshot: input,
      },
    }),

  appendStream: (text) =>
    set((state) =>
      state.job.phase === 'running'
        ? { job: { ...state.job, streamed: state.job.streamed + text } }
        : state,
    ),

  setStage: (stage) =>
    set((state) => (state.job.phase === 'running' ? { job: { ...state.job, stage } } : state)),

  finishJob: (result) =>
    set((state) => ({
      job: { ...state.job, phase: 'done', result, stage: '已完成', error: null },
    })),

  failJob: (message, detail) =>
    set((state) => ({
      job: {
        ...state.job,
        phase: 'error',
        error: { message, detail },
        stage: '批改失败',
      },
    })),

  clearJob: () => set({ job: idleJob }),
}))
