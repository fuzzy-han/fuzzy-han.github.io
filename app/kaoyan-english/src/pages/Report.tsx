import { useEffect, useMemo, useState } from 'react'
import { Shell } from '@/components/Shell'
import { ScoreRing, DimensionBars, formatScore } from '@/components/Score'
import { EssaySentenceCard, TranslationSentenceCard } from '@/components/SentenceCard'
import { CopyButton } from '@/components/Toast'
import { navigate } from '@/app/router'
import { TASK_SPECS, getProviderName } from '@/lib/tasks'
import { countByLevel, LEVEL_LABEL } from '@/lib/report'
import { getReport, type StoredReport } from '@/lib/reports'
import { formatTime } from '@/lib/storage'
import { IconAlert, IconBook, IconCaret, IconCheck, IconInfo, IconSpark } from '@/components/Icon'
import { useConfigStore, useDefaultModel } from '@/app/store'
import { listTemplates, saveTemplates } from '@/lib/templates'
import { generateTemplates } from '@/lib/templateActions'
import { toast } from '@/app/ui'
import { POINT_STATUS_LABEL, isTranslationReport, type EssaySentence, type TranslationSentence } from '@/types/report'
import './report.css'

/* ==========================================================================
   报告页
   结构对齐批改指令的五个部分：
     一、整体评价与评分 → 分数环 + 维度条 + 分项依据
     二、逐句批改       → 逐句折叠卡（作文）/ 采分点对照（翻译）
     三、修改后全文
     四、表达积累
     五、写作思路与复盘
   ========================================================================== */

type Filter = 'all' | 'must' | 'optional' | 'ok'

export function ReportPage({ reportId }: { reportId?: string | null }) {
  const [record, setRecord] = useState<StoredReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!reportId) {
      setLoading(false)
      return
    }
    setLoading(true)
    getReport(reportId).then((found) => {
      if (!cancelled) {
        setRecord(found)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [reportId])

  if (loading) {
    return (
      <Shell route="report" title="批改报告" crumbs={<span>加载中…</span>}>
        <div className="stack stack--4">
          <div className="skeleton" style={{ height: 180 }} />
          <div className="skeleton" style={{ height: 320 }} />
        </div>
      </Shell>
    )
  }

  if (!reportId || !record) {
    return (
      <Shell
        route="report"
        title="批改报告"
        crumbs={<span>批改 / 报告</span>}
        actions={
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => navigate('workbench')}>
            返回批改台
          </button>
        }
      >
        <div className="panel">
          <div className="empty">
            <span className="empty__mark">
              <IconAlert size={18} />
            </span>
            <h3 className="empty__title">找不到这份报告</h3>
            <p className="empty__desc">
              报告保存在本机浏览器里。可能是记录已被删除，或者你在另一台设备 / 另一个浏览器打开。
            </p>
            <div className="row" style={{ gap: 'var(--ds-2)', marginTop: 'var(--ds-5)' }}>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => navigate('workbench')}>
                回到批改台
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('history')}>
                查看批改记录
              </button>
            </div>
          </div>
        </div>
      </Shell>
    )
  }

  return <ReportView record={record} />
}

/* -------------------------------------------------------------------------- */

function ReportView({ record }: { record: StoredReport }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [makingTemplates, setMakingTemplates] = useState(false)
  const settings = useConfigStore((s) => s.settings)
  const model = useDefaultModel()

  /*
   * 从这份报告提炼可复用模板。
   * 放在报告页而不是只放模板库：学生刚看完自己的问题，此刻最愿意把
   * 「错→对」记下来，转化率最高。
   */
  async function handleMakeTemplates() {
    if (!model) {
      toast.error('请先在「模型配置」里添加并启用一个模型')
      return
    }
    setMakingTemplates(true)
    try {
      const existing = await listTemplates()
      const result = await generateTemplates(record, model, settings, existing)
      await saveTemplates(result.templates)
      toast.ok(
        `已加入模板库：新增 ${result.added} 条${result.merged > 0 ? `，合并 ${result.merged} 条（反复出现 +1）` : ''}`,
      )
      navigate('templates')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提炼失败')
    } finally {
      setMakingTemplates(false)
    }
  }

  const spec = TASK_SPECS[record.taskType]
  const { report } = record
  /*
   * 用类型守卫而不是布尔量：这样 report 会被真正收窄成
   * TranslationReport / EssayReport，逐句字段和 typoDeduction 都有类型保障，
   * 不需要到处 as 断言。
   */
  const isTranslation = isTranslationReport(record.taskType, report)

  const essaySentences = useMemo(
    () => (isTranslation ? [] : (report.sentences as EssaySentence[])),
    [report.sentences, isTranslation],
  )
  const transSentences = useMemo(
    () => (isTranslation ? (report.sentences as TranslationSentence[]) : []),
    [report.sentences, isTranslation],
  )

  const typo = isTranslation ? report.typoDeduction : undefined

  const counts = countByLevel(report.sentences)
  const filtered = essaySentences.filter((s) => filter === 'all' || s.level === filter)

  return (
    <Shell
      route="report"
      title="批改报告"
      crumbs={
        <span className="row" style={{ gap: 'var(--ds-2)' }}>
          <span>{spec.name}</span>
          <span>·</span>
          <span className="numeric">{formatTime(record.createdAt)}</span>
        </span>
      }
      actions={
        <>
          <CopyButton label="复制报告" text={reportToText(record)} />
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={makingTemplates}
            onClick={handleMakeTemplates}
            title="把这次的问题与优化句整理成可复用的模板"
          >
            {makingTemplates ? <span className="spinner" /> : <IconBook size={13} />}
            {makingTemplates ? '提炼中…' : '提炼模板'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('templates')}>
            模板库
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => navigate('grade', { task: record.taskType })}
          >
            <IconSpark size={13} />
            再批一次
          </button>
        </>
      }
    >
      {/* 模型输出有问题时如实告知，不悄悄修好装作没事 */}
      {record.diagnostics.length > 0 ? (
        <div className="note note--warn" style={{ marginBottom: 'var(--ds-5)' }}>
          <span className="note__icon">
            <IconInfo size={13} />
          </span>
          <div className="note__body">
            <p className="note__title">关于这次结果的几点说明</p>
            <ul className="report-diag">
              {record.diagnostics.map((d, i) => (
                <li key={i}>{d.message}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* ————— 一、整体评价与评分 ————— */}
      <section className="report-hero">
        <div className="report-hero__score">
          <ScoreRing total={report.total} max={spec.total} band={report.band} />
        </div>

        <div className="report-hero__detail">
          <div className="report-hero__tags">
            <span className={`chip ${report.isOnTopic ? 'chip--ok' : 'chip--warn'}`}>
              {report.isOnTopic ? (
                <>
                  <IconCheck size={11} /> 切题
                </>
              ) : (
                '可能偏题'
              )}
            </span>
            {report.revisedWordCount > 0 ? (
              <span className="numeric chip chip--ghost">
                {isTranslation ? `${report.revisedWordCount} 字` : `${report.revisedWordCount} 词`}
              </span>
            ) : null}
            {record.meta.repaired ? <span className="chip chip--warn">结果经过截断修复</span> : null}
            {record.meta.retried ? <span className="chip">走了重试通道</span> : null}
          </div>

          <DimensionBars dimensions={report.dimensions} specs={spec.dimensions} />

          {report.topicNote ? <p className="report-topic">{report.topicNote}</p> : null}
        </div>
      </section>

      {/* ————— 分项依据 ————— */}
      <section className="report-section">
        <h3 className="report-section__title">分项依据</h3>
        <div className="dimcards">
          {spec.dimensions.map((dimSpec) => {
            const dim = report.dimensions.find((d) => d.key === dimSpec.key)
            const ratio = dimSpec.max > 0 ? (dim?.score ?? 0) / dimSpec.max : 0
            return (
              <div key={dimSpec.key} className="dimcard">
                <div className="dimcard__head">
                  <span className="dimcard__name">{dimSpec.name}</span>
                  <span className="numeric dimcard__score">
                    {formatScore(dim?.score ?? 0)}
                    <span className="dimcard__max">/{dimSpec.max}</span>
                  </span>
                </div>
                <span className="dimcard__bar">
                  <span style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
                </span>
                {dim?.comment ? <p className="dimcard__comment">{dim.comment}</p> : null}
                {dim && dim.evidence.length > 0 ? (
                  <ul className="dimcard__evidence">
                    {dim.evidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      {/* ————— 二、逐句批改 ————— */}
      <section className="report-section">
        <div className="report-section__head">
          <div>
            <h3 className="report-section__title">{isTranslation ? '逐句采分点对照' : '逐句批改'}</h3>
            <p className="report-section__desc">
              默认折叠，点开才看具体情况。
              {isTranslation ? '每句按采分点给分，合计 2 分。' : '先自己判断，再对照讲解。'}
            </p>
          </div>

          {!isTranslation && report.sentences.length > 0 ? (
            <div className="segmented" role="tablist" aria-label="按级别筛选">
              {(
                [
                  { key: 'all', label: `全部 ${report.sentences.length}` },
                  { key: 'must', label: `必须修改 ${counts.must}` },
                  { key: 'optional', label: `可选优化 ${counts.optional}` },
                  { key: 'ok', label: `正确 ${counts.ok}` },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === item.key}
                  className="segmented__item"
                  onClick={() => setFilter(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {!isTranslation && counts.must > 0 ? (
          <p className="report-hint">
            本次有 <strong className="numeric">{counts.must}</strong> 处必须修改，建议先逐一改掉，再回头看可选优化。
          </p>
        ) : null}

        {report.sentences.length === 0 ? (
          <div className="note">
            <span className="note__icon">
              <IconInfo size={13} />
            </span>
            <div className="note__body">
              <p>
                模型这次没有返回逐句结果，只有总评与全文。可在「通用设置」里确认「输出逐句诊断」处于开启状态。
              </p>
            </div>
          </div>
        ) : (
          <div className="stack stack--2">
            {isTranslation
              ? transSentences.map((s) => (
                  <TranslationSentenceCard key={s.index} sentence={s} maxScore={2} />
                ))
              : filtered.map((s) => <EssaySentenceCard key={s.index} sentence={s} />)}
          </div>
        )}
      </section>

      {/* ————— 错别字扣分（翻译专有）————— */}
      {typo ? (
        <section className="report-section">
          <h3 className="report-section__title">错别字累计扣分</h3>
          <div className="panel">
            <div className="panel__body">
              <div className="row row--wrap" style={{ gap: 'var(--ds-6)' }}>
                <MetaField label="影响原意的错别字" value={String(typo.count)} numeric />
                <MetaField label="实际扣分" value={formatScore(typo.deducted)} numeric />
              </div>
              {typo.note ? (
                <p className="report-topic" style={{ marginTop: 'var(--ds-3)' }}>
                  {typo.note}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* ————— 三、修改后全文 ————— */}
      {report.revisedEssay ? (
        <section className="report-section">
          <div className="report-section__head">
            <div>
              <h3 className="report-section__title">{isTranslation ? '参考译文' : '修改后全文'}</h3>
              <p className="report-section__desc">
                {isTranslation ? '整合后的完整参考译文。' : '保留你的原意与正确句式，只改必要之处。'}
              </p>
            </div>
            <CopyButton label="复制全文" text={report.revisedEssay} />
          </div>
          <div className="report-essay">
            {report.revisedEssay.split(/\n{2,}/).map((para, i) => (
              <p key={i} className={isTranslation ? 'report-essay__zh' : 'report-essay__en'}>
                {para}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {/* ————— 四、表达积累 ————— */}
      {report.phrases.length > 0 ? (
        <section className="report-section">
          <h3 className="report-section__title">表达积累</h3>
          <p className="report-section__desc">挑的是准确、自然、考场上容易复现的表达，不堆生僻词。</p>
          <div className="phrase-grid">
            {report.phrases.map((p, i) => (
              <div key={i} className="phrase">
                <p className="phrase__en">{p.phrase}</p>
                {p.meaning ? <p className="phrase__meaning">{p.meaning}</p> : null}
                {p.usage ? <p className="phrase__meta">用法：{p.usage}</p> : null}
                {p.scene ? <p className="phrase__meta">场景：{p.scene}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ————— 五、写作思路与复盘 ————— */}
      {report.structure.outline.length > 0 || report.topFixes.length > 0 ? (
        <section className="report-section">
          <h3 className="report-section__title">{isTranslation ? '翻译思路与复盘' : '写作思路与复盘'}</h3>

          <div className="review-grid">
            {report.structure.outline.length > 0 ? (
              <div className="panel">
                <div className="panel__head" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
                  <h4 className="panel__title" style={{ fontSize: 'var(--ds-text-base)' }}>
                    {isTranslation ? '各句思路' : '段落思路'}
                  </h4>
                </div>
                <div className="panel__body" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
                  <ol className="outline">
                    {report.structure.outline.map((line, i) => (
                      <li key={i}>
                        <span className="numeric outline__no">{String(i + 1).padStart(2, '0')}</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : null}

            {report.structure.frameworks.length > 0 ? (
              <div className="panel">
                <div className="panel__head" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
                  <h4 className="panel__title" style={{ fontSize: 'var(--ds-text-base)' }}>
                    可替换句式框架
                  </h4>
                </div>
                <div className="panel__body" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
                  <ul className="frameworks">
                    {report.structure.frameworks.map((f, i) => (
                      <li key={i}>
                        <p className="frameworks__name">{f.name}</p>
                        {f.example ? <p className="frameworks__example">{f.example}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>

          {report.topFixes.length > 0 ? (
            <div className="panel" style={{ marginTop: 'var(--ds-4)' }}>
              <div className="panel__head" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
                <div>
                  <h4 className="panel__title" style={{ fontSize: 'var(--ds-text-base)' }}>
                    最需要优先改进的问题
                  </h4>
                  <p className="panel__desc">按这个顺序改，收益最大。</p>
                </div>
              </div>
              <div className="panel__body" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
                <ol className="fixes">
                  {report.topFixes.map((fix, i) => (
                    <li key={i} className="fixes__item">
                      <span className="numeric fixes__no">{i + 1}</span>
                      <div className="fixes__text">
                        <p className="fixes__fix">{fix}</p>
                        {report.practice[i] ? (
                          <p className="fixes__practice">练习建议：{report.practice[i]}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ————— 需要确认的地方 ————— */}
      {report.notes.length > 0 ? (
        <div className="note note--clay" style={{ marginTop: 'var(--ds-6)' }}>
          <span className="note__icon">
            <IconAlert size={13} />
          </span>
          <div className="note__body">
            <p className="note__title">需要你确认的地方</p>
            <ul className="report-diag">
              {report.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* ————— 输入与元信息 ————— */}
      <details className="disclosure" style={{ marginTop: 'var(--ds-6)' }}>
        <summary className="disclosure__summary">
          <IconCaret size={12} className="caret" />
          <span style={{ fontWeight: 500, fontSize: 'var(--ds-text-sm)' }}>这次批改的输入与元信息</span>
        </summary>
        <div className="disclosure__body">
          <div className="meta-grid">
            <MetaField
              label="模型"
              value={`${record.meta.modelLabel}（${getProviderName(record.meta.provider)} · ${record.meta.modelName}）`}
            />
            <MetaField label="耗时" value={`${(record.meta.elapsedMs / 1000).toFixed(1)} 秒`} numeric />
            <MetaField
              label="用量"
              value={record.meta.totalTokens ? `${record.meta.totalTokens} tokens` : '未返回'}
              numeric
            />
            <MetaField label="时间" value={formatTime(record.createdAt)} numeric />
          </div>

          <div className="stack stack--4" style={{ marginTop: 'var(--ds-5)' }}>
            <div>
              <p className="report-section__desc">题目</p>
              <pre className="code-block">{record.input.prompt || '（未提供）'}</pre>
            </div>
            <div>
              <p className="report-section__desc">你的{isTranslation ? '译文' : '作文'}</p>
              <pre className="code-block">{record.input.essay}</pre>
            </div>
            {record.input.transcriptionNote ? (
              <div>
                <p className="report-section__desc">图片转录说明</p>
                <pre className="code-block">{record.input.transcriptionNote}</pre>
              </div>
            ) : null}
          </div>
        </div>
      </details>
    </Shell>
  )
}

function MetaField({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="metafield">
      <span className="metafield__label">{label}</span>
      <span className={`metafield__value${numeric ? ' numeric' : ''}`}>{value}</span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  报告转纯文本，方便复制到笔记                                                */
/* -------------------------------------------------------------------------- */

export function reportToText(record: StoredReport): string {
  const spec = TASK_SPECS[record.taskType]
  const { report } = record
  const lines: string[] = []

  lines.push(`# ${spec.name} 批改报告`, '')
  lines.push(`模拟得分：${formatScore(report.total)}/${spec.total}　档位：${report.band}`, '')
  lines.push(`是否切题：${report.isOnTopic ? '是' : '否'}`)
  if (report.topicNote) lines.push(report.topicNote)
  lines.push('')

  lines.push('## 一、分项依据', '')
  for (const dim of spec.dimensions) {
    const found = report.dimensions.find((d) => d.key === dim.key)
    lines.push(`- ${dim.name}：${formatScore(found?.score ?? 0)}/${dim.max}　${found?.comment ?? ''}`)
  }
  lines.push('')

  lines.push('## 二、逐句批改', '')
  if (spec.reportMode === 'translation') {
    for (const s of report.sentences as TranslationSentence[]) {
      lines.push(`### ${s.index}. [${formatScore(s.score)}/2] ${s.original}`)
      for (const p of s.points) {
        lines.push(
          `- 采分点：${p.point}（${formatScore(p.earned)}/${formatScore(p.score)}，${POINT_STATUS_LABEL[p.status]}）`,
        )
        if (p.meaning) lines.push(`  应表达：${p.meaning}`)
        if (p.note) lines.push(`  说明：${p.note}`)
      }
      if (s.yourTranslation) lines.push(`你的译文：${s.yourTranslation}`)
      if (s.revised) lines.push(`修改译文：${s.revised}`)
      lines.push('')
    }
  } else {
    for (const s of report.sentences as EssaySentence[]) {
      lines.push(`### ${s.index}. [${LEVEL_LABEL[s.level]}] ${s.original}`)
      if (s.problems.length) lines.push(`问题：${s.problems.join('；')}`)
      if (s.revised !== s.original) lines.push(`修改句：${s.revised}`)
      if (s.explanation) lines.push(`解释：${s.explanation}`)
      lines.push('')
    }
  }

  lines.push('## 三、修改后全文', '', report.revisedEssay, '')

  if (report.phrases.length > 0) {
    lines.push('## 四、表达积累', '')
    for (const p of report.phrases) {
      lines.push(`- ${p.phrase}：${p.meaning}${p.usage ? `（${p.usage}）` : ''}`)
    }
    lines.push('')
  }

  lines.push('## 五、写作思路与复盘', '')
  report.structure.outline.forEach((line, i) => lines.push(`${i + 1}. ${line}`))
  if (report.topFixes.length > 0) {
    lines.push('', '优先改进：')
    report.topFixes.forEach((fix, i) => {
      lines.push(`${i + 1}. ${fix}`)
      if (report.practice[i]) lines.push(`   练习：${report.practice[i]}`)
    })
  }

  return lines.join('\n')
}
