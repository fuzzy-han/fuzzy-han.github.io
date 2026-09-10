import { useEffect, useMemo, useRef, useState } from 'react'
import { Shell } from '@/components/Shell'
import { Markdown } from '@/components/Markdown'
import { CopyButton } from '@/components/Toast'
import {
  IconAlert,
  IconCheck,
  IconCaret,
  IconEdit,
  IconEye,
  IconHistory,
  IconInfo,
  IconPlus,
  IconRubric,
  IconSave,
  IconSpark,
  IconTrash,
} from '@/components/Icon'
import { useConfigStore } from '@/app/store'
import { toast } from '@/app/ui'
import { TASK_ORDER, TASK_SPECS } from '@/lib/tasks'
import { buildRubricTemplate, hasPlaceholder, isRubricFilled, reviewRubric } from '@/lib/rubric'
import { formatTime } from '@/lib/storage'
import type { TaskType } from '@/types/domain'

/* ==========================================================================
   评分细则（Instruction）管理
   这里是平台的白盒核心：官方细则由用户自己填写、保存、版本化，
   批改时整段作为 prompt 主体上传。平台不预填任何评分内容。
   ========================================================================== */

export function RubricsPage() {
  const rubrics = useConfigStore((s) => s.rubrics)
  const saveRubric = useConfigStore((s) => s.saveRubric)
  const resetRubricToTemplate = useConfigStore((s) => s.resetRubricToTemplate)
  const restoreRubricVersion = useConfigStore((s) => s.restoreRubricVersion)
  const deleteRubricVersion = useConfigStore((s) => s.deleteRubricVersion)

  const [activeTask, setActiveTask] = useState<TaskType>('eng1_big')
  const [draft, setDraft] = useState(rubrics[activeTask].content)
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')

  const saved = rubrics[activeTask].content
  const dirty = draft.trim() !== saved.trim()
  const spec = TASK_SPECS[activeTask]

  // 切换题型 / 外部（如回滚）改动已保存内容时，把草稿同步过来
  useEffect(() => {
    setDraft(rubrics[activeTask].content)
    setNote('')
  }, [activeTask, rubrics])

  const report = useMemo(() => reviewRubric(draft, activeTask), [draft, activeTask])
  const checks = report.checks
  const warnCount = report.warnCount

  // ⌘S / Ctrl+S 保存。用 ref 持有最新闭包，避免因为依赖 draft 而反复解绑重绑监听
  const saveRef = useRef<() => void>(() => undefined)
  saveRef.current = () => {
    if (dirty) handleSave()
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function handleSave() {
    saveRubric(activeTask, draft, note)
    setNote('')
    toast.ok(`「${spec.shortName}」细则已保存`)
  }

  function handleInsertFramework() {
    if (draft.trim() && !hasPlaceholder(draft)) {
      const ok = window.confirm('当前已有内容。插入骨架会整体覆盖，旧内容会存进版本历史，继续？')
      if (!ok) return
    }
    setDraft(buildRubricTemplate(activeTask))
    toast.info('已插入空白骨架，请填入细则内容')
  }

  const versions = rubrics[activeTask].versions

  return (
    <Shell
      route="rubrics"
      title="评分细则"
      crumbs={
        <span className="row" style={{ gap: 'var(--ds-2)' }}>
          <span>配置</span>
          <span>/</span>
          <span>{spec.name}</span>
        </span>
      }
      actions={
        <>
          {dirty ? (
            <span className="chip chip--clay">有未保存的修改</span>
          ) : (
            <span className="chip chip--ghost">已与已保存版本一致</span>
          )}
          <button type="button" className="btn btn--secondary btn--sm" onClick={handleInsertFramework}>
            <IconSpark size={13} />
            插入骨架
          </button>
          <button type="button" className="btn btn--primary btn--sm" disabled={!dirty} onClick={handleSave}>
            <IconSave size={13} />
            保存
          </button>
        </>
      }
    >
      <div className="page-head">
        <p className="page-head__eyebrow">
          <IconRubric size={12} />
          Instruction · 将作为 Prompt 主体上传
        </p>
        <h2 className="page-head__title">评分细则编辑器</h2>
        <p className="page-head__desc">
          这里填写的全文会在批改时逐字注入到 system prompt 中，作为模型的唯一评分依据。
          平台<strong>不预置任何评分标准</strong>——官方细则、你自己的批改口径，都由你决定。
          内容保存在本机浏览器，随时可导出。
        </p>
      </div>

      {/* 题型切换 */}
      <div className="rubric-tabs" role="tablist" aria-label="选择题型">
        {TASK_ORDER.map((type) => {
          const taskSpec = TASK_SPECS[type]
          const filled = isRubricFilled(rubrics[type])
          return (
            <button
              key={type}
              role="tab"
              type="button"
              aria-selected={activeTask === type}
              className="rubric-tab"
              onClick={() => setActiveTask(type)}
            >
              <span className="rubric-tab__name">{taskSpec.name}</span>
              <span className="rubric-tab__meta">
                <span className="numeric">满分 {taskSpec.total}</span>
                <span className={`dot dot--${filled ? 'ok' : 'warn'}`} />
                <span>{filled ? '已填写' : '待填写'}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="rubric-layout">
        {/* ————— 左：编辑器 ————— */}
        <section className="panel rubric-editor">
          <div className="panel__head" style={{ paddingBottom: 'var(--ds-3)' }}>
            <div>
              <h3 className="panel__title">正文</h3>
              <p className="panel__desc">
                Markdown 格式。建议写明四件事：档次区间、维度分值、扣分规则、逐句诊断要求。
              </p>
            </div>
            <div className="segmented" role="tablist" aria-label="编辑模式">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'edit'}
                className="segmented__item"
                onClick={() => setMode('edit')}
              >
                <IconEdit size={12} />
                编辑
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'preview'}
                className="segmented__item"
                onClick={() => setMode('preview')}
              >
                <IconEye size={12} />
                预览
              </button>
            </div>
          </div>

          <div className="panel__body" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
            {mode === 'edit' ? (
              <textarea
                className="textarea textarea--code rubric-textarea"
                value={draft}
                spellCheck={false}
                aria-label={`${spec.name} 评分细则`}
                placeholder="粘贴或撰写该题型的评分细则……"
                onChange={(e) => setDraft(e.target.value)}
              />
            ) : (
              <div className="rubric-preview">
                <Markdown source={draft || '_（正文为空）_'} />
              </div>
            )}
          </div>

          <div className="rubric-editor__foot">
            <div className="rubric-savenote">
              <input
                className="input"
                value={note}
                placeholder="版本备注（可选），例如：依据 2024 年官方细则"
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && dirty) handleSave()
                }}
              />
            </div>
            <span className="numeric rubric-count">{draft.length} 字符</span>
            <span className="rubric-kbd">
              <kbd>⌘</kbd>
              <kbd>S</kbd>
              保存
            </span>
            <button type="button" className="btn btn--primary btn--sm" disabled={!dirty} onClick={handleSave}>
              <IconSave size={13} />
              保存并归档
            </button>
          </div>
        </section>

        {/* ————— 右：体检 + 分值 + 版本 ————— */}
        <aside className="rubric-side">
          <section className="panel">
            <div className="panel__head" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
              <div>
                <h3 className="panel__title" style={{ fontSize: 'var(--ds-text-base)' }}>
                  细则体检
                </h3>
                <p className="panel__desc">
                  {!report.filled
                    ? '还是空白骨架，先填入内容'
                    : warnCount === 0
                      ? '全部通过'
                      : `${warnCount} 项建议补充`}
                </p>
              </div>
              <span className={`chip ${!report.filled ? 'chip--warn' : warnCount === 0 ? 'chip--ok' : 'chip--warn'}`}>
                {report.filled ? `${checks.length - warnCount}/${checks.length}` : '待填写'}
              </span>
            </div>
            <div className="panel__body" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
              <ul className="checklist">
                {checks.map((check) => (
                  <li key={check.id} className={`checklist__item checklist__item--${check.level}`}>
                    <span className="checklist__mark">
                      {check.level === 'ok' ? <IconCheck size={12} /> : <IconAlert size={12} />}
                    </span>
                    <span className="checklist__text">
                      <span className="checklist__label">{check.label}</span>
                      <span className="checklist__hint">{check.hint}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="rubric-disclaimer">
                <IconInfo size={12} />
                体检只做关键词层面的静态提示，不会阻止保存——你的细则以你写的为准。
              </p>
            </div>
          </section>

          <section className="panel">
            <div className="panel__head" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
              <div>
                <h3 className="panel__title" style={{ fontSize: 'var(--ds-text-base)' }}>
                  分值结构
                </h3>
                <p className="panel__desc">默认骨架，可对照着写进细则正文。</p>
              </div>
            </div>
            <div className="panel__body" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
              <ul className="scoremap">
                {spec.dimensions.map((dim) => (
                  <li key={dim.key} className="scoremap__row">
                    <span className="scoremap__name">{dim.name}</span>
                    <span className="scoremap__bar" aria-hidden="true">
                      <span
                        className="scoremap__fill"
                        style={{ width: `${Math.round((dim.max / spec.total) * 100)}%` }}
                      />
                    </span>
                    <span className="numeric scoremap__val">{dim.max}</span>
                  </li>
                ))}
              </ul>
              <div className="bandlist">
                {spec.bands.map((band) => (
                  <div key={band.label} className="bandlist__row">
                    <span className="bandlist__label">{band.label}</span>
                    <span className="numeric bandlist__range">
                      {band.min}–{band.max}
                    </span>
                  </div>
                ))}
              </div>
              <div className="row" style={{ gap: 'var(--ds-2)', marginTop: 'var(--ds-4)' }}>
                <CopyButton
                  label="复制分值表"
                  text={[
                    `## 分值结构（${spec.name}，满分 ${spec.total}）`,
                    ...spec.dimensions.map((d) => `- ${d.name}：${d.max} 分 —— ${d.focus}`),
                    '',
                    '## 档次区间',
                    ...spec.bands.map((b) => `- ${b.label}：${b.min}–${b.max} 分`),
                  ].join('\n')}
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    const ok = window.confirm('重置为空白骨架？当前内容会存进版本历史。')
                    if (!ok) return
                    resetRubricToTemplate(activeTask)
                    toast.info('已重置为空白骨架')
                  }}
                >
                  <IconHistory size={13} />
                  重置骨架
                </button>
              </div>
            </div>
          </section>

          <details className="disclosure" open={versions.length > 0}>
            <summary className="disclosure__summary">
              <IconCaret size={12} className="caret" />
              <span className="row" style={{ flex: 1, gap: 'var(--ds-2)' }}>
                <IconHistory size={13} />
                <span style={{ fontWeight: 500, fontSize: 'var(--ds-text-sm)' }}>版本历史</span>
              </span>
              <span className="numeric chip chip--ghost">{versions.length}</span>
            </summary>
            <div className="disclosure__body">
              {versions.length === 0 ? (
                <p className="rubric-empty-hint">
                  还没有历史版本。每次「保存并归档」若有内容变化，都会把上一版存进这里，最多保留 20 版。
                </p>
              ) : (
                <ul className="versionlist">
                  {versions.map((version) => (
                    <li key={version.id} className="versionlist__row">
                      <div className="versionlist__text">
                        <span className="versionlist__note">{version.note}</span>
                        <span className="numeric versionlist__time">
                          {formatTime(version.savedAt)} · {version.content.length} 字符
                        </span>
                      </div>
                      <div className="versionlist__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => {
                            const ok = window.confirm('回滚到这一版？当前内容会先自动备份。')
                            if (!ok) return
                            restoreRubricVersion(activeTask, version.id)
                            toast.ok('已回滚')
                          }}
                        >
                          <IconHistory size={12} />
                          回滚
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          aria-label="删除此版本"
                          onClick={() => deleteRubricVersion(activeTask, version.id)}
                        >
                          <IconTrash size={12} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          <div className="note note--clay">
            <span className="note__icon">
              <IconPlus size={13} />
            </span>
            <div className="note__body">
              <p className="note__title">待你提供细则内容</p>
              <p>
                三个题型的正文目前都是空白骨架。你把官方细则或自己的批改标准发我，我可以直接帮你
                灌进这里并做一次措辞整理；也可以你自己在页面上粘进去。
              </p>
            </div>
          </div>
        </aside>
      </div>
    </Shell>
  )
}
