import { useEffect, useMemo, useState } from 'react'
import { Shell } from '@/components/Shell'
import { navigate } from '@/app/router'
import { toast } from '@/app/ui'
import { CopyButton } from '@/components/Toast'
import { useConfigStore } from '@/app/store'
import { useDefaultModel } from '@/app/store'
import { listReports, type StoredReport } from '@/lib/reports'
import { listTemplates, deleteTemplate, saveTemplate, saveTemplates } from '@/lib/templates'
import { generateTemplates } from '@/lib/templateActions'
import { TASK_SPECS } from '@/lib/tasks'
import { formatTime } from '@/lib/storage'
import {
  getCategoryMeta,
  isRecurring,
  summarizeByCategory,
  RECURRENCE_THRESHOLD,
  type TemplateCategory,
  type WritingTemplate,
} from '@/types/template'
import {
  IconBook,
  IconCaret,
  IconCheck,
  IconEdit,
  IconInfo,
  IconSpark,
  IconTrash,
} from '@/components/Icon'
import './templates.css'

/* ==========================================================================
   模板库
   · 按分类浏览，反复出现的问题置顶
   · 可从任意一次批改记录一键提炼模板
   · 标记「已掌握」，把注意力留给还没记住的
   ========================================================================== */

const MASTERED_KEY = 'kaoyan-writing-coach:template-mastered'

function loadMastered(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(MASTERED_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

export function TemplatesPage() {
  const settings = useConfigStore((s) => s.settings)
  const model = useDefaultModel()

  const [templates, setTemplates] = useState<WritingTemplate[]>([])
  const [reports, setReports] = useState<StoredReport[]>([])
  const [mastered, setMastered] = useState<Record<string, boolean>>(loadMastered)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TemplateCategory | 'all' | 'recurring'>('all')
  const [busy, setBusy] = useState<'idle' | 'generating' | 'batch'>('idle')
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 })

  useEffect(() => {
    Promise.all([listTemplates(), listReports()]).then(([t, r]) => {
      setTemplates(t)
      setReports(r)
      setLoading(false)
    })
  }, [])

  function persistMastered(next: Record<string, boolean>) {
    setMastered(next)
    try {
      localStorage.setItem(MASTERED_KEY, JSON.stringify(next))
    } catch {
      /* 存不下也不影响本次会话 */
    }
  }

  const stats = useMemo(() => summarizeByCategory(templates, mastered), [templates, mastered])
  const totalRecurring = templates.filter(isRecurring).length

  const visible = useMemo(() => {
    if (filter === 'all') return templates
    if (filter === 'recurring') return templates.filter(isRecurring)
    return templates.filter((t) => t.category === filter)
  }, [templates, filter])

  /** 按问题类型再分一层，同一类错误集中记忆效果最好 */
  const grouped = useMemo(() => {
    const map = new Map<TemplateCategory, WritingTemplate[]>()
    for (const t of visible) {
      const list = map.get(t.category) ?? []
      list.push(t)
      map.set(t.category, list)
    }
    return map
  }, [visible])

  async function handleGenerate(report: StoredReport) {
    if (!model) {
      toast.error('请先在「模型配置」里添加并启用一个模型')
      return
    }
    setBusy('generating')
    try {
      const result = await generateTemplates(report, model, settings, templates)
      setTemplates(result.templates)
      await saveTemplates(result.templates)
      toast.ok(
        `提炼完成：新增 ${result.added} 条${result.merged > 0 ? `，${result.merged} 条与已有模板合并（出现次数 +1）` : ''}`,
      )
      if (result.added > 0 || result.merged > 0) setFilter('all')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提炼失败')
    } finally {
      setBusy('idle')
    }
  }

  /** 一次性把历史记录全部提炼一遍，快速积累模板库 */
  async function handleBatch() {
    if (!model) {
      toast.error('请先配置模型')
      return
    }
    const targets = reports.filter((r) => r.report.sentences.length > 0)
    if (targets.length === 0) {
      toast.info('还没有可提炼的批改记录')
      return
    }

    setBusy('batch')
    setBatchProgress({ done: 0, total: targets.length })
    let acc = templates
    let added = 0
    let merged = 0
    let failed = 0

    for (let i = 0; i < targets.length; i += 1) {
      try {
        const result = await generateTemplates(targets[i], model, settings, acc)
        acc = result.templates
        added += result.added
        merged += result.merged
        await saveTemplates(acc)
        setTemplates([...acc])
      } catch {
        failed += 1
      }
      setBatchProgress({ done: i + 1, total: targets.length })
    }

    setBusy('idle')
    toast.ok(
      `批量提炼完成：新增 ${added} 条，合并 ${merged} 条${failed > 0 ? `，${failed} 条失败` : ''}`,
    )
  }

  return (
    <Shell
      route="templates"
      title="模板库"
      crumbs={<span>资料 / 模板库</span>}
      actions={
        <>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy !== 'idle' || reports.length === 0}
            onClick={handleBatch}
          >
            {busy === 'batch' ? (
              <>
                <span className="spinner" />
                批量提炼 {batchProgress.done}/{batchProgress.total}
              </>
            ) : (
              <>
                <IconSpark size={13} />
                提炼全部记录
              </>
            )}
          </button>
          <CopyButton
            label="复制全部模板"
            text={templates
              .map((t) => `【${getCategoryMeta(t.category).name}】${t.title}\n${t.body}${t.meaning ? `\n释义：${t.meaning}` : ''}`)
              .join('\n\n')}
          />
        </>
      }
    >
      <div className="page-head">
        <p className="page-head__eyebrow">
          <IconBook size={12} />
          Template Library
        </p>
        <h2 className="page-head__title">模板库</h2>
        <p className="page-head__desc">
          把每次批改里值得留下的东西沉淀成模板。同一个问题在多次批改里反复出现时，
          条目会**合并并累加出现次数**——出现次数越多，越该优先记住它。
        </p>
      </div>

      {/* —— 概览 —— */}
      <section className="tpl-stats">
        <div className="tpl-stat">
          <span className="numeric tpl-stat__num">{templates.length}</span>
          <span className="tpl-stat__label">模板总数</span>
        </div>
        <div className="tpl-stat tpl-stat--warn">
          <span className="numeric tpl-stat__num">{totalRecurring}</span>
          <span className="tpl-stat__label">反复出现</span>
        </div>
        <div className="tpl-stat tpl-stat--ok">
          <span className="numeric tpl-stat__num">
            {Object.values(mastered).filter(Boolean).length}
          </span>
          <span className="tpl-stat__label">已掌握</span>
        </div>
        <div className="tpl-stat">
          <span className="numeric tpl-stat__num">{reports.length}</span>
          <span className="tpl-stat__label">批改记录</span>
        </div>
      </section>

      {loading ? (
        <div className="stack stack--3">
          <div className="skeleton" style={{ height: 72 }} />
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          hasReports={reports.length > 0}
          onGenerate={() => reports[0] && handleGenerate(reports[0])}
          onBatch={handleBatch}
          busy={busy !== 'idle'}
        />
      ) : (
        <div className="tpl-layout">
          {/* —— 左：分类 —— */}
          <aside className="tpl-side">
            <button
              type="button"
              className="tpl-cat"
              aria-current={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              <span className="tpl-cat__name">全部模板</span>
              <span className="numeric tpl-cat__count">{templates.length}</span>
            </button>
            <button
              type="button"
              className="tpl-cat tpl-cat--warn"
              aria-current={filter === 'recurring'}
              onClick={() => setFilter('recurring')}
            >
              <span className="tpl-cat__name">反复出现</span>
              <span className="numeric tpl-cat__count">{totalRecurring}</span>
            </button>

            <p className="tpl-side__title">按分类</p>
            {stats.map((stat) => {
              const meta = getCategoryMeta(stat.category)
              return (
                <button
                  key={stat.category}
                  type="button"
                  className="tpl-cat"
                  aria-current={filter === stat.category}
                  onClick={() => setFilter(stat.category)}
                  title={meta.desc}
                >
                  <span className="tpl-cat__name">{meta.name}</span>
                  <span className="numeric tpl-cat__count">{stat.total}</span>
                </button>
              )
            })}
          </aside>

          {/* —— 右：模板列表 —— */}
          <div className="tpl-main">
            {filter !== 'all' && filter !== 'recurring' ? (
              <div className="note tpl-tip">
                <span className="note__icon">
                  <IconInfo size={13} />
                </span>
                <div className="note__body">
                  <p className="note__title">{getCategoryMeta(filter).name} · 怎么记</p>
                  <p>{getCategoryMeta(filter).memoryTip}</p>
                </div>
              </div>
            ) : null}

            {filter === 'recurring' && totalRecurring === 0 ? (
              <div className="note">
                <span className="note__icon">
                  <IconInfo size={13} />
                </span>
                <div className="note__body">
                  <p>
                    还没有反复出现的问题。当同一类问题在 {RECURRENCE_THRESHOLD} 次以上批改里出现时，
                    模板会自动合并并出现在这里。
                  </p>
                </div>
              </div>
            ) : null}

            {[...grouped.entries()].map(([category, items]) => (
              <section key={category} className="tpl-group">
                <h3 className="tpl-group__title">
                  {getCategoryMeta(category).name}
                  <span className="numeric tpl-group__count">{items.length}</span>
                </h3>
                <div className="stack stack--2">
                  {items.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      mastered={Boolean(mastered[template.id])}
                      onToggleMastered={() =>
                        persistMastered({ ...mastered, [template.id]: !mastered[template.id] })
                      }
                      onDelete={async () => {
                        if (!window.confirm('删除这条模板？该操作不可撤销。')) return
                        await deleteTemplate(template.id)
                        setTemplates((list) => list.filter((t) => t.id !== template.id))
                        toast.info('已删除')
                      }}
                      onSave={async (patch) => {
                        const next = { ...template, ...patch, updatedAt: Date.now(), edited: true }
                        await saveTemplate(next)
                        setTemplates((list) => list.map((t) => (t.id === next.id ? next : t)))
                        toast.ok('已保存')
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}

            {visible.length === 0 && filter !== 'recurring' ? (
              <div className="panel">
                <div className="empty">
                  <span className="empty__mark">
                    <IconBook size={18} />
                  </span>
                  <h3 className="empty__title">这个分类还没有模板</h3>
                  <p className="empty__desc">
                    从批改记录里提炼，或切到「全部模板」看看其他分类。
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* —— 从记录提炼 —— */}
      {templates.length > 0 && reports.length > 0 ? (
        <details className="disclosure" style={{ marginTop: 'var(--ds-6)' }}>
          <summary className="disclosure__summary">
            <IconCaret size={12} className="caret" />
            <span style={{ fontWeight: 500, fontSize: 'var(--ds-text-sm)' }}>
              从某次批改记录提炼模板
            </span>
            <span className="field__hint" style={{ marginLeft: 'auto' }}>
              共 {reports.length} 条记录
            </span>
          </summary>
          <div className="disclosure__body">
            <div className="stack stack--2">
              {reports.slice(0, 12).map((report) => (
                <div key={report.id} className="tpl-source">
                  <span className="tpl-source__meta">
                    <span className="tpl-source__task">{TASK_SPECS[report.taskType].shortName}</span>
                    <span className="numeric tpl-source__time">{formatTime(report.createdAt)}</span>
                    <span className="numeric tpl-source__score">
                      {report.report.total}/{TASK_SPECS[report.taskType].total}
                    </span>
                  </span>
                  <span className="tpl-source__excerpt">
                    {report.input.essay.replace(/\s+/g, ' ').slice(0, 60)}…
                  </span>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={busy !== 'idle'}
                    onClick={() => handleGenerate(report)}
                  >
                    <IconSpark size={12} />
                    提炼
                  </button>
                </div>
              ))}
            </div>
          </div>
        </details>
      ) : null}
    </Shell>
  )
}

/* -------------------------------------------------------------------------- */

function EmptyState({
  hasReports,
  onGenerate,
  onBatch,
  busy,
}: {
  hasReports: boolean
  onGenerate: () => void
  onBatch: () => void
  busy: boolean
}) {
  return (
    <div className="panel">
      <div className="empty">
        <span className="empty__mark">
          <IconBook size={18} />
        </span>
        <h3 className="empty__title">模板库还是空的</h3>
        <p className="empty__desc">
          {hasReports
            ? '从批改记录里提炼：把逐句问题、修改句和表达积累整理成离开这篇文章也能用的模板。同一问题反复出现时会自动合并。'
            : '先完成至少一次批改，报告里的问题与优化句就是提炼模板的原料。'}
        </p>
        <div className="row" style={{ gap: 'var(--ds-2)', marginTop: 'var(--ds-5)' }}>
          <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={onBatch}>
            <IconSpark size={13} />
            提炼全部记录
          </button>
          {!hasReports ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('workbench')}>
              去批改
            </button>
          ) : (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onGenerate}>
              只提炼最近一次
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TemplateCard({
  template,
  mastered,
  onToggleMastered,
  onDelete,
  onSave,
}: {
  template: WritingTemplate
  mastered: boolean
  onToggleMastered: () => void
  onDelete: () => void
  onSave: (patch: Partial<WritingTemplate>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(template)

  const recurring = isRecurring(template)

  return (
    <article className={`tpl${mastered ? ' tpl--mastered' : ''}${recurring ? ' tpl--recurring' : ''}`}>
      <header className="tpl__head">
        <div className="tpl__title-row">
          <h4 className="tpl__title">
            {editing ? (
              <input
                className="input"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            ) : (
              template.title
            )}
          </h4>
          {recurring ? (
            <span className="chip chip--clay" title={`在 ${template.recurrence} 次批改中出现`}>
              出现 {template.recurrence} 次
            </span>
          ) : null}
          {mastered ? (
            <span className="chip chip--ok">
              <IconCheck size={11} /> 已掌握
            </span>
          ) : null}
        </div>
        <div className="tpl__actions">
          <button
            type="button"
            className={`btn btn--ghost btn--sm${mastered ? ' btn--active' : ''}`}
            onClick={onToggleMastered}
            title={mastered ? '取消已掌握' : '标记为已掌握'}
          >
            <IconCheck size={12} />
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              if (editing) onSave(draft)
              setEditing((v) => !v)
            }}
            title={editing ? '保存' : '编辑'}
          >
            <IconEdit size={12} />
          </button>
          <CopyButton
            label="复制"
            text={`${template.body}\n${template.meaning ? `释义：${template.meaning}\n` : ''}${template.usage ? `用法：${template.usage}` : ''}`}
          />
          <button type="button" className="btn btn--ghost btn--sm" onClick={onDelete} title="删除">
            <IconTrash size={12} />
          </button>
        </div>
      </header>

      <div className="tpl__body">
        {editing ? (
          <>
            <textarea
              className="textarea"
              rows={2}
              value={draft.body}
              placeholder="可复用的句式或搭配"
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
            <input
              className="input"
              value={draft.meaning}
              placeholder="中文释义"
              onChange={(e) => setDraft({ ...draft, meaning: e.target.value })}
            />
            <input
              className="input"
              value={draft.usage}
              placeholder="用法说明"
              onChange={(e) => setDraft({ ...draft, usage: e.target.value })}
            />
            <input
              className="input"
              value={draft.scene}
              placeholder="适用场景"
              onChange={(e) => setDraft({ ...draft, scene: e.target.value })}
            />
          </>
        ) : (
          <>
            <p className="tpl__phrase">{template.body}</p>
            {template.meaning ? <p className="tpl__meaning">{template.meaning}</p> : null}
            {template.usage ? <p className="tpl__meta">用法：{template.usage}</p> : null}
            {template.scene ? <p className="tpl__meta">场景：{template.scene}</p> : null}
          </>
        )}

        {template.wrongExample ? (
          <div className="tpl__compare">
            <p className="tpl__wrong">
              <span className="tpl__compare-tag">原句</span>
              {template.wrongExample}
            </p>
            {template.example ? (
              <p className="tpl__right">
                <span className="tpl__compare-tag">改后</span>
                {template.example}
              </p>
            ) : null}
          </div>
        ) : template.example ? (
          <p className="tpl__example">
            <span className="tpl__compare-tag">例句</span>
            {template.example}
          </p>
        ) : null}

        <footer className="tpl__foot">
          {template.problemTags.length > 0 ? (
            <span className="row row--wrap" style={{ gap: 'var(--ds-1)' }}>
              {template.problemTags.map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </span>
          ) : (
            <span />
          )}
          <span className="numeric tpl__sources">
            {template.sourceReportIds.length} 次批改
            {template.origin === 'manual' ? ' · 手动创建' : ''}
          </span>
        </footer>
      </div>
    </article>
  )
}
