import { create } from 'zustand'
import { makeId } from '@/lib/storage'

/* ==========================================================================
   轻量 Toast — 用于「已保存」「连接失败」这类反馈
   ========================================================================== */

export type ToastTone = 'default' | 'ok' | 'danger'

export interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

interface ToastState {
  items: ToastItem[]
  push: (message: string, tone?: ToastTone) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>()((set) => ({
  items: [],
  push: (message, tone = 'default') => {
    const id = makeId('toast')
    set((state) => ({ items: [...state.items, { id, message, tone }] }))
    setTimeout(() => {
      set((state) => ({ items: state.items.filter((t) => t.id !== id) }))
    }, 3600)
  },
  dismiss: (id) => set((state) => ({ items: state.items.filter((t) => t.id !== id) })),
}))

/** 非组件环境下的快捷调用 */
export const toast = {
  ok: (message: string) => useToastStore.getState().push(message, 'ok'),
  info: (message: string) => useToastStore.getState().push(message, 'default'),
  error: (message: string) => useToastStore.getState().push(message, 'danger'),
}
