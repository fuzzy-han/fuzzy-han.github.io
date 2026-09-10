import { useEffect, useMemo, useState } from 'react'
import { Shell } from '@/components/Shell'
import { navigate } from '@/app/router'
import { toast } from '@/app/ui'
import { TASK_SPECS, TASK_ORDER } from '@/lib/tasks'
import { listReports, deleteReport, type StoredReport } from '@/lib/reports'
import { formatTime } from '@/lib/storage'
import { formatScore } from '@/components/Score'
import { IconAlert, IconBook, IconHistory, IconSpark, IconTrash } from '@/components/Icon'
import { useConfigStore, useDefaultModel } from '@/app/store'
import { listTemplates, saveTemplates } from '@/lib/templates'
import { generateTemplates } from '@/lib/templateActions'
import type { TaskType } from '@/types/domain'
import './history.css'

/* ==========================================================================
   批改记录
   · 按题型筛选
   · 同一题型的分数趋势（手写 SVG 折线，不引图表库）
   · 点击进入报告，可删除
   ========================================================================== */

export function HistoryPage() {
  const [records, setRecords] = useState<StoredReport[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TaskType | 'all'>('all')
  const [extractingId, setExtractingId] = useState<string | null>(null)
  const settings = useConfigStore((s) => s.settings)
  const model = useDefaultModel()

  /** 从某条记录提炼模板，提炼完直接去模板库看结果 */
  async function extractTemplates(record: StoredReport) {
    if (!model) {
      toast.error('请先在「模型配置」里添加并启用一个模型')
      return
    }
    setExtractingId(record.id)
    try {
      const existing = await listTemplates()
      const result = await generateTemplates(record, model, settings, existing)
      await saveTemplates(result.templates)
      toast.ok(
        `新增 ${result.added} 条模板${result.merged > 0 ? `，合并 ${result.merged} 条` : ''}`,
      )
      navigate('templates')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提炼失败')
    } finally {
      setExtractingId(null)
    }
  }

  useEffect(() => {
    listReports().then((rows) => {
      setRecords(rows)
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(
    () => (filter === 'all' ? records : records.filter((r) => r.taskType === filter)),
    [records, filter],
  )

  /* 分数趋势：按时间正序，同一题型的得分率 */
  const trend = useMemo(() => {
    if (filter === 'all') return []
    const spec = TASK_SPECS[filter]
    return [...filtered]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => ({
        id: r.id,
        ratio: spec.total > 0 ? r.report.total / spec.total : 0,
        score: r.report.total,
        total: spec.total,
        at: r.createdAt,
      }))
  }, [filtered, filter])

  async function handleDelete(id: string) {
    if (!window.confirm('删除这份批改记录？该操作不可撤销。')) return
    await deleteReport(id)
    setRecords((rows) => rows.filter((r) => r.id !== id))
    toast.info('已删除')
  }

  return (
    <Shell
      route="history"
      title="批改记录"
      crumbs={<span>批改 / 记录</span>}
      actions={
        <>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('templates')}>
            <IconBook size={13} />
            模板库
          </button>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => navigate('workbench')}>
            <IconSpark size={13} />
            去批改
          </button>
        </>
      }
    >
      {loading ? (
        <div className="stack stack--3">
          <div className="skeleton" style={{ height: 64 }} />
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      ) : records.length === 0 ? (
        <div className="panel">
          <div className="empty">
            <span className="empty__mark">
              <IconHistory size={18} />
            </span>
            <h3 className="empty__title">还没有批改记录</h3>
            <p className="empty__desc">
              完成第一次批改后，报告会自动出现在这里。记录保存在本机浏览器，不会上传到任何服务器。
            </p>
            <div className="row" style={{ gap: 'var(--ds-2)', marginTop: 'var(--ds-5)' }}>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate('workbench')}>
                回到批改台
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('rubrics')}>
                查看评分细则
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="hist-filters">
            <button
              type="button"
              className="grade-tab"
              aria-selected={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              <span className="grade-tab__name">全部</span>
              <span className="numeric grade-tab__meta">{records.length}</span>
            </button>
            {TASK_ORDER.map((type) => {
              const count = records.filter((r) => r.taskType === type).length
              if (count === 0) return null
              return (
                <button
                  key={type}
                  type="button"
                  className="grade-tab"
                  aria-selected={filter === type}
                  onClick={() => setFilter(type)}
                >
                  <span className="grade-tab__name">{TASK_SPECS[type].shortName}</span>
                  <span className="numeric grade-tab__meta">{count}</span>
                </button>
              )
            })}
          </div>

          {trend.length >= 2 ? <TrendChart points={trend} /> : null}

          <div className="hist-list">
            {filtered.map((record) => {
              const spec = TASK_SPECS[record.taskType]
              const ratio = spec.total > 0 ? record.report.total / spec.total : 0
              return (
                <div key={record.id} className="hist-item">
                  <button
                    type="button"
                    className="hist-item__main"
                    onClick={() => navigate('report', { id: record.id })}
                  >
                    <span className="hist-item__left">
                      <span className="hist-item__task">{spec.shortName}</span>
                      <span className="numeric hist-item__time">{formatTime(record.createdAt)}</span>
                    </span>

                    <span className="hist-item__excerpt">
                      {record.input.essay.replace(/\s+/g, ' ').slice(0, 96)}
                      {record.input.essay.length > 96 ? '…' : ''}
                    </span>

                    <span className="hist-item__score">
                      <span className="numeric hist-item__score-num">
                        {formatScore(record.report.total)}
                        <span className="hist-item__score-max">/{spec.total}</span>
                      </span>
                      <span className="hist-item__bar" aria-hidden="true">
                        <span
                          className={`hist-item__fill${ratio < 0.6 ? ' hist-item__fill--weak' : ''}`}
                          style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }}
                        />
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    className="hist-item__tpl"
                    disabled={extractingId !== null}
                    onClick={() => extractTemplates(record)}
                    aria-label="从这条记录提炼模板"
                    title="提炼成可复用的模板"
                  >
                    {extractingId === record.id ? <span className="spinner" /> : <IconBook size={13} />}
                  </button>

                  <button
                    type="button"
                    className="hist-item__del"
                    onClick={() => handleDelete(record.id)}
                    aria-label="删除这条记录"
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              )
            })}
          </div>

          <p className="hist-foot">
            <IconAlert size={12} />
            记录保存在本机浏览器（IndexedDB）。换浏览器或清理浏览器数据会丢失，重要结果建议导出。
          </p>
        </>
      )}
    </Shell>
  )
}

/* -------------------------------------------------------------------------- */

function TrendChart({
  points,
}: {
  points: { id: string; ratio: number; score: number; total: number; at: number }[]
}) {
  const w = 100
  const h = 28

  const path = points
    .map((p, i) => {
      const x = points.length === 1 ? 0 : (i / (points.length - 1)) * w
      const y = h - Math.max(0, Math.min(1, p.ratio)) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  const first = points[0]
  const last = points[points.length - 1]
  const delta = last.ratio - first.ratio

  return (
    <div className="trend">
      <div className="trend__head">
        <span className="trend__title">得分趋势</span>
        <span className={`numeric trend__delta${delta >= 0 ? ' trend__delta--up' : ' trend__delta--down'}`}>
          {delta >= 0 ? '+' : ''}
          {(delta * last.total).toFixed(1)} 分
        </span>
      </div>
      <svg className="trend__svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={`${path} L${w},${h} L0,${h} Z`} className="trend__area" />
        <path d={path} className="trend__line" />
      </svg>
      <div className="trend__axis">
        <span className="numeric">{formatTime(first.at).slice(5, 10)}</span>
        <span className="numeric">
          {points.length} 次 · 最新 {formatScore(last.score)}/{last.total}
        </span>
        <span className="numeric">{formatTime(last.at).slice(5, 10)}</span>
      </div>
    </div>
  )
}
