import { useEffect, useState } from 'react'
import { useToastStore } from '@/app/ui'
import { IconAlert, IconCheck } from './Icon'

export function ToastHost() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)

  if (items.length === 0) return null

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`toast${item.tone === 'danger' ? ' toast--danger' : item.tone === 'ok' ? ' toast--ok' : ''}`}
          onClick={() => dismiss(item.id)}
          title="点击关闭"
        >
          {item.tone === 'ok' ? <IconCheck size={14} /> : item.tone === 'danger' ? <IconAlert size={14} /> : null}
          <span>{item.message}</span>
        </button>
      ))}
    </div>
  )
}

/* ==========================================================================
   复制到剪贴板 — 带降级路径（非安全上下文下 navigator.clipboard 不可用）
   ========================================================================== */

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 继续走降级 */
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/** 复制按钮：点击后短暂显示「已复制」 */
export function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => setDone(false), 1800)
    return () => clearTimeout(timer)
  }, [done])

  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      onClick={async () => {
        const ok = await copyText(text)
        setDone(ok)
        if (!ok) useToastStore.getState().push('复制失败，请手动选择文本', 'danger')
      }}
    >
      {done ? <IconCheck size={13} /> : null}
      {done ? '已复制' : label}
    </button>
  )
}
