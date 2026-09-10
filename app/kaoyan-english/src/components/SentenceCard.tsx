import { useState } from 'react'
import { IconCaret, IconCheck, IconCopy } from './Icon'
import { copyText } from './Toast'
import { LEVEL_LABEL } from '@/lib/report'
import type { EssaySentence, TranslationSentence } from '@/types/report'
import { POINT_STATUS_LABEL } from '@/types/report'

/* ==========================================================================
   逐句折叠卡 —— 默认折叠，点开才看优化内容

   这是平台的核心交互：折叠时学生只看到「这一句有什么问题」的标签，
   先自己判断；点开才看到讲解与优化句。
   ========================================================================== */

const LEVEL_TONE: Record<string, string> = {
  must: 'danger',
  optional: 'warn',
  ok: 'ok',
}

function SentenceShell({
  index,
  level,
  labels,
  preview,
  previewMuted,
  trailing,
  children,
  defaultOpen,
}: {
  index: number
  level: EssaySentence['level']
  labels: string[]
  preview: string
  previewMuted?: boolean
  trailing?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)

  return (
    <div className={`sent sent--${level}`} data-open={open}>
      <button
        type="button"
        className="sent__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="numeric sent__no">{index}</span>

        <span className="sent__labels">
          {labels.length > 0 ? (
            labels.map((label) => (
              <span key={label} className={`chip chip--${LEVEL_TONE[level]}`}>
                {label}
              </span>
            ))
          ) : (
            <span className="chip chip--ok">语言无误</span>
          )}
        </span>

        <span className={`sent__preview${previewMuted ? ' sent__preview--muted' : ''}`}>{preview}</span>

        {trailing}

        <IconCaret size={12} className="caret sent__caret" />
      </button>

      {open ? <div className="sent__body">{children}</div> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  作文：原句 → 问题 → 修改句 → 中文解释                                       */
/* -------------------------------------------------------------------------- */

export function EssaySentenceCard({
  sentence,
  defaultOpen,
}: {
  sentence: EssaySentence
  defaultOpen?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const changed = sentence.revised.trim() !== sentence.original.trim()
  const labels = sentence.labels.length > 0 ? sentence.labels : []

  return (
    <SentenceShell
      index={sentence.index}
      level={sentence.level}
      labels={labels}
      preview={sentence.original}
      defaultOpen={defaultOpen}
      trailing={
        <span className={`sent__flag sent__flag--${sentence.level}`}>
          {LEVEL_LABEL[sentence.level]}
        </span>
      }
    >
      <div className="sent__block">
        <span className="sent__block-label">原句</span>
        <p className="sent__original">{sentence.original}</p>
      </div>

      {sentence.problems.length > 0 ? (
        <div className="sent__block">
          <span className="sent__block-label">问题</span>
          <ul className="sent__problems">
            {sentence.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="sent__block sent__block--ok">
          <span className="sent__block-label">
            <IconCheck size={11} /> 无语法错误
          </span>
          <p>这一句是正确的，可以保留。</p>
        </div>
      )}

      {changed ? (
        <div className="sent__block sent__block--revised">
          <div className="sent__block-head">
            <span className="sent__block-label">优化后</span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={async () => {
                const ok = await copyText(sentence.revised)
                setCopied(ok)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              <IconCopy size={12} />
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          <p className="sent__revised">{sentence.revised}</p>
        </div>
      ) : null}

      {sentence.explanation ? (
        <div className="sent__block">
          <span className="sent__block-label">讲解</span>
          <p className="sent__explain">{sentence.explanation}</p>
        </div>
      ) : null}
    </SentenceShell>
  )
}

/* -------------------------------------------------------------------------- */
/*  翻译：采分点对照                                                           */
/* -------------------------------------------------------------------------- */

export function TranslationSentenceCard({
  sentence,
  maxScore = 2,
  defaultOpen,
}: {
  sentence: TranslationSentence
  maxScore?: number
  defaultOpen?: boolean
}) {
  const gained = sentence.points.reduce((sum, p) => sum + p.earned, 0)
  const lost = sentence.points.reduce((sum, p) => sum + p.score, 0) - gained

  return (
    <SentenceShell
      index={sentence.index}
      level={sentence.level}
      labels={sentence.problems.length > 0 ? [`${sentence.problems.length} 处待改`] : []}
      preview={sentence.original}
      defaultOpen={defaultOpen}
      trailing={
        <span className="numeric sent__score">
          {formatNum(sentence.score)}/{maxScore}
        </span>
      }
    >
      <div className="sent__block">
        <span className="sent__block-label">原句</span>
        <p className="sent__original sent__original--en">{sentence.original}</p>
      </div>

      {sentence.points.length > 0 ? (
        <div className="sent__block">
          <div className="sent__block-head">
            <span className="sent__block-label">采分点（模拟划分）</span>
            <span className="numeric sent__points-sum">
              合计 {formatNum(gained)}/{formatNum(gained + lost)} 分
            </span>
          </div>
          <div className="pt-table">
            {sentence.points.map((point, i) => (
              <div key={i} className={`pt pt--${point.status}`}>
                <div className="pt__head">
                  <span className={`pt__status pt__status--${point.status}`}>
                    {POINT_STATUS_LABEL[point.status]}
                  </span>
                  <span className="numeric pt__score">
                    {formatNum(point.earned)}/{formatNum(point.score)}
                  </span>
                </div>
                <p className="pt__en">{point.point}</p>
                {point.meaning ? <p className="pt__meaning">应表达：{point.meaning}</p> : null}
                {point.yourRendering ? (
                  <p className="pt__yours">你的译文：{point.yourRendering}</p>
                ) : (
                  <p className="pt__yours pt__yours--missing">你的译文：（未找到对应内容）</p>
                )}
                {point.note ? <p className="pt__note">{point.note}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {sentence.yourTranslation ? (
        <div className="sent__block">
          <span className="sent__block-label">你的译文</span>
          <p className="sent__yourstr">{sentence.yourTranslation}</p>
        </div>
      ) : null}

      {sentence.revised ? (
        <div className="sent__block sent__block--revised">
          <span className="sent__block-label">修改译文</span>
          <p className="sent__revised sent__revised--zh">{sentence.revised}</p>
        </div>
      ) : null}

      {sentence.problems.length > 0 ? (
        <div className="sent__block">
          <span className="sent__block-label">错误分析</span>
          <ul className="sent__problems">
            {sentence.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {sentence.explanation ? (
        <div className="sent__block">
          <span className="sent__block-label">结构讲解</span>
          <p className="sent__explain">{sentence.explanation}</p>
        </div>
      ) : null}
    </SentenceShell>
  )
}

function formatNum(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
