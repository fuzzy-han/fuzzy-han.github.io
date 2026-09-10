import { Shell } from '@/components/Shell'
import { navigate } from '@/app/router'
import { modelStatus, useConfigStore } from '@/app/store'
import { TASK_ORDER, TASK_SPECS } from '@/lib/tasks'
import { isRubricFilled } from '@/lib/rubric'
import { IconCheck, IconEye, IconHistory, IconAlert, IconSpark } from '@/components/Icon'
import type { TaskType } from '@/types/domain'

/* ==========================================================================
   批改台 — 主入口
   P0/P1 阶段：先交付「就绪检查 + 题型选择」，批改输入与报告页在 P2/P3 接入。
   ========================================================================== */

/** 进入某题型的批改流程 */
function openTask(type: TaskType): void {
  navigate('grade', { task: type })
}

export function WorkbenchPage() {
  const models = useConfigStore((s) => s.models)
  const rubrics = useConfigStore((s) => s.rubrics)

  const readyModels = models.filter((m) => modelStatus(m).ok)
  const filledTasks = TASK_ORDER.filter((t) => isRubricFilled(rubrics[t]))
  const modelReady = readyModels.length > 0
  const anyRubricReady = filledTasks.length > 0

  return (
    <Shell
      route="workbench"
      title="批改台"
      crumbs={<span>考研英语一 · 写作与翻译</span>}
      actions={
        <>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('history')}>
            <IconHistory size={13} />
            批改记录
          </button>
          <button
            type="button"
            className={modelReady && anyRubricReady ? 'btn btn--primary btn--sm' : 'btn btn--secondary btn--sm'}
            disabled={!modelReady || !anyRubricReady}
            title={!modelReady ? '请先配置一个可用的模型' : !anyRubricReady ? '请先填写至少一个题型的评分细则' : undefined}
            onClick={() => openTask('eng1_big')}
          >
            <IconSpark size={13} />
            开始批改
          </button>
        </>
      }
    >
      {/* ————— 头部 ————— */}
      <header className="wb-hero">
        <p className="page-head__eyebrow">
          <IconSpark size={12} />
          Grading · Sentence-level Revision
        </p>
        <h2 className="wb-hero__title">
          让每一句都拿到
          <em className="wb-hero__em">它该得的分</em>
        </h2>
        <p className="wb-hero__desc">
          选择题型，贴入你的作文。平台会按你设定的评分细则逐句诊断：指出语法问题、给出优化后的句子、
          拆解句子结构，并把扣分落回具体位置。逐句内容默认折叠，点开才看——先自己想，再看答案。
        </p>
      </header>

      {/* ————— 就绪检查 ————— */}
      {/*
        语气刻度：只有「配了但没填全」这种真问题才用 danger。
        「还没配」是待办，用 warn（琥珀）——大片朱红底会把「未完成」
        渲染成「出错了」，那是错的情绪。
      */}
      <section className="readiness" aria-label="开始前的准备">
        <ReadinessItem
          tone={modelReady ? 'ok' : models.length > 0 ? 'danger' : 'warn'}
          title="模型服务"
          detail={
            modelReady
              ? `${readyModels.map((m) => m.label).join('、')} 已就绪`
              : models.length > 0
                ? '已有配置，但还缺 API Key 或模型名'
                : '尚未添加模型配置——批改前需要先接上一个模型'
          }
          action={{ label: modelReady ? '管理' : '去配置', to: 'models' }}
          icon={<IconGear size={14} />}
        />
        <ReadinessItem
          tone={filledTasks.length === TASK_ORDER.length ? 'ok' : 'warn'}
          title="评分细则"
          detail={
            filledTasks.length === TASK_ORDER.length
              ? '三个题型均已填写'
              : anyRubricReady
                ? `已填写 ${filledTasks.length}/${TASK_ORDER.length}，其余仍是空白骨架`
                : '三个题型都还是空白骨架——不填也能批，但分数会失去依据'
          }
          action={{ label: '去填写', to: 'rubrics' }}
          icon={<IconDoc size={14} />}
        />
      </section>

      {/* ————— 题型 ————— */}
      <section className="wb-section">
        <div className="wb-section__head">
          <h3 className="wb-section__title">选择题型</h3>
          <p className="wb-section__desc">三个模块共用一套评分引擎，差别在细则、权重与报告视图。</p>
        </div>

        <div className="task-grid">
          {TASK_ORDER.map((type) => (
            <TaskCard
              key={type}
              type={type}
              rubricFilled={isRubricFilled(rubrics[type])}
              blocked={!modelReady}
            />
          ))}
        </div>
      </section>

      {/* ————— 报告页预告 ————— */}
      <section className="wb-section">
        <div className="wb-section__head">
          <h3 className="wb-section__title">报告长什么样</h3>
          <p className="wb-section__desc">
            批改完成后会得到这样一张报告。下面是一份示意，用来先确认信息结构是否符合你的预期。
          </p>
        </div>
        <ReportPreview />
      </section>
    </Shell>
  )
}

/* —— 就绪检查用的小图标（局部使用，不占用全局图标库） —— */

const IconGear = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 2.2 13 5v6l-5 2.8L3 11V5l5-2.8Z" />
    <path d="M8 8.1 13 5M8 8.1v5.7M8 8.1 3 5" />
  </svg>
)

const IconDoc = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 2.3h6.2L13 5.1v8.6a.7.7 0 0 1-.7.7H4a.7.7 0 0 1-.7-.7V3a.7.7 0 0 1 .7-.7Z" />
    <path d="M9.9 2.4v2.9H13" />
    <path d="M5.8 8h4.4M5.8 10.6h3" />
  </svg>
)

function ReadinessItem({
  tone,
  title,
  detail,
  action,
  icon,
}: {
  tone: 'ok' | 'warn' | 'danger'
  title: string
  detail: string
  action: { label: string; to: 'models' | 'rubrics' }
  icon: React.ReactNode
}) {
  return (
    <div className={`readiness__item readiness__item--${tone}`}>
      <span className="readiness__icon">{tone === 'ok' ? <IconCheck size={14} /> : <IconAlert size={14} />}</span>
      <div className="readiness__text">
        <span className="readiness__title">
          {icon}
          {title}
        </span>
        <span className="readiness__detail">{detail}</span>
      </div>
      <button
        type="button"
        className={tone === 'ok' ? 'btn btn--ghost btn--sm' : 'btn btn--secondary btn--sm'}
        onClick={() => navigate(action.to)}
      >
        {action.label}
      </button>
    </div>
  )
}

function TaskCard({
  type,
  rubricFilled,
  blocked,
}: {
  type: TaskType
  rubricFilled: boolean
  blocked: boolean
}) {
  const spec = TASK_SPECS[type]
  return (
    <button
      type="button"
      className="card-interactive task-card"
      disabled={blocked}
      onClick={() => openTask(type)}
      title={blocked ? '请先在上方配置一个可用的模型' : undefined}
    >
      <span className="task-card__top">
        <span className="task-card__name">{spec.name}</span>
        <span className="numeric task-card__score">{spec.total} 分</span>
      </span>

      <span className="task-card__dims">
        {spec.dimensions.map((dim) => (
          <span key={dim.key} className="task-card__dim">
            <span className="task-card__dim-name">{dim.name}</span>
            <span className="task-card__dim-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((dim.max / spec.total) * 100)}%` }} />
            </span>
            <span className="numeric task-card__dim-val">{dim.max}</span>
          </span>
        ))}
      </span>

      <span className="task-card__foot">
        <span className="task-card__meta">
          <span className="numeric">{spec.inputs.wordLimit}</span>
          <span>·</span>
          <span>{spec.reportMode === 'translation' ? '译文对照视图' : '逐句优化视图'}</span>
        </span>
        <span className={`chip ${rubricFilled ? 'chip--ok' : 'chip--warn'}`}>
          {rubricFilled ? '细则已填写' : '细则待填写'}
        </span>
      </span>
    </button>
  )
}

/* -------------------------------------------------------------------------- */

const PREVIEW_SENTENCES = [
  {
    index: 3,
    labels: ['时态', '主谓一致'],
    severity: 'major' as const,
    text: 'The picture show two climbers who help each other to climb the mountain.',
    optimized: 'The picture shows two climbers helping each other up the mountain.',
    structure: 'Although + 从句, 主句',
    delta: -0.5,
  },
  {
    index: 4,
    labels: ['用词', '中式表达'],
    severity: 'minor' as const,
    text: 'We should learn the spirit of cooperation, which is very important for our life.',
    optimized: 'We should cultivate a cooperative spirit, which is indispensable in our daily life.',
    structure: '主句 + 非限定性定语从句',
    delta: -0.25,
  },
  {
    index: 5,
    labels: ['语法无误'],
    severity: 'ok' as const,
    text: 'Only by working together can we overcome the difficulties ahead.',
    optimized: 'Only by working together can we overcome the difficulties ahead.',
    structure: 'Only + 状语 引起的部分倒装',
    delta: 0,
  },
]

function ReportPreview() {
  return (
    <div className="preview-frame">
      <div className="preview-frame__bar">
        <span className="row" style={{ gap: 'var(--ds-2)' }}>
          <IconEye size={13} />
          <span style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-ink-muted)' }}>
            报告页示意 · 英语一大作文
          </span>
        </span>
        <span className="chip chip--clay">P3 阶段交付</span>
      </div>

      <div className="preview-frame__body">
        <div className="preview-score">
          <div className="preview-ring" aria-hidden="true">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" className="preview-ring__track" />
              <circle
                cx="60"
                cy="60"
                r="52"
                className="preview-ring__fill"
                strokeDasharray={`${0.75 * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
              />
            </svg>
            <span className="preview-ring__num">
              <strong className="numeric">15</strong>
              <span className="numeric">/ 20</span>
            </span>
          </div>
          <div className="preview-dims">
            {TASK_SPECS.eng1_big.dimensions.map((dim, i) => {
              const got = [5, 6, 2.5, 1.5][i] ?? 0
              return (
                <div key={dim.key} className="preview-dim">
                  <span className="preview-dim__name">{dim.name}</span>
                  <span className="preview-dim__bar">
                    <span style={{ width: `${(got / dim.max) * 100}%` }} />
                  </span>
                  <span className="numeric preview-dim__val">
                    {got}/{dim.max}
                  </span>
                </div>
              )
            })}
            <p className="preview-band">
              评定档次：<span className="chip chip--clay">第四档 13–16</span>
            </p>
          </div>
        </div>

        <p className="preview-label">逐句诊断（默认折叠，点击展开）</p>

        <div className="stack stack--2">
          {PREVIEW_SENTENCES.map((sentence, i) => (
            <details key={sentence.index} className="disclosure preview-sentence" open={i === 0}>
              <summary className="disclosure__summary">
                <span className="numeric preview-sentence__no">{sentence.index}</span>
                <span className="row row--wrap" style={{ flex: 1, gap: 'var(--ds-2)' }}>
                  {sentence.labels.map((label) => (
                    <span
                      key={label}
                      className={`chip ${sentence.severity === 'ok' ? 'chip--ok' : sentence.severity === 'major' ? 'chip--danger' : 'chip--warn'}`}
                    >
                      {label}
                    </span>
                  ))}
                  <span className="preview-sentence__text">{sentence.text}</span>
                </span>
                <span className="numeric preview-sentence__delta">
                  {sentence.delta === 0 ? '不扣分' : `${sentence.delta} 分`}
                </span>
                <svg width="12" height="12" viewBox="0 0 16 16" className="caret" aria-hidden="true">
                  <path
                    d="M4 6.2 8 10l4-3.8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>
              <div className="disclosure__body preview-sentence__body">
                <div className="preview-block">
                  <span className="preview-block__label">语法问题</span>
                  <p>
                    主谓不一致：主语 <code>The picture</code> 为第三人称单数，谓语应为{' '}
                    <code>shows</code>。
                  </p>
                </div>
                <div className="preview-block preview-block--ok">
                  <span className="preview-block__label">优化后</span>
                  <p className="preview-block__en">{sentence.optimized}</p>
                </div>
                <div className="preview-block">
                  <span className="preview-block__label">结构划分</span>
                  <p className="numeric" style={{ fontSize: 'var(--ds-text-xs)' }}>
                    {sentence.structure}
                  </p>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
