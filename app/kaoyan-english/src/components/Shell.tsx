import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { RouteName } from '@/app/router'
import { navigate } from '@/app/router'
import { useConfigStore } from '@/app/store'
import { TASK_ORDER, TASK_SPECS } from '@/lib/tasks'
import { isRubricFilled } from '@/lib/rubric'
import { modelStatus } from '@/app/store'
import {
  IconBook,
  IconHistory,
  IconModel,
  IconRubric,
  IconSettings,
  IconWorkbench,
} from '@/components/Icon'

/* ==========================================================================
   应用外壳 — 一个侧边导航轨 + 一个吸顶工具栏
   左侧 rail 使用暖色表面（--ds-surface），主区使用纸面（--ds-page），
   形成 Anthropic 式的两层表面关系。
   ========================================================================== */

interface NavEntry {
  name: RouteName
  label: string
  icon: ReactNode
  badge?: string
}

export function Shell({
  route,
  title,
  crumbs,
  actions,
  children,
}: {
  route: RouteName
  title: string
  crumbs?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const [navOpen, setNavOpen] = useState(false)

  /*
   * 报告页没有独立的导航入口，但侧栏仍应指出「你在哪」。
   * 把报告页归到批改台这一支，避免出现六项全灰、无从定位的情况。
   */
  const activeNav: RouteName = route === 'report' ? 'workbench' : route

  const closeNav = useCallback(() => setNavOpen(false), [])

  // 窄屏抽屉：Esc 关闭 + 锁住背景滚动，避免在手机上滑到导航底下
  useEffect(() => {
    if (!navOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNav()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [navOpen, closeNav])

  return (
    <div className="shell">
      {/* 抽屉打开时的遮罩：点一下就关，符合手机端习惯 */}
      <div
        className="nav-scrim"
        data-open={navOpen}
        onClick={closeNav}
        aria-hidden="true"
      />

      <aside id="app-sidebar" className="sidebar" data-open={navOpen} aria-label="侧边导航">
        <div className="sidebar__brand">
          <span className="brand-mark" aria-hidden="true">
            砚
          </span>
          <span className="brand-text">
            <span className="brand-name">砚台</span>
            <span className="brand-sub" style={{ display: 'block' }}>
              考研英语批改
            </span>
          </span>
          <button
            type="button"
            className="nav-close"
            onClick={closeNav}
            aria-label="收起导航"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <nav className="nav" aria-label="主导航">
          <p className="nav__section">批改</p>
          <NavList
            entries={[
              { name: 'workbench', label: '批改台', icon: <IconWorkbench /> },
              { name: 'history', label: '批改记录', icon: <IconHistory /> },
            ]}
            current={activeNav}
            onNavigate={(n) => {
              closeNav()
              navigate(n)
            }}
          />

          <p className="nav__section">配置</p>
          <NavList
            entries={[
              { name: 'rubrics', label: '评分细则', icon: <IconRubric /> },
              { name: 'models', label: '模型配置', icon: <IconModel /> },
              { name: 'settings', label: '通用设置', icon: <IconSettings /> },
            ]}
            current={activeNav}
            onNavigate={(n) => {
              closeNav()
              navigate(n)
            }}
          />

          <p className="nav__section">资料</p>
          <NavList
            entries={[{ name: 'templates', label: '模板库', icon: <IconBook /> }]}
            current={activeNav}
            onNavigate={(n) => {
              closeNav()
              navigate(n)
            }}
          />
        </nav>

        <div className="sidebar__foot">
          <StatusLine />
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar__left">
            <button
              type="button"
              className="nav-toggle"
              onClick={() => setNavOpen((v) => !v)}
              aria-label="打开导航"
              aria-expanded={navOpen}
              aria-controls="app-sidebar"
            >
              <span className="nav-toggle__bars" aria-hidden="true" />
            </button>
            <div className="topbar__titles">
              <h1 className="topbar__title">{title}</h1>
              {crumbs ? <div className="topbar__crumbs">{crumbs}</div> : null}
            </div>
          </div>
          {actions ? <div className="topbar__actions">{actions}</div> : null}
        </header>

        <div className="content">
          <div className="content__inner">{children}</div>
        </div>
      </main>
    </div>
  )
}

function NavList({
  entries,
  current,
  onNavigate,
  disabled,
}: {
  entries: NavEntry[]
  current: RouteName
  onNavigate: (name: RouteName) => void
  disabled?: boolean
}) {
  return (
    <ul>
      {entries.map((entry) => (
        <li key={`${entry.name}-${entry.label}`}>
          <button
            type="button"
            className="nav__item"
            aria-current={!disabled && current === entry.name ? 'page' : undefined}
            onClick={() => onNavigate(entry.name)}
            disabled={disabled}
            style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            <span className="nav__icon">{entry.icon}</span>
            <span className="nav__label">{entry.label}</span>
            {entry.badge ? <span className="nav__badge">{entry.badge}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** 侧栏底部状态：一眼看出「能不能开批」 */
function StatusLine() {
  const models = useConfigStore((s) => s.models)
  const rubrics = useConfigStore((s) => s.rubrics)

  const readyModels = models.filter((m) => modelStatus(m).ok).length
  const filledRubrics = TASK_ORDER.filter((t) => isRubricFilled(rubrics[t])).length

  const modelTone: 'ok' | 'warn' = readyModels > 0 ? 'ok' : 'warn'
  const rubricTone: 'ok' | 'warn' = filledRubrics === TASK_ORDER.length ? 'ok' : 'warn'

  return (
    <div className="stack stack--2">
      <div className="status-line">
        <span className={`dot dot--${modelTone}`} />
        <span>
          {readyModels > 0 ? `${readyModels} 个模型可用` : '尚未配置模型'}
        </span>
      </div>
      <div className="status-line">
        <span className={`dot dot--${rubricTone}`} />
        <span>
          细则已填 {filledRubrics}/{TASK_ORDER.length}
          {filledRubrics === 0 ? `（${TASK_SPECS.eng1_big.shortName} 起）` : ''}
        </span>
      </div>
    </div>
  )
}
