import { useEffect, useRef, useState } from 'react'
import { Shell } from '@/components/Shell'
import { toast } from '@/app/ui'
import { useGradeStore } from '@/app/gradeStore'
import { useConfigStore, useDefaultModel, modelStatus } from '@/app/store'
import { navigate } from '@/app/router'
import { TASK_ORDER, TASK_SPECS } from '@/lib/tasks'
import { isRubricFilled } from '@/lib/rubric'
import { buildInputSections } from '@/lib/rubric'
import { validateInput, grade, type GradeInput } from '@/lib/grade'
import { compressImage, readDocument, formatBytes } from '@/lib/ingest'
import { transcribeImage } from '@/lib/ocr'
import { saveReport } from '@/lib/reports'
import { ApiError } from '@/lib/api'
import {
  IconAlert,
  IconCamera,
  IconCheck,
  IconCaret,
  IconInfo,
  IconSpark,
  IconTrash,
  IconUpload,
} from '@/components/Icon'
import { CopyButton } from '@/components/Toast'
import type { TaskType } from '@/types/domain'
import type { InputImage } from '@/types/report'
import './grade.css'

/** 估算 token：中文约 1 字 1 token，英文约 4 字符 1 token */
function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  const rest = text.length - cjk
  return Math.round(cjk + rest / 4)
}

export function GradePage({ taskParam }: { taskParam?: string | null }) {
  const activeTask = useGradeStore((s) => s.activeTask)
  const setActiveTask = useGradeStore((s) => s.setActiveTask)
  const drafts = useGradeStore((s) => s.drafts)
  const updateDraft = useGradeStore((s) => s.updateDraft)
  const resetDraft = useGradeStore((s) => s.resetDraft)
  const job = useGradeStore((s) => s.job)
  const startJob = useGradeStore((s) => s.startJob)
  const appendStream = useGradeStore((s) => s.appendStream)
  const setStage = useGradeStore((s) => s.setStage)
  const finishJob = useGradeStore((s) => s.finishJob)
  const failJob = useGradeStore((s) => s.failJob)

  const rubrics = useConfigStore((s) => s.rubrics)
  const settings = useConfigStore((s) => s.settings)
  const model = useDefaultModel()

  const [busy, setBusy] = useState<null | 'ocr' | 'grading'>(null)
  const [showPreview, setShowPreview] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // URL 上的 task 参数决定当前题型
  useEffect(() => {
    if (taskParam && TASK_ORDER.includes(taskParam as TaskType)) {
      setActiveTask(taskParam as TaskType)
    }
  }, [taskParam, setActiveTask])

  const spec = TASK_SPECS[activeTask]
  const draft = drafts[activeTask]
  const rubric = rubrics[activeTask]

  const input: GradeInput = {
    taskType: activeTask,
    year: draft.year,
    prompt: draft.prompt,
    essay: draft.essay,
    extras: draft.extras,
    reference: draft.reference,
    transcriptionNote: draft.transcriptionNote,
  }

  const validation = validateInput(input, rubric)
  const modelReady = model ? modelStatus(model).ok : false
  const canSubmit = validation.ok && modelReady && busy === null && job.phase !== 'running'

  const composedTokens = model
    ? estimateTokens(rubric.content) + estimateTokens(draft.prompt + draft.essay + draft.extras + draft.reference)
    : 0

  /* ---------------- 图片 ---------------- */

  async function attachImages(role: 'prompt' | 'essay', files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return

    try {
      const payloads: InputImage[] = []
      for (const file of list) {
        const compressed = await compressImage(file)
        payloads.push({ ...compressed, role })
      }
      const key = role === 'prompt' ? 'promptImages' : 'essayImages'
      updateDraft(activeTask, { [key]: [...draft[key], ...payloads] } as Partial<typeof draft>)

      const saved = payloads.reduce((sum, p) => sum + (p.originalBytes - p.compressedBytes), 0)
      if (saved > 0) {
        toast.info(`已压缩 ${payloads.length} 张图片，节省约 ${formatBytes(saved)}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '图片处理失败')
    }
  }

  function removeImage(role: 'prompt' | 'essay', index: number) {
    const key = role === 'prompt' ? 'promptImages' : 'essayImages'
    updateDraft(activeTask, { [key]: draft[key].filter((_, i) => i !== index) } as Partial<typeof draft>)
  }

  async function ocrAll() {
    if (!model) return
    const targets = [...draft.promptImages, ...draft.essayImages]
    if (targets.length === 0) return

    setBusy('ocr')
    try {
      const uncertainAll: string[] = []
      const summaries: string[] = []

      // 作文图逐张转录，结果拼接进 essay 字段
      let essayText = draft.essay
      let promptText = draft.prompt
      // 转录结果回写进图片，避免重复识别
      const transcripts = new Map<string, string>()

      for (const image of targets) {
        setStage('正在准备…')
        toast.info(`正在识别：${image.name}`)
        const result = await transcribeImage(
          image,
          model,
          settings,
          image.role === 'essay' ? spec.shortName : '题目',
        )

        if (image.role === 'essay') {
          essayText = essayText ? `${essayText}\n\n${result.text}` : result.text
        } else {
          promptText = promptText ? `${promptText}\n\n${result.text}` : result.text
        }

        transcripts.set(image.dataUrl, result.text)
        if (result.uncertain.length > 0) uncertainAll.push(...result.uncertain)
        if (result.summary) summaries.push(`${image.name}：${result.summary}`)
      }

      updateDraft(activeTask, {
        prompt: promptText,
        essay: essayText,
        promptImages: draft.promptImages.map((img) => ({
          ...img,
          transcript: transcripts.get(img.dataUrl) ?? img.transcript,
        })),
        essayImages: draft.essayImages.map((img) => ({
          ...img,
          transcript: transcripts.get(img.dataUrl) ?? img.transcript,
        })),
        transcriptionNote: uncertainAll.length
          ? `以下地方识别存疑，请人工核对后再提交：\n- ${uncertainAll.join('\n- ')}`
          : '',
      })

      if (uncertainAll.length > 0) {
        toast.info(`识别完成，有 ${uncertainAll.length} 处存疑已列出，请核对`)
      } else {
        toast.ok('识别完成，请核对文字后再提交')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '识别失败')
    } finally {
      setBusy(null)
    }
  }

  /* ---------------- 文件 ---------------- */

  async function importFile(file: File, target: 'prompt' | 'essay') {
    try {
      if (file.type.startsWith('image/')) {
        await attachImages(target, [file])
        return
      }
      const { text, name } = await readDocument(file)
      if (!text.trim()) {
        toast.error(`${name} 里没有读到文字`)
        return
      }
      updateDraft(activeTask, { [target]: text })
      toast.ok(`已导入 ${name}（${text.length} 字符）`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '文件导入失败')
    }
  }

  /* ---------------- 提交 ---------------- */

  async function handleSubmit() {
    if (!model) {
      toast.error('请先在「模型配置」里添加并启用一个模型')
      return
    }
    if (!canSubmit) return

    // 若还有未识别的图片，先自动识别一次，避免把「[图片]」当作文提交
    if (draft.promptImages.length > 0 || draft.essayImages.length > 0) {
      const hasUntranscribed = [...draft.promptImages, ...draft.essayImages].some((i) => !i.transcript)
      if (hasUntranscribed && !draft.essay.trim()) {
        await ocrAll()
        toast.info('已先完成图片识别，请核对文字后再次点击开始批改')
        return
      }
    }

    const controller = new AbortController()
    abortRef.current = controller
    setBusy('grading')
    startJob(input)

    try {
      const result = await grade(input, model, rubric.content, settings, {
        signal: controller.signal,
        onStage: (stage) => setStage(stage),
        onDelta: (_delta, full) => appendStream(_delta.length ? _delta : full.slice(-1)),
      })

      const stored = await saveReport({
        taskType: activeTask,
        input: {
          year: draft.year,
          prompt: draft.prompt,
          essay: draft.essay,
          extras: draft.extras,
          reference: draft.reference,
          transcriptionNote: draft.transcriptionNote,
        },
        report: result.report,
        diagnostics: result.diagnostics,
        meta: {
          modelLabel: model.label,
          provider: model.provider,
          modelName: model.model,
          elapsedMs: result.elapsedMs,
          totalTokens: result.usage.totalTokens,
          retried: result.retried,
          repaired: result.repaired,
        },
      })

      finishJob({
        report: result.report,
        diagnostics: result.diagnostics,
        meta: stored.meta,
      })

      if (result.retried) toast.info('本次调用用了重试通道')
      navigate('report', { id: stored.id })
    } catch (err) {
      if (controller.signal.aborted) {
        failJob('已取消本次批改')
        toast.info('已取消')
      } else if (err instanceof ApiError) {
        failJob(err.message, err.detail)
        toast.error(err.message)
      } else {
        const message = err instanceof Error ? err.message : String(err)
        failJob(message)
        toast.error(message)
      }
    } finally {
      setBusy(null)
      abortRef.current = null
    }
  }

  return (
    <Shell
      route="grade"
      title="批改台"
      crumbs={
        <span className="row" style={{ gap: 'var(--ds-2)' }}>
          <span>批改</span>
          <span>/</span>
          <span>{spec.name}</span>
        </span>
      }
      actions={
        <>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('workbench')}>
            返回题型选择
          </button>
          {job.phase === 'running' ? (
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => abortRef.current?.abort()}
            >
              取消批改
            </button>
          ) : (
            <button type="button" className="btn btn--primary btn--sm" disabled={!canSubmit} onClick={handleSubmit}>
              <IconSpark size={13} />
              开始批改
            </button>
          )}
        </>
      }
    >
      {/* 题型切换 */}
      <div className="grade-tabs" role="tablist" aria-label="选择题型">
        {TASK_ORDER.map((type) => {
          const filled = isRubricFilled(rubrics[type])
          const hasDraft = Boolean(drafts[type].essay.trim() || drafts[type].prompt.trim())
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={activeTask === type}
              className="grade-tab"
              onClick={() => {
                setActiveTask(type)
                navigate('grade', { task: type })
              }}
            >
              <span className="grade-tab__name">{TASK_SPECS[type].shortName}</span>
              <span className="numeric grade-tab__meta">满分 {TASK_SPECS[type].total}</span>
              {hasDraft ? <span className="grade-tab__dot" title="有未提交的草稿" /> : null}
              {!filled ? <span className="chip chip--warn">缺细则</span> : null}
            </button>
          )
        })}
      </div>

      <div className="grade-layout">
        {/* ————— 左：输入 ————— */}
        <div className="grade-main stack stack--5">
          {validation.blockers.length > 0 ? (
            <div className="note note--warn">
              <span className="note__icon">
                <IconAlert size={13} />
              </span>
              <div className="note__body">
                {validation.blockers.map((b) => (
                  <p key={b}>{b}</p>
                ))}
              </div>
            </div>
          ) : null}

          {/* 缺题目是正常用法，不是错误：用中性提示说明这次会少给什么 */}
          {validation.warnings.length > 0 ? (
            <div className="note">
              <span className="note__icon">
                <IconInfo size={13} />
              </span>
              <div className="note__body">
                {validation.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            </div>
          ) : null}

          {/* 题目年份（仅大作文） */}
          {spec.guide.year ? (
            <label className="field">
              <span className="field__label">
                {spec.guide.year.label}
                <span className="field__hint">可选</span>
              </span>
              <input
                className="input"
                value={draft.year}
                placeholder={spec.guide.year.placeholder}
                onChange={(e) => updateDraft(activeTask, { year: e.target.value })}
              />
              <span className="field__desc">{spec.guide.year.hint}</span>
            </label>
          ) : null}

          {/* 题目：可选 */}
          <InputBlock
            field={spec.guide.prompt}
            optional
            value={draft.prompt}
            onChange={(v) => updateDraft(activeTask, { prompt: v })}
            images={draft.promptImages}
            onAttach={(files) => attachImages('prompt', files)}
            onRemoveImage={(i) => removeImage('prompt', i)}
            fileTargetRef={fileRef}
            onFile={(f) => importFile(f, 'prompt')}
            rows={7}
          />

          {/* 参考译文（仅翻译） */}
          {activeTask === 'eng1_translation' ? (
            <details className="disclosure">
              <summary className="disclosure__summary">
                <IconCaret size={12} className="caret" />
                <span style={{ fontWeight: 500, fontSize: 'var(--ds-text-sm)' }}>参考译文</span>
                <span className="field__hint" style={{ marginLeft: 'auto' }}>
                  可选，有则提供
                </span>
              </summary>
              <div className="disclosure__body">
                <textarea
                  className="textarea"
                  rows={4}
                  value={draft.reference}
                  placeholder="有官方或教辅参考译文就粘贴进来，我会用它辅助划分采分点；没有留空即可。"
                  onChange={(e) => updateDraft(activeTask, { reference: e.target.value })}
                />
              </div>
            </details>
          ) : null}

          {/* 作文 / 译文 */}
          <InputBlock
            field={spec.guide.essay}
            value={draft.essay}
            onChange={(v) => updateDraft(activeTask, { essay: v })}
            images={draft.essayImages}
            onAttach={(files) => attachImages('essay', files)}
            onRemoveImage={(i) => removeImage('essay', i)}
            rows={12}
            wordCount
          />

          {draft.transcriptionNote ? (
            <div className="note note--warn">
              <span className="note__icon">
                <IconInfo size={13} />
              </span>
              <div className="note__body">
                <p className="note__title">图片识别存疑处，请核对</p>
                <pre className="code-block" style={{ marginTop: 'var(--ds-2)', whiteSpace: 'pre-wrap' }}>
                  {draft.transcriptionNote}
                </pre>
              </div>
            </div>
          ) : null}

          {/* 额外需求 */}
          <label className="field">
            <span className="field__label">
              {spec.guide.extras.label}
              <span className="field__hint">可选</span>
            </span>
            <textarea
              className="textarea"
              rows={3}
              value={draft.extras}
              placeholder={spec.guide.extras.placeholder}
              onChange={(e) => updateDraft(activeTask, { extras: e.target.value })}
            />
            <span className="field__desc">{spec.guide.extras.hint}</span>
          </label>

          <div className="row row--wrap" style={{ gap: 'var(--ds-2)' }}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setShowPreview((v) => !v)}
            >
              <IconInfo size={13} />
              {showPreview ? '收起提示词预览' : '查看将要发送的提示词'}
            </button>
            <CopyButton
              label="复制完整提示词"
              text={`${rubric.content}\n\n──────────\n${buildInputSections(activeTask)}`}
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                if (!window.confirm('清空这个题型的全部输入？')) return
                resetDraft(activeTask)
                toast.info('已清空')
              }}
            >
              <IconTrash size={13} />
              清空输入
            </button>
          </div>

          {showPreview ? (
            <div className="panel">
              <div className="panel__head">
                <div>
                  <h3 className="panel__title" style={{ fontSize: 'var(--ds-text-base)' }}>
                    提示词预览
                  </h3>
                  <p className="panel__desc">
                    上半段是评分细则（system），下半段是你的输入（user）。细则可在「评分细则」页修改。
                  </p>
                </div>
                <CopyButton text={`${rubric.content}\n\n──────────\n${draft.prompt}\n\n${draft.essay}`} />
              </div>
              <div className="panel__body">
                <pre className="code-block grade-preview">{rubric.content}</pre>
                <p className="grade-preview__sep">─────── 你的输入 ───────</p>
                <pre className="code-block grade-preview">
                  {`【题目】\n${draft.prompt || '（未填写）'}\n\n【${spec.reportMode === 'translation' ? '译文' : '作文'}】\n${draft.essay || '（未填写）'}\n\n【额外需求】\n${draft.extras || '（未填写）'}`}
                </pre>
              </div>
            </div>
          ) : null}
        </div>

        {/* ————— 右：状态与提交 ————— */}
        <aside className="grade-side stack stack--4">
          <section className="panel">
            <div className="panel__head" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
              <h3 className="panel__title" style={{ fontSize: 'var(--ds-text-base)' }}>
                本次批改
              </h3>
            </div>
            <div className="panel__body stack stack--3" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
              <Row label="题型" value={spec.name} />
              <Row label="模型" value={model ? model.label : '未配置'} tone={modelReady ? 'ok' : 'warn'} />
              {model?.vision ? <Row label="图片识别" value="可用" tone="ok" /> : null}
              <Row label="细则" value={isRubricFilled(rubric) ? '已填写' : '空白'} tone={isRubricFilled(rubric) ? 'ok' : 'warn'} />
              <Row
                label="题目"
                value={draft.prompt.trim() ? '已提供' : '未提供（只批语言）'}
                tone={draft.prompt.trim() ? 'ok' : 'warn'}
              />
              <Row
                label="输入字数"
                value={`${draft.essay.trim().length} 字`}
                numeric
              />
              <Row label="预计输入" value={`≈${composedTokens} tokens`} numeric />

              {job.phase === 'running' ? (
                <div className="grade-progress">
                  <div className="row" style={{ gap: 'var(--ds-2)' }}>
                    <span className="spinner" />
                    <span style={{ fontSize: 'var(--ds-text-sm)' }}>{job.stage}</span>
                  </div>
                  <p className="numeric grade-progress__chars">
                    已接收 {job.streamed.length} 字符
                  </p>
                </div>
              ) : null}

              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                <IconSpark size={14} />
                {busy === 'grading' ? '批改中…' : `开始批改（满分 ${spec.total}）`}
              </button>

              {draft.promptImages.length + draft.essayImages.length > 0 ? (
                <button
                  type="button"
                  className="btn btn--secondary btn--block btn--sm"
                  disabled={!model?.vision || busy !== null}
                  onClick={ocrAll}
                >
                  <IconUpload size={13} />
                  {busy === 'ocr' ? '识别中…' : '识别图片中的文字'}
                </button>
              ) : null}

              {!modelReady ? (
                <button type="button" className="btn btn--secondary btn--block btn--sm" onClick={() => navigate('models')}>
                  先去配置模型
                </button>
              ) : null}

              <p className="field__desc">
                批改耗时通常 20–60 秒。中途可以取消，已生成的部分不会写入记录。
              </p>
            </div>
          </section>

          {job.phase === 'error' && job.error ? (
            <div className="note note--danger">
              <span className="note__icon">
                <IconAlert size={13} />
              </span>
              <div className="note__body">
                <p className="note__title">{job.error.message}</p>
                {job.error.detail ? (
                  <pre className="code-block" style={{ marginTop: 'var(--ds-2)' }}>
                    {job.error.detail.slice(0, 500)}
                  </pre>
                ) : null}
              </div>
            </div>
          ) : null}

          <details className="disclosure">
            <summary className="disclosure__summary">
              <IconCaret size={12} className="caret" />
              <span style={{ fontWeight: 500, fontSize: 'var(--ds-text-sm)' }}>输入要点</span>
            </summary>
            <div className="disclosure__body">
              <ul className="grade-tips">
                <li>{spec.guide.prompt.hint}</li>
                <li>{spec.guide.essay.hint}</li>
                <li>草稿按题型分别保存，切换题型不会丢，刷新页面也还在。</li>
              </ul>
            </div>
          </details>
        </aside>
      </div>
    </Shell>
  )
}

/* -------------------------------------------------------------------------- */

function Row({
  label,
  value,
  tone,
  numeric,
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn'
  numeric?: boolean
}) {
  return (
    <div className="grade-row">
      <span className="grade-row__label">{label}</span>
      <span className={`grade-row__value${numeric ? ' numeric' : ''}`}>
        {tone === 'ok' ? <IconCheck size={12} className="grade-row__icon" /> : null}
        {tone === 'warn' ? <IconAlert size={12} className="grade-row__icon grade-row__icon--warn" /> : null}
        {value}
      </span>
    </div>
  )
}

function InputBlock({
  field,
  value,
  onChange,
  images,
  onAttach,
  onRemoveImage,
  rows,
  wordCount,
  optional,
  onFile,
  fileTargetRef,
}: {
  field: { label: string; placeholder: string; hint: string }
  value: string
  onChange: (v: string) => void
  images: InputImage[]
  onAttach: (files: FileList | File[]) => void
  onRemoveImage: (index: number) => void
  rows: number
  wordCount?: boolean
  /** 标注为可选：标题旁显示角标，且不参与提交校验 */
  optional?: boolean
  onFile?: (file: File) => void
  fileTargetRef?: React.RefObject<HTMLInputElement | null>
}) {
  const [dragOver, setDragOver] = useState(false)
  const [focused, setFocused] = useState(false)
  const localRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const ref = (fileTargetRef ?? localRef) as React.RefObject<HTMLInputElement>

  const words = value.trim() ? value.trim().split(/\s+/).filter((w) => /[a-zA-Z]/.test(w)).length : 0

  /**
   * 粘贴图片直接入附件。
   *
   * 电脑端从网页、截图工具或 Word 里复制作文时，剪贴板里常常是图片而不是文字，
   * 默认行为会静默丢掉，用户以为粘上了其实没有。这里拦截并转成附件。
   * 若剪贴板里同时有文字，则放行文字粘贴——文字比图片更好用。
   */
  const handlePaste = (event: React.ClipboardEvent) => {
    const items = Array.from(event.clipboardData?.items ?? [])
    const imageFiles = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null)

    if (imageFiles.length === 0) return

    const hasText = (event.clipboardData?.getData('text') ?? '').trim().length > 0
    event.preventDefault()
    onAttach(imageFiles)
    if (hasText) onFile?.(imageFiles[0])
  }

  return (
    <div className="field">
      <div className="field__label">
        <span>{field.label}</span>
        {optional ? <span className="field__optional">可选</span> : null}
        {wordCount ? <span className="numeric field__counter">{words} 词</span> : null}
      </div>

      <div
        className={`grade-drop${dragOver ? ' grade-drop--over' : ''}${focused ? ' grade-drop--focused' : ''}`}
        onPaste={handlePaste}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={() => setFocused(false)}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const files = e.dataTransfer.files
          if (!files?.length) return
          const file = files[0]
          if (file.type.startsWith('image/')) onAttach(files)
          else onFile?.(file)
        }}
      >
        <textarea
          className="textarea grade-textarea"
          rows={rows}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />

        <div className="grade-drop__bar">
          {/*
            分开给三个入口，而不是挤在一个按钮里：
            · 拍照 —— 手机端最常用，用 capture 直接唤起后置摄像头
            · 选文件 —— 相册里的照片或 .txt/.md/.docx
            · 拖拽 / 粘贴 —— 电脑端最顺手
          */}
          <button
            type="button"
            className="btn btn--ghost btn--sm grade-drop__action"
            onClick={() => cameraRef.current?.click()}
          >
            <IconCamera size={13} />
            拍照
          </button>

          <button
            type="button"
            className="btn btn--ghost btn--sm grade-drop__action"
            onClick={() => ref.current?.click()}
          >
            <IconUpload size={13} />
            选文件
          </button>

          <span className="field__hint grade-drop__hint">
            也可拖入、或直接粘贴图片
          </span>

          {/* 相机：capture 提示移动端直接开后置摄像头；桌面端会退化成普通文件选择 */}
          <input
            ref={cameraRef}
            type="file"
            hidden
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const files = e.target.files
              if (files?.length) onAttach(files)
              e.target.value = ''
            }}
          />

          <input
            ref={ref}
            type="file"
            hidden
            multiple
            accept="image/*,.txt,.md,.docx"
            onChange={(e) => {
              const files = e.target.files
              if (!files?.length) return
              const images: File[] = []
              Array.from(files).forEach((file) => {
                if (file.type.startsWith('image/')) images.push(file)
                else onFile?.(file)
              })
              if (images.length > 0) onAttach(images)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {images.length > 0 ? (
        <div className="grade-thumbs">
          {images.map((img, i) => (
            <div key={`${img.name}-${i}`} className="grade-thumb">
              <img src={img.dataUrl} alt={img.name} />
              <div className="grade-thumb__meta">
                <span className="grade-thumb__name">{img.name}</span>
                <span className="numeric grade-thumb__size">
                  {formatBytes(img.originalBytes)} → {formatBytes(img.compressedBytes)}
                </span>
              </div>
              <button
                type="button"
                className="grade-thumb__remove"
                onClick={() => onRemoveImage(i)}
                aria-label={`移除 ${img.name}`}
              >
                <IconTrash size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <span className="field__desc">{field.hint}</span>
    </div>
  )
}
