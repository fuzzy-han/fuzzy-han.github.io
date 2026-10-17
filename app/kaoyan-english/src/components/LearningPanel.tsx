import { useEffect, useRef, useState } from 'react'
import { useConfigStore, useDefaultModel } from '@/app/store'
import { toast } from '@/app/ui'
import { Markdown } from './Markdown'
import { askCoach, extractLearningCard } from '@/lib/learning'
import { updateReport, type LearningTurn, type StoredReport } from '@/lib/reports'
import { listTemplates, saveTemplate } from '@/lib/templates'
import { TEMPLATE_CATEGORIES, type WritingTemplate } from '@/types/template'

export function LearningPanel({ record }: { record: StoredReport }) {
  const [turns, setTurns] = useState(record.learning?.turns ?? [])
  const [mode, setMode] = useState<LearningTurn['kind']>('question')
  const [question, setQuestion] = useState('')
  const [revision, setRevision] = useState([...turns].reverse().find(turn => turn.role === 'user' && turn.kind === 'revision')?.content ?? record.input.essay)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [card, setCard] = useState<WritingTemplate | null>(null)
  const [cardSaved, setCardSaved] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const model = useDefaultModel()
  const settings = useConfigStore(state => state.settings)
  useEffect(() => () => abort.current?.abort(), [])

  async function persist(next: LearningTurn[]) {
    await updateReport({ ...record, learning: { turns: next } })
    setDirty(false)
  }

  async function send() {
    if (!model || busy || dirty) return
    const text = mode === 'question' ? question : revision
    if (!text.trim()) return
    if (mode === 'revision') {
      const previous = [...turns].reverse().find(turn => turn.role === 'user' && turn.kind === 'revision')?.content ?? record.input.essay
      if (text.trim() === previous.trim()) { toast.info('这份作答还没有修改，请修改后再复评'); return }
    }
    const controller = new AbortController()
    abort.current = controller
    setBusy(true)
    try {
      const next = await askCoach(record, turns, text, mode, model, settings, controller.signal)
      if (controller.signal.aborted) return
      setTurns(next)
      setDirty(true)
      if (mode === 'question') setQuestion('')
      await persist(next)
    } catch (error) {
      if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : '请求失败，请重试')
    } finally { setBusy(false); abort.current = null }
  }

  async function makeCard(content: string) {
    if (!model || busy) return
    const controller = new AbortController()
    abort.current = controller
    setBusy(true)
    try {
      const candidate = await extractLearningCard(record, content, model, settings, controller.signal)
      if (!controller.signal.aborted) { setCard(candidate); setCardSaved(false) }
    } catch (error) {
      if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : '整理失败')
    } finally { setBusy(false); abort.current = null }
  }

  async function saveCard() {
    if (!card || busy || cardSaved) return
    if (['title', 'body', 'scene', 'usage', 'example', 'practice', 'answer'].some(key => !String(card[key as keyof WritingTemplate] ?? '').trim())) {
      toast.error('请填写知识点、句式、场景、方法、例句和练习答案'); return
    }
    setBusy(true)
    try {
      const existing = await listTemplates()
      const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()
      const duplicate = existing.find(row => row.category === card.category && normalize(row.body) === normalize(card.body) && normalize(row.scene) === normalize(card.scene))
      const next = duplicate ? { ...duplicate, ...card, id: duplicate.id, createdAt: duplicate.createdAt,
        sourceReportIds: [...new Set([...duplicate.sourceReportIds, record.id])],
        recurrence: duplicate.recurrence + (duplicate.sourceReportIds.includes(record.id) ? 0 : 1),
      } : card
      await saveTemplate({ ...next, edited: true, updatedAt: Date.now() })
      setCardSaved(true)
      toast.ok('已加入模板库，可按场景复习和仿写')
    } catch (error) { toast.error(error instanceof Error ? error.message : '保存失败') }
    finally { setBusy(false) }
  }

  return <section className="panel" aria-label="持续学习" style={{ marginTop: 24 }}>
    <div className="panel__body stack stack--4">
      <h3>继续学：追问 → 修改 → 复评 → 积累 → 仿写</h3>
      <p>沿用这份报告的题目和原文，无需再次拍题。复评只检查修改效果，不替代完整评分。</p>
      <details><summary>查看沿用的题目</summary><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{record.input.prompt || '原记录没有题目；可在追问中补充要求。'}</p></details>
      {turns.map(turn => <article key={turn.id} className="note" style={{ display: 'block', overflowWrap: 'anywhere' }}>
        <strong>{turn.role === 'user' ? (turn.kind === 'revision' ? '我的修改稿' : '我的追问') : '学习反馈'}</strong>
        {turn.role === 'user' ? <p style={{ whiteSpace: 'pre-wrap' }}>{turn.content}</p> : <Markdown source={turn.content} />}
        {turn.role === 'assistant' ? <button className="btn btn--secondary btn--sm" disabled={busy || !model} onClick={() => void makeCard(window.getSelection()?.toString().trim() || turn.content)}>整理成学习卡</button> : null}
      </article>)}
      {dirty ? <div role="alert"><p>回答已生成，但尚未保存到浏览器。请重试保存，避免刷新后丢失。</p><button className="btn btn--secondary" disabled={busy} onClick={() => { setBusy(true); void persist(turns).catch(error => toast.error(String(error))).finally(() => setBusy(false)) }}>重试保存对话</button></div> : null}
      <div className="row row--wrap" style={{ gap: 8 }}>
        <button className="btn btn--secondary" aria-pressed={mode === 'question'} disabled={busy} onClick={() => setMode('question')}>追问细节</button>
        <button className="btn btn--secondary" aria-pressed={mode === 'revision'} disabled={busy} onClick={() => setMode('revision')}>修改后复评</button>
      </div>
      {mode === 'question' ? <>
        <div className="row row--wrap" style={{ gap: 8 }}>{['这句为什么这样改？请解释语法和使用边界。', '同一个意思还能怎么写？请给出自然表达和适用场景。', '把这次最重要的问题整理成一个句式，再给我一道仿写练习。'].map(text => <button key={text} className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setQuestion(text)}>{text}</button>)}</div>
        <label className="field">想问什么<textarea aria-label="追问内容" className="textarea" rows={3} value={question} disabled={busy} onChange={event => setQuestion(event.target.value)} placeholder="引用原句，问清原因、替代写法或练习方法" /></label>
      </> : <label className="field">修改后的作答<textarea aria-label="修改后的作答" className="textarea" rows={8} value={revision} disabled={busy} onChange={event => setRevision(event.target.value)} /></label>}
      {!model ? <p>请先配置并选择模型，再开始追问或复评。</p> : null}
      <div className="row row--wrap" style={{ gap: 8 }}><button className="btn btn--primary" disabled={busy || dirty || !model || !(mode === 'question' ? question : revision).trim()} onClick={() => void send()}>{busy ? '处理中…' : mode === 'question' ? '发送追问' : '检查本次修改'}</button>{busy ? <button className="btn btn--ghost" onClick={() => abort.current?.abort()}>取消请求</button> : null}</div>
      {card ? <div className="stack stack--3" aria-label="学习卡预览">
        <h4>学习卡预览 · 核对后再入库</h4>
        <label className="field">分类<select className="input" value={card.category} disabled={busy || cardSaved} onChange={event => setCard({ ...card, category: event.target.value as WritingTemplate['category'] })}>{TEMPLATE_CATEGORIES.map(category => <option key={category.key} value={category.key}>{category.name}</option>)}</select></label>
        {([['title', '知识点'], ['body', '可复用句式 / 步骤'], ['meaning', '含义'], ['scene', '适用场景与边界'], ['usage', '套用方法'], ['example', '例句'], ['wrongExample', '原句对照'], ['practice', '换主题仿写题'], ['answer', '练习参考答案']] as const).map(([key, label]) => <label className="field" key={key}>{label}<textarea className="textarea" rows={2} aria-label={label} disabled={busy || cardSaved} value={card[key] ?? ''} onChange={event => setCard({ ...card, [key]: event.target.value })} /></label>)}
        <div className="row row--wrap" style={{ gap: 8 }}><button className="btn btn--primary" disabled={busy || cardSaved} onClick={() => void saveCard()}>{cardSaved ? '已加入学习库' : '确认加入学习库'}</button><button className="btn btn--ghost" disabled={busy} onClick={() => setCard(null)}>关闭预览</button></div>
      </div> : null}
    </div>
  </section>
}
